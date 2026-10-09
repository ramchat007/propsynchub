'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import {
  HousekeepingTask,
  HousekeepingStatus,
  InspectionStatus,
  MaintenanceTicket,
  MaintenanceCategory,
  MaintenanceSeverity,
  Room,
  RoomCategory,
} from '@/types';

export interface HousekeepingActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * 1. GET ALL HOUSEKEEPING TASKS & OPERATIONAL ROOM READINESS
 * Merges rooms, housekeeping state, and active floor maintenance issues.
 */
export async function getHousekeepingTasks(
  tenantId: string
): Promise<HousekeepingActionResponse<HousekeepingTask[]>> {
  try {
    const adminDb = createAdminClient();

    // 1. Fetch physical rooms
    const { data: rawRooms, error: roomsError } = await adminDb
      .from('rooms')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (roomsError) {
      return { success: false, error: 'Failed to fetch rooms: ' + roomsError.message };
    }

    const rooms = (rawRooms as unknown as Room[]) || [];

    // 2. Fetch categories for category name reference
    const { data: rawCategories } = await adminDb
      .from('room_categories')
      .select('id, name')
      .eq('tenant_id', tenantId);

    const categories = (rawCategories as unknown as RoomCategory[]) || [];
    const catMap = new Map<string, string>();
    categories.forEach((c) => catMap.set(c.id, c.name));

    // 3. Fetch active maintenance tickets
    let openMaintenanceTickets: MaintenanceTicket[] = [];
    try {
      const { data: rawMaint } = await adminDb
        .from('maintenance_tickets')
        .select('*')
        .eq('tenant_id', tenantId)
        .in('status', ['open', 'in_progress']);
      if (rawMaint) openMaintenanceTickets = rawMaint as unknown as MaintenanceTicket[];
    } catch {
      // Fallback to settings
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();
      const settings = (tenant?.settings as Record<string, unknown>) || {};
      const fallbackMaint = (settings.maintenance_tickets as MaintenanceTicket[]) || [];
      openMaintenanceTickets = fallbackMaint.filter((t) => t.status === 'open' || t.status === 'in_progress');
    }

    const maintenanceMap = new Map<string, MaintenanceTicket>();
    openMaintenanceTickets.forEach((t) => {
      if (t.room_id) maintenanceMap.set(t.room_id, t);
    });

    // 4. Try fetching from housekeeping_tasks table
    const dbTaskMap = new Map<string, HousekeepingTask>();
    try {
      const { data: rawTasks } = await adminDb
        .from('housekeeping_tasks')
        .select('*')
        .eq('tenant_id', tenantId);

      if (rawTasks) {
        (rawTasks as unknown as HousekeepingTask[]).forEach((t) => dbTaskMap.set(t.room_id, t));
      }
    } catch {
      // Table may not exist yet; handled via fallback below
    }

    // 5. Fetch fallback tasks in tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const fallbackTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};

    const now = new Date().toISOString();

    // Build authoritative list of tasks covering each physical room unit
    const tasks: HousekeepingTask[] = rooms.map((room) => {
      const dbTask = dbTaskMap.get(room.id);
      const fallback = fallbackTasks[room.id] || {};
      const activeMaint = maintenanceMap.get(room.id);

      const status: HousekeepingStatus =
        dbTask?.status ||
        fallback.status ||
        (room.status === 'dirty'
          ? 'dirty'
          : room.status === 'cleaning'
          ? 'cleaning'
          : room.status === 'inspected'
          ? 'inspected'
          : 'ready');

      const priority = dbTask?.priority || fallback.priority || 'normal';
      const assignedStaffId = dbTask?.assigned_staff_id || fallback.assigned_staff_id;
      const assignedStaffName = dbTask?.assigned_staff_name || fallback.assigned_staff_name;
      const assignedAt = dbTask?.assigned_at || fallback.assigned_at;
      const cleaningStartedAt = dbTask?.cleaning_started_at || fallback.cleaning_started_at;
      const cleaningCompletedAt = dbTask?.cleaning_completed_at || fallback.cleaning_completed_at;
      const turnaroundMinutes = dbTask?.turnaround_minutes || fallback.turnaround_minutes;
      const inspectedByName = dbTask?.inspected_by_name || fallback.inspected_by_name;
      const inspectedAt = dbTask?.inspected_at || fallback.inspected_at;
      const inspectionStatus: InspectionStatus = dbTask?.inspection_status || fallback.inspection_status || 'pending';
      const rejectionReason = dbTask?.rejection_reason || fallback.rejection_reason;
      const notes = dbTask?.notes || fallback.notes;

      return {
        id: dbTask?.id || `hk_${room.id}`,
        tenant_id: tenantId,
        room_id: room.id,
        room_number: room.room_number || room.name,
        category_name: room.category_id ? catMap.get(room.category_id) || room.room_type : room.room_type,
        status,
        assigned_staff_id: assignedStaffId,
        assigned_staff_name: assignedStaffName,
        assigned_at: assignedAt,
        cleaning_started_at: cleaningStartedAt,
        cleaning_completed_at: cleaningCompletedAt,
        turnaround_minutes: turnaroundMinutes,
        priority,
        notes,
        inspected_by_name: inspectedByName,
        inspected_at: inspectedAt,
        inspection_status: inspectionStatus,
        rejection_reason: rejectionReason,
        has_active_maintenance: !!activeMaint || room.status === 'maintenance',
        maintenance_issue: activeMaint ? `${activeMaint.category.toUpperCase()}: ${activeMaint.title}` : undefined,
        created_at: dbTask?.created_at || now,
        updated_at: dbTask?.updated_at || now,
      };
    });

    return { success: true, data: tasks };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve housekeeping tasks.';
    return { success: false, error: message };
  }
}

