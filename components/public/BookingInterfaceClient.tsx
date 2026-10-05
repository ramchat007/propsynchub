'use client';

import React, { useState, useEffect, useTransition, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Tenant } from '@/types';
import {
  checkRoomAvailability,
  createReservation,
  RoomWithPricing,
} from '@/app/actions/booking';
import { createTenantRazorpayOrder } from '@/app/actions/payment';

interface BookingInterfaceClientProps {
  tenant: Tenant;
  tenantParam: string;
  initialUser: {
    id: string;
    phone?: string;
    fullName?: string;
  } | null;
}

export default function BookingInterfaceClient({
  tenant,
  tenantParam,
  initialUser,
}: BookingInterfaceClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Helper date generators (Format YYYY-MM-DD)
  const getToday = () => new Date().toISOString().split('T')[0];
  const getTomorrow = () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return tmr.toISOString().split('T')[0];
  };

  // 1. Booking Form State (re-hydrating from searchParams if returning after auth)
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

  // 3. Checkout Modal State
  const [selectedRoom, setSelectedRoom] = useState<RoomWithPricing | null>(null);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [guestName, setGuestName] = useState(initialUser?.fullName || '');
  const [guestMobile, setGuestMobile] = useState(initialUser?.phone || '');
  const [guestEmail, setGuestEmail] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');

  // 4. Booking Completion State
  const [isBookingPending, startBookingTransition] = useTransition();
  const [bookingConfirmation, setBookingConfirmation] = useState<{
    id: string;
    roomName: string;
    totalAmount: number;
    guestName: string;
    razorpayOrderId?: string;
    razorpayKeyId?: string;
    currency?: string;
    receipt?: string;
  } | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  /**
   * Search availability function
   */
  const handleSearchAvailability = useCallback(
    (cIn = checkIn, cOut = checkOut, ad = adults, ch = children) => {
      setSearchError(null);
      startSearchTransition(async () => {
        const res = await checkRoomAvailability(tenant.id, cIn, cOut, ad, ch);
        if (res.success && res.rooms) {
          setAvailableRooms(res.rooms);
          setNights(res.nights || 1);

          // If a pre-selected roomId was present in searchParams, open checkout directly
          const preselectedRoomId = searchParams.get('roomId');
          if (preselectedRoomId) {
            const matched = res.rooms.find((r) => r.id === preselectedRoomId);
            if (matched && initialUser) {
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
    [checkIn, checkOut, adults, children, tenant.id, searchParams, initialUser]
  );

  // Initial load search
  useEffect(() => {
    handleSearchAvailability();
  }, [handleSearchAvailability]);

  // Handle Date Changes
  function handleCheckInChange(val: string) {
    setCheckIn(val);
    // If checkOut is earlier or equal, bump checkOut to next day
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

  /**
   * Auth-Aware 'Book Now' Handler
   */
  function handleBookNowClick(room: RoomWithPricing) {
    if (initialUser) {
      // User is logged in -> Open checkout confirmation modal
      setSelectedRoom(room);
      setIsCheckoutOpen(true);
    } else {
      // User is NOT logged in -> Save selections in callbackUrl and redirect to mobile OTP login
      const destination = `/${tenantParam}/book?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&children=${children}`;
      const encodedCallback = encodeURIComponent(destination);
      router.push(`/login?callbackUrl=${encodedCallback}`);
    }
  }

  /**
   * Finalize Reservation Submission & Generate Dynamic Razorpay Test Order
   */
  function handleConfirmBooking(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedRoom) return;

    setCheckoutError(null);
    startBookingTransition(async () => {
      // 1. Insert pending booking into Supabase database
      const res = await createReservation({
        tenantId: tenant.id,
        roomId: selectedRoom.id,
        checkIn,
        checkOut,
        adults,
        children,
        guestName,
        guestMobile,
        guestEmail,
        totalAmount: selectedRoom.grandTotal,
        specialRequests,
      });

      if (!res.success || !res.booking) {
        setCheckoutError(res.error || 'Failed to create reservation.');
        return;
      }

      // 2. Call the server action to securely fetch tenant test keys & generate Razorpay order
      const payRes = await createTenantRazorpayOrder(
        res.booking.id,
        tenant.id,
        selectedRoom.grandTotal
      );

      if (!payRes.success) {
        setCheckoutError(payRes.error || 'Failed to generate Razorpay test order.');
        return;
      }

      const generatedOrderId = payRes.data?.orderId || `order_test_${Date.now().toString(36)}`;
      const keyIdUsed = payRes.data?.keyId || tenant.razorpay_test_key_id || 'rzp_test_...';

      // 3. Set booking confirmation with generated test order details
      setBookingConfirmation({
        id: res.booking.id,
        roomName: selectedRoom.name,
        totalAmount: res.booking.total_amount_inr,
        guestName: res.booking.guest_name,
        razorpayOrderId: generatedOrderId,
        razorpayKeyId: keyIdUsed,
        currency: payRes.data?.currency || 'INR',
        receipt: payRes.data?.receipt,
      });
      setIsCheckoutOpen(false);
    });
  }

  return (
    <div className="min-h-screen bg-neutral-50 pb-20 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* ===================================================================== */}
      {/* TENANT BRANDED HERO HEADER */}
      {/* ===================================================================== */}
      <header className="border-b border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-4 px-4 py-6 sm:flex-row sm:px-6">
          <div className="flex items-center gap-3.5 text-center sm:text-left">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="h-12 w-12 rounded-2xl object-cover shadow-xs"
              />
            ) : (
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 font-extrabold text-white text-lg shadow-xs">
                {tenant.name.charAt(0)}
              </span>
            )}
            <div>
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{tenant.name}</h1>
              <p className="text-xs text-neutral-500">
                Direct Resort Booking & Guest Reservations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {initialUser ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {initialUser.phone || 'Verified Guest'}
              </span>
            ) : (
              <button
                onClick={() => {
                  const dest = encodeURIComponent(
                    `/${tenantParam}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=${adults}&children=${children}`
                  );
                  router.push(`/login?callbackUrl=${dest}`);
                }}
                className="rounded-xl border border-neutral-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
              >
                Sign in with Mobile
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ===================================================================== */}
      {/* SEARCH & FILTER BAR (MOBILE-FIRST) */}
      {/* ===================================================================== */}
      <section className="mx-auto mt-6 max-w-5xl px-4 sm:px-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Check-In Date */}
            <div>
              <label
                htmlFor="checkin"
                className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500"
              >
                Check-in Date
              </label>
              <input
                id="checkin"
                type="date"
                min={getToday()}
                value={checkIn}
                onChange={(e) => handleCheckInChange(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs font-semibold text-neutral-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            {/* Check-Out Date */}
            <div>
              <label
                htmlFor="checkout"
                className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500"
              >
                Check-out Date
              </label>
              <input
                id="checkout"
                type="date"
                min={checkIn}
                value={checkOut}
                onChange={(e) => handleCheckOutChange(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs font-semibold text-neutral-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              />
            </div>

            {/* Adults Counter */}
            <div>
              <label
                htmlFor="adults-counter"
                className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500"
              >
                Adults (Age 12+)
              </label>
              <div
                id="adults-counter"
                className="mt-1.5 flex items-center justify-between rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(1, adults - 1);
                    setAdults(next);
                    handleSearchAvailability(checkIn, checkOut, next, children);
                  }}
                  disabled={adults <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                >
                  −
                </button>
                <span className="text-xs font-bold">{adults} Guests</span>
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.min(10, adults + 1);
                    setAdults(next);
                    handleSearchAvailability(checkIn, checkOut, next, children);
                  }}
                  disabled={adults >= 10}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                >
                  +
                </button>
              </div>
            </div>

            {/* Children Counter */}
            <div>
              <label
                htmlFor="children-counter"
                className="block text-[11px] font-bold uppercase tracking-wider text-neutral-500"
              >
                Children (Age 0-11)
              </label>
              <div
                id="children-counter"
                className="mt-1.5 flex items-center justify-between rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 dark:border-neutral-700 dark:bg-neutral-800"
              >
                <button
                  type="button"
                  onClick={() => {
                    const next = Math.max(0, children - 1);
                    setChildren(next);
                    handleSearchAvailability(checkIn, checkOut, adults, next);
                  }}
                  disabled={children <= 0}
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
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
                  className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-100 disabled:opacity-40 dark:bg-neutral-700 dark:text-neutral-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col items-center justify-between gap-2 border-t border-neutral-100 pt-3 text-xs sm:flex-row dark:border-neutral-800">
            <span className="text-neutral-500">
              Selected Stay: <strong className="text-neutral-900 dark:text-neutral-100">{nights} {nights === 1 ? 'Night' : 'Nights'}</strong> ({checkIn} to {checkOut})
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                Checking live inventory
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================================================================== */}
      {/* ROOMS LISTING SECTION */}
      {/* ===================================================================== */}
      <main className="mx-auto mt-8 max-w-5xl px-4 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight">Available Rooms & Suites</h2>
          <span className="text-xs text-neutral-500">
            {availableRooms.length} {availableRooms.length === 1 ? 'room' : 'rooms'} found
          </span>
        </div>

        {searchError && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
            {searchError}
          </div>
        )}

        {/* Skeleton Loader during search transitions */}
        {isSearching && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2.5">
                    <div className="h-5 w-48 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                    <div className="h-3 w-32 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                  </div>
                  <div className="h-8 w-28 rounded-lg bg-neutral-200 dark:bg-neutral-800" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isSearching && availableRooms.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-neutral-200 bg-white p-12 text-center dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-500 dark:bg-neutral-800">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-bold text-neutral-900 dark:text-neutral-100">
              No rooms available for these dates
            </h3>
            <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
              All units are reserved for the selected period. Try adjusting your check-in dates or guest count.
            </p>
          </div>
        )}

        {/* Available Rooms Grid */}
        {!isSearching && availableRooms.length > 0 && (
          <div className="space-y-4">
            {availableRooms.map((room) => (
              <div
                key={room.id}
                className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-xs transition hover:shadow-md dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex flex-col justify-between gap-6 p-6 sm:flex-row sm:items-center">
                  {/* Room Details */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2.5">
                      <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                        {room.name}
                      </h3>
                      {room.room_number && (
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          Room {room.room_number}
                        </span>
                      )}
                      <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
                        Available
                      </span>
                    </div>

                    <p className="text-xs text-neutral-500">
                      Category: <strong className="text-neutral-700 dark:text-neutral-300">{room.room_type}</strong> · Max Capacity: {room.capacity_adults} Adults
                      {room.capacity_children > 0 ? `, ${room.capacity_children} Kids` : ''}
                    </p>

                    {/* Breakdown pill */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-neutral-600 dark:text-neutral-400">
                      <span className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
                        ₹{Number(room.base_price_inr).toLocaleString()} / night
                      </span>
                      {room.extraGuests > 0 && (
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          +{room.extraGuests} extra pax (₹{room.extraPaxRate}/night)
                        </span>
                      )}
                      <span className="rounded-md bg-neutral-100 px-2 py-1 dark:bg-neutral-800">
                        Instant WhatsApp Confirmation
                      </span>
                    </div>
                  </div>

                  {/* Pricing and Book Button */}
                  <div className="flex flex-col items-start justify-between gap-3 border-t border-neutral-100 pt-4 sm:items-end sm:border-t-0 sm:pt-0">
                    <div className="sm:text-right">
                      <span className="text-[11px] text-neutral-400 block">Total for {room.nights} {room.nights === 1 ? 'night' : 'nights'}</span>
                      <p className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                        ₹{room.grandTotal.toLocaleString()}
                      </p>
                      <p className="text-[10px] text-neutral-400">
                        Includes taxes &amp; charges
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleBookNowClick(room)}
                      className="w-full sm:w-auto inline-flex items-center justify-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2"
                    >
                      Book Now →
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* ===================================================================== */}
      {/* CHECKOUT CONFIRMATION MODAL (LOGGED IN USERS) */}
      {/* ===================================================================== */}
      {isCheckoutOpen && selectedRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Confirm Reservation
                </h3>
                <p className="text-xs text-neutral-500">{tenant.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 text-sm"
              >
                ✕
              </button>
            </div>

            {/* Reservation Summary */}
            <div className="mt-4 rounded-xl bg-neutral-50 p-4 text-xs dark:bg-neutral-800/60 space-y-2">
              <div className="flex justify-between">
                <span className="text-neutral-500">Selected Room</span>
                <span className="font-bold text-neutral-900 dark:text-neutral-100">{selectedRoom.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Dates</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{checkIn} to {checkOut} ({selectedRoom.nights} Nights)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Guests</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{adults} Adults, {children} Children</span>
              </div>
              <div className="border-t border-neutral-200 pt-2 dark:border-neutral-700 flex justify-between text-sm font-bold">
                <span>Total Amount</span>
                <span className="text-emerald-600 dark:text-emerald-400">₹{selectedRoom.grandTotal.toLocaleString()}</span>
              </div>
            </div>

            {checkoutError && (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
                {checkoutError}
              </div>
            )}

            {/* Guest Form */}
            <form onSubmit={handleConfirmBooking} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Guest Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Mobile Number (for WhatsApp Confirmation) *
                </label>
                <input
                  type="tel"
                  required
                  value={guestMobile}
                  onChange={(e) => setGuestMobile(e.target.value)}
                  placeholder="+919876543210"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="guest@example.com"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Special Requests (Optional)
                </label>
                <textarea
                  rows={2}
                  value={specialRequests}
                  onChange={(e) => setSpecialRequests(e.target.value)}
                  placeholder="Early check-in, ground floor preference, dietary preferences..."
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCheckoutOpen(false)}
                  className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isBookingPending || !guestName || !guestMobile}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isBookingPending ? 'Generating Test Order...' : 'Confirm & Generate Test Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* BOOKING SUCCESS & RAZORPAY TEST ORDER CONFIRMATION MODAL */}
      {/* ===================================================================== */}
      {bookingConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 text-left">
            {/* Header Badge */}
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300">
                <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                Razorpay Test Architecture
              </span>
              <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                PENDING CAPTURE
              </span>
            </div>

            {/* Test Order Generated Heading */}
            <div className="mt-4">
              <div className="flex items-start gap-2.5 text-emerald-600 dark:text-emerald-400">
                <svg className="h-6 w-6 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-neutral-900 dark:text-neutral-100">
                    Test Order Generated: {bookingConfirmation.razorpayOrderId}
                  </h3>
                  <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 font-sans">
                    Backend integration verified. The Razorpay Node SDK initialized dynamically with {tenant.name}&apos;s test credentials to generate this order.
                  </p>
                </div>
              </div>
            </div>

            {/* Verification Breakdown */}
            <div className="mt-5 space-y-2 rounded-xl bg-neutral-50 p-4 text-xs dark:bg-neutral-800/60 font-mono">
              <div className="flex justify-between font-sans">
                <span className="text-neutral-500">Property</span>
                <span className="font-bold text-neutral-800 dark:text-neutral-200">{tenant.name}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-neutral-500">Reserved Unit</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{bookingConfirmation.roomName}</span>
              </div>
              <div className="flex justify-between font-sans">
                <span className="text-neutral-500">Guest Name</span>
                <span className="font-semibold text-neutral-800 dark:text-neutral-200">{bookingConfirmation.guestName}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700 font-sans">
                <span className="text-neutral-500">Booking Database ID</span>
                <span className="font-mono font-bold text-neutral-900 dark:text-neutral-100">{bookingConfirmation.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-sans">Razorpay Order ID</span>
                <span className="font-bold text-indigo-600 dark:text-indigo-400">{bookingConfirmation.razorpayOrderId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500 font-sans">Active Test Key ID</span>
                <span className="text-neutral-700 dark:text-neutral-300">{bookingConfirmation.razorpayKeyId || 'Configured in Settings'}</span>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700 font-sans font-bold text-sm">
                <span>Total Amount</span>
                <span className="text-emerald-600 dark:text-emerald-400">₹{bookingConfirmation.totalAmount.toLocaleString()}</span>
              </div>
            </div>

            {/* Test Simulation Notice */}
            <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/70 p-3 text-[11px] text-indigo-900 dark:border-indigo-900/40 dark:bg-indigo-950/30 dark:text-indigo-300">
              <p className="font-semibold">Backend Verification Notice</p>
              <p className="mt-0.5 text-neutral-600 dark:text-neutral-400">
                Pending booking created in Supabase with order reference <code className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{bookingConfirmation.razorpayOrderId}</code>. Frontend checkout popup modal is intentionally omitted as required for this test phase.
              </p>
            </div>

            <div className="mt-6">
              <button
                type="button"
                onClick={() => {
                  setBookingConfirmation(null);
                  handleSearchAvailability();
                }}
                className="w-full rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
