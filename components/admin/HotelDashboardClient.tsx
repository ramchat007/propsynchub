'use client';

import React, { useState, useTransition, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Tenant, Room, Booking, RoomStatus } from '@/types';
import {
  createReservation,
  updateBookingStatus,
  seedSampleBookings,
} from '@/app/actions/booking';
import { updateRoomStatus } from '@/app/actions/inventory';
import { ToastContainer, ToastMessage } from './Toast';

export interface RoomOccupancyInfo {
  state:
    | 'occupied'
    | 'arriving_today'
    | 'departing_today'
    | 'maintenance'
    | 'blocked'
    | 'available'
    | 'dirty'
    | 'cleaning'
    | 'inspected';
  booking?: Booking;
  nextBooking?: Booking;
  recentCheckout?: Booking;
}

interface HotelDashboardClientProps {
  tenant: Tenant | null;
  initialRooms: Room[];
  initialBookings: Booking[];
}

export default function HotelDashboardClient({
  tenant,
  initialRooms,
  initialBookings,
}: HotelDashboardClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Active view tab in bottom action queue
  const [activeQueueTab, setActiveQueueTab] = useState<'arrivals' | 'departures' | 'recent'>('arrivals');

  // Room Rack Filter
  const [roomRackFilter, setRoomRackFilter] = useState<'all' | 'available' | 'occupied' | 'arriving' | 'upcoming' | 'maintenance'>('all');

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }
  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Walk-in modal state
  const [isWalkInModalOpen, setIsWalkInModalOpen] = useState(false);
  const [selectedRoomForWalkIn, setSelectedRoomForWalkIn] = useState<Room | null>(null);

  const getToday = () => new Date().toISOString().split('T')[0];
  const getTomorrow = () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return tmr.toISOString().split('T')[0];
  };

  const todayStr = getToday();
  const tenantId = tenant?.id || '';

  const [walkInGuestName, setWalkInGuestName] = useState('');
  const [walkInGuestMobile, setWalkInGuestMobile] = useState('');
  const [walkInGuestEmail, setWalkInGuestEmail] = useState('');
  const [walkInCheckIn, setWalkInCheckIn] = useState(getToday());
  const [walkInCheckOut, setWalkInCheckOut] = useState(getTomorrow());
  const [walkInAdults, setWalkInAdults] = useState(2);
  const [walkInChildren, setWalkInChildren] = useState(0);
  const [walkInSpecialRequests, setWalkInSpecialRequests] = useState('');
  const [walkInSelectedRoomId, setWalkInSelectedRoomId] = useState(
    initialRooms.length > 0 ? initialRooms[0].id : ''
  );

  // Today's formatted display date
  const formattedToday = useMemo(() => {
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

  // ===================================================================
  // ROOM OCCUPANCY & PAX CLASSIFICATION (COMPREHENSIVE FRONT DESK SYNC)
  // ===================================================================
  const roomOccupancyMap = useMemo(() => {
    const map = new Map<string, RoomOccupancyInfo>();

    initialRooms.forEach((room) => {
      // Find all non-cancelled bookings for this room
      const roomBookings = initialBookings.filter(
        (b) => b.room_id === room.id && b.booking_status !== 'cancelled'
      );

      // 1. In-House Checked In OR Active Stay covering today
      const inHouseBooking = roomBookings.find(
        (b) =>
          b.booking_status === 'checked_in' ||
          (b.booking_status === 'confirmed' &&
            b.check_in_date <= todayStr &&
            b.check_out_date > todayStr)
      );

      // 2. Scheduled to arrive today
      const arrivingToday = roomBookings.find(
        (b) =>
          (b.booking_status === 'confirmed' || b.booking_status === 'pending') &&
          b.check_in_date === todayStr
      );

      // 3. Soonest upcoming reservation on the books
      const futureBookings = roomBookings
        .filter(
          (b) =>
            (b.booking_status === 'confirmed' || b.booking_status === 'pending') &&
            b.check_in_date > todayStr
        )
        .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date));
      const nextBooking = futureBookings[0];

      // 4. Recent checkout settled today
      const recentCheckout = initialBookings.find(
        (b) =>
          b.room_id === room.id &&
          b.check_out_date === todayStr &&
          b.booking_status === 'checked_out'
      );

      if (inHouseBooking) {
        if (inHouseBooking.check_out_date === todayStr) {
          map.set(room.id, {
            state: 'departing_today',
            booking: inHouseBooking,
            nextBooking,
            recentCheckout,
          });
        } else {
          map.set(room.id, {
            state: 'occupied',
            booking: inHouseBooking,
            nextBooking,
            recentCheckout,
          });
        }
        return;
      }

      if (arrivingToday) {
        map.set(room.id, {
          state: 'arriving_today',
          booking: arrivingToday,
          nextBooking,
          recentCheckout,
        });
        return;
      }

      if (room.status === 'dirty') {
        map.set(room.id, {
          state: 'dirty',
          nextBooking,
          recentCheckout,
        });
        return;
      }

      if (room.status === 'cleaning') {
        map.set(room.id, {
          state: 'cleaning',
          nextBooking,
          recentCheckout,
        });
        return;
      }

      if (room.status === 'inspected') {
        map.set(room.id, {
          state: 'inspected',
          nextBooking,
          recentCheckout,
        });
        return;
      }

      if (room.status === 'maintenance') {
        map.set(room.id, {
          state: 'maintenance',
          nextBooking,
          recentCheckout,
        });
        return;
      }

      if (room.status === 'blocked') {
        map.set(room.id, {
          state: 'blocked',
          nextBooking,
          recentCheckout,
        });
        return;
      }

      // Vacant / Clean & Available
      map.set(room.id, {
        state: 'available',
        nextBooking,
        recentCheckout,
      });
    });

    return map;
  }, [initialRooms, initialBookings, todayStr]);

  // Operational metrics
  const occupiedRoomsCount = Array.from(roomOccupancyMap.values()).filter(
    (item) => item.state === 'occupied' || item.state === 'departing_today'
  ).length;

  const totalRoomsCount = initialRooms.length || 1;
  const occupancyPercentage = Math.round((occupiedRoomsCount / totalRoomsCount) * 100);

  const arrivalsToday = useMemo(() => {
    return initialBookings.filter(
      (b) =>
        b.check_in_date === todayStr &&
        (b.booking_status === 'confirmed' || b.booking_status === 'pending')
    );
  }, [initialBookings, todayStr]);

  const totalPaxArriving = arrivalsToday.reduce(
    (sum, b) => sum + (b.num_adults || 0) + (b.num_children || 0),
    0
  );

  const departuresToday = useMemo(() => {
    return initialBookings.filter(
      (b) =>
        b.check_out_date === todayStr &&
        (b.booking_status === 'checked_in' ||
          b.booking_status === 'confirmed' ||
          b.booking_status === 'checked_out')
    );
  }, [initialBookings, todayStr]);

  const availableRoomsCount = Array.from(roomOccupancyMap.values()).filter(
    (item) => item.state === 'available'
  ).length;

  const upcomingRoomsCount = Array.from(roomOccupancyMap.values()).filter(
    (item) => !!item.nextBooking
  ).length;

  // Filtered rooms for the rack
  const filteredRooms = useMemo(() => {
    return initialRooms.filter((room) => {
      const occupancy = roomOccupancyMap.get(room.id);
      if (roomRackFilter === 'all') return true;
      if (roomRackFilter === 'available') return occupancy?.state === 'available';
      if (roomRackFilter === 'occupied') return occupancy?.state === 'occupied' || occupancy?.state === 'departing_today';
      if (roomRackFilter === 'arriving') return occupancy?.state === 'arriving_today';
      if (roomRackFilter === 'upcoming') return !!occupancy?.nextBooking;
      if (roomRackFilter === 'maintenance') return occupancy?.state === 'maintenance' || occupancy?.state === 'blocked';
      return true;
    });
  }, [initialRooms, roomOccupancyMap, roomRackFilter]);

  // ===================================================================
  // ACTIONS
  // ===================================================================
  const handleCheckInGuest = (bookingId: string) => {
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, tenantId, 'checked_in');
      if (res.success) {
        addToast('success', res.message || 'Guest checked in successfully.');
        router.refresh();
      } else {
        addToast('error', res.error || 'Failed to check in guest.');
      }
    });
  };

  const handleCheckOutGuest = (bookingId: string) => {
    startTransition(async () => {
      const res = await updateBookingStatus(bookingId, tenantId, 'checked_out');
      if (res.success) {
        addToast('success', res.message || 'Guest checked out successfully.');
        router.refresh();
      } else {
        addToast('error', res.error || 'Failed to check out guest.');
      }
    });
  };

  const handleToggleRoomStatus = (room: Room, newStatus: RoomStatus) => {
    startTransition(async () => {
      const res = await updateRoomStatus(room.id, tenantId, newStatus);
      if (res.success) {
        addToast('success', res.message || `Room marked as ${newStatus}.`);
        router.refresh();
      } else {
        addToast('error', res.error || 'Failed to update room.');
      }
    });
  };

  const handleOpenWalkIn = (room?: Room) => {
    if (room) {
      setSelectedRoomForWalkIn(room);
      setWalkInSelectedRoomId(room.id);
    } else if (initialRooms.length > 0) {
      // Pick first available room if possible
      const firstAvailable = initialRooms.find(r => roomOccupancyMap.get(r.id)?.state === 'available') || initialRooms[0];
      setSelectedRoomForWalkIn(firstAvailable);
      setWalkInSelectedRoomId(firstAvailable.id);
    }
    setIsWalkInModalOpen(true);
  };

  const handleSeedDemo = () => {
    if (!tenantId) return;
    if (!confirm('Load 3 realistic sample reservations (1 In-House, 1 Arriving Today, 1 Upcoming) to preview the front-desk command loop?')) {
      return;
    }
    startTransition(async () => {
      const res = await seedSampleBookings(tenantId);
      if (res.success) {
        addToast('success', res.message);
        router.refresh();
      } else {
        addToast('error', res.message);
      }
    });
  };

  const handleSaveWalkInReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!walkInGuestName.trim() || !walkInGuestMobile.trim()) {
      addToast('error', 'Guest name and mobile number are required.');
      return;
    }

    const targetRoom = initialRooms.find((r) => r.id === walkInSelectedRoomId);
    if (!targetRoom) {
      addToast('error', 'Please select a valid room.');
      return;
    }

    const checkInDate = new Date(walkInCheckIn);
    const checkOutDate = new Date(walkInCheckOut);
    const diffMs = checkOutDate.getTime() - checkInDate.getTime();
    const nights = Math.max(1, Math.round(diffMs / (1000 * 60 * 60 * 24)));
    const totalAmount = nights * (targetRoom.base_price_inr || 0);

    startTransition(async () => {
      const res = await createReservation({
        tenantId,
        roomId: targetRoom.id,
        checkIn: walkInCheckIn,
        checkOut: walkInCheckOut,
        adults: walkInAdults,
        children: walkInChildren,
        guestName: walkInGuestName,
        guestMobile: walkInGuestMobile,
        guestEmail: walkInGuestEmail,
        totalAmount,
        specialRequests: walkInSpecialRequests,
      });

      if (res.success && res.booking) {
        await updateBookingStatus(res.booking.id, tenantId, 'checked_in');
        addToast('success', `Guest ${walkInGuestName} checked in to ${targetRoom.name}!`);
        setIsWalkInModalOpen(false);
        setWalkInGuestName('');
        setWalkInGuestMobile('');
        setWalkInGuestEmail('');
        setWalkInSpecialRequests('');
        router.refresh();
      } else {
        addToast('error', res.error || 'Failed to create walk-in reservation.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* =================================================================== */}
      {/* 1. EXECUTIVE FRONT DESK HEADER                                       */}
      {/* =================================================================== */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200/80 pb-5 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-white">
              {tenant?.name || 'Resort Front Desk'}
            </h1>
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800 uppercase dark:bg-emerald-950/60 dark:text-emerald-300">
              Live Desk
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-500 dark:text-neutral-400">
            {formattedToday} · Front Desk Operational Console
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => handleOpenWalkIn()}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500 active:scale-95"
          >
            <span>➕ Walk-In Check-In</span>
          </button>

          <Link
            href="/bookings"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
          >
            <span>📋 Bookings &amp; Folios</span>
          </Link>

          <Link
            href="/calendar"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
          >
            <span>📅 Calendar</span>
          </Link>

          <Link
            href={`/${tenant?.subdomain || 'raigad-tropical'}`}
            target="_blank"
            className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-stone-700 shadow-2xs transition hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
          >
            <span>🌐 Live Site ↗</span>
          </Link>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. 4 SIMPLIFIED OPERATIONAL PULSE CARDS                             */}
      {/* =================================================================== */}
      <section className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        {/* Today's Arrivals */}
        <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Today&apos;s Arrivals
            </span>
            <span className="flex h-2 w-2 rounded-full bg-amber-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-amber-900 dark:text-amber-200 sm:text-3xl">
            {arrivalsToday.length}
          </p>
          <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-400/80">
            {totalPaxArriving} Guests arriving today
          </p>
        </div>

        {/* In-House Occupancy */}
        <div className="rounded-2xl border border-rose-200 bg-rose-50/30 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
              In-House Occupied
            </span>
            <span className="flex h-2 w-2 rounded-full bg-rose-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-rose-900 dark:text-rose-200 sm:text-3xl">
            {occupiedRoomsCount} <span className="text-xs font-normal text-stone-500">/ {totalRoomsCount}</span>
          </p>
          <p className="mt-1 text-xs text-rose-700/80 dark:text-rose-400/80">
            {occupancyPercentage}% room occupancy rate
          </p>
        </div>

        {/* Today's Departures */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/40 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
              Today&apos;s Departures
            </span>
            <span className="flex h-2 w-2 rounded-full bg-blue-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-blue-900 dark:text-blue-200 sm:text-3xl">
            {departuresToday.length}
          </p>
          <p className="mt-1 text-xs text-blue-700/80 dark:text-blue-400/80">
            Scheduled checkouts today
          </p>
        </div>

        {/* Clean & Ready Rooms */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Ready to Sell
            </span>
            <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
          </div>
          <p className="mt-2 text-2xl font-black text-emerald-900 dark:text-emerald-200 sm:text-3xl">
            {availableRoomsCount}
          </p>
          <p className="mt-1 text-xs text-emerald-700/80 dark:text-emerald-400/80">
            Vacant &amp; ready for walk-ins
          </p>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. FRONT DESK ROOM RACK (COMPACT BOARD)                             */}
      {/* =================================================================== */}
      <section className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-stone-900 dark:text-white sm:text-lg">
              Room Rack (Live Status Board)
            </h2>
            <p className="text-xs text-stone-500">
              Instant glance at physical units, who is staying, and quick check-in / checkout controls.
            </p>
          </div>

          {/* Quick filter pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {(
              [
                { id: 'all', label: `All (${initialRooms.length})` },
                { id: 'available', label: `Ready (${availableRoomsCount})` },
                { id: 'occupied', label: `In-House (${occupiedRoomsCount})` },
                { id: 'arriving', label: `Arriving (${arrivalsToday.length})` },
                { id: 'upcoming', label: `Upcoming Stays (${upcomingRoomsCount})` },
                { id: 'maintenance', label: 'Maintenance' },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setRoomRackFilter(filter.id)}
                className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                  roomRackFilter === filter.id
                    ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300'
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        {filteredRooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 p-8 text-center text-xs text-stone-500 dark:border-neutral-800">
            No rooms matching the selected filter.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {filteredRooms.map((room) => {
              const occupancy = roomOccupancyMap.get(room.id) || { state: 'available' };
              const b = occupancy.booking;
              const nextB = occupancy.nextBooking;
              const recentOut = occupancy.recentCheckout;

              const isOccupied = occupancy.state === 'occupied' || occupancy.state === 'departing_today';
              const isArriving = occupancy.state === 'arriving_today';
              const isMaintenance = occupancy.state === 'maintenance' || occupancy.state === 'blocked';
              const isDirty = occupancy.state === 'dirty';
              const isCleaning = occupancy.state === 'cleaning';
              const isInspected = occupancy.state === 'inspected';
              const isAvailable = occupancy.state === 'available';

              return (
                <div
                  key={room.id}
                  className={`flex flex-col justify-between rounded-2xl border p-4 shadow-2xs transition hover:shadow-md ${
                    isOccupied
                      ? 'border-rose-200 bg-white dark:border-rose-900/60 dark:bg-neutral-900'
                      : isArriving
                      ? 'border-amber-200 bg-white dark:border-amber-900/60 dark:bg-neutral-900'
                      : isDirty
                      ? 'border-rose-300 bg-rose-50/30 dark:border-rose-900 dark:bg-rose-950/20'
                      : isCleaning
                      ? 'border-amber-300 bg-amber-50/30 dark:border-amber-900 dark:bg-amber-950/20'
                      : isInspected
                      ? 'border-blue-300 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20'
                      : isMaintenance
                      ? 'border-stone-300 bg-stone-50 dark:border-neutral-800 dark:bg-neutral-900/50'
                      : 'border-emerald-200 bg-white dark:border-emerald-900/60 dark:bg-neutral-900'
                  }`}
                >
                  {/* Card Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="rounded-md bg-stone-900 px-1.5 py-0.5 text-[10px] font-mono font-bold text-white dark:bg-stone-100 dark:text-stone-900">
                          #{room.room_number || 'Unit'}
                        </span>
                        <span className="text-xs font-bold text-stone-900 dark:text-white truncate max-w-[130px]">
                          {room.name}
                        </span>
                      </div>

                      {/* Status Tag */}
                      {isOccupied && (
                        <span className="rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200 dark:bg-rose-950 dark:border-rose-800 dark:text-rose-300">
                          🔴 In-House
                        </span>
                      )}
                      {isArriving && (
                        <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700 border border-amber-200 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-300">
                          🟡 Arriving Today
                        </span>
                      )}
                      {isDirty && (
                        <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800 border border-rose-300 dark:bg-rose-950 dark:text-rose-300">
                          🧹 Dirty
                        </span>
                      )}
                      {isCleaning && (
                        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-300">
                          🧼 Cleaning
                        </span>
                      )}
                      {isInspected && (
                        <span className="rounded-md bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800 border border-blue-300 dark:bg-blue-950 dark:text-blue-300">
                          🔍 Inspected
                        </span>
                      )}
                      {isAvailable && nextB && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300">
                          🟢 Vacant · 📅 Due {nextB.check_in_date.slice(5)}
                        </span>
                      )}
                      {isAvailable && !nextB && (
                        <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-300">
                          🟢 Ready &amp; Clean
                        </span>
                      )}
                      {isMaintenance && (
                        <span className="rounded-md bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-700 dark:bg-neutral-800 dark:text-stone-300">
                          🔧 Maintenance
                        </span>
                      )}
                    </div>

                    <p className="mt-1 text-[11px] text-stone-500 truncate">
                      {room.room_type} · ₹{Number(room.base_price_inr).toLocaleString()}/nt
                    </p>

                    {/* Guest Information or Vacancy Details */}
                    <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50/70 p-2.5 text-xs dark:border-neutral-800 dark:bg-neutral-850">
                      {b ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-stone-900 dark:text-white truncate">
                              👤 {b.guest_name}
                            </p>
                            <span className="font-mono text-[9px] font-bold text-stone-400">
                              #{b.id.slice(0, 8).toUpperCase()}
                            </span>
                          </div>
                          <p className="text-[11px] text-stone-600 dark:text-stone-300">
                            👥 {b.num_adults} Adults{b.num_children > 0 ? `, ${b.num_children} Kids` : ''} ({b.num_adults + b.num_children} Pax)
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-200/60 dark:border-neutral-800">
                            <span>Checkout: {b.check_out_date}</span>
                            <span className="font-bold text-emerald-700 dark:text-emerald-400">
                              ₹{Number(b.total_amount_inr).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : isAvailable && nextB ? (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[10px] font-bold text-amber-700 uppercase tracking-wider dark:text-amber-400">
                            <span>Upcoming on Books</span>
                            <span className="font-mono text-stone-400">#{nextB.id.slice(0, 8).toUpperCase()}</span>
                          </div>
                          <p className="font-bold text-stone-900 dark:text-white truncate">
                            👤 {nextB.guest_name}
                          </p>
                          <p className="text-[11px] text-stone-600 dark:text-stone-300">
                            📅 {nextB.check_in_date} → {nextB.check_out_date} · 👥 {nextB.num_adults + nextB.num_children} Pax
                          </p>
                          <div className="flex items-center justify-between text-[10px] text-stone-500 pt-1 border-t border-stone-200/60 dark:border-neutral-800">
                            <span className="text-emerald-700 dark:text-emerald-400 font-semibold">Vacant until arrival</span>
                            <span className="font-bold text-stone-800 dark:text-stone-200">
                              ₹{Number(nextB.total_amount_inr).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ) : isAvailable ? (
                        <div className="py-1">
                          {recentOut ? (
                            <div className="space-y-0.5 text-center">
                              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                ✓ Ready for Walk-In Check-In
                              </p>
                              <p className="text-[10px] text-stone-500 truncate">
                                🛎️ Checked out today: {recentOut.guest_name}
                              </p>
                            </div>
                          ) : (
                            <div className="text-center">
                              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                ✓ 100% Free · Walk-In Ready
                              </p>
                              <p className="text-[10px] text-stone-400">
                                No upcoming reservations · Max {room.capacity_adults} Adults
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="py-1 text-center text-[11px] text-stone-500">
                          Unit blocked for repairs/cleaning.
                          {nextB && (
                            <span className="block text-[10px] text-amber-600 mt-0.5">
                              ⚠️ Upcoming stay on {nextB.check_in_date} ({nextB.guest_name})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 1-Click Action Footer */}
                  <div className="mt-3.5 pt-2 border-t border-stone-100 dark:border-neutral-800 flex gap-1.5">
                    {isOccupied && b && (
                      <>
                        <Link
                          href={`/bookings/${b.id}`}
                          className="flex-1 rounded-lg border border-stone-200 bg-white py-1.5 text-center text-[11px] font-bold text-stone-700 hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                        >
                          Folio
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleCheckOutGuest(b.id)}
                          disabled={isPending}
                          className="flex-1 rounded-lg bg-stone-900 py-1.5 text-center text-[11px] font-bold text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900"
                        >
                          Check Out
                        </button>
                      </>
                    )}

                    {isArriving && b && (
                      <button
                        type="button"
                        onClick={() => handleCheckInGuest(b.id)}
                        disabled={isPending}
                        className="w-full rounded-lg bg-emerald-600 py-1.5 text-center text-[11px] font-bold text-white hover:bg-emerald-500 shadow-2xs"
                      >
                        🔑 Check In Guest
                      </button>
                    )}

                    {isAvailable && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleOpenWalkIn(room)}
                          className="flex-1 rounded-lg bg-emerald-600 py-1.5 text-center text-[11px] font-bold text-white hover:bg-emerald-500 shadow-2xs"
                        >
                          + Quick Book
                        </button>
                        {nextB ? (
                          <Link
                            href={`/bookings/${nextB.id}`}
                            title={`Open Folio for ${nextB.guest_name}`}
                            className="flex-1 rounded-lg border border-amber-300 bg-amber-50/70 py-1.5 text-center text-[11px] font-bold text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300 truncate"
                          >
                            Folio #{nextB.id.slice(0, 6)} ↗
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleToggleRoomStatus(room, 'maintenance')}
                            title="Block unit"
                            className="rounded-lg border border-stone-200 px-2 py-1.5 text-[11px] text-stone-500 hover:bg-stone-100 dark:border-neutral-700"
                          >
                            🔧
                          </button>
                        )}
                      </>
                    )}

                    {isDirty && (
                      <button
                        type="button"
                        onClick={() => handleToggleRoomStatus(room, 'cleaning')}
                        disabled={isPending}
                        className="w-full rounded-lg bg-amber-600 py-1.5 text-center text-[11px] font-bold text-white hover:bg-amber-500 shadow-2xs"
                      >
                        🧼 Start Cleaning
                      </button>
                    )}

                    {isCleaning && (
                      <button
                        type="button"
                        onClick={() => handleToggleRoomStatus(room, 'inspected')}
                        disabled={isPending}
                        className="w-full rounded-lg bg-blue-600 py-1.5 text-center text-[11px] font-bold text-white hover:bg-blue-500 shadow-2xs"
                      >
                        🔍 Mark Inspected
                      </button>
                    )}

                    {isInspected && (
                      <button
                        type="button"
                        onClick={() => handleToggleRoomStatus(room, 'available')}
                        disabled={isPending}
                        className="w-full rounded-lg bg-emerald-600 py-1.5 text-center text-[11px] font-bold text-white hover:bg-emerald-500 shadow-2xs"
                      >
                        ✨ Mark Clean &amp; Ready
                      </button>
                    )}

                    {isMaintenance && (
                      <button
                        type="button"
                        onClick={() => handleToggleRoomStatus(room, 'available')}
                        disabled={isPending}
                        className="w-full rounded-lg bg-stone-900 py-1.5 text-center text-[11px] font-bold text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900"
                      >
                        ✨ Mark Clean &amp; Ready
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 4. FRONT DESK ACTION QUEUE (TABS: ARRIVALS, DEPARTURES, RECENT)     */}
      {/* =================================================================== */}
      <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        {/* Navigation Tabs */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-3 dark:border-neutral-800">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveQueueTab('arrivals')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                activeQueueTab === 'arrivals'
                  ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-neutral-800'
              }`}
            >
              📥 Today&apos;s Arrivals ({arrivalsToday.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveQueueTab('departures')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                activeQueueTab === 'departures'
                  ? 'bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-neutral-800'
              }`}
            >
              📤 Today&apos;s Departures ({departuresToday.length})
            </button>

            <button
              type="button"
              onClick={() => setActiveQueueTab('recent')}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition ${
                activeQueueTab === 'recent'
                  ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                  : 'text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-neutral-800'
              }`}
            >
              📋 All Recent Bookings ({initialBookings.length})
            </button>
          </div>

          <Link
            href="/bookings"
            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
          >
            Open Full Ledger ➔
          </Link>
        </div>

        {/* Tab 1: Expected Arrivals */}
        {activeQueueTab === 'arrivals' && (
          <div className="mt-4">
            {arrivalsToday.length === 0 ? (
              <div className="py-10 text-center text-xs text-stone-400">
                ✓ All scheduled arrivals for today are checked in or none remaining.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-neutral-800">
                {arrivalsToday.map((b) => {
                  const room = initialRooms.find((r) => r.id === b.room_id);
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 font-bold text-amber-700 text-xs dark:bg-amber-950 dark:text-amber-300">
                          #{room?.room_number || 'R'}
                        </div>
                        <div>
                          <p className="font-bold text-stone-900 dark:text-white text-xs">
                            {b.guest_name}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {room?.name} · 👥 {b.num_adults} Adults{b.num_children > 0 ? `, ${b.num_children} Kids` : ''} · 📞 {b.guest_mobile_number}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right text-xs">
                          <span className="font-bold text-stone-900 dark:text-white block">
                            ₹{Number(b.total_amount_inr).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-emerald-600 font-semibold uppercase">
                            {b.payment_status}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleCheckInGuest(b.id)}
                          disabled={isPending}
                          className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500"
                        >
                          🔑 Check In
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Expected Departures */}
        {activeQueueTab === 'departures' && (
          <div className="mt-4">
            {departuresToday.length === 0 ? (
              <div className="py-10 text-center text-xs text-stone-400">
                ✓ No departures remaining for today.
              </div>
            ) : (
              <div className="divide-y divide-stone-100 dark:divide-neutral-800">
                {departuresToday.map((b) => {
                  const room = initialRooms.find((r) => r.id === b.room_id);
                  return (
                    <div
                      key={b.id}
                      className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 font-bold text-blue-700 text-xs dark:bg-blue-950 dark:text-blue-300">
                          #{room?.room_number || 'R'}
                        </div>
                        <div>
                          <p className="font-bold text-stone-900 dark:text-white text-xs">
                            {b.guest_name}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {room?.name} · Stayed from {b.check_in_date} · 📞 {b.guest_mobile_number}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <div className="text-right text-xs">
                          <span className="font-bold text-stone-900 dark:text-white block">
                            ₹{Number(b.total_amount_inr).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-stone-500 font-semibold uppercase">
                            {b.payment_status}
                          </span>
                        </div>

                        <Link
                          href={`/bookings/${b.id}`}
                          className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
                        >
                          Folio Bill
                        </Link>

                        {b.booking_status === 'checked_out' ? (
                          <span className="rounded-xl bg-stone-100 px-3 py-2 text-xs font-bold text-stone-600 dark:bg-neutral-800 dark:text-stone-300">
                            ✓ Settled &amp; Checked Out
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleCheckOutGuest(b.id)}
                            disabled={isPending}
                            className="rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900"
                          >
                            🛎️ Settle &amp; Checkout
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Recent Bookings Table */}
        {activeQueueTab === 'recent' && (
          <div className="mt-4 overflow-x-auto">
            {initialBookings.length === 0 ? (
              <div className="py-10 text-center text-xs text-stone-400">
                No bookings recorded yet.
              </div>
            ) : (
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-400 text-[11px] uppercase font-bold dark:border-neutral-800">
                    <th className="py-2.5">Ref #</th>
                    <th className="py-2.5">Guest</th>
                    <th className="py-2.5">Unit</th>
                    <th className="py-2.5">Dates</th>
                    <th className="py-2.5">Pax</th>
                    <th className="py-2.5">Status</th>
                    <th className="py-2.5">Amount</th>
                    <th className="py-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-neutral-800">
                  {initialBookings.slice(0, 10).map((b) => {
                    const room = initialRooms.find((r) => r.id === b.room_id);
                    return (
                      <tr key={b.id} className="hover:bg-stone-50 dark:hover:bg-neutral-850">
                        <td className="py-3 font-mono font-bold text-stone-900 dark:text-white">
                          #{b.id.slice(0, 8).toUpperCase()}
                        </td>
                        <td className="py-3 font-medium">
                          {b.guest_name}
                          <span className="block text-[10px] text-stone-400">{b.guest_mobile_number}</span>
                        </td>
                        <td className="py-3 text-stone-600 dark:text-stone-300">
                          {room?.name || 'Unit'}
                        </td>
                        <td className="py-3 text-stone-600 dark:text-stone-300">
                          {b.check_in_date} ➔ {b.check_out_date}
                        </td>
                        <td className="py-3 text-stone-600 dark:text-stone-300">
                          {b.num_adults}A {b.num_children > 0 ? `${b.num_children}C` : ''}
                        </td>
                        <td className="py-3">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                              b.booking_status === 'confirmed'
                                ? 'bg-emerald-50 text-emerald-700'
                                : b.booking_status === 'checked_in'
                                ? 'bg-blue-50 text-blue-700'
                                : b.booking_status === 'checked_out'
                                ? 'bg-stone-100 text-stone-700'
                                : 'bg-amber-50 text-amber-700'
                            }`}
                          >
                            {b.booking_status}
                          </span>
                        </td>
                        <td className="py-3 font-bold text-stone-900 dark:text-white">
                          ₹{Number(b.total_amount_inr).toLocaleString()}
                        </td>
                        <td className="py-3 text-right">
                          <Link
                            href={`/bookings/${b.id}`}
                            className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            Manage →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* 5. STREAMLINED WALK-IN CHECK-IN MODAL                               */}
      {/* =================================================================== */}
      {isWalkInModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  ➕ Walk-In Guest Check-In {selectedRoomForWalkIn ? `— ${selectedRoomForWalkIn.name}` : ''}
                </h3>
                <p className="text-xs text-stone-500">
                  Instant registration for guests arriving at front desk.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWalkInModalOpen(false)}
                className="text-stone-400 hover:text-stone-600 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWalkInReservation} className="mt-4 space-y-3.5">
              {/* Room Selection */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                  Assign Room Unit *
                </label>
                <select
                  value={walkInSelectedRoomId}
                  onChange={(e) => {
                    setWalkInSelectedRoomId(e.target.value);
                    const r = initialRooms.find((rm) => rm.id === e.target.value);
                    if (r) setSelectedRoomForWalkIn(r);
                  }}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {initialRooms.map((rm) => (
                    <option key={rm.id} value={rm.id}>
                      #{rm.room_number || 'R'} · {rm.name} (₹{Number(rm.base_price_inr).toLocaleString()}/night)
                    </option>
                  ))}
                </select>
              </div>

              {/* Guest Name & Mobile */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Guest Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={walkInGuestName}
                    onChange={(e) => setWalkInGuestName(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Mobile Number *
                  </label>
                  <input
                    type="tel"
                    required
                    placeholder="+91 98201 60376"
                    value={walkInGuestMobile}
                    onChange={(e) => setWalkInGuestMobile(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Email Address */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  placeholder="guest@example.com"
                  value={walkInGuestEmail}
                  onChange={(e) => setWalkInGuestEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              {/* Stay Dates */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Check-in Date
                  </label>
                  <input
                    type="date"
                    required
                    value={walkInCheckIn}
                    onChange={(e) => setWalkInCheckIn(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Check-out Date
                  </label>
                  <input
                    type="date"
                    required
                    value={walkInCheckOut}
                    onChange={(e) => setWalkInCheckOut(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Pax Breakdown */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Adults
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    value={walkInAdults}
                    onChange={(e) => setWalkInAdults(parseInt(e.target.value, 10) || 1)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Children
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="6"
                    value={walkInChildren}
                    onChange={(e) => setWalkInChildren(parseInt(e.target.value, 10) || 0)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Special Requests */}
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Paid in cash at reception."
                  value={walkInSpecialRequests}
                  onChange={(e) => setWalkInSpecialRequests(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-medium dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsWalkInModalOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending ? 'Registering...' : 'Confirm Check-In ➔'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
