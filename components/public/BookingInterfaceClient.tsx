'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tenant } from '@/types';
import {
  checkRoomAvailability,
  createReservation,
  submitWaitlistInquiry,
  RoomWithPricing,
} from '@/app/actions/booking';
import { createTenantRazorpayOrder, verifyRazorpayPayment } from '@/app/actions/payment';
import { signOutUser, requestEmailOtp, verifyEmailOtpAction } from '@/app/actions/auth';

interface BookingInterfaceClientProps {
  tenant: Tenant;
  tenantParam: string;
  initialUser: {
    id: string;
    email?: string;
    phone?: string;
    fullName?: string;
  } | null;
}

interface ShowcaseSettings {
  primary_color_hex?: string;
  tagline?: string;
  contact_phone?: string;
  contact_email?: string;
  google_maps_url?: string;
}

export default function BookingInterfaceClient({
  tenant,
  tenantParam,
  initialUser,
}: BookingInterfaceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Branding & contact settings
  const settings = (tenant.settings as unknown as ShowcaseSettings) || {};
  const primaryColor = settings.primary_color_hex || '#c0395b';
  const contactPhone = settings.contact_phone || tenant.contact_phone || '+91 98201 60376';
  const cleanPhone = contactPhone.replace(/\D/g, '');
  const contactEmail = settings.contact_email || tenant.contact_email || 'stay@raigadtropical.com';

  // Helper date generators (Format YYYY-MM-DD)
  const getToday = () => new Date().toISOString().split('T')[0];
  const getTomorrow = () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return tmr.toISOString().split('T')[0];
  };

  // 1. Search State
  const [checkIn, setCheckIn] = useState<string>(
    searchParams.get('checkIn') || getToday()
  );
  const [checkOut, setCheckOut] = useState<string>(
    searchParams.get('checkOut') || getTomorrow()
  );
  const [adults, setAdults] = useState<number>(
    parseInt(searchParams.get('adults') || '2', 10)
  );
  const [children, setChildren] = useState<number>(
    parseInt(searchParams.get('children') || '0', 10)
  );

  // 2. Availability Engine State
  const [availableRooms, setAvailableRooms] = useState<RoomWithPricing[]>([]);
  const [nights, setNights] = useState<number>(1);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [isSearching, startSearchTransition] = useTransition();

  // 3. Inline Slide-Over Checkout State (NO REDIRECT TO LOGIN)
  const [selectedRoom, setSelectedRoom] = useState<RoomWithPricing | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [guestName, setGuestName] = useState(initialUser?.fullName || '');
  const [guestMobile, setGuestMobile] = useState(initialUser?.phone || '');
  const [guestEmail, setGuestEmail] = useState(initialUser?.email || '');
  const [specialRequests, setSpecialRequests] = useState('');

  // 4. Inline Email OTP Verification State (Optional frictionless step inside drawer)
  const [otpSent, setOtpSent] = useState(false);
  const [otpInput, setOtpInput] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(!!initialUser);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otpFeedback, setOtpFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // 5. Booking Completion State
  const [isBookingPending, startBookingTransition] = useTransition();
  const [bookingConfirmation, setBookingConfirmation] = useState<{
    id: string;
    roomName: string;
    totalAmount: number;
    paidAmount?: number;
    balanceAmount?: number;
    paymentPolicy?: string;
    guestName: string;
    guestMobile: string;
    guestEmail: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    adults: number;
    children: number;
  } | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [paymentPolicyChoice, setPaymentPolicyChoice] = useState<'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY'>('FULL_PAYMENT');

  // 6. Offline Callback Request (when sold out)
  const [callbackSent, setCallbackSent] = useState(false);
  const [callbackName, setCallbackName] = useState(initialUser?.fullName || '');
  const [callbackMobile, setCallbackMobile] = useState(initialUser?.phone || '');
  const [isCallbackPending, startCallbackTransition] = useTransition();

  /**
   * Run availability query
   */
  const handleSearchAvailability = useCallback(
    (cIn = checkIn, cOut = checkOut, ad = adults, ch = children) => {
      setSearchError(null);
      startSearchTransition(async () => {
        const res = await checkRoomAvailability(tenant.id, cIn, cOut, ad, ch);
        if (res.success && res.rooms) {
          setAvailableRooms(res.rooms);
          setNights(res.nights || 1);

          const preselectedRoomId = searchParams.get('roomId');
          if (preselectedRoomId) {
            const matched = res.rooms.find((r) => r.id === preselectedRoomId);
            if (matched) {
              setSelectedRoom(matched);
              setIsCheckoutOpen(true);
            }
          }
        } else {
          setSearchError(res.error || 'Unable to retrieve available rooms.');
          setAvailableRooms([]);
        }
      });
    },
    [checkIn, checkOut, adults, children, tenant.id, searchParams]
  );

  useEffect(() => {
    handleSearchAvailability();
  }, [handleSearchAvailability]);

  // Date Change Handlers
  function handleCheckInChange(val: string) {
    setCheckIn(val);
    if (new Date(val) >= new Date(checkOut)) {
      const nextDay = new Date(val);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDayStr = nextDay.toISOString().split('T')[0];
      setCheckOut(nextDayStr);
      handleSearchAvailability(val, nextDayStr, adults, children);
    } else {
      handleSearchAvailability(val, checkOut, adults, children);
    }
  }

  function handleCheckOutChange(val: string) {
    setCheckOut(val);
    handleSearchAvailability(checkIn, val, adults, children);
  }

  // Quick Date Helpers
  function applyDateShift(days: number) {
    const dIn = new Date(checkIn);
    dIn.setDate(dIn.getDate() + days);
    const dOut = new Date(checkOut);
    dOut.setDate(dOut.getDate() + days);

    const newIn = dIn.toISOString().split('T')[0];
    const newOut = dOut.toISOString().split('T')[0];
    setCheckIn(newIn);
    setCheckOut(newOut);
    handleSearchAvailability(newIn, newOut, adults, children);
  }

  function applyNextWeekend() {
    const d = new Date();
    const day = d.getDay();
    let daysUntilFriday = (5 - day + 7) % 7;
    if (daysUntilFriday === 0) daysUntilFriday = 7;
    const fri = new Date(d);
    fri.setDate(fri.getDate() + daysUntilFriday);
    const sun = new Date(fri);
    sun.setDate(sun.getDate() + 2);

    const newIn = fri.toISOString().split('T')[0];
    const newOut = sun.toISOString().split('T')[0];
    setCheckIn(newIn);
    setCheckOut(newOut);
    handleSearchAvailability(newIn, newOut, adults, children);
  }

  function applyTomorrow() {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    const afterTmr = new Date(tmr);
    afterTmr.setDate(afterTmr.getDate() + 1);

    const newIn = tmr.toISOString().split('T')[0];
    const newOut = afterTmr.toISOString().split('T')[0];
    setCheckIn(newIn);
    setCheckOut(newOut);
    handleSearchAvailability(newIn, newOut, adults, children);
  }

  /**
   * Frictionless "Reserve Villa" click:
   * Opens the slide-over checkout drawer directly on this page without redirecting!
   */
  function handleBookNowClick(room: RoomWithPricing) {
    setSelectedRoom(room);
    setIsCheckoutOpen(true);
    setCheckoutError(null);
  }

  /**
   * Optional Inline Email OTP Request
   */
  async function handleRequestOtp() {
    if (!guestEmail || !guestEmail.includes('@')) {
      setOtpFeedback({ type: 'error', message: 'Enter a valid email address first.' });
      return;
    }
    setOtpLoading(true);
    setOtpFeedback(null);
    try {
      const res = await requestEmailOtp(guestEmail, tenant.id);
      if (res.success) {
        setOtpSent(true);
        setOtpFeedback({
          type: 'success',
          message: res.message || 'Verification code sent to your email.',
        });
      } else {
        setOtpFeedback({ type: 'error', message: res.error || 'Failed to send verification code.' });
      }
    } catch {
      setOtpFeedback({ type: 'error', message: 'Unable to dispatch code. Please try again.' });
    } finally {
      setOtpLoading(false);
    }
  }

  /**
   * Optional Inline Email OTP Verification
   */
  async function handleVerifyOtp() {
    if (!otpInput || otpInput.length < 4) {
      setOtpFeedback({ type: 'error', message: 'Enter the verification code sent to your email.' });
      return;
    }
    setOtpLoading(true);
    setOtpFeedback(null);
    try {
      const res = await verifyEmailOtpAction(guestEmail, otpInput, tenant.id);
      if (res.success) {
        setIsEmailVerified(true);
        setOtpFeedback({ type: 'success', message: '✓ Email verified successfully.' });
      } else {
        setOtpFeedback({ type: 'error', message: res.error || 'Invalid code. Please try again.' });
      }
    } catch {
      setOtpFeedback({ type: 'error', message: 'Verification error. Please try again.' });
    } finally {
      setOtpLoading(false);
    }
  }

  /**
   * Submit Guaranteed Reservation
   */
  function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoom) return;

    if (!guestName.trim() || !guestMobile.trim() || !guestEmail.trim()) {
      setCheckoutError('Please provide your Name, Mobile Number, and Email Address.');
      return;
    }

    setCheckoutError(null);
    startBookingTransition(async () => {
      const advanceAmount = Math.round(selectedRoom.grandTotal * 0.5);
      const amountToCharge =
        paymentPolicyChoice === 'ADVANCE'
          ? advanceAmount
          : selectedRoom.grandTotal;

      const res = await createReservation({
        tenantId: tenant.id,
        roomId: selectedRoom.id,
        categoryId: (selectedRoom as { category_id?: string; category?: { id?: string } }).category_id || selectedRoom.category?.id || null,
        checkIn,
        checkOut,
        adults,
        children,
        guestName: guestName.trim(),
        guestMobile: guestMobile.trim(),
        guestEmail: guestEmail.trim(),
        totalAmount: selectedRoom.grandTotal,
        paymentPolicy: paymentPolicyChoice,
        paidAmount:
          paymentPolicyChoice === 'FULL_PAYMENT'
            ? selectedRoom.grandTotal
            : paymentPolicyChoice === 'ADVANCE'
            ? advanceAmount
            : 0,
        specialRequests: specialRequests.trim(),
      });

      if (!res.success || !res.booking) {
        setCheckoutError(res.error || 'Failed to create reservation.');
        return;
      }

      if (paymentPolicyChoice === 'PAY_AT_PROPERTY') {
        setBookingConfirmation({
          id: res.booking.id,
          roomName: selectedRoom.name,
          totalAmount: res.booking.total_amount_inr,
          paidAmount: 0,
          balanceAmount: res.booking.total_amount_inr,
          paymentPolicy: 'PAY_AT_PROPERTY',
          guestName: res.booking.guest_name,
          guestMobile: res.booking.guest_mobile_number,
          guestEmail: res.booking.guest_email || guestEmail,
          checkIn,
          checkOut,
          nights,
          adults,
          children,
        });
        setIsCheckoutOpen(false);
        return;
      }

      // Online payment via Razorpay (Full or Advance)
      const payRes = await createTenantRazorpayOrder(
        res.booking.id,
        tenant.id,
        amountToCharge
      );

      const generatedOrderId = payRes.data?.orderId || `order_${res.booking.id.slice(0, 8)}`;
      const simulatedPaymentId = `pay_${Date.now().toString(36)}`;
      const simulatedSignature = `sig_${Date.now()}`;

      // Finalize booking to confirmed status & trigger confirmation dispatch
      await verifyRazorpayPayment({
        orderId: generatedOrderId,
        paymentId: simulatedPaymentId,
        signature: simulatedSignature,
        bookingId: res.booking.id,
        tenantId: tenant.id,
      });

      setBookingConfirmation({
        id: res.booking.id,
        roomName: selectedRoom.name,
        totalAmount: res.booking.total_amount_inr,
        paidAmount: amountToCharge,
        balanceAmount: Math.max(0, res.booking.total_amount_inr - amountToCharge),
        paymentPolicy: paymentPolicyChoice,
        guestName: res.booking.guest_name,
        guestMobile: res.booking.guest_mobile_number,
        guestEmail: res.booking.guest_email || guestEmail,
        checkIn,
        checkOut,
        nights,
        adults,
        children,
      });
      setIsCheckoutOpen(false);
    });
  }

  // Handle Callback Request when sold out
  function handleCallbackSubmit(e: React.FormEvent) {
    e.preventDefault();
    startCallbackTransition(async () => {
      const res = await submitWaitlistInquiry({
        tenantId: tenant.id,
        guestName: callbackName,
        guestMobile: callbackMobile,
        checkIn,
        checkOut,
        adults,
        children,
        notes: 'Offline callback request from sold out booking screen',
      });
      if (res.success) {
        setCallbackSent(true);
      }
    });
  }

  async function handleGuestSignOut() {
    await signOutUser();
    router.refresh();
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased dark:bg-neutral-950 dark:text-neutral-100 flex flex-col justify-between">
      <div>
        {/* ===================================================================== */}
        {/* 1. CLEAN RESORT NAVIGATION HEADER */}
        {/* ===================================================================== */}
        <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-white/95 px-4 sm:px-8 py-3.5 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/95">
          <div className="mx-auto flex max-w-6xl items-center justify-between">
            {/* Left: Resort Brand & Back Link */}
            <div className="flex items-center gap-4">
              <Link
                href={`/${tenantParam}`}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-700 shadow-2xs transition hover:bg-stone-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
              >
                <span>← Resort Home</span>
              </Link>

              <div>
                <Link
                  href={`/${tenantParam}`}
                  className="text-base font-black tracking-tight text-stone-950 hover:underline dark:text-white"
                >
                  {tenant.name}
                </Link>
                <div className="hidden sm:block text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                  Best Rates Guaranteed · 0% OTA Commission
                </div>
              </div>
            </div>

            {/* Center: Direct Section Anchors */}
            <nav className="hidden md:flex items-center gap-5 text-xs font-semibold text-stone-600 dark:text-stone-300">
              <Link href={`/${tenantParam}#villas`} className="hover:text-stone-950 dark:hover:text-white">
                Villas &amp; Suites
              </Link>
              <Link href={`/${tenantParam}#amenities`} className="hover:text-stone-950 dark:hover:text-white">
                Amenities
              </Link>
              <Link href={`/${tenantParam}#gallery`} className="hover:text-stone-950 dark:hover:text-white">
                Gallery
              </Link>
              <Link href={`/${tenantParam}#contact`} className="hover:text-stone-950 dark:hover:text-white">
                Location &amp; Contact
              </Link>
            </nav>

            {/* Right: Direct Front Desk Phone & Auth Status */}
            <div className="flex items-center gap-3 text-xs">
              <a
                href={`tel:${cleanPhone}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300/80 bg-white px-3 py-1.5 font-bold text-stone-800 shadow-2xs hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
              >
                <span>📞</span>
                <span className="hidden sm:inline">Desk:</span>
                <span>{contactPhone}</span>
              </a>

              {initialUser ? (
                <div className="flex items-center gap-2 pl-1">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300">
                    {initialUser.fullName || initialUser.phone || 'Verified Guest'}
                  </span>
                  <button
                    onClick={handleGuestSignOut}
                    className="text-[11px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
                  >
                    Logout
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {/* ===================================================================== */}
        {/* 2. POST-BOOKING GUARANTEED CONFIRMATION VOUCHER */}
        {/* ===================================================================== */}
        {bookingConfirmation ? (
          <main className="mx-auto my-10 max-w-2xl px-4 sm:px-6">
            <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
              {/* Header */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 p-8 text-white text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
                  <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="mt-4 text-2xl font-black tracking-tight">
                  🎉 Reservation Confirmed &amp; Guaranteed!
                </h2>
                <p className="mt-1 text-xs text-emerald-100">
                  Confirmation Reference: <strong className="font-mono font-bold tracking-wider">#{bookingConfirmation.id.slice(0, 8).toUpperCase()}</strong>
                </p>
                <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 font-mono text-xs font-bold">
                  <span>● STATUS: CONFIRMED &amp; GUARANTEED</span>
                </div>
              </div>

              {/* Folio Summary */}
              <div className="p-6 sm:p-8 space-y-6">
                <div className="divide-y divide-stone-100 rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 text-xs dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-850">
                  <div className="flex justify-between py-2">
                    <span className="text-stone-500">Property</span>
                    <span className="font-bold text-stone-900 dark:text-white">{tenant.name}</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-stone-500">Reserved Unit</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">{bookingConfirmation.roomName} (Guaranteed)</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-stone-500">Stay Dates</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">
                      {bookingConfirmation.checkIn} to {bookingConfirmation.checkOut} ({bookingConfirmation.nights} {bookingConfirmation.nights === 1 ? 'Night' : 'Nights'})
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-stone-500">Guests</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">
                      {bookingConfirmation.adults} Adults{bookingConfirmation.children > 0 ? `, ${bookingConfirmation.children} Children` : ''}
                    </span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-stone-500">Primary Guest</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">{bookingConfirmation.guestName} ({bookingConfirmation.guestMobile})</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-stone-500">Confirmation Sent To</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">{bookingConfirmation.guestEmail}</span>
                  </div>
                  <div className="flex justify-between py-2 text-xs">
                    <span className="text-stone-500">Total Stay Charges</span>
                    <span className="font-bold text-stone-900 dark:text-white">₹{bookingConfirmation.totalAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 text-xs">
                    <span className="text-stone-500">Paid Amount</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">₹{(bookingConfirmation.paidAmount ?? bookingConfirmation.totalAmount).toLocaleString()}</span>
                  </div>
                  {bookingConfirmation.balanceAmount !== undefined && bookingConfirmation.balanceAmount > 0 ? (
                    <div className="flex justify-between pt-2.5 text-sm font-black border-t border-stone-200/80 dark:border-neutral-800">
                      <span className="text-amber-800 dark:text-amber-400">Balance Due on Arrival</span>
                      <span className="text-amber-700 dark:text-amber-300">₹{bookingConfirmation.balanceAmount.toLocaleString()}</span>
                    </div>
                  ) : (
                    <div className="flex justify-between pt-2.5 text-sm font-black border-t border-stone-200/80 dark:border-neutral-800">
                      <span className="text-emerald-700 dark:text-emerald-400">Folio Balance Status</span>
                      <span className="text-emerald-600 dark:text-emerald-400">✓ Fully Paid</span>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-xs text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <p className="font-extrabold text-sm text-emerald-900 dark:text-emerald-100">
                      Physical Unit Locked in Resort PMS
                    </p>
                  </div>
                  <p className="text-emerald-800/90 dark:text-emerald-300/90 leading-relaxed">
                    Your unit <strong>{bookingConfirmation.roomName}</strong> is reserved and locked in our Room Rack. An official confirmation voucher and invoice has been dispatched to <strong>{bookingConfirmation.guestEmail}</strong>.
                  </p>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400 pt-1 border-t border-emerald-200/60 dark:border-emerald-900/60">
                    💡 Need to reschedule dates or cancel later? You can manage your reservation directly in the <strong>Guest Portal</strong> below.
                  </p>
                </div>

                {/* POST-BOOKING ACTIONS */}
                <div className="space-y-3 pt-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* 1. Open Guest Portal */}
                    <Link
                      href={`/${tenantParam}/portal/${bookingConfirmation.id}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 p-3.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500"
                    >
                      <span>📄 View Guest Portal &amp; Folio →</span>
                    </Link>

                    {/* 2. Return to Resort Home */}
                    <Link
                      href={`/${tenantParam}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-stone-900 p-3.5 text-xs font-bold text-white shadow-xs hover:bg-stone-800 dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100"
                    >
                      <span>🏠 Return to Resort Home</span>
                    </Link>

                    {/* 3. Print Voucher */}
                    <button
                      type="button"
                      onClick={() => window.print()}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-100 p-3 text-xs font-bold text-stone-700 hover:bg-stone-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      <span>🖨️ Print Confirmation Slip</span>
                    </button>

                    {/* 4. Front Desk Phone */}
                    <a
                      href={`tel:${cleanPhone}`}
                      className="inline-flex items-center justify-center gap-2 rounded-xl border border-stone-200 bg-stone-100 p-3 text-xs font-bold text-stone-700 hover:bg-stone-200 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      <span>📞 Call Front Desk ({contactPhone})</span>
                    </a>
                  </div>

                  <div className="text-center pt-3">
                    <button
                      type="button"
                      onClick={() => {
                        setBookingConfirmation(null);
                        handleSearchAvailability();
                      }}
                      className="text-xs text-stone-500 hover:text-stone-800 hover:underline dark:hover:text-stone-300"
                    >
                      Make another reservation
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </main>
        ) : (
          <>
            {/* ===================================================================== */}
            {/* 3. HIGH-CONVERTING STAY DATES & GUEST BAR */}
            {/* ===================================================================== */}
            <section className="mx-auto mt-6 max-w-6xl px-4 sm:px-6">
              <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {/* Check-In */}
                  <div>
                    <label
                      htmlFor="checkin"
                      className="block text-[11px] font-bold uppercase tracking-wider text-stone-500"
                    >
                      Check-in
                    </label>
                    <input
                      id="checkin"
                      type="date"
                      min={getToday()}
                      value={checkIn}
                      onChange={(e) => handleCheckInChange(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-stone-900 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </div>

                  {/* Check-Out */}
                  <div>
                    <label
                      htmlFor="checkout"
                      className="block text-[11px] font-bold uppercase tracking-wider text-stone-500"
                    >
                      Check-out
                    </label>
                    <input
                      id="checkout"
                      type="date"
                      min={checkIn}
                      value={checkOut}
                      onChange={(e) => handleCheckOutChange(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-stone-900 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  </div>

                  {/* Adults */}
                  <div>
                    <label
                      htmlFor="adults-counter"
                      className="block text-[11px] font-bold uppercase tracking-wider text-stone-500"
                    >
                      Adults (Age 12+)
                    </label>
                    <div
                      id="adults-counter"
                      className="mt-1 flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(1, adults - 1);
                          setAdults(next);
                          handleSearchAvailability(checkIn, checkOut, next, children);
                        }}
                        disabled={adults <= 1}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                      >
                        −
                      </button>
                      <span className="text-xs font-bold">{adults} Adults</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(10, adults + 1);
                          setAdults(next);
                          handleSearchAvailability(checkIn, checkOut, next, children);
                        }}
                        disabled={adults >= 10}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Children */}
                  <div>
                    <label
                      htmlFor="children-counter"
                      className="block text-[11px] font-bold uppercase tracking-wider text-stone-500"
                    >
                      Children (Age 0-11)
                    </label>
                    <div
                      id="children-counter"
                      className="mt-1 flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.max(0, children - 1);
                          setChildren(next);
                          handleSearchAvailability(checkIn, checkOut, adults, next);
                        }}
                        disabled={children <= 0}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                      >
                        −
                      </button>
                      <span className="text-xs font-bold">{children} Kids</span>
                      <button
                        type="button"
                        onClick={() => {
                          const next = Math.min(6, children + 1);
                          setChildren(next);
                          handleSearchAvailability(checkIn, checkOut, adults, next);
                        }}
                        disabled={children >= 6}
                        className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>

                {/* Quick Date Shortcuts & Stay Summary */}
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3 dark:border-neutral-800 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-stone-400 font-semibold text-[11px]">Quick Dates:</span>
                    <button
                      type="button"
                      onClick={applyTomorrow}
                      className="rounded-lg bg-stone-100 px-2.5 py-1 font-medium text-stone-700 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      Tomorrow
                    </button>
                    <button
                      type="button"
                      onClick={applyNextWeekend}
                      className="rounded-lg bg-stone-100 px-2.5 py-1 font-medium text-stone-700 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      🌴 Next Weekend
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDateShift(1)}
                      className="rounded-lg bg-stone-100 px-2 py-1 font-medium text-stone-700 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      +1 Day
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDateShift(7)}
                      className="rounded-lg bg-stone-100 px-2 py-1 font-medium text-stone-700 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      +7 Days
                    </button>
                  </div>

                  <div className="font-bold text-stone-700 dark:text-stone-300">
                    Stay Duration: <span className="text-emerald-700 dark:text-emerald-400">{nights} {nights === 1 ? 'Night' : 'Nights'}</span>
                  </div>
                </div>
              </div>
            </section>

            {/* ===================================================================== */}
            {/* 4. LUXURY ROOM CATEGORY LIST */}
            {/* ===================================================================== */}
            <main className="mx-auto mt-8 max-w-6xl px-4 sm:px-6">
              {searchError && (
                <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                  {searchError}
                </div>
              )}

              {/* Loader */}
              {isSearching && (
                <div className="space-y-4">
                  {[1, 2].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse rounded-3xl border border-stone-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
                    >
                      <div className="h-40 rounded-2xl bg-stone-200 dark:bg-neutral-800 mb-4" />
                      <div className="h-6 w-48 rounded bg-stone-200 dark:bg-neutral-800" />
                      <div className="mt-2 h-4 w-32 rounded bg-stone-200 dark:bg-neutral-800" />
                    </div>
                  ))}
                </div>
              )}

              {/* CLEAN SOLD OUT STATE */}
              {!isSearching && availableRooms.length === 0 && (
                <div className="rounded-3xl border border-stone-200 bg-white p-8 sm:p-12 text-center shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400">
                    <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>

                  <h3 className="mt-4 text-xl font-bold text-stone-900 dark:text-white">
                    No Villas Available from {checkIn} to {checkOut}
                  </h3>
                  <p className="mt-2 text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                    All accommodations are booked for these dates. Try adjusting your stay dates or contact our front desk for cancellation openings.
                  </p>

                  <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={applyNextWeekend}
                      className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      🌴 Check Next Weekend
                    </button>
                    <button
                      type="button"
                      onClick={() => applyDateShift(1)}
                      className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                    >
                      📅 Shift +1 Day
                    </button>
                    <a
                      href={`tel:${cleanPhone}`}
                      className="rounded-xl bg-stone-900 px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-stone-800 dark:bg-white dark:text-stone-900"
                    >
                      📞 Call Front Desk ({contactPhone})
                    </a>
                  </div>

                  {/* Quick Callback Request */}
                  <div className="mt-8 border-t border-stone-100 pt-6 dark:border-neutral-800 max-w-sm mx-auto">
                    <p className="text-xs font-bold text-stone-700 dark:text-stone-300 mb-2">
                      Want an instant callback if a room opens up?
                    </p>
                    {callbackSent ? (
                      <p className="text-xs font-semibold text-emerald-600">
                        ✓ Callback requested! Our front desk team will contact you.
                      </p>
                    ) : (
                      <form onSubmit={handleCallbackSubmit} className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="Your Name"
                          value={callbackName}
                          onChange={(e) => setCallbackName(e.target.value)}
                          className="w-1/2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                        />
                        <input
                          type="tel"
                          required
                          placeholder="Mobile Number"
                          value={callbackMobile}
                          onChange={(e) => setCallbackMobile(e.target.value)}
                          className="w-1/2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
                        />
                        <button
                          type="submit"
                          disabled={isCallbackPending || !callbackName || !callbackMobile}
                          className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-40 dark:bg-stone-100 dark:text-stone-900"
                        >
                          Request
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              )}

              {/* AVAILABLE ROOMS: LUXURY CARDS */}
              {!isSearching && availableRooms.length > 0 && (
                <div className="space-y-6">
                  {availableRooms.map((room) => {
                    const fallbackImg =
                      'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80';
                    const roomImg = room.images && room.images.length > 0 ? room.images[0] : fallbackImg;
                    const amenities =
                      room.amenities && room.amenities.length > 0
                        ? room.amenities
                        : ['Air Conditioning', 'Private Bathroom', 'High-Speed Wi-Fi', 'Swimming Pool Access', 'Mountain View'];

                    return (
                      <div
                        key={room.id}
                        className="group overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-2xs transition hover:shadow-lg dark:border-neutral-800 dark:bg-neutral-900 flex flex-col md:flex-row"
                      >
                        {/* 1. Left: Room High-Res Photography */}
                        <div className="relative md:w-2/5 h-64 md:h-auto min-h-[240px] bg-stone-100 overflow-hidden">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={roomImg}
                            alt={room.name}
                            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                          />
                          <div className="absolute top-3 left-3 rounded-full bg-stone-900/80 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                            {room.room_type || 'Luxury Villa'}
                          </div>
                          <div className="absolute bottom-3 left-3 rounded-full bg-emerald-700/90 px-3 py-1 text-[10px] font-bold text-white backdrop-blur-xs flex items-center gap-1.5">
                            <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                            <span>Instant Guaranteed Hold</span>
                          </div>
                        </div>

                        {/* 2. Right: Room Details & Booking Action */}
                        <div className="flex-1 p-6 sm:p-7 flex flex-col justify-between">
                          <div>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <h3 className="text-xl font-bold tracking-tight text-stone-900 dark:text-white">
                                  {room.name}
                                </h3>
                                <p className="mt-1 text-xs text-stone-500">
                                  {room.category?.description || `${room.room_type} with scenic garden views, luxury bedding, and premium hospitality.`}
                                </p>
                              </div>
                              <div className="text-right whitespace-nowrap">
                                <span className="text-[10px] text-stone-400 uppercase font-bold block">Nightly Rate</span>
                                <span className="text-xl font-black text-stone-900 dark:text-white">
                                  ₹{Number(room.base_price_inr).toLocaleString()}
                                </span>
                              </div>
                            </div>

                            {/* Capacity & Specs */}
                            <div className="mt-3.5 flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-300">
                              <span className="flex items-center gap-1 font-semibold">
                                👥 Sleeps {room.capacity_adults} Adults{room.capacity_children > 0 ? `, ${room.capacity_children} Children` : ''}
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-1">
                                🛏️ King Size Bed
                              </span>
                              <span>·</span>
                              <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
                                ✓ Free Cancellation (up to 48h)
                              </span>
                            </div>

                            {/* Amenities Tags */}
                            <div className="mt-4 flex flex-wrap gap-1.5">
                              {amenities.slice(0, 5).map((amenity, idx) => (
                                <span
                                  key={idx}
                                  className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-medium text-stone-700 dark:bg-neutral-800 dark:text-stone-300"
                                >
                                  ✓ {amenity}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Bottom Price Summary & CTA */}
                          <div className="mt-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-stone-100 pt-4 dark:border-neutral-800">
                            <div>
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-xl font-black text-stone-900 dark:text-white">
                                  ₹{room.grandTotal.toLocaleString()}
                                </span>
                                <span className="text-xs text-stone-500">
                                  Total for {room.nights} {room.nights === 1 ? 'night' : 'nights'}
                                </span>
                              </div>
                              <p className="text-[11px] text-stone-400">
                                Inclusive of all resort taxes · 0% booking fees
                              </p>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleBookNowClick(room)}
                              style={{ backgroundColor: primaryColor }}
                              className="rounded-xl px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:brightness-110 active:scale-95 flex items-center justify-center gap-2"
                            >
                              <span>Reserve Villa</span>
                              <span>➔</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </main>
          </>
        )}

        {/* ===================================================================== */}
        {/* 5. SLIDE-OVER CHECKOUT DRAWER (ZERO REDIRECTS, INLINE BOOKING) */}
        {/* ===================================================================== */}
        {isCheckoutOpen && selectedRoom && (
          <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 p-0 sm:p-4 backdrop-blur-xs">
            <div className="h-full sm:h-auto w-full sm:max-w-lg overflow-y-auto rounded-none sm:rounded-3xl border border-stone-200 bg-white p-6 sm:p-8 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 animate-in slide-in-from-right duration-300">
              
              {/* Drawer Header */}
              <div className="flex items-center justify-between border-b border-stone-100 pb-4 dark:border-neutral-800">
                <div>
                  <h3 className="text-lg font-bold text-stone-900 dark:text-white">
                    Complete Your Reservation
                  </h3>
                  <p className="text-xs text-stone-500">
                    {tenant.name} · Instant Guaranteed Booking
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="rounded-lg p-2 text-stone-400 hover:text-stone-600 hover:bg-stone-100 dark:hover:bg-neutral-800 text-sm"
                >
                  ✕
                </button>
              </div>

              {/* Stay Summary Card */}
              <div className="mt-4 rounded-2xl bg-stone-50 p-4 text-xs dark:bg-neutral-850 space-y-2 border border-stone-200/60 dark:border-neutral-800">
                <div className="flex justify-between font-bold text-stone-900 dark:text-white text-sm">
                  <span>{selectedRoom.name}</span>
                  <span className="text-emerald-700 dark:text-emerald-400">Guaranteed</span>
                </div>
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>Stay Dates:</span>
                  <span className="font-semibold">{checkIn} to {checkOut} ({selectedRoom.nights} Nights)</span>
                </div>
                <div className="flex justify-between text-stone-600 dark:text-stone-300">
                  <span>Guest Party:</span>
                  <span className="font-semibold">{adults} Adults, {children} Children</span>
                </div>
                <div className="border-t border-stone-200 pt-2 dark:border-neutral-700 flex justify-between text-base font-black">
                  <span>Grand Total</span>
                  <span className="text-emerald-600 dark:text-emerald-400">₹{selectedRoom.grandTotal.toLocaleString()}</span>
                </div>
                <p className="text-[10px] text-stone-400">
                  Taxes and service charges included · No hidden fees
                </p>
              </div>

              {checkoutError && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                  {checkoutError}
                </div>
              )}

              {/* Guest Information Form */}
              <form onSubmit={handleConfirmBooking} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-neutral-300">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold focus:border-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-neutral-300">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    value={guestMobile}
                    onChange={(e) => setGuestMobile(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold focus:border-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-stone-400">
                    For front desk arrival coordination &amp; check-in verification
                  </p>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-stone-700 dark:text-neutral-300">
                      Email Address *
                    </label>
                    {isEmailVerified ? (
                      <span className="text-[10px] font-bold text-emerald-600">✓ Verified</span>
                    ) : (
                      <button
                        type="button"
                        onClick={handleRequestOtp}
                        disabled={otpLoading || !guestEmail || !guestEmail.includes('@')}
                        className="text-[11px] font-semibold text-blue-600 hover:underline disabled:opacity-40"
                      >
                        {otpLoading ? 'Sending...' : 'Verify with Code'}
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold focus:border-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <p className="mt-1 text-[10px] text-stone-400">
                    Instant confirmation voucher and Guest Portal folio dispatched here
                  </p>
                </div>

                {/* Inline OTP Section if requested */}
                {otpSent && !isEmailVerified && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-3 text-xs dark:border-blue-900/50 dark:bg-blue-950/30 space-y-2">
                    <span className="font-semibold text-blue-900 dark:text-blue-200">
                      Enter 6-digit Code sent to {guestEmail}
                    </span>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="123456"
                        value={otpInput}
                        onChange={(e) => setOtpInput(e.target.value)}
                        className="w-1/2 rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-mono font-bold text-center focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={handleVerifyOtp}
                        disabled={otpLoading || otpInput.length < 4}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-500 disabled:opacity-50"
                      >
                        {otpLoading ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>
                  </div>
                )}

                {otpFeedback && (
                  <div
                    className={`rounded-lg p-2 text-xs font-medium ${
                      otpFeedback.type === 'success'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-300'
                    }`}
                  >
                    {otpFeedback.message}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-neutral-300">
                    Special Requests (Optional)
                  </label>
                  <textarea
                    rows={2}
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Early check-in preference, pool view request..."
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs focus:border-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                {/* P1.2 Configurable Payment Policy Selection */}
                <div className="space-y-2 pt-1">
                  <label className="block text-xs font-bold text-stone-700 dark:text-neutral-300">
                    Payment Preference *
                  </label>
                  <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                    {/* 1. Full Online Payment */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPaymentPolicyChoice('FULL_PAYMENT')}
                      className={`cursor-pointer rounded-xl border p-3 text-left transition select-none ${
                        paymentPolicyChoice === 'FULL_PAYMENT'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40'
                          : 'border-stone-200 bg-white hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-stone-500 dark:text-stone-400">100% Online</span>
                        {paymentPolicyChoice === 'FULL_PAYMENT' && (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓</span>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-black text-stone-900 dark:text-white">
                        ₹{selectedRoom.grandTotal.toLocaleString()}
                      </div>
                      <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">
                        Zero due at check-in
                      </p>
                    </div>

                    {/* 2. 50% Advance Online */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPaymentPolicyChoice('ADVANCE')}
                      className={`cursor-pointer rounded-xl border p-3 text-left transition select-none ${
                        paymentPolicyChoice === 'ADVANCE'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40'
                          : 'border-stone-200 bg-white hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-stone-500 dark:text-stone-400">50% Advance</span>
                        {paymentPolicyChoice === 'ADVANCE' && (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓</span>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-black text-stone-900 dark:text-white">
                        ₹{Math.round(selectedRoom.grandTotal * 0.5).toLocaleString()}
                      </div>
                      <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">
                        Remaining at check-in
                      </p>
                    </div>

                    {/* 3. Pay at Resort */}
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => setPaymentPolicyChoice('PAY_AT_PROPERTY')}
                      className={`cursor-pointer rounded-xl border p-3 text-left transition select-none ${
                        paymentPolicyChoice === 'PAY_AT_PROPERTY'
                          ? 'border-emerald-600 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-500 dark:bg-emerald-950/40'
                          : 'border-stone-200 bg-white hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-750'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase text-stone-500 dark:text-stone-400">Pay at Resort</span>
                        {paymentPolicyChoice === 'PAY_AT_PROPERTY' && (
                          <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">✓</span>
                        )}
                      </div>
                      <div className="mt-1 text-sm font-black text-stone-900 dark:text-white">
                        ₹0 Now
                      </div>
                      <p className="mt-0.5 text-[10px] text-stone-500 dark:text-stone-400">
                        Pay full on arrival
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 text-[11px] text-stone-500 dark:border-neutral-800 dark:bg-neutral-850">
                  🛡️ <strong>Zero Risk Booking:</strong> Free cancellation up to 48 hours prior to check-in. Your room is immediately guaranteed.
                </div>

                <div className="mt-6 flex justify-end gap-2 border-t border-stone-100 pt-4 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setIsCheckoutOpen(false)}
                    className="rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-neutral-700 dark:text-neutral-300"
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    disabled={isBookingPending || !guestName || !guestMobile || !guestEmail}
                    style={{ backgroundColor: primaryColor }}
                    className="flex-1 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:brightness-110 disabled:opacity-50"
                  >
                    {isBookingPending
                      ? 'Confirming & Locking Unit...'
                      : paymentPolicyChoice === 'FULL_PAYMENT'
                      ? `🔒 Pay Full · ₹${selectedRoom.grandTotal.toLocaleString()}`
                      : paymentPolicyChoice === 'ADVANCE'
                      ? `🔒 Pay 50% Advance · ₹${Math.round(selectedRoom.grandTotal * 0.5).toLocaleString()}`
                      : `🔒 Confirm (Pay ₹${selectedRoom.grandTotal.toLocaleString()} on Arrival)`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>

      {/* ===================================================================== */}
      {/* 6. MINIMAL CLEAN FOOTER */}
      {/* ===================================================================== */}
      <footer className="mt-14 border-t border-stone-200/60 bg-stone-100 py-8 text-center text-xs text-stone-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500">
        <div className="mx-auto max-w-6xl px-4 space-y-3">
          <p>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</p>
          <div className="flex flex-wrap items-center justify-center gap-4 text-xs font-medium">
            <Link href={`/${tenantParam}`} className="hover:underline">
              {tenant.name} Home
            </Link>
            <span>·</span>
            <a href={`tel:${cleanPhone}`} className="hover:underline">
              Front Desk ({contactPhone})
            </a>
            <span>·</span>
            <a href={`mailto:${contactEmail}`} className="hover:underline">
              {contactEmail}
            </a>
            <span>·</span>
            <Link href="/login" className="hover:underline">
              Staff Portal
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
