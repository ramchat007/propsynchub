'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Tenant, Room, RoomCategory, Booking } from '@/types';
import { updateRoomStatus } from '@/app/actions/inventory';

interface OccupancyCalendarClientProps {
  tenant: Tenant | null;
  rooms: Room[];
  categories: RoomCategory[];
  bookings: Booking[];
}

export default function OccupancyCalendarClient({
  tenant,
  rooms,
  categories,
  bookings,
}: OccupancyCalendarClientProps) {
  // Navigation: Base start date for the 14-day grid
  const [startDateStr, setStartDateStr] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2); // Show 2 days in past for immediate check-out context
    return d.toISOString().split('T')[0];
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<string | null>(null);

  // Generate 14 continuous dates from startDateStr
  const numDays = 14;
  const dates: Date[] = [];
  const baseDate = new Date(startDateStr);

  for (let i = 0; i < numDays; i++) {
    const nextD = new Date(baseDate);
    nextD.setDate(baseDate.getDate() + i);
    dates.push(nextD);
  }

  const todayStr = new Date().toISOString().split('T')[0];

  // Navigation helpers
  function shiftDays(days: number) {
    const d = new Date(startDateStr);
    d.setDate(d.getDate() + days);
    setStartDateStr(d.toISOString().split('T')[0]);
  }

  function resetToToday() {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    setStartDateStr(d.toISOString().split('T')[0]);
  }

  // Filtered rooms
  const filteredRooms = rooms.filter((r) => {
    if (selectedCategory === 'all') return true;
    return r.category_id === selectedCategory || (r.room_type || '').toLowerCase() === selectedCategory.toLowerCase();
  });

  // Calculate quick metrics for today
  const activeBookingsToday = bookings.filter((b) => {
    if (b.booking_status === 'cancelled') return false;
    return b.check_in_date <= todayStr && b.check_out_date > todayStr;
  });

  const checkInsToday = bookings.filter(
    (b) => b.check_in_date === todayStr && b.booking_status !== 'cancelled'
  );

  const checkOutsToday = bookings.filter(
    (b) => b.check_out_date === todayStr && b.booking_status !== 'cancelled'
  );

  const maintenanceRooms = rooms.filter((r) => r.status === 'maintenance' || r.status === 'blocked');

  // Helper to find booking covering a room on a specific day
  function getBookingForRoomDate(roomId: string, dateStr: string): Booking | undefined {
    return bookings.find((b) => {
      if (b.room_id !== roomId) return false;
      if (b.booking_status === 'cancelled') return false;
      return b.check_in_date <= dateStr && b.check_out_date > dateStr;
    });
  }

  // Quick room maintenance toggle
  async function handleToggleMaintenance(room: Room) {
    if (!tenant) return;
    const nextStatus = room.status === 'available' ? 'maintenance' : 'available';
    setIsUpdatingStatus(room.id);
    try {
      await updateRoomStatus(room.id, tenant.id, nextStatus);
    } finally {
      setIsUpdatingStatus(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* 1. Header & Control Bar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200/80 pb-5 dark:border-neutral-800">
        <div>
          <h1 className="text-xl font-black tracking-tight text-stone-900 dark:text-white sm:text-2xl">
            Occupancy Calendar
          </h1>
          <p className="mt-1 text-xs text-stone-500 dark:text-neutral-400">
            Real-time room occupancy grid, reservations, active holds &amp; operational maintenance
          </p>
        </div>

        {/* Date Navigator & Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 shadow-2xs focus:border-emerald-600 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
          >
            <option value="all">All Categories ({categories.length})</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          {/* Stepper Buttons */}
          <div className="flex items-center rounded-xl border border-stone-300 bg-white shadow-2xs dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => shiftDays(-7)}
              title="7 Days Earlier"
              className="px-2.5 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-700 rounded-l-xl"
            >
              ← 7d
            </button>
            <button
              type="button"
              onClick={resetToToday}
              className="border-x border-stone-200 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-200 dark:hover:bg-neutral-700"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => shiftDays(7)}
              title="7 Days Later"
              className="px-2.5 py-1.5 text-xs font-bold text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-700 rounded-r-xl"
            >
              +7d →
            </button>
          </div>
        </div>
      </div>

      {/* 2. Today's Front Desk Operations KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total Units</p>
          <p className="mt-1 text-2xl font-black text-stone-900 dark:text-white">{rooms.length}</p>
          <p className="mt-0.5 text-[11px] text-stone-500">{categories.length} configured categories</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Occupied Today
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-800 dark:text-emerald-300">
            {activeBookingsToday.length}
          </p>
          <p className="mt-0.5 text-[11px] text-emerald-600/80">
            {Math.round((activeBookingsToday.length / Math.max(1, rooms.length)) * 100)}% occupancy rate
          </p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            Today Check-Ins / Outs
          </p>
          <p className="mt-1 text-2xl font-black text-blue-900 dark:text-blue-200">
            {checkInsToday.length} / {checkOutsToday.length}
          </p>
          <p className="mt-0.5 text-[11px] text-blue-600/80">Scheduled guest transitions</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Under Maintenance
          </p>
          <p className="mt-1 text-2xl font-black text-amber-800 dark:text-amber-300">
            {maintenanceRooms.length}
          </p>
          <p className="mt-0.5 text-[11px] text-amber-600/80">Blocked physical units</p>
        </div>
      </div>

      {/* 3. Operational Timeline Calendar Grid */}
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50/80 dark:border-neutral-800 dark:bg-neutral-850">
                {/* Room Unit Fixed Header Column */}
                <th className="sticky left-0 z-20 min-w-[190px] border-r border-stone-200 bg-stone-50 px-4 py-3 text-xs font-bold text-stone-700 dark:border-neutral-800 dark:bg-neutral-850 dark:text-stone-200">
                  Room Unit
                </th>

                {/* 14 Date Columns */}
                {dates.map((d) => {
                  const dStr = d.toISOString().split('T')[0];
                  const isToday = dStr === todayStr;
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;

                  return (
                    <th
                      key={dStr}
                      className={`min-w-[85px] border-r border-stone-100 px-2 py-2 text-center text-xs dark:border-neutral-800 ${
                        isToday
                          ? 'bg-emerald-50/90 text-emerald-800 font-black dark:bg-emerald-950/60 dark:text-emerald-300'
                          : isWeekend
                          ? 'bg-stone-100/60 text-stone-700 dark:bg-neutral-800/40 dark:text-stone-300'
                          : 'text-stone-600 dark:text-stone-400'
                      }`}
                    >
                      <div className="text-[10px] uppercase font-semibold">
                        {d.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="text-xs font-bold">
                        {d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}
                      </div>
                      {isToday && (
                        <span className="inline-block rounded-full bg-emerald-600 px-1.5 py-0.2 text-[8px] font-bold text-white uppercase">
                          Today
                        </span>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody className="divide-y divide-stone-100 text-xs dark:divide-neutral-800">
              {filteredRooms.map((room) => {
                const isRoomMaintenance = room.status === 'maintenance' || room.status === 'blocked';

                return (
                  <tr key={room.id} className="hover:bg-stone-50/40 dark:hover:bg-neutral-850/40">
                    {/* Fixed Room Unit Info */}
                    <td className="sticky left-0 z-10 border-r border-stone-200 bg-white px-4 py-3 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-bold text-stone-900 dark:text-white">
                            {room.name}
                          </p>
                          <p className="text-[10px] text-stone-500">
                            {room.room_type} · #{room.room_number || 'Unit'}
                          </p>
                        </div>

                        {/* Status chip toggle */}
                        <button
                          type="button"
                          onClick={() => handleToggleMaintenance(room)}
                          disabled={isUpdatingStatus === room.id}
                          title="Click to toggle Maintenance"
                          className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold transition uppercase ${
                            isRoomMaintenance
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          }`}
                        >
                          {isUpdatingStatus === room.id ? '...' : room.status}
                        </button>
                      </div>
                    </td>

                    {/* 14 Date Timeline Cells */}
                    {dates.map((d) => {
                      const dStr = d.toISOString().split('T')[0];
                      const isToday = dStr === todayStr;
                      const booking = getBookingForRoomDate(room.id, dStr);

                      if (isRoomMaintenance) {
                        return (
                          <td
                            key={dStr}
                            className="border-r border-stone-100 bg-amber-50/40 p-1 text-center dark:border-neutral-800 dark:bg-amber-950/20"
                          >
                            <span className="text-[10px] font-semibold text-amber-700/80 dark:text-amber-400/80">
                              Maintenance
                            </span>
                          </td>
                        );
                      }

                      if (booking) {
                        const isCheckInDay = booking.check_in_date === dStr;
                        const isHold = booking.booking_status === 'pending';
                        const isCheckedIn = booking.booking_status === 'checked_in';

                        return (
                          <td
                            key={dStr}
                            className={`border-r border-stone-100 p-1 text-center dark:border-neutral-800 ${
                              isToday ? 'bg-emerald-50/30' : ''
                            }`}
                          >
                            <div
                              onClick={() => setSelectedBooking(booking)}
                              className={`cursor-pointer rounded-lg p-1.5 text-left text-[10px] font-bold transition hover:shadow-md ${
                                isHold
                                  ? 'border border-amber-300 bg-amber-100 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200'
                                  : isCheckedIn
                                  ? 'border border-blue-300 bg-blue-100 text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-200'
                                  : 'border border-emerald-300 bg-emerald-100 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                              }`}
                            >
                              <div className="truncate font-extrabold">
                                {isCheckInDay ? '🛎️ ' : ''}
                                {booking.guest_name}
                              </div>
                              <div className="text-[8px] opacity-75 font-mono">
                                #{booking.id.slice(0, 6).toUpperCase()} · {booking.booking_status}
                              </div>
                            </div>
                          </td>
                        );
                      }

                      // Empty / Available Day
                      return (
                        <td
                          key={dStr}
                          className={`border-r border-stone-100 p-1 text-center dark:border-neutral-800 ${
                            isToday ? 'bg-emerald-50/40' : ''
                          }`}
                        >
                          <span className="text-[9px] text-stone-300 dark:text-neutral-700 select-none">
                            —
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Booking Quick Inspector Modal */}
      {selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  Reservation #{selectedBooking.id.slice(0, 8).toUpperCase()}
                </h3>
                <span
                  className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    selectedBooking.booking_status === 'confirmed'
                      ? 'bg-emerald-100 text-emerald-800'
                      : selectedBooking.booking_status === 'checked_in'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedBooking.booking_status} · {selectedBooking.payment_status}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-850">
                <span className="text-stone-500">Guest Name:</span>
                <span className="font-bold text-stone-900 dark:text-white">{selectedBooking.guest_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-850">
                <span className="text-stone-500">Contact:</span>
                <span className="font-semibold">{selectedBooking.guest_mobile_number}</span>
              </div>
              {selectedBooking.guest_email && (
                <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-850">
                  <span className="text-stone-500">Email:</span>
                  <span className="font-semibold">{selectedBooking.guest_email}</span>
                </div>
              )}
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-850">
                <span className="text-stone-500">Dates:</span>
                <span className="font-semibold">
                  {selectedBooking.check_in_date} to {selectedBooking.check_out_date}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-850">
                <span className="text-stone-500">Party Size:</span>
                <span className="font-semibold">
                  {selectedBooking.num_adults} Adults
                  {selectedBooking.num_children > 0 ? `, ${selectedBooking.num_children} Children` : ''}
                </span>
              </div>
              <div className="flex justify-between pt-2 text-sm font-black">
                <span>Total Folio:</span>
                <span className="text-emerald-600">₹{selectedBooking.total_amount_inr.toLocaleString()}</span>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-2 border-t border-stone-100 pt-3 dark:border-neutral-800">
              <Link
                href={`/bookings/${selectedBooking.id}`}
                className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900"
              >
                Manage Booking &amp; Folio →
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