/**
 * 2. UPDATE ROOM HOUSEKEEPING STATUS (General transition helper)
 */
export async function updateHousekeepingStatus(
  tenantId: string,
  roomId: string,
  status: HousekeepingStatus,
  notes?: string,
  assignedStaffName?: string
): Promise<HousekeepingActionResponse> {
  try {
    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const now = new Date().toISOString();

    // 1. Dual-storage: housekeeping_tasks table
    try {
      await adminDb
        .from('housekeeping_tasks')
        .upsert({
          tenant_id: tenantId,
          room_id: roomId,
          status,
          notes: notes || null,
          assigned_staff_name: assignedStaffName || null,
          updated_at: now,
        });
    } catch {
      // Table may not exist yet
    }

    // 2. Dual-storage: tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};

    currentTasks[roomId] = {
      ...(currentTasks[roomId] || {}),
      status,
      notes: notes || currentTasks[roomId]?.notes,
      assigned_staff_name: assignedStaffName || currentTasks[roomId]?.assigned_staff_name,
      updated_at: now,
    };

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          housekeeping_tasks: currentTasks,
        },
      })
      .eq('id', tenantId);

    // 3. Keep physical rooms.status strictly synchronized
    let targetPhysicalStatus = 'dirty';
    if (status === 'ready') targetPhysicalStatus = 'available';
    else if (status === 'cleaning') targetPhysicalStatus = 'cleaning';
    else if (status === 'inspected') targetPhysicalStatus = 'inspected';
    else targetPhysicalStatus = 'dirty';

    await adminDb
      .from('rooms')
      .update({ status: targetPhysicalStatus, updated_at: now })
      .eq('id', roomId);

    // 4. Record audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'housekeeping_tasks',
        record_id: roomId,
        action_type: 'UPDATE',
        new_data: { room_id: roomId, new_status: status, notes, assigned_to: assignedStaffName },
        created_at: now,
      });
    } catch {
      // Non-blocking
    }

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Room status updated to ${status.toUpperCase()}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update housekeeping status.';
    return { success: false, error: message };
  }
}

/**
 * 3. START CLEANING (Floor Attendant Action)
 * Records cleaning_started_at timestamp and transitions room to 'cleaning'.
 */
