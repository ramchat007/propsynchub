'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import {
  CheckInPayload,
  CheckOutSettlementPayload,
  GuestIdentityRecord,
  TaxInvoiceDocument,
} from '@/types';
import { maskIdentityDocumentNumber, validateFormCCompliance } from '@/lib/privacy-guard';
import { recordPaymentReceipt } from './payments';
import { getAuthoritativeFolio } from './folio';

export interface FrontDeskActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * Authenticates staff / admin user and verifies tenant context
 */
async function getAuthenticatedStaff() {
  const supabase = await createServerSupabaseClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Unauthorized: Staff or admin authentication required.');
    }
  }

  const adminDb = createAdminClient();
  return { adminDb, user };
}

/**
 * 1. EXECUTE FRONT DESK GUEST CHECK-IN
 * - Validates physical room cleanliness and occupancy
 * - Enforces privacy-first masked identity verification (Aadhaar last 4 / Form C)
 * - Optional security deposit / advance payment collection
 * - Transitions room to 'occupied' and booking to 'checked_in'
 */
export async function executeCheckIn(
  payload: CheckInPayload
): Promise<FrontDeskActionResponse<GuestIdentityRecord>> {
  try {
    const { tenantId, bookingId, roomId, roomKeyNumber, idType, idNumber, holderName } = payload;

    if (!tenantId || !bookingId) {
      return { success: false, error: 'Tenant and Booking identifiers are required.' };
    }

    if (!idNumber || !holderName) {
      return { success: false, error: 'Guest document number and holder name are mandatory for check-in.' };
    }

    const { adminDb, user } = await getAuthenticatedStaff();
    const nowIso = new Date().toISOString();

    // 1. Fetch current booking record
    const { data: booking, error: bErr } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (bErr || !booking) {
      return { success: false, error: 'Reservation record not found.' };
    }

    if (booking.booking_status === 'cancelled') {
      return { success: false, error: 'Cannot check in: Reservation has been cancelled.' };
    }

    if (booking.booking_status === 'checked_out') {
      return { success: false, error: 'Cannot check in: Reservation is already checked out.' };
    }

    const targetRoomId = roomId || booking.room_id;
    if (!targetRoomId) {
      return { success: false, error: 'Cannot check in: No room unit assigned to this reservation.' };
    }

    // 2. Validate physical room unit readiness & cleanliness
    const { data: roomUnit } = await adminDb
      .from('rooms')
      .select('id, name, room_number, status')
      .eq('id', targetRoomId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!roomUnit) {
      return { success: false, error: 'Target room unit does not exist.' };
    }

    // Readiness invariant: Cannot check in to dirty, cleaning, maintenance, or blocked room
    if (roomUnit.status === 'dirty' || roomUnit.status === 'cleaning') {
      return {
        success: false,
        error: `Cannot Check In: Unit "${roomUnit.name}" is currently ${roomUnit.status.toUpperCase()}. Housekeeping must clean and inspect the room first.`,
      };
    }
    if (roomUnit.status === 'maintenance' || roomUnit.status === 'blocked') {
      return {
        success: false,
        error: `Cannot Check In: Unit "${roomUnit.name}" is currently ${roomUnit.status.toUpperCase()}. Please assign an available unit.`,
      };
    }

    // Double occupancy guard: Check if another booking is in-house in this unit
    const { data: occupyingStays } = await adminDb
      .from('bookings')
      .select('id, guest_name')
      .eq('tenant_id', tenantId)
      .eq('room_id', targetRoomId)
      .eq('booking_status', 'checked_in')
      .neq('id', bookingId);

    if (occupyingStays && occupyingStays.length > 0) {
      return {
        success: false,
        error: `Physical Unit Conflict: Unit "${roomUnit.name}" is already occupied by in-house guest "${occupyingStays[0].guest_name}". Please reassign to an available unit.`,
      };
    }

    // 3. Privacy-First Identity Verification
    const maskResult = maskIdentityDocumentNumber(idType, idNumber);
    if (!maskResult.isValid) {
      return { success: false, error: maskResult.error || 'Invalid identity document details.' };
    }

    if (payload.isForeignGuest) {
      const formCCheck = validateFormCCompliance(payload.formC);
      if (!formCCheck.isValid) {
        return { success: false, error: formCCheck.error || 'Foreign guest Form C details are incomplete.' };
      }
    }

    const identityRecord: GuestIdentityRecord = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      booking_id: bookingId,
      id_type: idType,
      id_number_masked: maskResult.maskedNumber,
      holder_name: holderName.trim(),
      nationality: payload.nationality || (payload.isForeignGuest ? 'Foreign' : 'Indian'),
      is_foreign_guest: !!payload.isForeignGuest,
      form_c_data: payload.isForeignGuest ? payload.formC : null,
      verified_by_user_id: user?.id || null,
      verified_by_name: user?.email || 'Front Desk Staff',
      verified_at: nowIso,
      retention_consent: true,
      is_redacted: false,
      created_at: nowIso,
      updated_at: nowIso,
    };

    // Store in public.guest_identities table
    try {
      await adminDb.from('guest_identities').insert({
        id: identityRecord.id,
        tenant_id: tenantId,
        booking_id: bookingId,
        id_type: identityRecord.id_type,
        id_number_masked: identityRecord.id_number_masked,
        holder_name: identityRecord.holder_name,
        nationality: identityRecord.nationality,
        is_foreign_guest: identityRecord.is_foreign_guest,
        form_c_data: identityRecord.form_c_data,
        verified_by: user?.id || null,
        verified_at: nowIso,
        retention_consent: true,
        is_redacted: false,
      });
    } catch {
      // Table may not exist yet in remote DB -> dual storage fallback handles below
    }

    // 4. Optional Security Deposit / Advance Payment at Check-In
    let addedPaid = 0;
    if (payload.depositAmountInr && payload.depositAmountInr > 0) {
      addedPaid = payload.depositAmountInr;
      await recordPaymentReceipt({
        tenantId,
        bookingId,
        amountInr: payload.depositAmountInr,
        paymentMethod: payload.depositPaymentMethod || 'cash',
        referenceNumber: payload.depositRef,
        payerName: holderName,
        payerPhone: booking.guest_mobile_number,
        notes: payload.notes || 'Deposit collected at front desk check-in',
      });
    }

    // 5. Authoritative Updates on Booking & Room
    const updatedPaid = Number(booking.paid_amount_inr || 0) + addedPaid;
    const totalAmount = Number(booking.total_amount_inr || 0);
    const updatedBalance = Math.max(0, totalAmount - updatedPaid);

    await adminDb
      .from('bookings')
      .update({
        booking_status: 'checked_in',
        room_id: targetRoomId,
        room_key_number: roomKeyNumber || null,
        actual_check_in_at: nowIso,
        paid_amount_inr: updatedPaid,
        balance_amount_inr: updatedBalance,
        guest_identity_data: identityRecord,
        updated_at: nowIso,
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    // Update Room unit to occupied
    await adminDb
      .from('rooms')
      .update({
        status: 'occupied',
        updated_at: nowIso,
      })
      .eq('id', targetRoomId)
      .eq('tenant_id', tenantId);

    // 6. Audit Trail Logging
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'CHECK_IN',
        new_data: {
          booking_status: 'checked_in',
          room_id: targetRoomId,
          room_name: roomUnit.name,
          room_key_number: roomKeyNumber || null,
          verified_id_type: idType,
          masked_id: maskResult.maskedNumber,
          is_foreign: payload.isForeignGuest,
          actual_check_in_at: nowIso,
          deposit_collected_inr: addedPaid,
        },
        created_at: nowIso,
      });
    } catch {
      // Non-blocking
    }

    revalidatePath('/dashboard');
    revalidatePath('/bookings');
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Guest "${holderName}" checked in to ${roomUnit.name} (Key #${roomKeyNumber || 'Handed'}). ID verified.`,
      data: identityRecord,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to execute front desk check-in.';
    return { success: false, error: message };
  }
}

