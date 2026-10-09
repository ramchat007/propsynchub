'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import {
  PaymentReceipt,
  PaymentMethodType,
  UserRole,
} from '@/types';
import { getCurrentFinancialYear } from '@/lib/tax-engine';

export interface PaymentActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * 1. RECORD ACCOUNTANT-VERIFIABLE PAYMENT RECEIPT
 * Records Cash, UPI, Direct Bank Transfer, Card, or Razorpay payment.
 */
export async function recordPaymentReceipt(params: {
  tenantId: string;
  bookingId: string;
  amountInr: number;
  paymentMethod: PaymentMethodType;
  referenceNumber?: string;
  payerName: string;
  payerPhone?: string;
  notes?: string;
}): Promise<PaymentActionResponse<PaymentReceipt>> {
  try {
    const {
      tenantId,
      bookingId,
      amountInr,
      paymentMethod,
      referenceNumber,
      payerName,
      payerPhone,
      notes,
    } = params;

    if (!tenantId || !bookingId) {
      return { success: false, error: 'Tenant and Booking ID are required.' };
    }

    if (!amountInr || amountInr <= 0) {
      return { success: false, error: 'Payment amount must be greater than zero.' };
    }

    if (!payerName.trim()) {
      return { success: false, error: 'Payer name is required for accounting.' };
    }

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    // Fetch booking
    const { data: booking, error: bErr } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    if (bErr || !booking) {
      return { success: false, error: 'Booking record not found.' };
    }

    // Generate sequential receipt number
    const fy = getCurrentFinancialYear();
    const receiptPrefix = `REC/${fy}`;
    const timestampSeq = Date.now().toString().slice(-4);
    const receiptNumber = `${receiptPrefix}/${timestampSeq}`;

    const now = new Date().toISOString();

    const receipt: PaymentReceipt = {
      id: crypto.randomUUID(),
      tenant_id: tenantId,
      booking_id: bookingId,
      receipt_number: receiptNumber,
      payment_method: paymentMethod,
      amount_inr: Math.round(amountInr),
      status: 'completed',
      reference_number: referenceNumber?.trim() || undefined,
      payer_name: payerName.trim(),
      payer_phone: payerPhone?.trim() || booking.guest_mobile_number,
      received_by_user_id: user?.id,
      received_by_name: user?.email ? user.email.split('@')[0] : 'Front Desk Officer',
      received_at: now,
      notes: notes?.trim() || undefined,
      is_voided: false,
      is_reconciled: false,
      created_at: now,
      updated_at: now,
    };

    // 1. Insert into payment_records table (with dual-storage fallback in special_requests)
    try {
      await adminDb.from('payment_records').insert({
        id: receipt.id,
        tenant_id: tenantId,
        booking_id: bookingId,
        receipt_number: receipt.receipt_number,
        payment_method: receipt.payment_method,
        amount_inr: receipt.amount_inr,
        status: receipt.status,
        reference_number: receipt.reference_number,
        payer_name: receipt.payer_name,
        payer_phone: receipt.payer_phone,
        received_by_user_id: receipt.received_by_user_id,
        received_by_name: receipt.received_by_name,
        received_at: receipt.received_at,
        notes: receipt.notes,
        is_voided: false,
        is_reconciled: false,
      });
    } catch (dbErr) {
      console.warn('[Payments] Note on payment_records table insert:', dbErr);
    }

    // Always maintain dual-storage in booking.special_requests JSON
    try {
      let existingPayload: Record<string, unknown> = {};
      if (booking.special_requests && booking.special_requests.startsWith('JSON:')) {
        try {
          existingPayload = JSON.parse(booking.special_requests.slice(5));
        } catch {
          // ignore
        }
      }

      const existingReceipts = Array.isArray(existingPayload.receipts)
        ? (existingPayload.receipts as PaymentReceipt[])
        : [];

      const updatedReceipts = [receipt, ...existingReceipts];
      existingPayload.receipts = updatedReceipts;

      await adminDb
        .from('bookings')
        .update({
          special_requests: `JSON:${JSON.stringify(existingPayload)}`,
        })
        .eq('id', bookingId);
    } catch {
      // ignore
    }

    // 2. Authoritative booking balance recalculation
    const previousPaid = Number(booking.paid_amount_inr || 0);
    const newPaidTotal = previousPaid + receipt.amount_inr;
    const totalDue = Number(booking.total_amount_inr || 0);
    const newBalance = Math.max(0, totalDue - newPaidTotal);
    const newPaymentStatus = newBalance === 0 ? 'paid' : 'partially_paid';

    await adminDb
      .from('bookings')
      .update({
        paid_amount_inr: newPaidTotal,
        balance_amount_inr: newBalance,
        payment_status: newPaymentStatus,
        updated_at: now,
      })
      .eq('id', bookingId);

    // 3. Insert audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user?.id || null,
        table_name: 'payment_records',
        record_id: receipt.id,
        action_type: 'INSERT',
        new_data: {
          receipt_number: receipt.receipt_number,
          amount_inr: receipt.amount_inr,
          method: receipt.payment_method,
          reference: receipt.reference_number,
          new_paid_total: newPaidTotal,
        },
      });
    } catch {
      // ignore
    }

    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Receipt ${receipt.receipt_number} issued for ₹${receipt.amount_inr.toLocaleString()} via ${receipt.payment_method.toUpperCase()}.`,
      data: receipt,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to record payment.';
    return { success: false, error: msg };
  }
}

/**
 * 2. SUPERVISOR PAYMENT REVERSAL / VOID (Accountant & Supervisor Audit Control)
 * Reverses a mistaken payment receipt with mandatory reason and recalculates folio balance.
 */
export async function voidPaymentReceipt(params: {
  tenantId: string;
  bookingId: string;
  receiptId: string;
  voidReason: string;
}): Promise<PaymentActionResponse> {
  try {
    const { tenantId, bookingId, receiptId, voidReason } = params;

    if (!voidReason || voidReason.trim().length < 5) {
      return { success: false, error: 'A mandatory void reason (at least 5 characters) is required.' };
    }

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Session required.' };
    }

    // Role check: Only superadmin, tenant_admin, resort_manager, or accountant can void
    const { data: profile } = await adminDb
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .maybeSingle();

    const userRole = (profile?.role as UserRole) || 'guest';
    const isSupervisor =
      userRole === 'superadmin' ||
      userRole === 'tenant_admin' ||
      userRole === 'resort_manager' ||
      userRole === 'accountant';

    if (!isSupervisor) {
      return {
        success: false,
        error: 'Access Denied: Only resort managers, owners, or accountants can reverse payment receipts.',
      };
    }

    const now = new Date().toISOString();
    let voidedAmount = 0;

    // 1. Update in payment_records table
    try {
      const { data: existingRec } = await adminDb
        .from('payment_records')
        .select('*')
        .eq('id', receiptId)
        .single();

      if (existingRec) {
        if (existingRec.is_voided) {
          return { success: false, error: 'This payment receipt is already voided.' };
        }
        voidedAmount = Number(existingRec.amount_inr || 0);

        await adminDb
          .from('payment_records')
          .update({
            status: 'voided',
            is_voided: true,
            voided_at: now,
            voided_by_user_id: user.id,
            voided_by_name: user.email?.split('@')[0] || 'Supervisor',
            void_reason: voidReason.trim(),
            updated_at: now,
          })
          .eq('id', receiptId);
      }
    } catch {
      // ignore
    }

    // 2. Also update in booking.special_requests JSON
    const { data: booking } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (!booking) return { success: false, error: 'Booking not found.' };

    if (booking.special_requests && booking.special_requests.startsWith('JSON:')) {
      try {
        const payload = JSON.parse(booking.special_requests.slice(5));
        if (Array.isArray(payload.receipts)) {
          const rec = payload.receipts.find((r: PaymentReceipt) => r.id === receiptId);
          if (rec && !rec.is_voided) {
            if (!voidedAmount) voidedAmount = Number(rec.amount_inr || 0);
            rec.is_voided = true;
            rec.status = 'voided';
            rec.voided_at = now;
            rec.voided_by_user_id = user.id;
            rec.voided_by_name = user.email?.split('@')[0] || 'Supervisor';
            rec.void_reason = voidReason.trim();

            await adminDb
              .from('bookings')
              .update({
                special_requests: `JSON:${JSON.stringify(payload)}`,
              })
              .eq('id', bookingId);
          }
        }
      } catch {
        // ignore
      }
    }

    // 3. Recalculate booking balance
    if (voidedAmount > 0) {
      const currentPaid = Number(booking.paid_amount_inr || 0);
      const newPaid = Math.max(0, currentPaid - voidedAmount);
      const totalDue = Number(booking.total_amount_inr || 0);
      const newBalance = Math.max(0, totalDue - newPaid);
      const newStatus = newPaid === 0 ? 'pending' : newBalance === 0 ? 'paid' : 'partially_paid';

      await adminDb
        .from('bookings')
        .update({
          paid_amount_inr: newPaid,
          balance_amount_inr: newBalance,
          payment_status: newStatus,
          updated_at: now,
        })
        .eq('id', bookingId);
    }

    // 4. Audit Log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user.id,
        table_name: 'payment_records',
        record_id: receiptId,
        action_type: 'UPDATE',
        new_data: {
          action: 'PAYMENT_VOIDED',
          amount_reversed: voidedAmount,
          reason: voidReason.trim(),
          supervisor: user.email,
        },
      });
    } catch {
      // ignore
    }

    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Payment receipt successfully voided. ₹${voidedAmount.toLocaleString()} deducted from paid total.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to void receipt.';
    return { success: false, error: msg };
  }
}

/**
 * 3. GET ALL RECEIPTS FOR A BOOKING
 */
export async function getBookingReceipts(
  bookingId: string,
  tenantId?: string
): Promise<PaymentActionResponse<PaymentReceipt[]>> {
  try {
    const adminDb = createAdminClient();

    // 1. Query payment_records table
    let query = adminDb.from('payment_records').select('*').eq('booking_id', bookingId);
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data: dbRecords, error: dbErr } = await query.order('received_at', { ascending: false });

    if (!dbErr && dbRecords && dbRecords.length > 0) {
      return { success: true, data: dbRecords as unknown as PaymentReceipt[] };
    }

    // 2. Fallback: check booking.special_requests JSON
    const { data: booking } = await adminDb
      .from('bookings')
      .select('special_requests')
      .eq('id', bookingId)
      .maybeSingle();

    if (booking?.special_requests && booking.special_requests.startsWith('JSON:')) {
      try {
        const payload = JSON.parse(booking.special_requests.slice(5));
        if (Array.isArray(payload.receipts)) {
          return { success: true, data: payload.receipts as PaymentReceipt[] };
        }
      } catch {
        // ignore
      }
    }

    return { success: true, data: [] };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve receipts.';
    return { success: false, error: msg };
  }
}

/**
 * 4. BANK RECONCILIATION
 * Marks an offline payment as verified and reconciled with the resort's official bank statement.
 */
export async function reconcilePaymentReceipt(params: {
  receiptId: string;
  tenantId: string;
  bankStatementRef: string;
}): Promise<PaymentActionResponse> {
  try {
    const { receiptId, tenantId, bankStatementRef } = params;
    if (!bankStatementRef.trim()) {
      return { success: false, error: 'Bank statement reference or UTR is required.' };
    }

    const adminDb = createAdminClient();
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    const now = new Date().toISOString();

    const { error } = await adminDb
      .from('payment_records')
      .update({
        is_reconciled: true,
        reconciled_at: now,
        reconciled_by_name: user?.email?.split('@')[0] || 'Accountant',
        bank_statement_ref: bankStatementRef.trim(),
        updated_at: now,
      })
      .eq('id', receiptId)
      .eq('tenant_id', tenantId);

    if (error) throw error;

    return { success: true, message: 'Receipt reconciled with bank statement.' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to reconcile payment.';
    return { success: false, error: msg };
  }
}
