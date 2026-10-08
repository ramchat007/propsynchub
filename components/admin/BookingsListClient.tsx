'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Booking, Room, Tenant } from '@/types';
import {
  updateBookingStatus,
  reassignBookingRoom,
  rescheduleBookingDates,
  cancelBooking,
} from '@/app/actions/booking';

interface BookingsListClientProps {
  bookings: Booking[];
  rooms: Room[];
  tenant: Tenant | null;
}

export default function BookingsListClient({
  bookings: initialBookings,
  rooms,
  tenant,
}: BookingsListClientProps) {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPending, startTransition] = useTransition();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reassignment Modal state
  const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
  const [reassigningBooking, setReassigningBooking] = useState<Booking | null>(null);
  const [selectedNewRoomId, setSelectedNewRoomId] = useState<string>('');

  // Reschedule Modal state
  const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
  const [reschedulingBooking, setReschedulingBooking] = useState<Booking | null>(null);
  const [newCheckIn, setNewCheckIn] = useState('');
  const [newCheckOut, setNewCheckOut] = useState('');

  // Cancel Modal state
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellingBooking, setCancellingBooking] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('Guest requested cancellation');

  const roomMap = new Map<string, Room>();
  rooms.forEach((r) => roomMap.set(r.id, r));

  const filteredBookings = bookings.filter((b) => {
    const matchesSearch =
      b.guest_name.toLowerCase().includes(search.toLowerCase()) ||
      b.guest_mobile_number.includes(search) ||
      b.id.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'all' || b.booking_status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Executive Metrics
  const totalBookingsCount = bookings.length;
  const inHouseCount = bookings.filter((b) => b.booking_status === 'checked_in').length;
  const confirmedCount = bookings.filter((b) => b.booking_status === 'confirmed').length;
  const pendingCount = bookings.filter((b) => b.booking_status === 'pending').length;
  const totalOnBooksRevenue = bookings
    .filter((b) => b.booking_status !== 'cancelled')
    .reduce((sum, b) => sum + Number(b.total_amount_inr || 0), 0);

  /**
   * Handle Status Change (Accept, Decline, Check In, Check Out)
   */
  function handleStatusChange(
    bookingId: string,
    newStatus: 'confirmed' | 'cancelled' | 'checked_in' | 'checked_out'
  ) {
    if (!tenant) return;
    setActionLoadingId(`${bookingId}-${newStatus}`);
    setNotification(null);

    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, tenant.id, newStatus);
      setActionLoadingId(null);

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Booking status updated.' });
        setBookings((prev) =>
          prev.map((b) => (b.id === bookingId ? { ...b, booking_status: newStatus } : b))
        );
        router.refresh();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to update booking status.' });
      }
    });
  }

  /**
   * Open Room Reassignment Dialog
   */
  function handleOpenReassign(b: Booking) {
    setReassigningBooking(b);
    setSelectedNewRoomId(b.room_id || (rooms.length > 0 ? rooms[0].id : ''));
    setIsReassignModalOpen(true);
  }

  /**
   * Submit Room Reassignment
   */
  function handleSaveReassignment(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !reassigningBooking || !selectedNewRoomId) return;

    setActionLoadingId(`reassign-${reassigningBooking.id}`);
    startTransition(async () => {
      const res = await reassignBookingRoom(reassigningBooking.id, tenant.id, selectedNewRoomId);
      setActionLoadingId(null);

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Room reassigned successfully.' });
        setBookings((prev) =>
          prev.map((b) =>
            b.id === reassigningBooking.id ? { ...b, room_id: selectedNewRoomId } : b
          )
        );
        setIsReassignModalOpen(false);
        setReassigningBooking(null);
        router.refresh();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to reassign room.' });
      }
    });
  }

  /**
   * Open Reschedule Dialog
   */
  function handleOpenReschedule(b: Booking) {
    setReschedulingBooking(b);
    setNewCheckIn(b.check_in_date);
    setNewCheckOut(b.check_out_date);
    setIsRescheduleModalOpen(true);
  }

  /**
   * Submit Reschedule
   */
  function handleSaveReschedule(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !reschedulingBooking || !newCheckIn || !newCheckOut) return;

    setActionLoadingId(`reschedule-${reschedulingBooking.id}`);
    startTransition(async () => {
      const res = await rescheduleBookingDates({
        bookingId: reschedulingBooking.id,
        tenantId: tenant.id,
        newCheckIn,
        newCheckOut,
      });
      setActionLoadingId(null);

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Stay dates rescheduled successfully.' });
        setBookings((prev) =>
          prev.map((b) =>
            b.id === reschedulingBooking.id
              ? {
                  ...b,
                  check_in_date: newCheckIn,
                  check_out_date: newCheckOut,
                }
              : b
          )
        );
        setIsRescheduleModalOpen(false);
        setReschedulingBooking(null);
        router.refresh();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to reschedule stay dates.' });
      }
    });
  }

  /**
   * Open Cancel Dialog
   */
  function handleOpenCancel(b: Booking) {
    setCancellingBooking(b);
    setCancelReason('Guest requested cancellation');
    setIsCancelModalOpen(true);
  }

  /**
   * Submit Cancel
   */
  function handleSaveCancel(e: React.FormEvent) {
    e.preventDefault();
    if (!tenant || !cancellingBooking) return;

    setActionLoadingId(`cancel-${cancellingBooking.id}`);
    startTransition(async () => {
      const res = await cancelBooking({
        bookingId: cancellingBooking.id,
        tenantId: tenant.id,
        reason: cancelReason,
      });
      setActionLoadingId(null);

      if (res.success) {
        setNotification({ type: 'success', message: res.message || 'Reservation cancelled and inventory released.' });
        setBookings((prev) =>
          prev.map((b) =>
            b.id === cancellingBooking.id
              ? { ...b, booking_status: 'cancelled' }
              : b
          )
        );
        setIsCancelModalOpen(false);
        setCancellingBooking(null);
        router.refresh();
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to cancel reservation.' });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200/80 pb-5 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
              Bookings &amp; Unified Folios
            </h1>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-700 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                {pendingCount} Awaiting Acceptance
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Real-time reservations ledger synced directly with the Room Rack. Verify room availability, check in guests, manage folios, and reassign units.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
          >
            <span>🏨 Room Rack (Live Board)</span>
          </Link>

          {tenant && (
            <Link
              href={`/${tenant.subdomain || tenant.id}/book`}
              target="_blank"
              className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-3.5 py-2 text-xs font-bold text-white shadow-xs hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <span>+ Create Booking</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </Link>
          )}
        </div>
      </div>

      {/* EXECUTIVE STATS PULSE STRIP */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-4">
        {/* Total Reservations */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500">
            Total Reservations
          </span>
          <p className="mt-1 text-2xl font-black text-stone-900 dark:text-white">
            {totalBookingsCount}
          </p>
          <p className="mt-0.5 text-xs text-stone-400">
            ₹{totalOnBooksRevenue.toLocaleString()} on books
          </p>
        </div>

        {/* Currently In-House */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            In-House Active
          </span>
          <p className="mt-1 text-2xl font-black text-rose-900 dark:text-rose-200">
            {inHouseCount}
          </p>
          <p className="mt-0.5 text-xs text-rose-700/80 dark:text-rose-400/80">
            Occupying units right now
          </p>
        </div>

        {/* Awaiting Acceptance */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Pending Acceptance
          </span>
          <p className="mt-1 text-2xl font-black text-amber-900 dark:text-amber-200">
            {pendingCount}
          </p>
          <p className="mt-0.5 text-xs text-amber-700/80 dark:text-amber-400/80">
            Awaiting offline room check
          </p>
        </div>

        {/* Confirmed Upcoming */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Confirmed Upcoming
          </span>
          <p className="mt-1 text-2xl font-black text-emerald-900 dark:text-emerald-200">
            {confirmedCount}
          </p>
          <p className="mt-0.5 text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Reserved future arrivals
          </p>
        </div>
      </section>

      {/* NOTIFICATION FEEDBACK */}
      {notification && (
        <div
          className={`flex items-center justify-between rounded-2xl border p-3.5 text-xs ${
            notification.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
        >
          <span>{notification.message}</span>
          <button onClick={() => setNotification(null)} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
      )}

      {/* FILTER BAR */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by guest name, mobile number, or booking ref ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
          />
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[11px] font-bold text-neutral-400 uppercase">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
          >
            <option value="all">All Bookings ({bookings.length})</option>
            <option value="pending">⚠️ Pending Approval ({pendingCount})</option>
            <option value="confirmed">Confirmed ({confirmedCount})</option>
            <option value="checked_in">Checked In ({inHouseCount})</option>
            <option value="checked_out">Checked Out</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* BOOKINGS TABLE */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-100 bg-neutral-50/70 text-[11px] font-semibold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40">
              <tr>
                <th className="py-3 px-5">Booking Ref</th>
                <th className="py-3 px-4">Guest Details</th>
                <th className="py-3 px-4">Stay Pax</th>
                <th className="py-3 px-4">Assigned Unit &amp; Room Rack Sync</th>
                <th className="py-3 px-4">Stay Dates</th>
                <th className="py-3 px-4 text-right">Folio Total</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-5 text-center">Operations &amp; Folio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredBookings.length > 0 ? (
                filteredBookings.map((b) => {
                  const room = b.room_id ? roomMap.get(b.room_id) : undefined;
                  const isPendingStatus = b.booking_status === 'pending';
                  const isConfirmed = b.booking_status === 'confirmed';
                  const isCheckedIn = b.booking_status === 'checked_in';
                  const isActionLoading = actionLoadingId?.startsWith(b.id);

                  // Check if this room currently has someone checked in
                  const isRoomCurrentlyInHouse = room && bookings.some(
                    (other) => other.room_id === room.id && other.booking_status === 'checked_in'
                  );
                  const isRoomInMaintenance = room?.status === 'maintenance';

                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition ${
                        isPendingStatus ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      {/* 1. REF */}
                      <td className="py-3.5 px-5 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                        #{b.id.slice(0, 8).toUpperCase()}
                      </td>

                      {/* 2. GUEST */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-neutral-900 dark:text-neutral-100">
                          {b.guest_name}
                        </div>
                        <a
                          href={`https://wa.me/${b.guest_mobile_number.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11px] text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          💬 {b.guest_mobile_number}
                        </a>
                      </td>

                      {/* 3. PAX */}
                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded-lg bg-neutral-100 px-2 py-1 font-bold text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200">
                          👥 {b.num_adults}A, {b.num_children}C ({b.num_adults + b.num_children} Pax)
                        </span>
                      </td>

                      {/* 4. ASSIGNED ROOM & LIVE STATUS */}
                      <td className="py-3.5 px-4">
                        {!b.room_id ? (
                          <div className="space-y-1">
                            <span className="inline-block rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300">
                              ⚠️ Unassigned Unit
                            </span>
                            <div>
                              <button
                                type="button"
                                onClick={() => handleOpenReassign(b)}
                                className="rounded-md bg-emerald-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-emerald-500 shadow-2xs"
                              >
                                + Assign Unit
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-neutral-900 dark:text-neutral-100">
                                {room?.name || 'Unit #' + b.room_id.slice(0, 5)}
                              </span>
                              {isRoomInMaintenance ? (
                                <span className="rounded-sm bg-stone-100 px-1.5 py-0.5 text-[9px] font-bold text-stone-600 border border-stone-300">
                                  🔧 Maint
                                </span>
                              ) : isRoomCurrentlyInHouse ? (
                                <span className="rounded-sm bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-200">
                                  🔴 In-House
                                </span>
                              ) : room?.status === 'dirty' ? (
                                <span className="rounded-sm bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700 border border-rose-300">
                                  🧹 Dirty
                                </span>
                              ) : room?.status === 'cleaning' ? (
                                <span className="rounded-sm bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 border border-amber-300">
                                  🧼 Cleaning
                                </span>
                              ) : room?.status === 'inspected' ? (
                                <span className="rounded-sm bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 border border-blue-300">
                                  🔍 Inspected
                                </span>
                              ) : (
                                <span className="rounded-sm bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 border border-emerald-200">
                                  🟢 Ready
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[11px] text-neutral-400">
                                {room?.room_type || 'Accommodation'}
                              </span>
                              {b.booking_status !== 'checked_out' && b.booking_status !== 'cancelled' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenReassign(b)}
                                  className="text-[10px] font-bold text-blue-600 hover:underline dark:text-blue-400"
                                >
                                  ⇄ Change Unit
                                </button>
                              )}
                            </div>
                          </>
                        )}
                      </td>

                      {/* 5. DATES */}
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div>In: {b.check_in_date}</div>
                        <div>Out: {b.check_out_date}</div>
                      </td>

                      {/* 6. AMOUNT & BALANCE */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-neutral-800 dark:text-neutral-200">
                        ₹{Number(b.total_amount_inr).toLocaleString()}
                        {b.balance_amount_inr !== undefined && Number(b.balance_amount_inr) > 0 ? (
                          <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            Due: ₹{Number(b.balance_amount_inr).toLocaleString()}
                          </div>
                        ) : b.payment_status === 'paid' ? (
                          <div className="text-[10px] font-bold text-emerald-600">
                            ✓ Fully Paid
                          </div>
                        ) : (
                          <div className="text-[10px] uppercase font-normal text-stone-400">
                            {b.payment_status}
                          </div>
                        )}
                      </td>

                      {/* 7. STATUS */}
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            b.booking_status === 'pending'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/40'
                              : b.booking_status === 'confirmed'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : b.booking_status === 'checked_in'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                              : b.booking_status === 'checked_out'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}
                        >
                          {b.booking_status === 'pending' ? 'Pending Approval' : b.booking_status.replace('_', ' ')}
                        </span>
                      </td>

                      {/* 8. OPERATIONS */}
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          {/* PENDING ACTIONS */}
                          {isPendingStatus && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b.id, 'confirmed')}
                                disabled={isPending || isActionLoading}
                                title="Verify offline room availability & accept"
                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500 disabled:opacity-50"
                              >
                                <span>✓ Accept</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b.id, 'cancelled')}
                                disabled={isPending || isActionLoading}
                                title="Room unavailable offline - decline reservation"
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                              >
                                <span>✕ Decline</span>
                              </button>
                            </>
                          )}

                          {/* CONFIRMED ACTIONS: Check In, Reschedule, Cancel */}
                          {isConfirmed && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b.id, 'checked_in')}
                                disabled={isPending || isActionLoading}
                                title="Check in guest & mark unit occupied on Room Rack"
                                className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500 disabled:opacity-50"
                              >
                                <span>🔑 Check In</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReschedule(b)}
                                disabled={isPending || isActionLoading}
                                title="Change reservation dates with live collision check"
                                className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-white px-2 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                              >
                                <span>📅 Reschedule</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCancel(b)}
                                disabled={isPending || isActionLoading}
                                title="Cancel reservation & release room inventory"
                                className="inline-flex items-center gap-1 rounded-xl border border-rose-300 bg-rose-50 px-2 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300"
                              >
                                <span>✕ Cancel</span>
                              </button>
                            </>
                          )}

                          {/* CHECKED IN ACTIONS: Check Out & Extend */}
                          {isCheckedIn && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b.id, 'checked_out')}
                                disabled={isPending || isActionLoading}
                                title="Check out guest & mark unit clean on Room Rack"
                                className="inline-flex items-center gap-1 rounded-xl bg-stone-900 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-stone-800 disabled:opacity-50 dark:bg-white dark:text-stone-900"
                              >
                                <span>🛎️ Check Out</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReschedule(b)}
                                disabled={isPending || isActionLoading}
                                title="Extend stay check-out date"
                                className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-white px-2 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                              >
                                <span>📅 Extend</span>
                              </button>
                            </>
                          )}

                          {/* DIRECT LINK TO FOLIO & INVOICE */}
                          <Link
                            href={`/bookings/${b.id}`}
                            className="inline-flex items-center gap-1 rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                          >
                            Folio →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-xs text-neutral-400">
                    No reservations found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ROOM REASSIGNMENT MODAL */}
      {isReassignModalOpen && reassigningBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  Reassign Physical Unit
                </h3>
                <p className="text-xs text-stone-500">
                  Guest: {reassigningBooking.guest_name} (#{reassigningBooking.id.slice(0, 8).toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReassignModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReassignment} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-700 dark:text-stone-300">
                  Select New Physical Room Unit
                </label>
                <select
                  value={selectedNewRoomId}
                  onChange={(e) => setSelectedNewRoomId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                >
                  {rooms.map((r) => {
                    const isCurrent = r.id === reassigningBooking.room_id;
                    return (
                      <option key={r.id} value={r.id}>
                        {r.name} ({r.room_type}) · Base ₹{Number(r.base_price_inr).toLocaleString()}/nt {isCurrent ? '— Current' : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="mt-1.5 text-[11px] text-stone-500">
                  Stay Dates: {reassigningBooking.check_in_date} → {reassigningBooking.check_out_date}
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsReassignModalOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || selectedNewRoomId === reassigningBooking.room_id}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending ? 'Updating...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESCHEDULE MODAL */}
      {isRescheduleModalOpen && reschedulingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  📅 Reschedule Reservation Stay
                </h3>
                <p className="text-xs text-stone-500">
                  Guest: {reschedulingBooking.guest_name} (#{reschedulingBooking.id.slice(0, 8).toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsRescheduleModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveReschedule} className="mt-4 space-y-4">
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

              {/* Dynamic Preview */}
              {newCheckIn && newCheckOut && new Date(newCheckOut) > new Date(newCheckIn) && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 text-xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
                  <div className="flex justify-between font-semibold text-emerald-900 dark:text-emerald-200">
                    <span>Stay Duration:</span>
                    <span>
                      {Math.max(1, Math.round((new Date(newCheckOut).getTime() - new Date(newCheckIn).getTime()) / (1000 * 60 * 60 * 24)))} Nights
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-300">
                    ✓ Collision guard checks {(reschedulingBooking.room_id ? roomMap.get(reschedulingBooking.room_id)?.name : undefined) || 'unit'} availability in real time before confirming.
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsRescheduleModalOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !newCheckIn || !newCheckOut || new Date(newCheckOut) <= new Date(newCheckIn)}
                  className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
                >
                  {isPending ? 'Validating & Rescheduling...' : 'Confirm Reschedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CANCEL MODAL */}
      {isCancelModalOpen && cancellingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/40 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-rose-700 dark:text-rose-400">
                  ✕ Cancel Reservation
                </h3>
                <p className="text-xs text-stone-500">
                  Guest: {cancellingBooking.guest_name} (#{cancellingBooking.id.slice(0, 8).toUpperCase()})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCancel} className="mt-4 space-y-4">
              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-xs text-rose-800 dark:border-rose-900/30 dark:bg-rose-950/20 dark:text-rose-300">
                <p className="font-semibold">⚠️ Inventory Release Notice:</p>
                <p className="mt-0.5 text-[11px]">
                  Cancelling will immediately release {(cancellingBooking.room_id ? roomMap.get(cancellingBooking.room_id)?.name : undefined) || 'the unit'} back to available inventory on the Room Rack and open availability for online bookings.
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
                  onClick={() => setIsCancelModalOpen(false)}
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
    </div>
  );
}
