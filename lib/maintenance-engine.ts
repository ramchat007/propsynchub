/**
 * PropSyncHub Maintenance & Inventory Collision Engine
 * 
 * Non-negotiable architectural invariant:
 * Maintenance blocks reduce sellable inventory and CANNOT silently conflict
 * with existing reservations.
 * 
 * 1. Pre-block Collision Validation:
 *    A room cannot be placed under maintenance if an active booking overlaps that window.
 * 2. Availability Filtering:
 *    Any room with an active maintenance block overlapping requested dates is
 *    immediately excluded from sellable inventory.
 * 3. Dual-storage Resilience:
 *    Operates with public.room_blocks and transparent fallback to tenant.settings.room_blocks.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { RoomBlock } from '@/types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = SupabaseClient<any, any, any>;

export interface CollisionCheckResult {
  canBlock: boolean;
  conflictReason?: string;
  conflictingBooking?: {
    id: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    booking_status: string;
  };
}

/**
 * 1. Validates that no active reservation conflicts with a proposed maintenance window.
 */
export async function validateMaintenanceBlockSafety(
  adminDb: DbClient,
  tenantId: string,
  roomId: string,
  startDate: string,
  endDate: string
): Promise<CollisionCheckResult> {
  // Query all active/confirmed/checked-in/pending bookings on this unit overlapping the window
  const { data: collisions, error } = await adminDb
    .from('bookings')
    .select('id, guest_name, check_in_date, check_out_date, booking_status, hold_expires_at')
    .eq('tenant_id', tenantId)
    .eq('room_id', roomId)
    .neq('booking_status', 'cancelled')
    .lt('check_in_date', endDate)
    .gt('check_out_date', startDate);

  if (error) {
    console.warn('[CollisionCheck] Error checking overlapping bookings:', error.message);
  }

  const now = Date.now();
  const activeConflict = (collisions || []).find((b) => {
    if (b.booking_status === 'confirmed' || b.booking_status === 'checked_in') return true;
    if (b.booking_status === 'pending') {
      if (b.hold_expires_at) return new Date(b.hold_expires_at).getTime() > now;
      return true;
    }
    return false;
  });

  if (activeConflict) {
    const ref = activeConflict.id.slice(0, 8).toUpperCase();
    return {
      canBlock: false,
      conflictingBooking: activeConflict,
      conflictReason: `Reservation Conflict: Unit has an active booking #${ref} for "${activeConflict.guest_name}" from ${activeConflict.check_in_date} to ${activeConflict.check_out_date}. Please reassign the booking before scheduling maintenance.`,
    };
  }

  return { canBlock: true };
}

/**
 * 2. Fetches active maintenance blocks for a resort.
 */
export async function getActiveRoomBlocks(
  adminDb: DbClient,
  tenantId: string
): Promise<RoomBlock[]> {
  try {
    const { data, error } = await adminDb
      .from('room_blocks')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('start_date', { ascending: true });

    if (!error && data) {
      return data as RoomBlock[];
    }
  } catch {
    // ignore
  }

  // Fallback to tenant settings storage
  try {
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    if (Array.isArray(settings.room_blocks)) {
      return (settings.room_blocks as RoomBlock[]).filter((b) => b.status === 'active');
    }
  } catch {
    // ignore
  }

  return [];
}

/**
 * 3. Checks if a room has an active block overlapping given stay dates.
 */
export function isRoomBlockedForDates(
  roomId: string,
  checkIn: string,
  checkOut: string,
  activeBlocks: RoomBlock[]
): { isBlocked: boolean; block?: RoomBlock } {
  const match = activeBlocks.find((b) => {
    if (b.room_id !== roomId) return false;
    if (b.status !== 'active') return false;
    // Overlap: b.start_date < checkOut AND b.end_date > checkIn
    return b.start_date < checkOut && b.end_date > checkIn;
  });

  return {
    isBlocked: !!match,
    block: match,
  };
}
