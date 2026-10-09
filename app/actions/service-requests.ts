'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';
import { ServiceRequest, ServiceRequestStatus, ServiceRequestCategory } from '@/types';

export interface ServiceRequestActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * 1. CREATE GUEST SERVICE REQUEST (From Guest Portal or Staff Desk)
 */
export async function createServiceRequest(
  tenantId: string,
  requestPayload: {
    booking_id: string;
    guest_name: string;
    room_number?: string;
    category: ServiceRequestCategory;
    title: string;
    description?: string;
  }
): Promise<ServiceRequestActionResponse<ServiceRequest>> {
  try {
    if (!tenantId) return { success: false, error: 'Resort identifier is required.' };
    if (!requestPayload.title?.trim()) return { success: false, error: 'Request title or item is required.' };
    if (!requestPayload.guest_name?.trim()) return { success: false, error: 'Guest name is required.' };

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const newRequest: ServiceRequest = {
      id: `req_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      booking_id: requestPayload.booking_id,
      guest_name: requestPayload.guest_name.trim(),
      room_number: requestPayload.room_number?.trim() || undefined,
      category: requestPayload.category,
      title: requestPayload.title.trim(),
      description: requestPayload.description?.trim() || undefined,
      status: 'PENDING',
      created_at: now,
      updated_at: now,
    };

    // 1. Try SQL insert
    const { data: dbReq, error: dbError } = await adminDb
      .from('service_requests')
      .insert({
        tenant_id: tenantId,
        booking_id: newRequest.booking_id,
        guest_name: newRequest.guest_name,
        room_number: newRequest.room_number || null,
        category: newRequest.category,
        title: newRequest.title,
        description: newRequest.description || null,
        status: newRequest.status,
        created_at: now,
        updated_at: now,
      })
      .select()
      .maybeSingle();

    let createdRecord = newRequest;
    if (!dbError && dbReq) {
      createdRecord = dbReq as unknown as ServiceRequest;
    } else {
      // Fallback: Store in tenant.settings.service_requests
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      const settings = (tenant?.settings as Record<string, unknown>) || {};
      const existing = (settings.service_requests as ServiceRequest[]) || [];
      existing.unshift(newRequest);

      await adminDb
        .from('tenants')
        .update({
          settings: {
            ...settings,
            service_requests: existing.slice(0, 200),
          },
        })
        .eq('id', tenantId);
    }

    // 2. Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        table_name: 'service_requests',
        record_id: createdRecord.id,
        action_type: 'INSERT',
        new_data: {
          category: createdRecord.category,
          title: createdRecord.title,
          guest_name: createdRecord.guest_name,
          room: createdRecord.room_number,
        },
        created_at: now,
      });
    } catch (auditErr) {
      console.warn('[Service Request Audit Log Notice]:', auditErr);
    }

    revalidatePath('/guest-services');
    revalidatePath(`/bookings/${requestPayload.booking_id}`);

    return {
      success: true,
      message: 'Service request submitted successfully. Resort team has been notified.',
      data: createdRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit service request.';
    return { success: false, error: message };
  }
}

/**
 * 2. GET SERVICE REQUESTS (For Staff Desk or Guest Portal)
 */
export async function getServiceRequests(
  tenantId: string,
  bookingId?: string
): Promise<ServiceRequestActionResponse<ServiceRequest[]>> {
  try {
    const adminDb = createAdminClient();

    let query = adminDb
      .from('service_requests')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }

    const { data: dbRequests, error: dbError } = await query;
    if (!dbError && dbRequests && dbRequests.length > 0) {
      return { success: true, data: dbRequests as unknown as ServiceRequest[] };
    }

    // Fallback: Read from tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    let requests = (settings.service_requests as ServiceRequest[]) || [];

    if (bookingId) {
      requests = requests.filter((r) => r.booking_id === bookingId);
    }

    return { success: true, data: requests };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve service requests.';
    return { success: false, error: message };
  }
}

/**
 * 3. UPDATE SERVICE REQUEST STATUS (Staff Operational Workflow)
 */
export async function updateServiceRequestStatus(
  tenantId: string,
  requestId: string,
  status: ServiceRequestStatus,
  staffNotes?: string,
  assignedTo?: string
): Promise<ServiceRequestActionResponse<ServiceRequest>> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // 1. Try SQL update
    const updatePayload: Record<string, unknown> = {
      status,
      updated_at: now,
    };
    if (staffNotes !== undefined) updatePayload.staff_notes = staffNotes;
    if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo;

    const { data: dbReq, error: dbError } = await adminDb
      .from('service_requests')
      .update(updatePayload)
      .eq('id', requestId)
      .eq('tenant_id', tenantId)
      .select()
      .maybeSingle();

    if (!dbError && dbReq) {
      revalidatePath('/guest-services');
      return {
        success: true,
        message: `Request status updated to ${status}.`,
        data: dbReq as unknown as ServiceRequest,
      };
    }

    // 2. Fallback in tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existing = (settings.service_requests as ServiceRequest[]) || [];

    const reqIndex = existing.findIndex((r) => r.id === requestId);
    if (reqIndex >= 0) {
      existing[reqIndex] = {
        ...existing[reqIndex],
        status,
        staff_notes: staffNotes !== undefined ? staffNotes : existing[reqIndex].staff_notes,
        assigned_to: assignedTo !== undefined ? assignedTo : existing[reqIndex].assigned_to,
        updated_at: now,
      };

      await adminDb
        .from('tenants')
        .update({
          settings: {
            ...settings,
            service_requests: existing,
          },
        })
        .eq('id', tenantId);

      revalidatePath('/guest-services');
      return {
        success: true,
        message: `Request status updated to ${status}.`,
        data: existing[reqIndex],
      };
    }

    return { success: false, error: 'Service request record not found.' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update service request.';
    return { success: false, error: message };
  }
}
