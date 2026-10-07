/**
 * Deterministic Inventory Engine for PropSyncHub
 * 
 * Formula:
 * Available Units = Total Active Units in Category
 *                 - Confirmed/Checked-in Bookings
 *                 - Active Holds (pending < 15 min)
 *                 - Maintenance / Out-of-Order Units
 */

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { RoomCategory, Room, Booking } from '@/types';

export interface CategoryAvailabilityResult {
  category: RoomCategory;
  totalUnits: number;
  maintenanceUnits: number;
  bookedUnits: number;
  heldUnits: number;
  availableUnits: number;
  isAvailable: boolean;
  nights: number;
  basePricePerNight: number;
  baseTotal: number;
  extraGuests: number;
  extraPaxRate: number;
  extraPaxTotal: number;
  grandTotal: number;
  availableRoomUnits: Room[];
}

export interface InventoryCheckParams {
  tenantId: string;
  checkIn: string;
  checkOut: string;
  adults?: number;
  children?: number;
}

const HOLD_EXPIRY_MINUTES = 15;

/**
 * Calculates deterministic availability and rates across all room categories
 */
export async function calculateInventoryAvailability(
  params: InventoryCheckParams
): Promise<{
  success: boolean;
  categories: CategoryAvailabilityResult[];
  nights: number;
  checkIn: string;
  checkOut: string;
  error?: string;
}> {
  try {
    const { tenantId, checkIn, checkOut, adults = 2, children = 0 } = params;

    if (!tenantId || !checkIn || !checkOut) {
      return { success: false, categories: [], nights: 1, checkIn, checkOut, error: 'Missing search parameters.' };
    }

    const cIn = new Date(checkIn);
    const cOut = new Date(checkOut);
    if (isNaN(cIn.getTime()) || isNaN(cOut.getTime()) || cOut <= cIn) {
      return { success: false, categories: [], nights: 1, checkIn, checkOut, error: 'Invalid stay dates.' };
    }

    const diffDays = Math.max(1, Math.round((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24)));
    const nights = diffDays;

    const supabase = await createServerSupabaseClient();

    // 1. Fetch Categories
    const { data: rawCats, error: catError } = await supabase
      .from('room_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('base_price_inr', { ascending: true });

    if (catError) throw catError;
    const categories: RoomCategory[] = rawCats || [];

    // 2. Fetch Physical Units (Rooms)
    const { data: rawRooms, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('tenant_id', tenantId);

    if (roomError) throw roomError;
    const allRooms: Room[] = rawRooms || [];

    // 3. Fetch Overlapping Bookings & Holds
    // Overlap: check_in_date < checkOut AND check_out_date > checkIn
    const { data: rawBookings, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn);

    if (bookingError) throw bookingError;
    const bookings: Booking[] = rawBookings || [];

    // Classify overlapping bookings vs active holds
    const now = Date.now();
    const holdCutoff = now - HOLD_EXPIRY_MINUTES * 60 * 1000;

    const confirmedRoomIds = new Set<string>();
    const heldRoomIds = new Set<string>();

    bookings.forEach((b) => {
      if (b.booking_status === 'confirmed' || b.booking_status === 'checked_in') {
        if (b.room_id) confirmedRoomIds.add(b.room_id);
      } else if (b.booking_status === 'pending') {
        // P0.2 Hold TTL evaluation: check hold_expires_at or fallback to 15m creation cutoff
        const isHoldActive = b.hold_expires_at
          ? new Date(b.hold_expires_at).getTime() > now
          : new Date(b.created_at).getTime() > holdCutoff;

        if (isHoldActive && b.room_id) {
          heldRoomIds.add(b.room_id);
        }
      }
    });

    // 4. Compute Availability & Pricing per Category
    const results: CategoryAvailabilityResult[] = categories.map((cat) => {
      // Find all rooms belonging to this category
      const categoryRooms = allRooms.filter((r) => {
        if (r.category_id) return r.category_id === cat.id;
        return (r.room_type || '').toLowerCase() === cat.name.toLowerCase();
      });

      const totalUnits = categoryRooms.length;

      // Units in maintenance, blocked, dirty, or cleaning
      const maintenanceUnits = categoryRooms.filter(
        (r) =>
          r.status === 'maintenance' ||
          r.status === 'blocked' ||
          r.status === 'dirty' ||
          r.status === 'cleaning'
      ).length;

      // Count booked and held units in this category
      let bookedUnits = 0;
      let heldUnits = 0;
      const availableRoomUnits: Room[] = [];

      categoryRooms.forEach((r) => {
        if (r.status !== 'available') return;

        if (confirmedRoomIds.has(r.id)) {
          bookedUnits++;
        } else if (heldRoomIds.has(r.id)) {
          heldUnits++;
        } else {
          availableRoomUnits.push(r);
        }
      });

      const fitsCapacity = (cat.max_adults || 2) >= adults && (cat.max_children || 0) >= children;
      const availableUnits = fitsCapacity ? Math.max(0, availableRoomUnits.length) : 0;
      const isAvailable = availableUnits > 0;

      // Rate Calculations
      const basePricePerNight = Number(cat.base_price_inr);
      const baseTotal = nights * basePricePerNight;
      const extraPaxRate = Number(cat.extra_pax_price_inr || 1000);
      const extraGuests = Math.max(0, adults - 2);
      const extraPaxTotal = nights * extraGuests * extraPaxRate;
      const grandTotal = baseTotal + extraPaxTotal;

      return {
        category: cat,
        totalUnits,
        maintenanceUnits,
        bookedUnits,
        heldUnits,
        availableUnits,
        isAvailable,
        nights,
        basePricePerNight,
        baseTotal,
        extraGuests,
        extraPaxRate,
        extraPaxTotal,
        grandTotal,
        availableRoomUnits,
      };
    });

    return {
      success: true,
      categories: results,
      nights,
      checkIn,
      checkOut,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Inventory availability calculation failed.';
    return {
      success: false,
      categories: [],
      nights: 1,
      checkIn: params.checkIn,
      checkOut: params.checkOut,
      error: msg,
    };
  }
}

/**
 * Deterministically assigns the best available physical room unit for a category stay
 */
export async function assignAvailableRoomUnit(
  tenantId: string,
  categoryId: string,
  checkIn: string,
  checkOut: string
): Promise<Room | null> {
  const result = await calculateInventoryAvailability({
    tenantId,
    checkIn,
    checkOut,
  });

  if (!result.success) return null;

  const catResult = result.categories.find((c) => c.category.id === categoryId);
  if (!catResult || catResult.availableRoomUnits.length === 0) {
    return null;
  }

  // Return the first available physical room unit
  return catResult.availableRoomUnits[0];
}