export async function startCleaning(
  tenantId: string,
  roomId: string,
  staffName?: string
): Promise<HousekeepingActionResponse> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const payload: Partial<HousekeepingTask> = {
      status: 'cleaning',
      cleaning_started_at: now,
      inspection_status: 'pending',
      updated_at: now,
    };
    if (staffName) payload.assigned_staff_name = staffName;

    // Dual-store in table
    try {
      await adminDb
        .from('housekeeping_tasks')
        .upsert({
          tenant_id: tenantId,
          room_id: roomId,
          ...payload,
        });
    } catch {
      // ignore
    }

    // Dual-store in settings
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};
    currentTasks[roomId] = { ...(currentTasks[roomId] || {}), ...payload };

    await adminDb.from('tenants').update({ settings: { ...settings, housekeeping_tasks: currentTasks } }).eq('id', tenantId);

    // Sync room status
    await adminDb.from('rooms').update({ status: 'cleaning', updated_at: now }).eq('id', roomId);

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return { success: true, message: 'Cleaning started. Room marked in-progress.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to start cleaning.';
    return { success: false, error: message };
  }
}

/**
 * 4. COMPLETE CLEANING & SUBMIT FOR INSPECTION (Floor Attendant Action)
 * Records cleaning_completed_at, computes turnaround time, and transitions room to 'inspected'.
 */
export async function completeCleaningAndSubmitInspection(
  tenantId: string,
  roomId: string,
  notes?: string
): Promise<HousekeepingActionResponse> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // Fetch previous start time to calculate turnaround time
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};
    const existing = currentTasks[roomId] || {};

    let turnaroundMinutes = 30; // sensible default
    if (existing.cleaning_started_at) {
      const startMs = new Date(existing.cleaning_started_at).getTime();
      const diffMs = new Date(now).getTime() - startMs;
      turnaroundMinutes = Math.max(5, Math.round(diffMs / (1000 * 60)));
    }

    const payload: Partial<HousekeepingTask> = {
      status: 'inspected',
      cleaning_completed_at: now,
      turnaround_minutes: turnaroundMinutes,
      inspection_status: 'pending',
      notes: notes || existing.notes,
      updated_at: now,
    };

    // Dual-store in table
    try {
      await adminDb.from('housekeeping_tasks').upsert({
        tenant_id: tenantId,
        room_id: roomId,
        ...payload,
      });
    } catch {
      // ignore
    }

    // Dual-store in settings
    currentTasks[roomId] = { ...existing, ...payload };
    await adminDb.from('tenants').update({ settings: { ...settings, housekeeping_tasks: currentTasks } }).eq('id', tenantId);

    // Sync room status
    await adminDb.from('rooms').update({ status: 'inspected', updated_at: now }).eq('id', roomId);

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Cleaning completed (${turnaroundMinutes}m turnaround). Unit submitted for supervisor inspection.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to complete cleaning.';
    return { success: false, error: message };
  }
}

/**
 * 5. SUPERVISOR APPROVE ROOM (Inspection Passed)
 * Releases room to 'ready' / 'available' for front desk direct check-in.
 */
export async function supervisorApproveRoom(
  tenantId: string,
  roomId: string,
  supervisorName: string,
  notes?: string
): Promise<HousekeepingActionResponse> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const payload: Partial<HousekeepingTask> = {
      status: 'ready',
      inspected_by_name: supervisorName,
      inspected_at: now,
      inspection_status: 'approved',
      rejection_reason: undefined,
      notes: notes || undefined,
      updated_at: now,
    };

    // Dual-store in table
    try {
      await adminDb.from('housekeeping_tasks').upsert({
        tenant_id: tenantId,
        room_id: roomId,
        ...payload,
      });
    } catch {
      // ignore
    }

    // Dual-store in settings
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};
    currentTasks[roomId] = { ...(currentTasks[roomId] || {}), ...payload };

    await adminDb.from('tenants').update({ settings: { ...settings, housekeeping_tasks: currentTasks } }).eq('id', tenantId);

    // Room is now verified available and ready to sell!
    await adminDb.from('rooms').update({ status: 'available', updated_at: now }).eq('id', roomId);

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Unit approved by ${supervisorName}. Room marked clean and ready for guests.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to approve room.';
    return { success: false, error: message };
  }
}

