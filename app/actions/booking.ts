'use server';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { Room, RoomCategory, Booking } from '@/types';

export interface RoomWithPricing extends Room {
  nights: number;
  baseTotal: number;
  extraGuests: number;
  extraPaxRate: number;
  extraPaxTotal: number;
  grandTotal: number;
  category?: RoomCategory;
}

export interface AvailabilityResponse {
  success: boolean;
  error?: string;
  rooms?: RoomWithPricing[];
  nights?: number;
  checkIn?: string;
  checkOut?: string;
}

/**
 * Real-time Room Availability Engine
 * 
 * Takes check-in/check-out dates and guest counts,
 * queries Supabase for overlapping bookings,
 * and returns only non-conflicting available rooms with computed dynamic pricing.
 */
export async function checkRoomAvailability(
  tenantId: string,
  checkIn: string,
  checkOut: string,
  adults: number = 2,
  children: number = 0
): Promise<AvailabilityResponse> {
  try {
    if (!tenantId) {
      return { success: false, error: 'Tenant identifier is required.' };
    }
    if (!checkIn || !checkOut) {
      return { success: false, error: 'Both check-in and check-out dates are required.' };
    }

    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);

    if (isNaN(checkInDate.getTime()) || isNaN(checkOutDate.getTime())) {
      return { success: false, error: 'Invalid dates provided.' };
    }

    if (checkOutDate <= checkInDate) {
      return { success: false, error: 'Check-out date must be after check-in date.' };
    }

    const diffMs = checkOutDate.getTime() - checkInDate.getTime();
    const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

    const supabase = await createServerSupabaseClient();

    // 1. Fetch all rooms belonging to this tenant that are marked 'available'
    const { data: allRooms, error: roomsError } = await supabase
      .from('rooms')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('status', 'available')
      .order('base_price_inr', { ascending: true });

    if (roomsError) throw roomsError;
    if (!allRooms || allRooms.length === 0) {
      return { success: true, rooms: [], nights, checkIn, checkOut };
    }

    // 2. Fetch overlapping active bookings for the specified date window
    // An overlap exists when: booking.check_in_date < checkOut AND booking.check_out_date > checkIn
    const { data: overlappingBookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('room_id')
      .eq('tenant_id', tenantId)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn);

    if (bookingsError) throw bookingsError;

    const bookedRoomIds = new Set(
      (overlappingBookings || []).map((b) => b.room_id).filter(Boolean)
    );

    // 3. Fetch room categories to determine extra pax charges
    let categories: RoomCategory[] = [];
    const { data: catData, error: catError } = await supabase
      .from('room_categories')
      .select('*')
      .eq('tenant_id', tenantId);

    if (!catError && catData) {
      categories = catData as RoomCategory[];
    } else {
      // Fallback: check tenant settings JSON
      const { data: tenant } = await supabase
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();
      const settings = (tenant?.settings as Record<string, unknown>) || {};
      if (Array.isArray(settings.room_categories)) {
        categories = settings.room_categories as RoomCategory[];
      }
    }

    const categoryMap = new Map<string, RoomCategory>();
    categories.forEach((cat) => {
      categoryMap.set(cat.name.toLowerCase(), cat);
    });

    // 4. Filter unbooked rooms and compute dynamic pricing
    const availableRoomsWithPricing: RoomWithPricing[] = [];

    for (const room of allRooms as Room[]) {
      // Skip if room is already booked for these dates
      if (bookedRoomIds.has(room.id)) {
        continue;
      }

      // Check capacity
      const totalPax = adults + children;
      const roomCapacity = (room.capacity_adults || 2) + (room.capacity_children || 0);
      if (adults > (room.capacity_adults || 2) + 2 || totalPax > roomCapacity + 2) {
        // Exceeds absolute max capacity including extra rollaway beds
        continue;
      }

      // Find matching category
      const matchedCategory = categoryMap.get((room.room_type || '').toLowerCase());
      const extraPaxRate = matchedCategory?.extra_pax_price_inr ?? 1000;

      // Base price calculation: (Total Nights * Room Base Price)
      const baseTotal = nights * Number(room.base_price_inr);

      // Extra pax calculation: (Total Nights * Extra Pax Charge * Number of Extra Guests)
      // Standard room base covers 2 adults; any adult beyond 2 is considered extra pax
      const extraGuests = Math.max(0, adults - 2);
      const extraPaxTotal = nights * extraPaxRate * extraGuests;

      // Dynamic grand total
      const grandTotal = baseTotal + extraPaxTotal;

      availableRoomsWithPricing.push({
        ...room,
        nights,
        baseTotal,
        extraGuests,
        extraPaxRate,
        extraPaxTotal,
        grandTotal,
        category: matchedCategory,
      });
    }

    return {
      success: true,
      rooms: availableRoomsWithPricing,
      nights,
      checkIn,
      checkOut,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to search room availability.';
    return { success: false, error: message };
  }
}

