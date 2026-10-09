'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';
import { ResortActivity, ActivityBooking } from '@/types';
import { addIncidentalCharge } from './ledger';

export interface ActivityActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

const DEFAULT_RESORT_ACTIVITIES: Array<{
  title: string;
  description: string;
  price_inr: number;
  duration_minutes: number;
  timing: string;
  max_participants: number;
}> = [
  {
    title: 'Sunset Sea Kayaking & Mangrove Tour',
    description: 'Guided paddle tour exploring scenic backwaters and tranquil mangrove channels at golden hour.',
    price_inr: 850,
    duration_minutes: 90,
    timing: '04:30 PM - 06:00 PM',
    max_participants: 8,
  },
  {
    title: 'Ayurvedic Herbal Rejuvenation Spa',
    description: 'Traditional full-body herbal oil therapy and steam bath by certified coastal practitioners.',
    price_inr: 1800,
    duration_minutes: 60,
    timing: 'Slots available from 09:00 AM to 07:00 PM',
    max_participants: 2,
  },
  {
    title: 'Private Starlit Bonfire & Beach Barbecue',
    description: 'Exclusive beachside fire pit setup with chef-grilled marinated skewers and ambient music.',
    price_inr: 1500,
    duration_minutes: 120,
    timing: '07:30 PM - 09:30 PM',
    max_participants: 6,
  },
  {
    title: 'Morning Forest Trail & Birdwatching Walk',
    description: 'Early morning naturalist-led walk across lush coconut plantations and coastal nature trails.',
    price_inr: 400,
    duration_minutes: 75,
    timing: '06:30 AM - 07:45 AM',
    max_participants: 12,
  },
  {
    title: 'Resort Poolside Candlelight Dinner Setup',
    description: 'Romantic 4-course curated dinner by the illuminated infinity pool with custom floral decor.',
    price_inr: 2500,
    duration_minutes: 120,
    timing: '08:00 PM - 10:00 PM',
    max_participants: 2,
  },
];

/**
 * 1. GET RESORT ACTIVITIES CATALOG
 */
export async function getResortActivities(
  tenantId: string
): Promise<ActivityActionResponse<ResortActivity[]>> {
  try {
    const adminDb = createAdminClient();

    // 1. Try SQL query
    const { data: dbActivities, error: dbError } = await adminDb
      .from('activities')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('price_inr', { ascending: true });

    if (!dbError && dbActivities && dbActivities.length > 0) {
      return { success: true, data: dbActivities as unknown as ResortActivity[] };
    }

    // 2. Fallback: check tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existing = (settings.activities as ResortActivity[]) || [];

    if (existing && existing.length > 0) {
      return { success: true, data: existing.filter((a) => a.is_active !== false) };
    }

    // 3. Initialize default activities for resort
    const now = new Date().toISOString();
    const defaults: ResortActivity[] = DEFAULT_RESORT_ACTIVITIES.map((act, idx) => ({
      id: `act_${idx + 1}`,
      tenant_id: tenantId,
      title: act.title,
      description: act.description,
      price_inr: act.price_inr,
      duration_minutes: act.duration_minutes,
      timing: act.timing,
      max_participants: act.max_participants,
      is_active: true,
      created_at: now,
    }));

    try {
      await adminDb
        .from('tenants')
        .update({
          settings: {
            ...settings,
            activities: defaults,
          },
        })
        .eq('id', tenantId);
    } catch (saveErr) {
      console.warn('[Activity Defaults Save Notice]:', saveErr);
    }

    return { success: true, data: defaults };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve resort activities.';
    return { success: false, error: message };
  }
}

/**
 * 2. BOOK AN ACTIVITY (Guest or Front Desk)
 */
