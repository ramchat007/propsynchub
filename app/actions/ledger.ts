'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { IncidentalCharge, IncidentalCategory, Booking, Room, Tenant } from '@/types';

export interface LedgerActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface BookingLedgerDetails {
  booking: Booking;
  room: Room | null;
  tenant: Tenant | null;
  incidentals: IncidentalCharge[];
  roomCost: number;
  incidentalsTotal: number;
  grandTotal: number;
}

/**
 * 1. FETCH FULL BOOKING LEDGER & INCIDENTALS
 */
export async function getBookingLedger(
  bookingId: string,
  tenantId?: string
): Promise<LedgerActionResponse<BookingLedgerDetails>> {
  try {
    const adminDb = createAdminClient();

    // Query booking
    let bookingQuery = adminDb.from('bookings').select('*').eq('id', bookingId);
    if (tenantId) {
      bookingQuery = bookingQuery.eq('tenant_id', tenantId);
    }
    const { data: rawBooking, error: bookingError } = await bookingQuery.maybeSingle();

    if (bookingError || !rawBooking) {
      return { success: false, error: 'Booking record not found.' };
    }

    const booking = rawBooking as unknown as Booking;

    // Query associated room
    const { data: rawRoom } = await adminDb
      .from('rooms')
      .select('*')
      .eq('id', booking.room_id)
      .maybeSingle();
    const room = (rawRoom as unknown as Room) || null;

    // Query tenant
    const { data: rawTenant } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', booking.tenant_id)
      .maybeSingle();
    const tenant = (rawTenant as unknown as Tenant) || null;

    // Query incidental charges
    let incidentals: IncidentalCharge[] = [];
    const { data: rawIncidentals, error: incError } = await adminDb
      .from('incidental_charges')
      .select('*')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: false });

    if (!incError && rawIncidentals) {
      incidentals = rawIncidentals as unknown as IncidentalCharge[];
    } else {
      // Fallback: Check if incidentals were stored in booking.special_requests JSON
      try {
        if (booking.special_requests && booking.special_requests.startsWith('JSON:')) {
          const parsed = JSON.parse(booking.special_requests.slice(5));
          if (Array.isArray(parsed.incidentals)) {
            incidentals = parsed.incidentals;
          }
        }
      } catch {
        // Ignore fallback parse error
      }
    }

    const roomCost = Number(booking.total_amount_inr || 0);
    const incidentalsTotal = incidentals.reduce((sum, item) => {
      return sum + Number(item.amount_inr || 0) * (item.quantity || 1);
    }, 0);
    const grandTotal = roomCost + incidentalsTotal;

    return {
      success: true,
      data: {
        booking,
        room,
        tenant,
        incidentals,
        roomCost,
        incidentalsTotal,
        grandTotal,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve booking ledger.';
    return { success: false, error: message };
  }
}

/**
 * 2. ADD AN INCIDENTAL CHARGE (Item Name, Amount, Category)
 */