/**
 * Create Reservation Record
 */
export async function createReservation(payload: {
  tenantId: string;
  roomId: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName: string;
  guestMobile: string;
  guestEmail?: string;
  totalAmount: number;
  specialRequests?: string;
}): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  try {
    const {
      tenantId,
      roomId,
      checkIn,
      checkOut,
      adults,
      children,
      guestName,
      guestMobile,
      guestEmail,
      totalAmount,
      specialRequests,
    } = payload;

    if (!tenantId || !roomId || !checkIn || !checkOut || !guestName || !guestMobile) {
      return { success: false, error: 'Missing required reservation fields.' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Double check that room wasn't booked in the interim
    const { data: collision } = await supabase
      .from('bookings')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('room_id', roomId)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn)
      .limit(1);

    if (collision && collision.length > 0) {
      return {
        success: false,
        error: 'This room was just booked by another guest for the selected dates. Please choose another room.',
      };
    }

    const cleanMobile = guestMobile.replace(/[^\d+]/g, '');

    const { data: booking, error: insertError } = await supabase
      .from('bookings')
      .insert({
        tenant_id: tenantId,
        room_id: roomId,
        user_id: user?.id || null,
        guest_name: guestName.trim(),
        guest_mobile_number: cleanMobile,
        guest_email: guestEmail?.trim() || null,
        check_in_date: checkIn,
        check_out_date: checkOut,
        num_adults: adults,
        num_children: children,
        total_amount_inr: totalAmount,
        booking_status: 'pending',
        payment_status: 'pending',
        special_requests: specialRequests?.trim() || null,
      })
      .select()
      .single();

    if (insertError) {
      throw insertError;
    }

    return {
      success: true,
      booking: booking as Booking,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to finalize reservation.';
    return { success: false, error: message };
  }
}

/**
 * Update Booking Status (Accept / Decline / Check In / Check Out)
 * Admin action allowing manual acceptance after offline room availability check.
 */
export async function updateBookingStatus(
  bookingId: string,
  tenantId: string,
  newStatus: 'confirmed' | 'cancelled' | 'checked_in' | 'checked_out',
  notes?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!bookingId || !tenantId) {
      return { success: false, error: 'Booking ID and Tenant ID are required.' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const updatePayload: Record<string, unknown> = {
      booking_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updatePayload.special_requests = notes;
    }

    const { error: updateError } = await supabase
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .select()
      .single();

    if (updateError) {
      throw updateError;
    }

    // Direct audit trail entry
    try {
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'UPDATE',
        old_data: null,
        new_data: {
          booking_status: newStatus,
          action_by: user?.id || null,
          updated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Audit log fallback
    }

    const actionText =
      newStatus === 'confirmed'
        ? 'Accepted & Confirmed'
        : newStatus === 'cancelled'
        ? 'Declined / Cancelled'
        : newStatus === 'checked_in'
        ? 'Checked In'
        : 'Checked Out';

    return {
      success: true,
      message: `Booking #${bookingId.slice(0, 8).toUpperCase()} successfully marked as ${actionText}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update booking status.';
    return { success: false, error: message };
  }
}