/**
 * 6. SUPERVISOR REJECT & RETURN ROOM TO CLEANING (Inspection Failed)
 * Non-negotiable supervisor workflow: returns room to 'cleaning' with rejection reason and urgent priority.
 */
export async function supervisorRejectRoom(
  tenantId: string,
  roomId: string,
  supervisorName: string,
  rejectionReason: string,
  notes?: string
): Promise<HousekeepingActionResponse> {
  try {
    if (!rejectionReason.trim()) {
      return { success: false, error: 'Rejection reason is mandatory when returning a room to cleaning.' };
    }

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const payload: Partial<HousekeepingTask> = {
      status: 'cleaning',
      priority: 'urgent',
      inspected_by_name: supervisorName,
      inspected_at: now,
      inspection_status: 'rejected',
      rejection_reason: rejectionReason.trim(),
      notes: notes ? notes.trim() : undefined,
      updated_at: now,
    };

    // Dual-store in table
    try {
      await adminDb.from('housekeeping_tasks').upsert({
        tenant_id: tenantId,
        room_id: roomId,
        ...payload,
      });
    } catch {
      // ignore
    }

    // Dual-store in settings
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};
    currentTasks[roomId] = { ...(currentTasks[roomId] || {}), ...payload };

    await adminDb.from('tenants').update({ settings: { ...settings, housekeeping_tasks: currentTasks } }).eq('id', tenantId);

    // Physical room status returns to 'cleaning'
    await adminDb.from('rooms').update({ status: 'cleaning', updated_at: now }).eq('id', roomId);

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Unit rejected by ${supervisorName} and returned to cleaning. Priority set to URGENT.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reject room.';
    return { success: false, error: message };
  }
}

/**
 * 7. ASSIGN HOUSEKEEPING STAFF
 */
export async function assignHousekeepingStaff(
  tenantId: string,
  roomId: string,
  staffId: string,
  staffName: string,
  priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal'
): Promise<HousekeepingActionResponse> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const payload: Partial<HousekeepingTask> = {
      assigned_staff_id: staffId,
      assigned_staff_name: staffName,
      assigned_at: now,
      priority,
      updated_at: now,
    };

    // Table upsert
    try {
      await adminDb.from('housekeeping_tasks').upsert({
        tenant_id: tenantId,
        room_id: roomId,
        ...payload,
      });
    } catch {
      // ignore
    }

    // Settings fallback
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTasks = (settings.housekeeping_tasks as Record<string, Partial<HousekeepingTask>>) || {};
    currentTasks[roomId] = { ...(currentTasks[roomId] || {}), ...payload };

    await adminDb.from('tenants').update({ settings: { ...settings, housekeeping_tasks: currentTasks } }).eq('id', tenantId);

    revalidatePath('/housekeeping');
    return {
      success: true,
      message: `Assigned room task to ${staffName} (${priority.toUpperCase()} priority).`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to assign housekeeping staff.';
    return { success: false, error: message };
  }
}

/**
 * 8. REPORT FLOOR MAINTENANCE ISSUE
 * Links floor defects directly to room operational status and blocks unit if severe.
 */