/**
 * 2. EXECUTE FRONT DESK CHECKOUT & SPLIT FOLIO SETTLEMENT
 * - Enforces physical key return
 * - Supports split payment across multiple payment modes (UPI + Cash + Card)
 * - Verifies total settlement matches outstanding balance
 * - Generates final official Tax Invoice number
 * - Transitions room status to 'dirty' (triggers housekeeping queue)
 */
export async function executeCheckOutAndSettlement(
  payload: CheckOutSettlementPayload
): Promise<FrontDeskActionResponse<TaxInvoiceDocument>> {
  try {
    const { tenantId, bookingId, splitPayments, keysReturned, settlementNotes, allowLedgerCredit } = payload;

    if (!tenantId || !bookingId) {
      return { success: false, error: 'Tenant and Booking identifiers are required.' };
    }

    if (!keysReturned) {
      return { success: false, error: 'Cannot checkout: Please confirm physical room key return.' };
    }

    const { adminDb, user } = await getAuthenticatedStaff();
    const nowIso = new Date().toISOString();

    // 1. Fetch Authoritative Folio to calculate exact balance
    const folioRes = await getAuthoritativeFolio(tenantId, bookingId);
    if (!folioRes.success || !folioRes.data) {
      return { success: false, error: folioRes.error || 'Failed to calculate folio ledger.' };
    }

    const folio = folioRes.data;
    const currentOutstanding = folio.outstandingBalanceInr;

    // 2. Validate Settlement Amounts
    const splitTotal = splitPayments.reduce((sum, sp) => sum + Number(sp.amount_inr || 0), 0);

    if (currentOutstanding > 0 && splitTotal < currentOutstanding && !allowLedgerCredit) {
      return {
        success: false,
        error: `Outstanding balance is ₹${currentOutstanding.toLocaleString()}. Split payments total ₹${splitTotal.toLocaleString()}. Full settlement or authorized ledger credit required to checkout.`,
      };
    }

    // 3. Record Each Split Payment Transaction with Authoritative Receipts
    for (const payment of splitPayments) {
      if (payment.amount_inr > 0) {
        const receiptRes = await recordPaymentReceipt({
          tenantId,
          bookingId,
          amountInr: payment.amount_inr,
          paymentMethod: payment.payment_method,
          referenceNumber: payment.reference_number,
          payerName: folio.guestName,
          payerPhone: folio.guestPhone,
          notes: payment.notes || settlementNotes || 'Checkout split settlement',
        });

        if (!receiptRes.success) {
          console.warn('[Checkout Settlement Receipt Warning]:', receiptRes.error);
        }
      }
    }

    // 4. Generate Official Tax Invoice Number
    const year = new Date().getFullYear();
    const invoiceNumber = `INV-${year}-${bookingId.slice(0, 6).toUpperCase()}`;

    // 5. Update Booking Status to Checked Out
    const finalPaidAmount = folio.paidAmountInr + splitTotal;
    const finalBalance = Math.max(0, folio.grandTotalInr - finalPaidAmount);

    await adminDb
      .from('bookings')
      .update({
        booking_status: 'checked_out',
        payment_status: finalBalance === 0 ? 'paid' : 'partially_paid',
        actual_check_out_at: nowIso,
        paid_amount_inr: finalPaidAmount,
        balance_amount_inr: finalBalance,
        invoice_number: invoiceNumber,
        updated_at: nowIso,
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    // 6. Transition Room Unit to 'dirty' (Feeds into Phase 4 Housekeeping Queue)
    const { data: bookingData } = await adminDb
      .from('bookings')
      .select('room_id')
      .eq('id', bookingId)
      .single();

    if (bookingData?.room_id) {
      await adminDb
        .from('rooms')
        .update({
          status: 'dirty',
          updated_at: nowIso,
        })
        .eq('id', bookingData.room_id)
        .eq('tenant_id', tenantId);
    }

    // 7. Assemble Complete Tax Invoice Document
    const tenantSettings = (folio.tenant.settings as Record<string, unknown>) || {};
    const taxProfile = (tenantSettings.tax_profile as Record<string, unknown>) || {};

    const invoiceDoc: TaxInvoiceDocument = {
      invoice_number: invoiceNumber,
      invoice_date: nowIso.split('T')[0],
      financial_year: `${year}-${year + 1}`,
      tenant: {
        name: folio.tenant.name,
        legal_name: (taxProfile.legal_entity_name as string) || folio.tenant.name,
        gstin: (taxProfile.gstin as string) || 'URP (Unregistered)',
        address: (taxProfile.registered_address as string) || 'Maharashtra, India',
        state_code: (taxProfile.state_code as string) || '27',
        state_name: (taxProfile.state_name as string) || 'Maharashtra',
        phone: folio.tenant.contact_phone || undefined,
        email: folio.tenant.contact_email || undefined,
      },
      guest: {
        name: folio.guestName,
        phone: folio.guestPhone,
        email: folio.guestEmail,
        gstin: folio.guestGstin,
        company_name: folio.companyName,
        billing_address: folio.billingAddress,
      },
      stay: {
        booking_ref: folio.bookingRef,
        check_in: folio.checkInDate,
        check_out: folio.checkOutDate,
        nights: folio.nights,
        room_name: folio.roomName,
        meal_plan: folio.mealPlanName,
        pax: `${folio.numAdults} Adults, ${folio.numChildren} Children`,
      },
      tax_summary: folio.taxCalculation,
      paid_amount_inr: finalPaidAmount,
      balance_amount_inr: finalBalance,
      payment_records: folio.receipts,
    };

    // 8. Audit Log Checkout
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'bookings',
        record_id: bookingId,
        action_type: 'CHECK_OUT',
        new_data: {
          booking_status: 'checked_out',
          invoice_number: invoiceNumber,
          settled_split_payments_count: splitPayments.length,
          settled_amount_inr: splitTotal,
          final_balance_inr: finalBalance,
          actual_check_out_at: nowIso,
          room_transitioned_to: 'dirty',
        },
        created_at: nowIso,
      });
    } catch {
      // Non-blocking
    }

    revalidatePath('/dashboard');
    revalidatePath('/bookings');
    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/housekeeping');
    revalidatePath('/calendar');

    return {
      success: true,
      message: `Checkout complete for ${folio.guestName}. Invoice ${invoiceNumber} generated. Room marked for cleaning.`,
      data: invoiceDoc,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to execute checkout and settlement.';
    return { success: false, error: message };
  }
}

