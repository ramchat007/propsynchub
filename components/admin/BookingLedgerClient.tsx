'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BookingLedgerDetails,
  addIncidentalCharge,
  deleteIncidentalCharge,
  settleBookingInvoice,
} from '@/app/actions/ledger';
import {
  rescheduleBookingDates,
  cancelBooking,
} from '@/app/actions/booking';
import { redactGuestIdentity } from '@/app/actions/front-desk';
import { IncidentalCategory, Room } from '@/types';
import CheckInModal from './CheckInModal';
import SplitCheckoutModal from './SplitCheckoutModal';
import GuestQrModal from './GuestQrModal';

interface BookingLedgerClientProps {
  initialDetails: BookingLedgerDetails;
  availableRooms?: Room[];
}

const CATEGORY_LABELS: Record<IncidentalCategory, { label: string; color: string }> = {
  restaurant: { label: 'Restaurant & Dining', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950/50 dark:text-orange-300' },
  spa: { label: 'Spa & Wellness', color: 'bg-teal-100 text-teal-800 dark:bg-teal-950/50 dark:text-teal-300' },
  room_service: { label: 'Room Service', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-300' },
  minibar: { label: 'Minibar', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950/50 dark:text-purple-300' },
  laundry: { label: 'Laundry', color: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/50 dark:text-cyan-300' },
  damage_fee: { label: 'Damage Fee', color: 'bg-rose-100 text-rose-800 dark:bg-rose-950/50 dark:text-rose-300' },
  activities: { label: 'Activities & Tours', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' },
  other: { label: 'Incidentals', color: 'bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-300' },
};

export default function BookingLedgerClient({ initialDetails, availableRooms = [] }: BookingLedgerClientProps) {
  const router = useRouter();

  // Local Ledger State
  const [details, setDetails] = useState<BookingLedgerDetails>(initialDetails);
  const { booking, room, tenant, incidentals, roomCost, incidentalsTotal, grandTotal } = details;

  // Form State for Adding Incidental Charge
  const [isAddFormOpen, setIsAddFormOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [category, setCategory] = useState<IncidentalCategory>('restaurant');
  const [amountInr, setAmountInr] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [notes, setNotes] = useState('');

  // Status & Feedback State
  const [isPending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Invoice Modal State
  const [isInvoiceOpen, setIsInvoiceOpen] = useState(false);

  // Phase 3 Front Desk & Split Settlement Modal States
  const [isCheckInOpen, setIsCheckInOpen] = useState(false);
  const [isSplitCheckoutOpen, setIsSplitCheckoutOpen] = useState(false);

  // Phase 6 In-Room QR & Portal Modal State
  const [isGuestQrOpen, setIsGuestQrOpen] = useState(false);

  // Legacy Settle & Checkout Confirmation Modal State (fallback)
  const [isSettleModalOpen, setIsSettleModalOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'cash' | 'card' | 'bank_transfer' | 'razorpay'>('upi');
  const [paymentReference, setPaymentReference] = useState('');
  const [settleNotes, setSettleNotes] = useState('');

  // Reschedule & Cancel Modal States
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [newCheckIn, setNewCheckIn] = useState(booking.check_in_date);
  const [newCheckOut, setNewCheckOut] = useState(booking.check_out_date);

  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('Guest requested cancellation');

  /**
   * Reschedule Stay Dates
   */
  function handleRescheduleBooking(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const res = await rescheduleBookingDates({
        bookingId: booking.id,
        tenantId: booking.tenant_id,
        newCheckIn,
        newCheckOut,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Stay dates rescheduled successfully.' });
        setIsRescheduleOpen(false);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to reschedule stay.' });
      }
    });
  }

  /**
   * Cancel Reservation
   */
  function handleCancelBooking(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    startTransition(async () => {
      const res = await cancelBooking({
        bookingId: booking.id,
        tenantId: booking.tenant_id,
        reason: cancelReason,
      });

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Reservation cancelled and inventory released.' });
        setDetails((prev) => ({
          ...prev,
          booking: { ...prev.booking, booking_status: 'cancelled' },
        }));
        setIsCancelOpen(false);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to cancel reservation.' });
      }
    });
  }

  /**
   * Redact guest identity document under privacy policy
   */
  function handleRedactIdentity() {
    if (
      !confirm(
        "Are you sure you want to redact this guest's identity document record under the data privacy retention policy?"
      )
    )
      return;
    startTransition(async () => {
      const res = await redactGuestIdentity(booking.tenant_id, booking.id);
      if (res.success) {
        setFeedback({
          type: 'success',
          message: res.message || 'Identity data redacted.',
        });
        router.refresh();
      } else {
        setFeedback({
          type: 'error',
          message: res.error || 'Failed to redact identity.',
        });
      }
    });
  }

  /**
   * Handle adding an incidental charge
   */
  function handleAddCharge(e: React.FormEvent) {
    e.preventDefault();
    setFeedback(null);

    const parsedAmount = parseFloat(amountInr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFeedback({ type: 'error', message: 'Please enter a valid positive amount.' });
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('bookingId', booking.id);
      formData.set('tenantId', booking.tenant_id);
      formData.set('itemName', itemName);
      formData.set('category', category);
      formData.set('amountInr', parsedAmount.toString());
      formData.set('quantity', quantity.toString());
      if (notes) formData.set('notes', notes);

      const res = await addIncidentalCharge(formData);
      if (res.success && res.data) {
        setFeedback({ type: 'success', message: res.message || 'Charge added.' });
        // Optimistically update ledger state
        const updatedIncidentals = [res.data, ...incidentals];
        const newIncidentalsTotal = updatedIncidentals.reduce((sum, i) => sum + Number(i.amount_inr) * i.quantity, 0);
        setDetails({
          ...details,
          incidentals: updatedIncidentals,
          incidentalsTotal: newIncidentalsTotal,
          grandTotal: roomCost + newIncidentalsTotal,
        });

        // Reset form
        setItemName('');
        setAmountInr('');
        setQuantity(1);
        setNotes('');
        setIsAddFormOpen(false);
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to add charge.' });
      }
    });
  }

  /**
   * Handle deleting an incidental charge
   */
  function handleDeleteCharge(chargeId: string) {
    if (!confirm('Are you sure you want to remove this charge from the ledger?')) return;

    setFeedback(null);
    startTransition(async () => {
      const res = await deleteIncidentalCharge(chargeId, booking.id, booking.tenant_id);
      if (res.success) {
        setFeedback({ type: 'success', message: 'Charge removed.' });
        const updatedIncidentals = incidentals.filter((i) => i.id !== chargeId);
        const newIncidentalsTotal = updatedIncidentals.reduce((sum, i) => sum + Number(i.amount_inr) * i.quantity, 0);
        setDetails({
          ...details,
          incidentals: updatedIncidentals,
          incidentalsTotal: newIncidentalsTotal,
          grandTotal: roomCost + newIncidentalsTotal,
        });
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to remove charge.' });
      }
    });
  }

  /**
   * Settle invoice & mark as checked out with actual payment confirmation
   */
  function handleSettleBooking(e?: React.FormEvent) {
    if (e) e.preventDefault();

    startTransition(async () => {
      const res = await settleBookingInvoice(
        booking.id,
        booking.tenant_id,
        'paid',
        'checked_out',
        paymentMethod,
        paymentReference,
        settleNotes
      );
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Booking settled.' });
        setDetails({
          ...details,
          booking: {
            ...details.booking,
            booking_status: 'checked_out',
            payment_status: 'paid',
            razorpay_payment_id: paymentReference || details.booking.razorpay_payment_id,
          },
        });
        setIsSettleModalOpen(false);
        setIsInvoiceOpen(false);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to settle booking.' });
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* ===================================================================== */}
      {/* 1. TOP HEADER & BREADCRUMBS */}
      {/* ===================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <Link href="/bookings" className="hover:underline">Bookings</Link>
            <span>/</span>
            <span className="font-mono font-semibold text-neutral-800 dark:text-neutral-200">
              #{booking.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
            Booking &amp; Unified Ledger
          </h1>
          <p className="text-xs text-neutral-500">
            Guest folio, room billing, incidental charges, and final checkout invoicing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {booking.booking_status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => {
                setNewCheckIn(booking.check_in_date);
                setNewCheckOut(booking.check_out_date);
                setIsRescheduleOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
            >
              <span>📅 Reschedule Dates</span>
            </button>
          )}

          {booking.booking_status !== 'cancelled' && booking.booking_status !== 'checked_out' && (
            <button
              type="button"
              onClick={() => setIsCancelOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-700 hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
            >
              <span>✕ Cancel Stay</span>
            </button>
          )}

          {(booking.booking_status === 'confirmed' || booking.booking_status === 'pending') && (
            <button
              type="button"
              onClick={() => setIsCheckInOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500"
            >
              <span>🔑 Check In Guest</span>
            </button>
          )}

          {booking.booking_status !== 'checked_out' && booking.booking_status !== 'cancelled' && (
            <button
              type="button"
              onClick={() => setIsSplitCheckoutOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-600 bg-rose-50 px-3.5 py-2.5 text-xs font-bold text-rose-800 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700"
            >
              <span>🛎️ Settle &amp; Check Out</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsGuestQrOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 shadow-2xs hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
          >
            <span>📱 Room QR &amp; Portal</span>
          </button>

          <button
            type="button"
            onClick={() => setIsInvoiceOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Generate Final Invoice
          </button>
        </div>
      </div>

      {/* CANCELLED BANNER IF APPLICABLE */}
      {booking.booking_status === 'cancelled' && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50/80 p-4 text-xs text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-2 font-bold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-[10px] text-white">✕</span>
            <span>Reservation Cancelled</span>
          </div>
          <p className="mt-1 text-stone-600 dark:text-stone-400">
            This reservation is marked as cancelled. The assigned physical unit has been freed and is open for booking on the Room Rack.
          </p>
        </div>
      )}

      {/* FEEDBACK BANNER */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="text-neutral-400 hover:text-neutral-600"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 2. GUEST & RESERVATION OVERVIEW CARDS */}
      {/* ===================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Guest Details */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Guest Folio</h3>
            <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Active Guest
            </span>
          </div>
          <div className="mt-4 space-y-2.5 text-xs">
            <div>
              <span className="block text-[11px] text-neutral-400">Full Name</span>
              <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {booking.guest_name}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-neutral-400">Mobile (WhatsApp)</span>
              <span className="font-mono font-medium text-neutral-800 dark:text-neutral-200">
                {booking.guest_mobile_number}
              </span>
            </div>
            {booking.guest_email && (
              <div>
                <span className="block text-[11px] text-neutral-400">Email</span>
                <span className="text-neutral-700 dark:text-neutral-300">{booking.guest_email}</span>
              </div>
            )}
            <div>
              <span className="block text-[11px] text-neutral-400">Party Size</span>
              <span className="text-neutral-700 dark:text-neutral-300">
                {booking.num_adults} Adults{booking.num_children > 0 ? `, ${booking.num_children} Children` : ''}
              </span>
            </div>

            {/* Identity & KYC Verification Badge */}
            <div className="pt-2.5 border-t border-neutral-100 dark:border-neutral-800">
              <span className="block text-[11px] font-semibold text-neutral-500">Identity (KYC)</span>
              {booking.guest_identity_data ? (
                <div className="mt-1 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      ✓ {String((booking.guest_identity_data as Record<string, unknown>).id_type || 'ID').toUpperCase()}: {String((booking.guest_identity_data as Record<string, unknown>).id_number_masked || 'Verified')}
                    </span>
                    {!(booking.guest_identity_data as Record<string, unknown>).is_redacted && (
                      <button
                        type="button"
                        onClick={handleRedactIdentity}
                        disabled={isPending}
                        title="Redact KYC Document data for privacy compliance"
                        className="text-[10px] font-semibold text-rose-600 hover:underline"
                      >
                        Redact
                      </button>
                    )}
                  </div>
                  {Boolean((booking.guest_identity_data as Record<string, unknown>).is_foreign_guest) && (
                    <p className="text-[10px] text-indigo-600 dark:text-indigo-400">
                      🛂 Form C Filed ({String((booking.guest_identity_data as Record<string, unknown>).nationality || 'Foreign')})
                    </p>
                  )}
                  {booking.room_key_number && (
                    <p className="text-[10px] text-neutral-500">
                      🔑 Physical Key / Card: #{booking.room_key_number}
                    </p>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-neutral-400 italic">
                  Not recorded yet · Verify at Check-In
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Room & Stay Details */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Room &amp; Stay</h3>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
              {room?.room_type || 'Standard Unit'}
            </span>
          </div>
          <div className="mt-4 space-y-2.5 text-xs">
            <div>
              <span className="block text-[11px] text-neutral-400">Assigned Room</span>
              <span className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {room?.name || (booking.room_id ? 'Unit #' + booking.room_id.slice(0, 6) : 'Unassigned Unit')} {room?.room_number ? `(${room.room_number})` : ''}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="block text-[11px] text-neutral-400">Check-in</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{booking.check_in_date}</span>
              </div>
              <div>
                <span className="block text-[11px] text-neutral-400">Check-out</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{booking.check_out_date}</span>
              </div>
            </div>
            {booking.actual_check_in_at && (
              <div>
                <span className="block text-[11px] text-neutral-400">Checked In At</span>
                <span className="text-neutral-700 dark:text-neutral-300">
                  {new Date(booking.actual_check_in_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
            )}
            {booking.actual_check_out_at && (
              <div>
                <span className="block text-[11px] text-neutral-400">Checked Out At</span>
                <span className="text-neutral-700 dark:text-neutral-300">
                  {new Date(booking.actual_check_out_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                </span>
              </div>
            )}
            <div>
              <span className="block text-[11px] text-neutral-400">Property / Tenant</span>
              <span className="text-neutral-700 dark:text-neutral-300">{tenant?.name || 'Resort Property'}</span>
            </div>
          </div>
        </div>

        {/* Ledger Balance Summary Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400">Ledger Balance</h3>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                booking.payment_status === 'paid'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}
            >
              {booking.payment_status}
            </span>
          </div>

          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-neutral-500">Room Accommodation</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                ₹{roomCost.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Incidentals Subtotal</span>
              <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                ₹{incidentalsTotal.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between border-t border-neutral-200 pt-2 text-sm font-black dark:border-neutral-700">
              <span className="text-neutral-900 dark:text-neutral-100">Grand Total</span>
              <span className="text-emerald-600 dark:text-emerald-400">
                ₹{grandTotal.toLocaleString()}
              </span>
            </div>
            {booking.invoice_number && (
              <div className="flex justify-between border-t border-neutral-100 pt-1.5 text-[11px] dark:border-neutral-800">
                <span className="text-neutral-500">Official Invoice:</span>
                <span className="font-mono font-bold text-neutral-800 dark:text-neutral-200">
                  {booking.invoice_number}
                </span>
              </div>
            )}
          </div>

          <div className="mt-4">
            <button
              type="button"
              onClick={() => setIsInvoiceOpen(true)}
              className="w-full rounded-xl bg-neutral-900 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              View Invoice Breakdown
            </button>
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 3. UNIFIED LEDGER TABLE & INCIDENTAL MUTATIONS */}
      {/* ===================================================================== */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col items-start justify-between gap-4 border-b border-neutral-100 p-5 sm:flex-row sm:items-center dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Itemized Ledger &amp; Incidentals
            </h2>
            <p className="text-xs text-neutral-500">
              Track room stay charges and billable extras like restaurant dining, spa, and damages.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsAddFormOpen(!isAddFormOpen)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <span>{isAddFormOpen ? '✕ Cancel' : '+ Add Incidental Charge'}</span>
          </button>
        </div>

        {/* ADD INCIDENTAL CHARGE FORM */}
        {isAddFormOpen && (
          <form
            onSubmit={handleAddCharge}
            className="border-b border-neutral-100 bg-neutral-50/70 p-5 dark:border-neutral-800 dark:bg-neutral-800/40"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">
              New Incidental Charge
            </h3>

            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {/* Item Name */}
              <div className="lg:col-span-2">
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Item Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Seafood Dinner at Resort Deck, Spa Treatment, Minibar"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Category *
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as IncidentalCategory)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                >
                  <option value="restaurant">Restaurant &amp; Dining</option>
                  <option value="spa">Spa &amp; Wellness</option>
                  <option value="room_service">Room Service</option>
                  <option value="minibar">Minibar Consumption</option>
                  <option value="laundry">Laundry Services</option>
                  <option value="damage_fee">Damage / Breakage Fee</option>
                  <option value="activities">Activities &amp; Tours</option>
                  <option value="other">Other Incidentals</option>
                </select>
              </div>

              {/* Amount */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Amount in INR (₹) *
                </label>
                <input
                  type="number"
                  min="1"
                  step="0.01"
                  required
                  placeholder="e.g. 1500"
                  value={amountInr}
                  onChange={(e) => setAmountInr(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              </div>

              {/* Quantity */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value || '1', 10))}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              </div>

              {/* Notes */}
              <div className="lg:col-span-3">
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Notes / Bill Slip Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Slip #8491, Bill signed by guest at pool bar..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsAddFormOpen(false)}
                className="rounded-xl border border-neutral-300 px-3.5 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending || !itemName || !amountInr}
                className="rounded-xl bg-emerald-600 px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                {isPending ? 'Adding to Ledger...' : 'Add Charge'}
              </button>
            </div>
          </form>
        )}

        {/* LEDGER ITEMS TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-100 bg-neutral-50/50 text-[11px] font-semibold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/30">
              <tr>
                <th className="py-3 px-5">Item / Service</th>
                <th className="py-3 px-4">Category</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4 text-right">Unit Price</th>
                <th className="py-3 px-4 text-right">Total (₹)</th>
                <th className="py-3 px-5 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {/* 1. Base Room Charge Row */}
              <tr className="bg-neutral-50/20 font-medium">
                <td className="py-3.5 px-5">
                  <div className="font-bold text-neutral-900 dark:text-neutral-100">
                    Room Accommodation ({room?.name || 'Assigned Room'})
                  </div>
                  <div className="text-[11px] text-neutral-400">
                    Stay from {booking.check_in_date} to {booking.check_out_date}
                  </div>
                </td>
                <td className="py-3.5 px-4">
                  <span className="inline-block rounded-md bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                    Room Tariffs
                  </span>
                </td>
                <td className="py-3.5 px-4 text-center">1</td>
                <td className="py-3.5 px-4 text-right font-mono">₹{roomCost.toLocaleString()}</td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">
                  ₹{roomCost.toLocaleString()}
                </td>
                <td className="py-3.5 px-5 text-center text-[11px] text-neutral-400">
                  Base Booking
                </td>
              </tr>

              {/* 2. Incidental Charge Rows */}
              {incidentals.length > 0 ? (
                incidentals.map((item) => {
                  const catMeta = CATEGORY_LABELS[item.category] || CATEGORY_LABELS.other;
                  const lineTotal = Number(item.amount_inr) * item.quantity;

                  return (
                    <tr key={item.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/40">
                      <td className="py-3.5 px-5">
                        <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {item.item_name}
                        </div>
                        {item.notes && (
                          <div className="text-[11px] text-neutral-400 italic">
                            Note: {item.notes}
                          </div>
                        )}
                        <div className="text-[10px] text-neutral-400 font-mono">
                          Logged: {new Date(item.created_at).toLocaleString()}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold ${catMeta.color}`}>
                          {catMeta.label}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center font-mono">{item.quantity}</td>
                      <td className="py-3.5 px-4 text-right font-mono">
                        ₹{Number(item.amount_inr).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-neutral-800 dark:text-neutral-200">
                        ₹{lineTotal.toLocaleString()}
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteCharge(item.id)}
                          disabled={isPending}
                          className="rounded-lg p-1 text-neutral-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400"
                          title="Delete incidental charge"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-xs text-neutral-400">
                    No incidental charges added to this folio yet. Use &quot;+ Add Incidental Charge&quot; above to log dining, spa, or extras.
                  </td>
                </tr>
              )}
            </tbody>

            {/* Total Footer */}
            <tfoot className="border-t-2 border-neutral-200 bg-neutral-50/80 font-bold dark:border-neutral-700 dark:bg-neutral-800/60">
              <tr>
                <td colSpan={4} className="py-3.5 px-5 text-right uppercase text-[11px] text-neutral-500">
                  Total Folio Balance (Room + Incidentals)
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                  ₹{grandTotal.toLocaleString()}
                </td>
                <td className="py-3.5 px-5 text-center"></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* 4. FINAL CHECKOUT & INVOICING MODAL / VIEW */}
      {/* ===================================================================== */}
      {isInvoiceOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            {/* INVOICE HEADER */}
            <div className="flex items-start justify-between border-b border-neutral-200 pb-5 dark:border-neutral-800">
              <div className="flex items-center gap-3">
                {tenant?.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={tenant.logo_url} alt={tenant.name} className="h-12 w-12 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 font-extrabold text-white text-lg">
                    {tenant?.name?.charAt(0) || 'P'}
                  </div>
                )}
                <div>
                  <h2 className="text-xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                    {tenant?.name || 'PropSyncHub Resort'}
                  </h2>
                  <p className="text-xs text-neutral-500">
                    Tax Invoice &amp; Guest Folio Statement
                  </p>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block rounded-lg bg-neutral-100 px-2.5 py-1 text-xs font-mono font-bold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                  INV-{booking.id.slice(0, 8).toUpperCase()}
                </span>
                <p className="mt-1 text-[11px] text-neutral-400">
                  Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                <div className="mt-1 text-[11px]">
                  <span
                    className={`font-bold uppercase ${
                      booking.payment_status === 'paid'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    Payment: {booking.payment_status.toUpperCase()}
                  </span>
                  {booking.razorpay_payment_id && (
                    <p className="font-mono text-[10px] text-neutral-500">
                      Ref / UTR: {booking.razorpay_payment_id}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* GUEST & STAY INVOICE METADATA */}
            <div className="mt-5 grid grid-cols-2 gap-4 rounded-2xl bg-neutral-50 p-4 text-xs dark:bg-neutral-800/50">
              <div>
                <span className="block text-[11px] font-bold text-neutral-400 uppercase">Billed To</span>
                <p className="font-bold text-neutral-900 dark:text-neutral-100">{booking.guest_name}</p>
                <p className="font-mono text-neutral-600 dark:text-neutral-400">{booking.guest_mobile_number}</p>
                {booking.guest_email && <p className="text-neutral-500">{booking.guest_email}</p>}
              </div>

              <div className="text-right">
                <span className="block text-[11px] font-bold text-neutral-400 uppercase">Reservation Details</span>
                <p className="font-semibold text-neutral-800 dark:text-neutral-200">
                  {room?.name || 'Resort Accommodation'}
                </p>
                <p className="text-neutral-500">
                  Check-in: {booking.check_in_date} · Check-out: {booking.check_out_date}
                </p>
                <p className="text-neutral-500">
                  {booking.num_adults} Adults{booking.num_children > 0 ? `, ${booking.num_children} Children` : ''}
                </p>
              </div>
            </div>

            {/* ITEMIZED INVOICE BREAKDOWN */}
            <div className="mt-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">
                Itemized Summary
              </h3>

              <div className="rounded-xl border border-neutral-200 overflow-hidden dark:border-neutral-800">
                <table className="w-full text-left text-xs">
                  <thead className="bg-neutral-50 border-b border-neutral-200 dark:bg-neutral-800 dark:border-neutral-700">
                    <tr>
                      <th className="py-2.5 px-4">Item</th>
                      <th className="py-2.5 px-3 text-center">Qty</th>
                      <th className="py-2.5 px-3 text-right">Rate</th>
                      <th className="py-2.5 px-4 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                    {/* Room */}
                    <tr>
                      <td className="py-2.5 px-4">
                        <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                          Room Tariffs ({room?.name || 'Room Stay'})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">1</td>
                      <td className="py-2.5 px-3 text-right font-mono">₹{roomCost.toLocaleString()}</td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold">₹{roomCost.toLocaleString()}</td>
                    </tr>

                    {/* Incidentals */}
                    {incidentals.map((inc) => (
                      <tr key={inc.id}>
                        <td className="py-2.5 px-4">
                          <span className="font-medium text-neutral-800 dark:text-neutral-200">
                            {inc.item_name}
                          </span>
                          <span className="ml-2 text-[10px] text-neutral-400 capitalize">
                            ({inc.category.replace('_', ' ')})
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">{inc.quantity}</td>
                        <td className="py-2.5 px-3 text-right font-mono">₹{Number(inc.amount_inr).toLocaleString()}</td>
                        <td className="py-2.5 px-4 text-right font-mono font-bold">
                          ₹{(Number(inc.amount_inr) * inc.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/60 font-bold">
                    <tr>
                      <td colSpan={3} className="py-3 px-4 text-right text-xs">
                        Grand Total (Inclusive of applicable duties)
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-base font-black text-emerald-600 dark:text-emerald-400">
                        ₹{grandTotal.toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* INVOICE ACTIONS */}
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-t border-neutral-200 pt-4 dark:border-neutral-800">
              <button
                type="button"
                onClick={() => window.print()}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
              >
                🖨️ Print Invoice
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsInvoiceOpen(false)}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Close
                </button>

                {booking.booking_status !== 'checked_out' && (
                  <button
                    type="button"
                    onClick={() => setIsSettleModalOpen(true)}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500"
                  >
                    Mark as Settled &amp; Check Out
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* 5. PAYMENT CONFIRMATION & SETTLEMENT DIALOG */}
      {/* ===================================================================== */}
      {isSettleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Settle Invoice &amp; Check Out
              </h3>
              <button
                type="button"
                onClick={() => setIsSettleModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSettleBooking} className="mt-4 space-y-4 text-xs">
              {/* Grand Total Summary */}
              <div className="rounded-2xl bg-neutral-50 p-4 dark:bg-neutral-800/60 flex items-center justify-between">
                <div>
                  <span className="text-neutral-500 block">Total Folio Balance</span>
                  <span className="font-bold text-neutral-800 dark:text-neutral-200">
                    {booking.guest_name} (#{booking.id.slice(0, 8).toUpperCase()})
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black text-emerald-600 dark:text-emerald-400">
                    ₹{grandTotal.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Payment Method */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Payment Method Received *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as 'upi' | 'cash' | 'card' | 'bank_transfer' | 'razorpay')}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-100"
                >
                  <option value="upi">Direct UPI (Google Pay / PhonePe / Paytm / BHIM QR)</option>
                  <option value="cash">Cash at Front Desk</option>
                  <option value="card">Card POS Machine (Debit / Credit Terminal)</option>
                  <option value="bank_transfer">Bank IMPS / NEFT Transfer</option>
                  <option value="razorpay">Online Payment Gateway</option>
                </select>
              </div>

              {/* Payment Reference ID */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Payment / Reference ID (UTR / Txn Slip Number)
                </label>
                <input
                  type="text"
                  placeholder="e.g. 529103948291, POS Slip #4819, or Cash Memo"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-mono text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-100"
                />
                <p className="mt-1 text-[10px] text-neutral-400">
                  Required for UPI &amp; Cards to prevent discrepancies and print on Tax Invoice.
                </p>
              </div>

              {/* Settlement Notes */}
              <div>
                <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                  Settlement Notes (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Settled in full upon keys handover"
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-100"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsSettleModalOpen(false)}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending ? 'Settling...' : 'Confirm Payment & Check Out'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {isRescheduleOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  📅 Reschedule Reservation
                </h3>
                <p className="text-xs text-stone-500">
                  Guest: {booking.guest_name} (#{booking.id.slice(0, 8).toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRescheduleOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRescheduleBooking} className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    New Check-In
                  </label>
                  <input
                    type="date"
                    required
                    value={newCheckIn}
                    onChange={(e) => setNewCheckIn(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    New Check-Out
                  </label>
                  <input
                    type="date"
                    required
                    value={newCheckOut}
                    min={newCheckIn}
                    onChange={(e) => setNewCheckOut(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                  />
                </div>
              </div>

              {newCheckIn && newCheckOut && new Date(newCheckOut) > new Date(newCheckIn) && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="flex justify-between font-semibold text-emerald-900 dark:text-emerald-200">
                    <span>Stay Duration:</span>
                    <span>
                      {Math.max(1, Math.round((new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / (1000 * 60 * 60 * 24)))} Nights
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                    ✓ System will run collision check for assigned unit ({room?.name || 'unit'}) before confirming.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsRescheduleOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !newCheckIn || !newCheckOut || new Date(newCheckOut) <= new Date(newCheckIn)}
                  className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  {isPending ? 'Validating & Updating...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {isCancelOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/40 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-rose-700 dark:text-rose-400">
                  ✕ Cancel Reservation
                </h3>
                <p className="text-xs text-stone-500">
                  Guest: {booking.guest_name} (#{booking.id.slice(0, 8).toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCancelBooking} className="mt-4 space-y-4">
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
                <p className="font-semibold">⚠️ Inventory Release Notice:</p>
                <p className="mt-0.5 text-[11px]">
                  Cancelling this reservation will immediately release {room?.name || 'the unit'} back to available inventory on the Room Rack.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Select Cancellation Reason
                </label>
                <select
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-900 focus:border-rose-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                >
                  <option value="Guest requested cancellation">Guest requested cancellation</option>
                  <option value="Guest no-show / duplicate booking">Guest no-show / duplicate booking</option>
                  <option value="Medical or travel emergency">Medical or travel emergency</option>
                  <option value="Payment issue / fraud prevention">Payment issue / failed payment</option>
                  <option value="Operational maintenance / resort request">Operational maintenance / resort request</option>
                  <option value="Other / Front Desk reason">Other</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCancelOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Keep Reservation
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-rose-600 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-rose-500 disabled:opacity-50"
                >
                  {isPending ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHASE 3: FRONT DESK CHECK-IN MODAL */}
      {isCheckInOpen && (
        <CheckInModal
          booking={booking}
          rooms={availableRooms.length > 0 ? availableRooms : room ? [room] : []}
          isOpen={isCheckInOpen}
          onClose={() => setIsCheckInOpen(false)}
          onSuccess={(msg) => {
            setFeedback({ type: 'success', message: msg });
            setIsCheckInOpen(false);
            setDetails((prev) => ({
              ...prev,
              booking: {
                ...prev.booking,
                booking_status: 'checked_in',
              },
            }));
            router.refresh();
          }}
          onError={(err) => setFeedback({ type: 'error', message: err })}
        />
      )}

      {/* PHASE 3: SPLIT CHECKOUT & SETTLEMENT MODAL */}
      {isSplitCheckoutOpen && (
        <SplitCheckoutModal
          bookingId={booking.id}
          tenantId={booking.tenant_id}
          isOpen={isSplitCheckoutOpen}
          onClose={() => setIsSplitCheckoutOpen(false)}
          onSuccess={(msg, invoice) => {
            setFeedback({
              type: 'success',
              message: `${msg}${invoice ? ` (Invoice #${invoice.invoice_number})` : ''}`,
            });
            setIsSplitCheckoutOpen(false);
            setDetails((prev) => ({
              ...prev,
              booking: {
                ...prev.booking,
                booking_status: 'checked_out',
                payment_status: 'paid',
                invoice_number: invoice?.invoice_number || prev.booking.invoice_number,
              },
            }));
            router.refresh();
          }}
          onError={(err) => setFeedback({ type: 'error', message: err })}
        />
      )}

      {/* PHASE 6: IN-ROOM QR & SIGNED PORTAL ACCESS MODAL */}
      {isGuestQrOpen && (
        <GuestQrModal
          tenant={tenant}
          booking={booking}
          room={room}
          onClose={() => setIsGuestQrOpen(false)}
        />
      )}
    </div>
  );
}
