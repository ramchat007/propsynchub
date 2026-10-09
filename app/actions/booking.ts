'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { Room, RoomCategory, Booking, PaymentPolicy, NightlyRateBreakdown } from '@/types';
import { notifications } from '@/lib/notifications';
import { getActiveRoomBlocks, isRoomBlockedForDates } from '@/lib/maintenance-engine';
import { calculateAuthoritativeStayPricing } from '@/lib/pricing-engine';
import { getSeasonalPricingRulesList } from '@/app/actions/inventory';

export interface RoomWithPricing extends Room {
  nights: number;
  baseTotal: number;
  extraGuests: number;
  extraPaxRate: number;
  extraPaxTotal: number;
  grandTotal: number;
  category?: RoomCategory;
  nightlyBreakdown?: NightlyRateBreakdown[];
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
      .select('room_id, booking_status, hold_expires_at, created_at')
      .eq('tenant_id', tenantId)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', checkOut)
      .gt('check_out_date', checkIn);

    if (bookingsError) throw bookingsError;

    // Filter out expired pending holds (P0.2: 15-min hold TTL)
    const now = Date.now();
    const activeOverlapping = (overlappingBookings || []).filter((b) => {
      if (b.booking_status === 'confirmed' || b.booking_status === 'checked_in') {
        return true;
      }
      if (b.booking_status === 'pending') {
        if (b.hold_expires_at) {
          return new Date(b.hold_expires_at).getTime() > now;
        }
        // Fallback: 15-minute hold TTL based on created_at
        const createdAt = new Date(b.created_at).getTime();
        return now - createdAt < 15 * 60 * 1000;
      }
      return false;
    });

    const bookedRoomIds = new Set(
      activeOverlapping.map((b) => b.room_id).filter(Boolean)
    );

    // 3. Fetch active maintenance blocks & seasonal pricing rules (Phase 2 Invariants)
    const [activeBlocks, pricingRules] = await Promise.all([
      getActiveRoomBlocks(supabase, tenantId),
      getSeasonalPricingRulesList(tenantId),
    ]);

    // 4. Fetch room categories
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
    const categoryIdMap = new Map<string, RoomCategory>();
    categories.forEach((cat) => {
      categoryMap.set(cat.name.toLowerCase(), cat);
      if (cat.id) categoryIdMap.set(cat.id, cat);
    });

    // 5. Filter unbooked, unblocked rooms and compute authoritative dynamic pricing
    const availableRoomsWithPricing: RoomWithPricing[] = [];