export async function addIncidentalCharge(formData: FormData): Promise<LedgerActionResponse<IncidentalCharge>> {
  try {
    const bookingId = formData.get('bookingId')?.toString()?.trim();
    const tenantId = formData.get('tenantId')?.toString()?.trim();
    const itemName = formData.get('itemName')?.toString()?.trim();
    const category = (formData.get('category')?.toString() || 'other') as IncidentalCategory;
    const amountInr = parseFloat(formData.get('amountInr')?.toString() || '0');
    const quantity = parseInt(formData.get('quantity')?.toString() || '1', 10);
    const notes = formData.get('notes')?.toString()?.trim() || null;

    if (!bookingId || !tenantId) {
      return { success: false, error: 'Booking ID and Tenant ID are required.' };
    }
    if (!itemName) {
      return { success: false, error: 'Item description/name is required.' };
    }
    if (isNaN(amountInr) || amountInr <= 0) {
      return { success: false, error: 'Amount must be a positive number.' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const adminDb = createAdminClient();

    // 1. Attempt insertion into incidental_charges table
    let insertedCharge: IncidentalCharge | null = null;
    const { data: rawCharge, error: insertError } = await adminDb
      .from('incidental_charges')
      .insert({
        tenant_id: tenantId,
        booking_id: bookingId,
        item_name: itemName,
        category,
        amount_inr: amountInr,
        quantity: isNaN(quantity) || quantity < 1 ? 1 : quantity,
        notes,
        created_by: user?.id || null,
        created_at: new Date().toISOString(),
      })
      .select()
      .maybeSingle();

    if (!insertError && rawCharge) {
      insertedCharge = rawCharge as unknown as IncidentalCharge;
    } else {
      // Graceful fallback if table is pending schema execution in Supabase:
      // Store in booking special_requests JSON payload
      const { data: rawBooking } = await adminDb
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();

      const booking = rawBooking as unknown as Booking;
      let existingIncidentals: IncidentalCharge[] = [];

      try {
        if (booking?.special_requests && booking.special_requests.startsWith('JSON:')) {
          const parsed = JSON.parse(booking.special_requests.slice(5));
          if (Array.isArray(parsed.incidentals)) {
            existingIncidentals = parsed.incidentals;
          }
        }
      } catch {
        // Fallback default
      }

      const newId = `inc_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
      const fallbackCharge: IncidentalCharge = {
        id: newId,
        tenant_id: tenantId,
        booking_id: bookingId,
        item_name: itemName,
        category,
        amount_inr: amountInr,
        quantity: isNaN(quantity) || quantity < 1 ? 1 : quantity,
        notes,
        created_by: user?.id || null,
        created_at: new Date().toISOString(),
      };

      existingIncidentals.unshift(fallbackCharge);

      await adminDb
        .from('bookings')
        .update({
          special_requests: `JSON:${JSON.stringify({ incidentals: existingIncidentals })}`,
          updated_at: new Date().toISOString(),
        })
        .eq('id', bookingId);

      insertedCharge = fallbackCharge;
    }

    // 2. Also record in audit_logs directly (ensures audit trail even if triggers are pending)
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'incidental_charges',
        record_id: insertedCharge.id,
        action_type: 'INSERT',
        old_data: null,
        new_data: {
          booking_id: bookingId,
          item_name: itemName,
          category,
          amount_inr: amountInr,
          quantity: quantity,
          added_by_user_id: user?.id || null,
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn('[Audit Log Write Note]:', auditErr);
    }

    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/audit-logs');
    revalidatePath('/bookings');

    return {
      success: true,
      message: `Incidental charge "${itemName}" (₹${amountInr.toLocaleString()}) added to ledger.`,
      data: insertedCharge,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to add incidental charge.';
    return { success: false, error: message };
  }
}

/**
 * 3. REMOVE AN INCIDENTAL CHARGE
 */
export async function deleteIncidentalCharge(
  chargeId: string,
  bookingId: string,
  tenantId: string
): Promise<LedgerActionResponse> {
  try {
    if (!chargeId || !bookingId) {
      return { success: false, error: 'Charge ID and Booking ID are required.' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const adminDb = createAdminClient();

    // Query old charge for audit log
    const { data: oldCharge } = await adminDb
      .from('incidental_charges')
      .select('*')
      .eq('id', chargeId)
      .maybeSingle();

    // Delete from table
    const { error: deleteErr } = await adminDb
      .from('incidental_charges')
      .delete()
      .eq('id', chargeId)
      .eq('booking_id', bookingId);

    if (deleteErr) {
      // Check JSON fallback
      const { data: rawBooking } = await adminDb
        .from('bookings')
        .select('*')
        .eq('id', bookingId)
        .single();
      const booking = rawBooking as unknown as Booking;
      if (booking?.special_requests && booking.special_requests.startsWith('JSON:')) {
        try {
          const parsed = JSON.parse(booking.special_requests.slice(5));
          if (Array.isArray(parsed.incidentals)) {
            const filtered = parsed.incidentals.filter((i: IncidentalCharge) => i.id !== chargeId);
            await adminDb
              .from('bookings')
              .update({
                special_requests: `JSON:${JSON.stringify({ incidentals: filtered })}`,
                updated_at: new Date().toISOString(),
              })
              .eq('id', bookingId);
          }
        } catch {
          // Ignore
        }
      }
    }

    // Write audit log entry
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'incidental_charges',
        record_id: chargeId,
        action_type: 'DELETE',
        old_data: oldCharge || { id: chargeId, booking_id: bookingId },
        new_data: null,
        created_at: new Date().toISOString(),
      });
    } catch {
      // Ignore
    }

    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/audit-logs');

    return {
      success: true,
      message: 'Incidental charge removed successfully.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to delete incidental charge.';
    return { success: false, error: message };
  }
}

/**
 * 4. SETTLE INVOICE & UPDATE BOOKING STATUS (Checkout)
 */
export async function settleBookingInvoice(
  bookingId: string,
  tenantId: string,
  newPaymentStatus: 'paid' | 'pending' | 'partially_paid' = 'paid',
  newBookingStatus: 'checked_out' | 'confirmed' | 'checked_in' = 'checked_out',
  paymentMethod: string = 'upi',
  paymentReference: string = '',
  settleNotes: string = ''
): Promise<LedgerActionResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const adminDb = createAdminClient();

    // Fetch old booking data for audit log
    const { data: oldBooking } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    const oldBookingTyped = oldBooking as unknown as Booking | null;

    const updatePayload: Record<string, unknown> = {
      booking_status: newBookingStatus,
      payment_status: newPaymentStatus,
      updated_at: new Date().toISOString(),
    };

    if (paymentReference) {
      updatePayload.razorpay_payment_id = paymentReference;
    }
    if (settleNotes) {
      updatePayload.special_requests = settleNotes;
    }

    const { error: updateError } = await adminDb
      .from('bookings')
      .update(updatePayload)
      .eq('id', bookingId);

    if (updateError) {
      throw updateError;
    }

    // Direct audit log write
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'UPDATE',
        old_data: {
          booking_status: oldBookingTyped?.booking_status,
          payment_status: oldBookingTyped?.payment_status,
          payment_id: oldBookingTyped?.razorpay_payment_id,
        },
        new_data: {
          booking_status: newBookingStatus,
          payment_status: newPaymentStatus,
          payment_method: paymentMethod,
          payment_reference: paymentReference || null,
          settle_notes: settleNotes || null,
          settled_at: new Date().toISOString(),
        },
        created_at: new Date().toISOString(),
      });
    } catch (auditErr) {
      console.warn('[Audit Log Write Note]:', auditErr);
    }

    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
    revalidatePath('/audit-logs');
    revalidatePath('/dashboard');

    const paymentLabel = paymentReference ? `(Mode: ${paymentMethod.toUpperCase()}, Ref: ${paymentReference})` : `(Payment: ${newPaymentStatus.toUpperCase()})`;

    return {
      success: true,
      message: `Booking #${bookingId.slice(0, 8).toUpperCase()} settled as ${newBookingStatus.replace('_', ' ').toUpperCase()} ${paymentLabel}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update booking status.';
    return { success: false, error: message };
  }
}
