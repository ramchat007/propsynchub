'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Booking, Room, Tenant } from '@/types';
import { updateBookingStatus } from '@/app/actions/booking';

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
  const [bookings, setBookings] = useState<Booking[]>(initialBookings);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isPending, startTransition] = useTransition();
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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

  const pendingCount = bookings.filter((b) => b.booking_status === 'pending').length;

  /**
   * Handle Accept or Decline of a booking
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
      } else {
        setNotification({ type: 'error', message: res.error || 'Failed to update booking status.' });
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
              Bookings &amp; Unified Folios
            </h1>
            {pendingCount > 0 && (
              <span className="rounded-full bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30 animate-pulse">
                {pendingCount} Awaiting Manual Acceptance
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Verify offline room availability before manually accepting reservations. Manage folios, dining, and final invoice checkout.
          </p>
        </div>

        {tenant && (
          <Link
            href={`/${tenant.subdomain || tenant.id}/book`}
            target="_blank"
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            <span>+ Create Public Booking</span>
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </Link>
        )}
      </div>

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
            placeholder="Search by guest name, mobile, or booking ID..."
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
            <option value="all">All Bookings</option>
            <option value="pending">⚠️ Pending Acceptance ({pendingCount})</option>
            <option value="confirmed">Confirmed</option>
            <option value="checked_in">Checked In</option>
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
                <th className="py-3 px-4">Assigned Room</th>
                <th className="py-3 px-4">Stay Dates</th>
                <th className="py-3 px-4 text-right">Room Tariff</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-5 text-center">Action &amp; Approval</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredBookings.length > 0 ? (
                filteredBookings.map((b) => {
                  const room = roomMap.get(b.room_id);
                  const isPendingStatus = b.booking_status === 'pending';
                  const isActionLoading = actionLoadingId?.startsWith(b.id);

                  return (
                    <tr
                      key={b.id}
                      className={`hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30 transition ${
                        isPendingStatus ? 'bg-amber-50/20 dark:bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="py-3.5 px-5 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                        #{b.id.slice(0, 8).toUpperCase()}
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-neutral-900 dark:text-neutral-100">
                          {b.guest_name}
                        </div>
                        <div className="font-mono text-[11px] text-neutral-500">
                          {b.guest_mobile_number}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {room?.name || 'Unit #' + b.room_id.slice(0, 5)}
                        </div>
                        <div className="text-[11px] text-neutral-400">
                          {room?.room_type || 'Accommodation'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-[11px]">
                        <div>In: {b.check_in_date}</div>
                        <div>Out: {b.check_out_date}</div>
                      </td>
                      <td className="py-3.5 px-4 text-right font-mono font-bold text-neutral-800 dark:text-neutral-200">
                        ₹{Number(b.total_amount_inr).toLocaleString()}
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span
                          className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                            b.booking_status === 'pending'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/40'
                              : b.booking_status === 'confirmed' || b.booking_status === 'checked_in'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : b.booking_status === 'checked_out'
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                          }`}
                        >
                          {b.booking_status === 'pending' ? 'Pending Approval' : b.booking_status.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3.5 px-5 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {/* MANUAL APPROVAL BUTTONS FOR PENDING BOOKINGS */}
                          {isPendingStatus ? (
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
                          ) : null}

                          <Link
                            href={`/bookings/${b.id}`}
                            className="inline-flex items-center gap-1 rounded-xl bg-neutral-100 px-3 py-1.5 text-xs font-bold text-neutral-800 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                          >
                            Folio &amp; Ledger →
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-xs text-neutral-400">
                    No reservations found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