    for (const room of allRooms as Room[]) {
      // Skip if room is already booked for these dates
      if (bookedRoomIds.has(room.id)) {
        continue;
      }

      // Skip if room has an active maintenance or out-of-order block overlapping stay dates
      const blockCheck = isRoomBlockedForDates(room.id, checkIn, checkOut, activeBlocks);
      if (blockCheck.isBlocked) {
        continue;
      }

      // Find matching category (by ID or name)
      const matchedCategory = (room.category_id ? categoryIdMap.get(room.category_id) : null) ||
        categoryMap.get((room.room_type || '').toLowerCase());

      // Authoritative stay pricing with precedence: Date Override > Seasonal > Weekend > Base Tariff
      // Also enforces adult / child occupancy thresholds
      const pricingResult = calculateAuthoritativeStayPricing({
        checkIn,
        checkOut,
        adults,
        children,
        basePriceInr: Number(room.base_price_inr),
        category: matchedCategory,
        room,
        pricingRules,
      });

      // If room exceeds allowed occupancy, exclude from availability
      if (!pricingResult.is_available) {
        continue;
      }

      availableRoomsWithPricing.push({
        ...room,
        nights,
        baseTotal: pricingResult.total_room_charges_inr,
        extraGuests: pricingResult.extra_adults + pricingResult.extra_children,
        extraPaxRate: pricingResult.extra_adult_rate_inr,
        extraPaxTotal: pricingResult.total_extra_guest_charges_inr,
        grandTotal: pricingResult.grand_total_inr,
        category: matchedCategory,
        nightlyBreakdown: pricingResult.nightly_breakdown,
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
  roomId?: string | null;
  categoryId?: string | null;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  guestName: string;
  guestMobile: string;
  guestEmail?: string;
  totalAmount: number;
  specialRequests?: string;
  paymentPolicy?: PaymentPolicy;
  paidAmount?: number;
  mealPlanCode?: import('@/types').MealPlanCode;
  mealPlanChargeInr?: number;
  guestGstin?: string;
  companyName?: string;
  billingAddress?: string;
}): Promise<{ success: boolean; error?: string; booking?: Booking }> {
  try {
    const {
      tenantId,
      roomId,
      categoryId,
      checkIn,
      checkOut,
      adults,
      children,
      guestName,
      guestMobile,
      guestEmail,
      totalAmount,
      specialRequests,
      paymentPolicy = 'FULL_PAYMENT',
      paidAmount = 0,
      mealPlanCode = 'EP',
      mealPlanChargeInr = 0,
      guestGstin,
      companyName,
      billingAddress,
    } = payload;

    if (!tenantId || (!roomId && !categoryId) || !checkIn || !checkOut || !guestName || !guestMobile) {
      return { success: false, error: 'Missing required reservation fields.' };
    }

    const supabase = await createServerSupabaseClient();
    const adminDb = createAdminClient();
    const { data: { user } } = await supabase.auth.getUser();

    let resolvedRoomId = roomId || null;
    let resolvedCategoryId = categoryId || null;

    // Fetch active maintenance blocks for tenant (Phase 2 Invariant: maintenance blocks reduce sellable inventory)
    const activeBlocks = await getActiveRoomBlocks(adminDb, tenantId);

    // 1. If category provided but no roomId, find an available physical room in that category
    if (!resolvedRoomId && resolvedCategoryId) {
      const { data: catRooms } = await adminDb
        .from('rooms')
        .select('id, name, status')
        .eq('tenant_id', tenantId)
        .eq('category_id', resolvedCategoryId)
        .in('status', ['available', 'inspected']);

      if (catRooms && catRooms.length > 0) {
        // Query overlapping active bookings for these rooms
        const roomIds = catRooms.map((r) => r.id);
        const { data: busyBookings } = await adminDb
          .from('bookings')
          .select('room_id, booking_status, hold_expires_at, created_at')
          .in('room_id', roomIds)
          .neq('booking_status', 'cancelled')
          .lt('check_in_date', checkOut)
          .gt('check_out_date', checkIn);

        const now = Date.now();
        const busyRoomIds = new Set(
          (busyBookings || [])
            .filter((b) => {
              if (b.booking_status === 'confirmed' || b.booking_status === 'checked_in') return true;
              if (b.booking_status === 'pending') {
                if (b.hold_expires_at) return new Date(b.hold_expires_at).getTime() > now;
                return now - new Date(b.created_at).getTime() < 15 * 60 * 1000;
              }
              return false;
            })
            .map((b) => b.room_id)
        );

        // Filter out rooms that are already booked OR have an active maintenance block
        const freeRoom = catRooms.find((r) => {
          if (busyRoomIds.has(r.id)) return false;
          const blocked = isRoomBlockedForDates(r.id, checkIn, checkOut, activeBlocks);
          return !blocked.isBlocked;
        });

        if (freeRoom) {
          resolvedRoomId = freeRoom.id;
        }
      }
    }

    // 2. If room specified, check category and double check collision
    if (resolvedRoomId) {
      if (!resolvedCategoryId) {
        const { data: rm } = await adminDb
          .from('rooms')
          .select('category_id')
          .eq('id', resolvedRoomId)
          .single();
        if (rm?.category_id) resolvedCategoryId = rm.category_id;
      }

      // 2a. Check maintenance block collision
      const blockCheck = isRoomBlockedForDates(resolvedRoomId, checkIn, checkOut, activeBlocks);
      if (blockCheck.isBlocked) {
        return {
          success: false,
          error: `Unit is blocked for ${blockCheck.block?.block_type.replace('_', ' ') || 'maintenance'} (${blockCheck.block?.start_date} to ${blockCheck.block?.end_date}). Reason: ${blockCheck.block?.reason || 'Maintenance'}.`,
        };
      }

      // 2b. Check reservation collision
      const { data: collision } = await adminDb
        .from('bookings')
        .select('id, booking_status, hold_expires_at, created_at')
        .eq('tenant_id', tenantId)
        .eq('room_id', resolvedRoomId)
        .neq('booking_status', 'cancelled')
        .lt('check_in_date', checkOut)
        .gt('check_out_date', checkIn);

      const now = Date.now();
      const activeCollision = (collision || []).find((b) => {
        if (b.booking_status === 'confirmed' || b.booking_status === 'checked_in') return true;
        if (b.booking_status === 'pending') {
          if (b.hold_expires_at) return new Date(b.hold_expires_at).getTime() > now;
          return now - new Date(b.created_at).getTime() < 15 * 60 * 1000;
        }
        return false;
      });

      if (activeCollision) {
        return {
          success: false,
          error: 'This room was just reserved by another guest for the selected dates. Please choose another option.',
        };
      }
    }

    // 2c. Enforce adult/child occupancy limits (Phase 2 Invariant)
    let targetCategory: RoomCategory | null = null;
    let targetRoom: Room | null = null;
    if (resolvedRoomId) {
      const { data: rm } = await adminDb.from('rooms').select('*').eq('id', resolvedRoomId).single();
      if (rm) {
        targetRoom = rm as Room;
        if (!resolvedCategoryId && rm.category_id) resolvedCategoryId = rm.category_id;
      }
    }
    if (resolvedCategoryId) {
      const { data: cat } = await adminDb.from('room_categories').select('*').eq('id', resolvedCategoryId).single();
      if (cat) targetCategory = cat as RoomCategory;
    }

    const occupancyValidation = calculateAuthoritativeStayPricing({
      checkIn,
      checkOut,
      adults,
      children,
      category: targetCategory,
      room: targetRoom,
    });

    if (!occupancyValidation.is_available) {
      return {
        success: false,
        error: occupancyValidation.unavailability_reason || 'Occupancy exceeds maximum limit for this accommodation.',
      };
    }

    const cleanMobile = guestMobile.replace(/[^\d+]/g, '');

    // 3. Compute hold TTL and initial balances based on payment policy
    const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    let initialBookingStatus: 'pending' | 'confirmed' = 'pending';
    let initialPaymentStatus: 'pending' | 'paid' | 'partially_paid' = 'pending';
    let initialPaid = 0;
    let initialBalance = totalAmount;

    if (paymentPolicy === 'PAY_AT_PROPERTY') {
      initialBookingStatus = 'confirmed';
      initialPaymentStatus = 'pending';
      initialPaid = 0;
      initialBalance = totalAmount;
    } else if (paymentPolicy === 'ADVANCE') {
      initialBookingStatus = 'pending';
      initialPaymentStatus = 'pending';
      initialPaid = paidAmount > 0 ? paidAmount : Math.round(totalAmount * 0.5);
      initialBalance = totalAmount - initialPaid;
    } else {
      // FULL_PAYMENT
      initialBookingStatus = 'pending';
      initialPaymentStatus = 'pending';
      initialPaid = 0;
      initialBalance = totalAmount;
    }

    const insertPayload: Record<string, unknown> = {
      tenant_id: tenantId,
      room_id: resolvedRoomId,
      category_id: resolvedCategoryId,
      user_id: user?.id || null,
      guest_name: guestName.trim(),
      guest_mobile_number: cleanMobile,
      guest_email: guestEmail?.trim() || null,
      check_in_date: checkIn,
      check_out_date: checkOut,
      num_adults: adults,
      num_children: children,
      total_amount_inr: totalAmount,
      paid_amount_inr: initialPaid,
      balance_amount_inr: initialBalance,
      booking_status: initialBookingStatus,
      payment_status: initialPaymentStatus,
      hold_expires_at: holdExpiresAt,
      special_requests: specialRequests?.trim() || null,
      meal_plan_code: mealPlanCode || 'EP',
      meal_plan_charge_inr: mealPlanChargeInr || 0,
      guest_gstin: guestGstin ? guestGstin.trim().toUpperCase() : null,
      company_name: companyName?.trim() || null,
      billing_address: billingAddress?.trim() || null,
    };

    let booking = null;
    const { data: initialBooking, error: insertError } = await adminDb
      .from('bookings')
      .insert(insertPayload)
      .select()
      .single();
    booking = initialBooking;

    if (insertError) {
      // Fallback if newly added columns are not yet in the DB schema
      const metaEnvelope = {
        meal_plan_code: mealPlanCode || 'EP',
        meal_plan_charge_inr: mealPlanChargeInr || 0,
        guest_gstin: guestGstin ? guestGstin.trim().toUpperCase() : null,
        company_name: companyName?.trim() || null,
        billing_address: billingAddress?.trim() || null,
        notes: specialRequests?.trim() || null,
      };

      const fallbackPayload = {
        tenant_id: tenantId,
        room_id: resolvedRoomId,
        user_id: user?.id || null,
        guest_name: guestName.trim(),
        guest_mobile_number: cleanMobile,
        guest_email: guestEmail?.trim() || null,
        check_in_date: checkIn,
        check_out_date: checkOut,
        num_adults: adults,
        num_children: children,
        total_amount_inr: totalAmount,
        booking_status: initialBookingStatus,
        payment_status: initialPaymentStatus,
        special_requests: `JSON:${JSON.stringify(metaEnvelope)}`,
      };
      const retry = await adminDb
        .from('bookings')
        .insert(fallbackPayload)
        .select()
        .single();
      if (retry.error) throw retry.error;
      booking = retry.data;
    }

    // 4. Send Confirmation Email if Pay At Property
    if (paymentPolicy === 'PAY_AT_PROPERTY' && booking && guestEmail) {
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('name, contact_phone')
        .eq('id', tenantId)
        .single();

      const diffMs = new Date(checkOut).getTime() - new Date(checkIn).getTime();
      const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));

      try {
        await notifications.sendBookingConfirmationEmail({
          to: guestEmail,
          guestName: guestName.trim(),
          bookingReference: (booking as Booking).id.slice(0, 8).toUpperCase(),
          resortName: tenant?.name || 'Resort Desk',
          categoryName: 'Standard Accommodation',
          checkInDate: checkIn,
          checkOutDate: checkOut,
          nights,
          adults,
          children,
          totalAmountInr: totalAmount,
          paymentStatus: 'Pay At Property (Balance: ₹' + initialBalance.toLocaleString('en-IN') + ')',
          guestPortalUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`,
          contactPhone: tenant?.contact_phone || undefined,
        });
      } catch (notifErr) {
        console.warn('[Confirmation Email Notice]:', notifErr);
      }
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

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Verify staff/admin authorization
    let isAuthorized = false;
    if (user) {
      const ADMIN_EMAILS = [
        'ramchat007@gmail.com',
        'admin@raigadtropical.com',
        'contact@raigadtropical.com',
      ];
      if (user.email && (ADMIN_EMAILS.includes(user.email.toLowerCase()) || user.email.toLowerCase().includes('admin'))) {
        isAuthorized = true;
      } else {
        const { data: profile } = await adminDb
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && (profile.role === 'tenant_admin' || profile.role === 'staff' || profile.role === 'superadmin')) {
          isAuthorized = true;
        }
      }
    } else {
      // In development or server tasks without interactive user session
      isAuthorized = process.env.NODE_ENV !== 'production';
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Forbidden: Front desk staff or manager privileges required to update booking status.',
      };
    }

    // 1. Fetch current booking record
    const { data: existingBooking, error: fetchErr } = await adminDb
      .from('bookings')
      .select('id, guest_name, booking_status, room_id, check_in_date, check_out_date')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (fetchErr || !existingBooking) {
      return { success: false, error: 'Booking record not found.' };
    }

    // 2. Unit assignment & readiness guard for Check In
    if (newStatus === 'checked_in') {
      if (!existingBooking.room_id) {
        return {
          success: false,
          error: 'Cannot Check In: No room unit has been assigned yet. Please click "Change Unit" to assign a room first.',
        };
      }

      const { data: assignedRoom } = await adminDb
        .from('rooms')
        .select('name, status')
        .eq('id', existingBooking.room_id)
        .maybeSingle();

      if (assignedRoom) {
        if (assignedRoom.status === 'dirty' || assignedRoom.status === 'cleaning') {
          return {
            success: false,
            error: `Cannot Check In: Room ${assignedRoom.name} is currently marked "${assignedRoom.status.toUpperCase()}". Housekeeping cleaning & inspection must be completed first.`,
          };
        }
        if (assignedRoom.status === 'maintenance' || assignedRoom.status === 'blocked') {
          return {
            success: false,
            error: `Cannot Check In: Room ${assignedRoom.name} is currently marked "${assignedRoom.status.toUpperCase()}".`,
          };
        }
      }
    }

    const updatePayload: Record<string, unknown> = {
      booking_status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (notes) {
      updatePayload.special_requests = notes;
    }

    const { error: updateError } = await adminDb
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    if (updateError) {
      throw updateError;
    }

    // P0.1 Housekeeping Trigger: If checked out, immediately mark room dirty
    if (newStatus === 'checked_out' && existingBooking.room_id) {
      try {
        await adminDb
          .from('rooms')
          .update({
            status: 'dirty',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingBooking.room_id);
      } catch (rErr) {
        console.warn('[Checkout Room Dirty Notice]:', rErr);
      }
    }

    // Direct audit trail entry
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'UPDATE',
        old_data: { booking_status: existingBooking.booking_status },
        new_data: {
          booking_status: newStatus,
          action_by: user?.email || user?.id || 'staff',
          updated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    } catch {
      // Audit log fallback
    }

    revalidatePath('/bookings');
    revalidatePath('/dashboard');
    revalidatePath('/calendar');

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

/**
 * Reassign Booking to a different Room
 * Admin action allowing front desk manager to switch rooms with double-booking prevention.
 */
export async function reassignBookingRoom(
  bookingId: string,
  tenantId: string,
  newRoomId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    if (!bookingId || !tenantId || !newRoomId) {
      return { success: false, error: 'Booking ID, Tenant ID, and new Room ID are required.' };
    }

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Verify staff/admin authorization
    let isAuthorized = false;
    if (user) {
      const ADMIN_EMAILS = [
        'ramchat007@gmail.com',
        'admin@raigadtropical.com',
        'contact@raigadtropical.com',
      ];
      if (user.email && (ADMIN_EMAILS.includes(user.email.toLowerCase()) || user.email.toLowerCase().includes('admin'))) {
        isAuthorized = true;
      } else {
        const { data: profile } = await adminDb
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && (profile.role === 'tenant_admin' || profile.role === 'staff' || profile.role === 'superadmin')) {
          isAuthorized = true;
        }
      }
    } else {
      isAuthorized = process.env.NODE_ENV !== 'production';
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Forbidden: Front desk staff or manager privileges required to reassign rooms.',
      };
    }

    // 1. Fetch current booking stay dates
    const { data: booking, error: bErr } = await adminDb
      .from('bookings')
      .select('id, guest_name, check_in_date, check_out_date, room_id')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (bErr || !booking) {
      return { success: false, error: 'Booking not found.' };
    }

    // 2. Check if new room exists and belongs to tenant
    const { data: room, error: roomErr } = await adminDb
      .from('rooms')
      .select('name, status')
      .eq('id', newRoomId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (roomErr || !room) {
      return { success: false, error: 'Target room does not exist.' };
    }

    // 2b. Housekeeping & Out-of-Order Check for immediate check-in:
    const todayStr = new Date().toISOString().split('T')[0];
    if (booking.check_in_date <= todayStr) {
      if (room.status === 'dirty' || room.status === 'cleaning') {
        return {
          success: false,
          error: `Cannot assign ${room.name}: Room is currently marked "${room.status.toUpperCase()}". Please complete housekeeping cleaning and inspection first.`,
        };
      }
      if (room.status === 'maintenance' || room.status === 'blocked') {
        return {
          success: false,
          error: `Cannot assign ${room.name}: Room is currently marked "${room.status.toUpperCase()}".`,
        };
      }
    }

    // 3. Prevent double-booking / collision in the new target room for this guest's dates
    const { data: collision } = await adminDb
      .from('bookings')
      .select('id, guest_name, booking_status, hold_expires_at, created_at')
      .eq('tenant_id', tenantId)
      .eq('room_id', newRoomId)
      .neq('id', bookingId)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', booking.check_out_date)
      .gt('check_out_date', booking.check_in_date);

    const now = Date.now();
    const activeCollision = (collision || []).find((c) => {
      if (c.booking_status === 'confirmed' || c.booking_status === 'checked_in') return true;
      if (c.booking_status === 'pending') {
        if (c.hold_expires_at) return new Date(c.hold_expires_at).getTime() > now;
        return now - new Date(c.created_at).getTime() < 15 * 60 * 1000;
      }
      return false;
    });

    if (activeCollision) {
      return {
        success: false,
        error: `Cannot assign: ${room.name} is already booked by ${activeCollision.guest_name} for these dates.`,
      };
    }

    const { error: updateError } = await adminDb
      .from('bookings')
      .update({
        room_id: newRoomId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    if (updateError) throw updateError;

    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'UPDATE',
        old_data: { room_id: booking.room_id },
        new_data: {
          reassigned_room_id: newRoomId,
          reassigned_room_name: room.name,
          updated_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    } catch {}

    revalidatePath('/bookings');
    revalidatePath('/dashboard');
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Booking #${bookingId.slice(0, 8).toUpperCase()} reassigned to ${room.name} successfully.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reassign room.';
    return { success: false, error: message };
  }
}

/**
 * Assign Physical Room Unit to an unassigned reservation (Category-First Flow)
 */
export async function assignBookingRoom(
  bookingId: string,
  tenantId: string,
  newRoomId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  return reassignBookingRoom(bookingId, tenantId, newRoomId);
}

/**
 * Confirm Pay-At-Property Reservation
 * Transitions pending hold directly to confirmed reservation with payment_status = pending
 * Dispatches formal booking confirmation email.
 */
export async function confirmPayAtPropertyReservation(
  bookingId: string,
  tenantId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const adminDb = createAdminClient();
    const { data: booking, error } = await adminDb
      .from('bookings')
      .select('*, tenant:tenants(name, contact_phone)')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !booking) {
      return { success: false, error: 'Booking not found.' };
    }

    const total = Number(booking.total_amount_inr || 0);

    const { error: updErr } = await adminDb
      .from('bookings')
      .update({
        booking_status: 'confirmed',
        payment_status: 'pending',
        paid_amount_inr: 0,
        balance_amount_inr: total,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId);

    if (updErr) {
      // Fallback without new columns
      await adminDb
        .from('bookings')
        .update({
          booking_status: 'confirmed',
          payment_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);
    }

    // Send confirmation email
    if (booking.guest_email) {
      const diffMs = new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime();
      const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
      const tenantInfo = booking.tenant as { name?: string; contact_phone?: string } | null;

      try {
        await notifications.sendBookingConfirmationEmail({
          to: booking.guest_email,
          guestName: booking.guest_name,
          bookingReference: booking.id.slice(0, 8).toUpperCase(),
          resortName: tenantInfo?.name || 'Resort Desk',
          categoryName: 'Confirmed Reservation',
          checkInDate: booking.check_in_date,
          checkOutDate: booking.check_out_date,
          nights,
          adults: booking.num_adults,
          children: booking.num_children,
          totalAmountInr: total,
          paymentStatus: 'Pay At Property (Balance: ₹' + total.toLocaleString('en-IN') + ')',
          guestPortalUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/login`,
          contactPhone: tenantInfo?.contact_phone || undefined,
        });
      } catch (err) {
        console.warn('[Confirmation Email Error]:', err);
      }
    }

    revalidatePath('/bookings');
    revalidatePath('/dashboard');
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Reservation #${bookingId.slice(0, 8).toUpperCase()} confirmed. Balance due at property: ₹${total.toLocaleString('en-IN')}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to confirm reservation.';
    return { success: false, error: msg };
  }
}

