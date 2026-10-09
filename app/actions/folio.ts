'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';
import {
  Booking,
  Room,
  RoomCategory,
  Tenant,
  IncidentalCharge,
  MealPlanCode,
  TaxCalculationResult,
  PaymentReceipt,
} from '@/types';
import { getBookingLedger } from './ledger';
import { calculateAuthoritativeFolioTax } from '@/lib/tax-engine';
import { STANDARD_MEAL_PLANS } from '@/lib/meal-plans';
import { getBookingReceipts, recordPaymentReceipt } from './payments';

export interface FolioActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface AuthoritativeFolioSummary {
  bookingId: string;
  bookingRef: string;
  tenant: Tenant;
  guestName: string;
  guestEmail?: string;
  guestPhone: string;
  guestGstin?: string;
  companyName?: string;
  billingAddress?: string;
  roomName?: string;
  roomNumber?: string;
  categoryName?: string;
  mealPlanCode?: MealPlanCode;
  mealPlanName?: string;
  mealPlanChargeInr?: number;
  checkInDate: string;
  checkOutDate: string;
  nights: number;
  numAdults: number;
  numChildren: number;
  roomChargeInr: number;
  incidentals: IncidentalCharge[];
  incidentalsTotalInr: number;
  subtotalInr: number;
  taxInr: number;
  taxCalculation: TaxCalculationResult;
  grandTotalInr: number;
  paidAmountInr: number;
  outstandingBalanceInr: number;
  paymentStatus: string;
  bookingStatus: string;
  isFullySettled: boolean;
  receipts: PaymentReceipt[];
  createdAt: string;
}

/**
 * 1. GET AUTHORITATIVE FOLIO BREAKDOWN (Configurable GST Schedules & Receipts)
 */