export async function reportMaintenanceIssue(payload: {
  tenantId: string;
  roomId?: string;
  roomNumber?: string;
  title: string;
  category: MaintenanceCategory;
  severity: MaintenanceSeverity;
  description?: string;
  reportedByName?: string;
}): Promise<HousekeepingActionResponse<MaintenanceTicket>> {
  try {
    const { tenantId, roomId, roomNumber, title, category, severity, description, reportedByName } = payload;
    if (!title.trim()) {
      return { success: false, error: 'Maintenance issue title is required.' };
    }

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const ticket: MaintenanceTicket = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      room_id: roomId || null,
      room_number: roomNumber || null,
      title: title.trim(),
      description: description?.trim() || '',
      category,
      severity,
      status: 'open',
      reported_by_name: reportedByName || 'Floor Attendant',
      created_at: now,
      updated_at: now,
    };

    // Table insert
    try {
      await adminDb.from('maintenance_tickets').insert(ticket);
    } catch {
      // Table may not exist yet
    }

    // Settings fallback
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTickets = (settings.maintenance_tickets as MaintenanceTicket[]) || [];
    currentTickets.unshift(ticket);

    await adminDb.from('tenants').update({ settings: { ...settings, maintenance_tickets: currentTickets } }).eq('id', tenantId);

    // If severity is 'block_unit' or 'urgent', transition room status to 'maintenance'
    if (roomId && (severity === 'block_unit' || severity === 'urgent')) {
      await adminDb.from('rooms').update({ status: 'maintenance', updated_at: now }).eq('id', roomId);
    }

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Maintenance ticket #${ticket.id.slice(0, 6).toUpperCase()} logged.${severity === 'block_unit' ? ' Room placed in maintenance.' : ''}`,
      data: ticket,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to report maintenance issue.';
    return { success: false, error: message };
  }
}

/**
 * 9. RESOLVE MAINTENANCE ISSUE
 * Once fixed, unit returns to 'dirty' so housekeeping can sanitize and inspect it.
 */
export async function resolveMaintenanceIssue(
  tenantId: string,
  ticketId: string,
  roomId?: string,
  resolutionNotes?: string
): Promise<HousekeepingActionResponse> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // Table update
    try {
      await adminDb
        .from('maintenance_tickets')
        .update({
          status: 'resolved',
          resolution_notes: resolutionNotes?.trim() || 'Resolved on floor',
          resolved_at: now,
          updated_at: now,
        })
        .eq('id', ticketId)
        .eq('tenant_id', tenantId);
    } catch {
      // ignore
    }

    // Settings update
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const currentTickets = (settings.maintenance_tickets as MaintenanceTicket[]) || [];
    const updatedTickets = currentTickets.map((t) =>
      t.id === ticketId
        ? {
            ...t,
            status: 'resolved' as const,
            resolution_notes: resolutionNotes?.trim() || 'Resolved on floor',
            resolved_at: now,
            updated_at: now,
          }
        : t
    );

    await adminDb.from('tenants').update({ settings: { ...settings, maintenance_tickets: updatedTickets } }).eq('id', tenantId);

    // If ticket was linked to a room, check if other open maintenance tickets exist
    if (roomId) {
      const remainingOpen = updatedTickets.some(
        (t) => t.room_id === roomId && (t.status === 'open' || t.status === 'in_progress')
      );

      if (!remainingOpen) {
        // Return room to 'dirty' so housekeeping can sanitize and inspect it
        await adminDb.from('rooms').update({ status: 'dirty', updated_at: now }).eq('id', roomId);
      }
    }

    revalidatePath('/housekeeping');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Maintenance ticket resolved. Room returned to housekeeping queue for sanitization.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to resolve maintenance issue.';
    return { success: false, error: message };
  }
}

/**
 * 10. GET ALL MAINTENANCE TICKETS FOR RESORT
 */
export async function getMaintenanceTickets(
  tenantId: string
): Promise<HousekeepingActionResponse<MaintenanceTicket[]>> {
  try {
    const adminDb = createAdminClient();

    try {
      const { data, error } = await adminDb
        .from('maintenance_tickets')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return { success: true, data: data as MaintenanceTicket[] };
      }
    } catch {
      // ignore
    }

    // Fallback to settings
    const { data: tenant } = await adminDb.from('tenants').select('settings').eq('id', tenantId).single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const tickets = (settings.maintenance_tickets as MaintenanceTicket[]) || [];

    return { success: true, data: tickets };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve maintenance tickets.';
    return { success: false, error: message };
  }
}