export async function bookResortActivity(
  tenantId: string,
  payload: {
    booking_id: string;
    activity_id: string;
    activity_title: string;
    guest_name: string;
    participants: number;
    scheduled_date: string;
    unit_price_inr: number;
    charge_to_folio: boolean;
  }
): Promise<ActivityActionResponse<ActivityBooking>> {
  try {
    if (!tenantId) return { success: false, error: 'Resort identifier is required.' };
    if (!payload.booking_id) return { success: false, error: 'Active booking ID is required.' };
    if (payload.participants < 1) return { success: false, error: 'At least 1 participant is required.' };

    const totalAmount = Math.max(0, payload.unit_price_inr * payload.participants);
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const newBooking: ActivityBooking = {
      id: `actb_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      booking_id: payload.booking_id,
      activity_id: payload.activity_id,
      activity_title: payload.activity_title,
      guest_name: payload.guest_name,
      participants: payload.participants,
      scheduled_date: payload.scheduled_date,
      total_amount_inr: totalAmount,
      status: 'confirmed',
      charged_to_folio: payload.charge_to_folio,
      created_at: now,
    };

    // 1. Try SQL insert into activity_bookings
    const { data: dbBooking, error: dbError } = await adminDb
      .from('activity_bookings')
      .insert({
        tenant_id: tenantId,
        booking_id: newBooking.booking_id,
        activity_id: newBooking.activity_id,
        activity_title: newBooking.activity_title,
        guest_name: newBooking.guest_name,
        participants: newBooking.participants,
        scheduled_date: newBooking.scheduled_date,
        total_amount_inr: newBooking.total_amount_inr,
        status: newBooking.status,
        charged_to_folio: newBooking.charged_to_folio,
        created_at: now,
      })
      .select()
      .maybeSingle();

    let createdBooking = newBooking;
    if (!dbError && dbBooking) {
      createdBooking = dbBooking as unknown as ActivityBooking;
    } else {
      // Fallback: Store in tenant.settings.activity_bookings
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      const settings = (tenant?.settings as Record<string, unknown>) || {};
      const existing = (settings.activity_bookings as ActivityBooking[]) || [];
      existing.unshift(newBooking);

      await adminDb
        .from('tenants')
        .update({
          settings: {
            ...settings,
            activity_bookings: existing.slice(0, 200),
          },
        })
        .eq('id', tenantId);
    }

    // 2. If charged to folio, automatically record incidental charge
    if (payload.charge_to_folio && totalAmount > 0) {
      const folioFormData = new FormData();
      folioFormData.append('bookingId', payload.booking_id);
      folioFormData.append('tenantId', tenantId);
      folioFormData.append('itemName', `${payload.activity_title} (${payload.participants} Pax - ${payload.scheduled_date})`);
      folioFormData.append('category', 'activities');
      folioFormData.append('amountInr', totalAmount.toString());
      folioFormData.append('quantity', '1');
      folioFormData.append('notes', `Booked by ${payload.guest_name}`);

      await addIncidentalCharge(folioFormData);
    }

    // 3. Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        table_name: 'activity_bookings',
        record_id: createdBooking.id,
        action_type: 'INSERT',
        new_data: {
          activity: payload.activity_title,
          guest_name: payload.guest_name,
          participants: payload.participants,
          amount_inr: totalAmount,
          folio_charged: payload.charge_to_folio,
        },
        created_at: now,
      });
    } catch (auditErr) {
      console.warn('[Activity Audit Log Notice]:', auditErr);
    }

    revalidatePath('/activities');
    revalidatePath(`/bookings/${payload.booking_id}`);

    return {
      success: true,
      message: `Successfully booked "${payload.activity_title}"! Reference: #${createdBooking.id.slice(0, 8)}.`,
      data: createdBooking,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to book activity.';
    return { success: false, error: message };
  }
}

/**
 * 3. GET ACTIVITY BOOKINGS (For Staff Desk or Guest Portal)
 */
export async function getActivityBookings(
  tenantId: string,
  bookingId?: string
): Promise<ActivityActionResponse<ActivityBooking[]>> {
  try {
    const adminDb = createAdminClient();

    let query = adminDb
      .from('activity_bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (bookingId) {
      query = query.eq('booking_id', bookingId);
    }

    const { data: dbBookings, error: dbError } = await query;
    if (!dbError && dbBookings && dbBookings.length > 0) {
      return { success: true, data: dbBookings as unknown as ActivityBooking[] };
    }

    // Fallback: tenant settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    let bookings = (settings.activity_bookings as ActivityBooking[]) || [];

    if (bookingId) {
      bookings = bookings.filter((b) => b.booking_id === bookingId);
    }

    return { success: true, data: bookings };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve activity bookings.';
    return { success: false, error: message };
  }
}

/**
 * 4. UPDATE ACTIVITY BOOKING STATUS (Confirmed -> Completed -> Cancelled)
 */
export async function updateActivityBookingStatus(
  tenantId: string,
  bookingRecordId: string,
  status: 'confirmed' | 'completed' | 'cancelled'
): Promise<ActivityActionResponse> {
  try {
    const adminDb = createAdminClient();

    // Try SQL
    await adminDb
      .from('activity_bookings')
      .update({ status })
      .eq('id', bookingRecordId)
      .eq('tenant_id', tenantId);

    // Also fallback in settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existing = (settings.activity_bookings as ActivityBooking[]) || [];

    const idx = existing.findIndex((b) => b.id === bookingRecordId);
    if (idx >= 0) {
      existing[idx] = { ...existing[idx], status };
      await adminDb
        .from('tenants')
        .update({
          settings: { ...settings, activity_bookings: existing },
        })
        .eq('id', tenantId);
    }

    revalidatePath('/activities');
    return { success: true, message: `Activity booking marked as ${status}.` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update activity booking.';
    return { success: false, error: message };
  }
}