/**
 * Reschedule Booking Stay Dates (Change Dates with Collision Prevention)
 * Admin action allowing front desk to change check-in / check-out dates and auto-recalculate folio tariff.
 */
export async function rescheduleBookingDates(payload: {
  bookingId: string;
  tenantId: string;
  newCheckIn: string;
  newCheckOut: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { bookingId, tenantId, newCheckIn, newCheckOut } = payload;
    if (!bookingId || !tenantId || !newCheckIn || !newCheckOut) {
      return { success: false, error: 'Booking ID, Tenant ID, and new stay dates are required.' };
    }

    const dIn = new Date(newCheckIn);
    const dOut = new Date(newCheckOut);
    if (isNaN(dIn.getTime()) || isNaN(dOut.getTime()) || dOut <= dIn) {
      return { success: false, error: 'Check-out date must be strictly after check-in date.' };
    }

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Verify staff/admin authorization
    let isAuthorized = false;
    if (user) {
      const ADMIN_EMAILS = [
        'ramchat007@gmail.com',
        'admin@raigadtropical.com',
        'contact@raigadtropical.com',
      ];
      if (user.email && (ADMIN_EMAILS.includes(user.email.toLowerCase()) || user.email.toLowerCase().includes('admin'))) {
        isAuthorized = true;
      } else {
        const { data: profile } = await adminDb
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && (profile.role === 'tenant_admin' || profile.role === 'staff' || profile.role === 'superadmin')) {
          isAuthorized = true;
        }
      }
    } else {
      isAuthorized = process.env.NODE_ENV !== 'production';
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Forbidden: Front desk staff or manager privileges required to reschedule bookings.',
      };
    }

    // 1. Fetch current booking & assigned room
    const { data: booking, error: bErr } = await adminDb
      .from('bookings')
      .select('*, room:rooms(*)')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (bErr || !booking) {
      return { success: false, error: 'Booking not found.' };
    }

    if (booking.booking_status === 'cancelled') {
      return { success: false, error: 'Cannot reschedule a cancelled reservation.' };
    }

    // 2. Collision check for the same room on new dates
    const { data: collision } = await adminDb
      .from('bookings')
      .select('id, guest_name')
      .eq('tenant_id', tenantId)
      .eq('room_id', booking.room_id)
      .neq('id', bookingId)
      .neq('booking_status', 'cancelled')
      .lt('check_in_date', newCheckOut)
      .gt('check_out_date', newCheckIn)
      .limit(1);

    if (collision && collision.length > 0) {
      return {
        success: false,
        error: `Room is unavailable for new dates: already reserved by ${collision[0].guest_name}.`,
      };
    }

    // 3. Recalculate nights and total amount
    const diffMs = dOut.getTime() - dIn.getTime();
    const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const roomRatePerNight = booking.room?.base_price_inr || Math.round(booking.total_amount_inr / Math.max(1, Math.round((new Date(booking.check_out_date).getTime() - new Date(booking.check_in_date).getTime()) / (1000 * 60 * 60 * 24))));
    const newTotal = nights * roomRatePerNight;

    // 4. Update booking record
    const { error: updateError } = await adminDb
      .from('bookings')
      .update({
        check_in_date: newCheckIn,
        check_out_date: newCheckOut,
        total_amount_inr: newTotal,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    if (updateError) throw updateError;

    // 5. Audit Log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'UPDATE',
        old_data: { check_in_date: booking.check_in_date, check_out_date: booking.check_out_date, total_amount_inr: booking.total_amount_inr },
        new_data: { check_in_date: newCheckIn, check_out_date: newCheckOut, total_amount_inr: newTotal },
        created_at: new Date().toISOString(),
      });
    } catch {}

    revalidatePath('/bookings');
    revalidatePath('/dashboard');
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Reservation dates updated to ${newCheckIn} → ${newCheckOut} (${nights} nights, ₹${newTotal.toLocaleString()}).`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to reschedule stay.';
    return { success: false, error: message };
  }
}

/**
 * Cancel Reservation (Releases inventory immediately)
 * Admin action allowing front desk to cancel a booking with optional reason.
 */
export async function cancelBooking(payload: {
  bookingId: string;
  tenantId: string;
  reason?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { bookingId, tenantId, reason } = payload;
    if (!bookingId || !tenantId) {
      return { success: false, error: 'Booking ID and Tenant ID are required.' };
    }

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Verify staff/admin authorization
    let isAuthorized = false;
    if (user) {
      const ADMIN_EMAILS = [
        'ramchat007@gmail.com',
        'admin@raigadtropical.com',
        'contact@raigadtropical.com',
      ];
      if (user.email && (ADMIN_EMAILS.includes(user.email.toLowerCase()) || user.email.toLowerCase().includes('admin'))) {
        isAuthorized = true;
      } else {
        const { data: profile } = await adminDb
          .from('profiles')
          .select('role, tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (profile && (profile.role === 'tenant_admin' || profile.role === 'staff' || profile.role === 'superadmin')) {
          isAuthorized = true;
        }
      }
    } else {
      isAuthorized = process.env.NODE_ENV !== 'production';
    }

    if (!isAuthorized) {
      return {
        success: false,
        error: 'Forbidden: Front desk staff or manager privileges required to cancel bookings.',
      };
    }

    const { data: booking, error: bErr } = await adminDb
      .from('bookings')
      .select('id, guest_name, special_requests, booking_status')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (bErr || !booking) {
      return { success: false, error: 'Booking not found.' };
    }

    const reasonNote = reason ? `[Cancelled by Front Desk: ${reason}]` : '[Cancelled by Front Desk]';
    const updatedNotes = booking.special_requests
      ? `${booking.special_requests}\n${reasonNote}`
      : reasonNote;

    const { error: updateError } = await adminDb
      .from('bookings')
      .update({
        booking_status: 'cancelled',
        special_requests: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    if (updateError) throw updateError;

    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'UPDATE',
        old_data: { booking_status: booking.booking_status },
        new_data: { booking_status: 'cancelled', reason },
        created_at: new Date().toISOString(),
      });
    } catch {}

    revalidatePath('/bookings');
    revalidatePath('/dashboard');
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Booking #${bookingId.slice(0, 8).toUpperCase()} cancelled successfully. Room is now available.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel booking.';
    return { success: false, error: message };
  }
}

/**
 * Seed Realistic Sample Bookings for Dashboard Preview
 */
export async function seedSampleBookings(tenantId: string): Promise<{ success: boolean; message: string }> {
  try {
    if (!tenantId) {
      return { success: false, message: 'Tenant identifier is required.' };
    }

    const supabase = await createServerSupabaseClient();

    // Fetch existing rooms
    const { data: rooms } = await supabase
      .from('rooms')
      .select('id, name, base_price_inr')
      .eq('tenant_id', tenantId)
      .order('name');

    if (!rooms || rooms.length === 0) {
      return { success: false, message: 'Please create or initialize rooms first before generating sample bookings.' };
    }

    const today = new Date();
    const formatDate = (d: Date) => d.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const dayAfter = new Date(today);
    dayAfter.setDate(dayAfter.getDate() + 2);

    const room1 = rooms[0];
    const room2 = rooms[1] || rooms[0];
    const room3 = rooms[2] || rooms[0];

    const sampleBookings = [
      {
        tenant_id: tenantId,
        room_id: room1.id,
        guest_name: 'Amelia Hart',
        guest_mobile_number: '+919876543210',
        guest_email: 'amelia.hart@luxurytravel.com',
        check_in_date: formatDate(yesterday),
        check_out_date: formatDate(dayAfter),
        num_adults: 2,
        num_children: 1,
        total_amount_inr: (room1.base_price_inr || 8500) * 3,
        booking_status: 'checked_in',
        payment_status: 'paid',
        special_requests: 'Private gazebo candle-light dinner setup requested.',
      },
      {
        tenant_id: tenantId,
        room_id: room2.id,
        guest_name: 'Marcus Chen',
        guest_mobile_number: '+919819001122',
        guest_email: 'marcus.chen@outlook.com',
        check_in_date: formatDate(today),
        check_out_date: formatDate(dayAfter),
        num_adults: 2,
        num_children: 0,
        total_amount_inr: (room2.base_price_inr || 8500) * 2,
        booking_status: 'confirmed',
        payment_status: 'paid',
        special_requests: 'Late arrival expected around 17:30. Extra key card requested.',
      },
      {
        tenant_id: tenantId,
        room_id: room3.id,
        guest_name: 'Sofia Laurent',
        guest_mobile_number: '+919920334455',
        guest_email: 'sofia.laurent@gmail.com',
        check_in_date: formatDate(tomorrow),
        check_out_date: formatDate(dayAfter),
        num_adults: 4,
        num_children: 2,
        total_amount_inr: (room3.base_price_inr || 5200) * 1,
        booking_status: 'pending',
        payment_status: 'pending',
        special_requests: 'Family weekend staycation. Requested early check-in at 11 AM if possible.',
      },
    ];

    const { error: insertError } = await supabase.from('bookings').insert(sampleBookings);
    if (insertError) throw insertError;

    return {
      success: true,
      message: 'Sample demo reservations loaded successfully into Command Center.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to seed sample bookings.';
    return { success: false, message: msg };
  }
}

/**
 * Submit Offline / Waitlist Inquiry when rooms are unavailable online
 */
export async function submitWaitlistInquiry(payload: {
  tenantId: string;
  guestName: string;
  guestMobile: string;
  guestEmail?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  notes?: string;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const {
      tenantId,
      guestName,
      guestMobile,
      guestEmail,
      checkIn,
      checkOut,
      adults,
      children,
      notes,
    } = payload;

    if (!tenantId || !guestName || !guestMobile) {
      return { success: false, error: 'Name and mobile number are required.' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    // Log the inquiry into audit_logs so the resort owner sees it in their admin feed
    try {
      await supabase.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'waitlist_inquiries',
        record_id: null,
        action_type: 'INSERT',
        old_data: null,
        new_data: {
          guest_name: guestName.trim(),
          guest_mobile: guestMobile.trim(),
          guest_email: guestEmail?.trim() || null,
          check_in_date: checkIn,
          check_out_date: checkOut,
          num_adults: adults,
          num_children: children,
          notes: notes?.trim() || 'Waitlist / offline booking request',
          created_at: new Date().toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('Could not insert waitlist inquiry into audit_logs:', auditErr);
    }

    return {
      success: true,
      message: 'Your waitlist request has been submitted to the front desk. We will reach out to you directly via WhatsApp or Call!',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to submit waitlist request.';
    return { success: false, error: message };
  }
}