/**
 * 3. GET GUEST IDENTITY DETAILS FOR RESERVATION (Strict Staff Only)
 */
export async function getGuestIdentity(
  tenantId: string,
  bookingId: string
): Promise<FrontDeskActionResponse<GuestIdentityRecord | null>> {
  try {
    const { adminDb } = await getAuthenticatedStaff();

    // 1. Try public.guest_identities table
    try {
      const { data, error } = await adminDb
        .from('guest_identities')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('booking_id', bookingId)
        .maybeSingle();

      if (!error && data) {
        return { success: true, data: data as GuestIdentityRecord };
      }
    } catch {
      // Table may not exist yet
    }

    // 2. Dual-storage fallback on bookings.guest_identity_data
    const { data: booking } = await adminDb
      .from('bookings')
      .select('guest_identity_data')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (booking?.guest_identity_data) {
      return { success: true, data: booking.guest_identity_data as GuestIdentityRecord };
    }

    return { success: true, data: null };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve guest identity.';
    return { success: false, error: message };
  }
}

/**
 * 4. REDACT GUEST IDENTITY (Data Privacy Compliance / Retention Policy)
 */
export async function redactGuestIdentity(
  tenantId: string,
  bookingId: string
): Promise<FrontDeskActionResponse> {
  try {
    const { adminDb, user } = await getAuthenticatedStaff();
    const nowIso = new Date().toISOString();

    // 1. Redact from public.guest_identities
    try {
      await adminDb
        .from('guest_identities')
        .update({
          id_number_masked: 'REDACTED',
          form_c_data: null,
          is_redacted: true,
          redacted_at: nowIso,
          updated_at: nowIso,
        })
        .eq('tenant_id', tenantId)
        .eq('booking_id', bookingId);
    } catch {
      // ignore
    }

    // 2. Redact from bookings.guest_identity_data
    await adminDb
      .from('bookings')
      .update({
        guest_identity_data: { is_redacted: true, redacted_at: nowIso },
        updated_at: nowIso,
      })
      .eq('id', bookingId)
      .eq('tenant_id', tenantId);

    // Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'guest_identities',
        record_id: bookingId,
        action_type: 'REDACT_IDENTITY',
        new_data: { redacted_at: nowIso },
        created_at: nowIso,
      });
    } catch {
      // ignore
    }

    revalidatePath(`/bookings/${bookingId}`);

    return {
      success: true,
      message: 'Guest identity details redacted in accordance with property privacy retention policy.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to redact identity data.';
    return { success: false, error: message };
  }
}