export async function getAuthoritativeFolio(
  tenantId: string,
  bookingId: string
): Promise<FolioActionResponse<AuthoritativeFolioSummary>> {
  try {
    const adminDb = createAdminClient();

    // Fetch booking
    const { data: rawBooking, error: bError } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .maybeSingle();

    if (bError || !rawBooking) {
      return { success: false, error: 'Booking record not found.' };
    }

    const booking = rawBooking as unknown as Booking;

    // Fetch tenant
    const { data: rawTenant } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', booking.tenant_id)
      .maybeSingle();

    const tenant = (rawTenant as unknown as Tenant) || {
      id: booking.tenant_id,
      name: 'Resort',
      subdomain: '',
      is_active: true,
      settings: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Fetch room & category
    let room: Room | null = null;
    let category: RoomCategory | null = null;

    if (booking.room_id) {
      const { data: rData } = await adminDb.from('rooms').select('*').eq('id', booking.room_id).maybeSingle();
      room = (rData as unknown as Room) || null;
    }
    const catId = booking.category_id || room?.category_id;
    if (catId) {
      const { data: cData } = await adminDb.from('room_categories').select('*').eq('id', catId).maybeSingle();
      category = (cData as unknown as RoomCategory) || null;
    }

    // Fetch ledger incidentals
    const ledgerRes = await getBookingLedger(bookingId, booking.tenant_id);
    const incidentals = ledgerRes.success && ledgerRes.data ? ledgerRes.data.incidentals : [];

    const cIn = new Date(booking.check_in_date);
    const cOut = new Date(booking.check_out_date);
    const nights = Math.max(1, Math.round((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24)));

    const roomChargeInr = Number(booking.total_amount_inr || 0);
    const incidentalsTotalInr = incidentals.reduce(
      (sum, item) => sum + Number(item.amount_inr || 0) * (item.quantity || 1),
      0
    );

    const subtotalInr = roomChargeInr + incidentalsTotalInr;

    // Calculate Authoritative Tax via Configurable Tax Engine (Zero hardcoding)
    const taxSummary = calculateAuthoritativeFolioTax(
      roomChargeInr,
      incidentals.map((inc) => ({
        category: inc.category,
        amount: Number(inc.amount_inr || 0),
        quantity: inc.quantity || 1,
        description: inc.item_name || 'Incidental Charge',
      })),
      tenant.settings as Record<string, unknown>,
      booking.check_in_date
    );

    const taxInr = taxSummary.total_tax_inr;
    const grandTotalInr = taxSummary.grand_total_inr;

    // Fetch official payment receipts
    const receiptsRes = await getBookingReceipts(booking.id, booking.tenant_id);
    const receipts = receiptsRes.success && receiptsRes.data ? receiptsRes.data : [];

    // Authoritative Paid Calculation:
    // Sum all non-voided receipts if available; otherwise use stored paid_amount_inr
    const validReceiptsTotal = receipts
      .filter((r) => !r.is_voided)
      .reduce((sum, r) => sum + Number(r.amount_inr || 0), 0);

    let paidAmountInr = Number(booking.paid_amount_inr || 0);
    if (validReceiptsTotal > 0) {
      paidAmountInr = validReceiptsTotal;
    } else if (booking.payment_status === 'paid' && paidAmountInr < grandTotalInr) {
      paidAmountInr = grandTotalInr;
    }

    const outstandingBalanceInr = Math.max(0, grandTotalInr - paidAmountInr);
    const isFullySettled = outstandingBalanceInr === 0;

    // Resolve meal plan details
    const mealPlanCode = (booking.meal_plan_code as MealPlanCode) || 'EP';
    const mealPlanName = STANDARD_MEAL_PLANS[mealPlanCode]?.name || 'European Plan (Room Only)';
    const mealPlanChargeInr = Number(booking.meal_plan_charge_inr || 0);

    const summary: AuthoritativeFolioSummary = {
      bookingId: booking.id,
      bookingRef: booking.id.slice(0, 8).toUpperCase(),
      tenant,
      guestName: booking.guest_name,
      guestEmail: booking.guest_email || undefined,
      guestPhone: booking.guest_mobile_number,
      guestGstin: booking.guest_gstin || undefined,
      companyName: booking.company_name || undefined,
      billingAddress: booking.billing_address || undefined,
      roomName: room?.name,
      roomNumber: room?.room_number || undefined,
      categoryName: category?.name || room?.room_type,
      mealPlanCode,
      mealPlanName,
      mealPlanChargeInr,
      checkInDate: booking.check_in_date,
      checkOutDate: booking.check_out_date,
      nights,
      numAdults: booking.num_adults,
      numChildren: booking.num_children,
      roomChargeInr,
      incidentals,
      incidentalsTotalInr,
      subtotalInr,
      taxInr,
      taxCalculation: taxSummary,
      grandTotalInr,
      paidAmountInr,
      outstandingBalanceInr,
      paymentStatus: isFullySettled ? 'paid' : paidAmountInr > 0 ? 'partially_paid' : 'pending',
      bookingStatus: booking.booking_status,
      isFullySettled,
      receipts,
      createdAt: booking.created_at,
    };

    return { success: true, data: summary };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve authoritative folio.';
    return { success: false, error: message };
  }
}

/**
 * 2. SETTLE REMAINING FOLIO BALANCE (Online Razorpay or Desk Cash/UPI/Bank Transfer)
 * Automatically issues an accountant-verifiable receipt with an audit trail.
 */
export async function settleFolioPayment(
  tenantId: string,
  bookingId: string,
  paymentDetails: {
    amountInr: number;
    paymentMode: 'razorpay' | 'cash' | 'upi' | 'credit_card' | 'bank_transfer';
    transactionRef?: string;
    notes?: string;
  }
): Promise<FolioActionResponse> {
  try {
    const adminDb = createAdminClient();

    // Fetch existing booking
    const { data: rawBooking, error: bError } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .single();

    if (bError || !rawBooking) {
      return { success: false, error: 'Booking record not found.' };
    }

    const booking = rawBooking as unknown as Booking;

    // Issue official verifiable payment receipt
    const receiptRes = await recordPaymentReceipt({
      tenantId,
      bookingId,
      amountInr: paymentDetails.amountInr,
      paymentMethod: paymentDetails.paymentMode,
      referenceNumber: paymentDetails.transactionRef,
      payerName: booking.guest_name,
      payerPhone: booking.guest_mobile_number,
      notes: paymentDetails.notes,
    });

    if (!receiptRes.success) {
      return { success: false, error: receiptRes.error || 'Failed to issue payment receipt.' };
    }

    revalidatePath(`/bookings/${bookingId}`);
    revalidatePath('/bookings');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Folio payment of ₹${paymentDetails.amountInr.toLocaleString()} recorded via ${paymentDetails.paymentMode.toUpperCase()}. Receipt ${receiptRes.data?.receipt_number} issued.`,
      data: receiptRes.data,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to settle folio balance.';
    return { success: false, error: message };
  }
}
