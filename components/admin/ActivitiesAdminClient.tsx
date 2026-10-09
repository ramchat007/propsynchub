'use client';

import React, { useState } from 'react';
import { ResortActivity, ActivityBooking } from '@/types';
import { updateActivityBookingStatus } from '@/app/actions/activities';

interface ActivitiesAdminClientProps {
  tenantId: string;
  initialActivities: ResortActivity[];
  initialBookings: ActivityBooking[];
}

export default function ActivitiesAdminClient({
  tenantId,
  initialActivities,
  initialBookings,
}: ActivitiesAdminClientProps) {
  const [activeTab, setActiveTab] = useState<'roster' | 'catalog'>('roster');
  const [bookings, setBookings] = useState<ActivityBooking[]>(initialBookings);
  const [activities] = useState<ResortActivity[]>(initialActivities);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleUpdateStatus = async (
    bookingRecordId: string,
    status: 'confirmed' | 'completed' | 'cancelled'
  ) => {
    setLoadingId(bookingRecordId);
    const res = await updateActivityBookingStatus(tenantId, bookingRecordId, status);
    if (res.success) {
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingRecordId ? { ...b, status } : b))
      );
    } else {
      alert(res.error || 'Failed to update activity booking status');
    }
    setLoadingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Navigation Tabs */}
      <div className="flex border-b border-stone-200 dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('roster')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative ${
            activeTab === 'roster'
              ? 'text-stone-900 dark:text-white border-b-2 border-emerald-600'
              : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
          }`}
        >
          Bookings Roster ({bookings.length})
        </button>
        <button
          onClick={() => setActiveTab('catalog')}
          className={`pb-3 px-4 text-xs font-bold transition-all relative ${
            activeTab === 'catalog'
              ? 'text-stone-900 dark:text-white border-b-2 border-emerald-600'
              : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
          }`}
        >
          Experiences Catalog ({activities.length})
        </button>
      </div>

      {activeTab === 'roster' ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bookings.length === 0 ? (
              <div className="col-span-full p-12 text-center rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <span className="text-3xl">🛶</span>
                <p className="mt-2 text-stone-500 text-xs font-bold">No activity bookings scheduled yet.</p>
              </div>
            ) : (
              bookings.map((booking) => {
                const isLoading = loadingId === booking.id;
                return (
                  <div
                    key={booking.id}
                    className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-mono text-stone-400 block uppercase">
                            #{booking.id.slice(0, 8).toUpperCase()}
                          </span>
                          <h3 className="text-base font-black text-stone-900 dark:text-white">
                            {booking.activity_title}
                          </h3>
                          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
                            {booking.guest_name} ({booking.participants} Pax)
                          </p>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                            booking.status === 'completed'
                              ? 'bg-emerald-100 text-emerald-800'
                              : booking.status === 'cancelled'
                              ? 'bg-stone-100 text-stone-600'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          ● {booking.status}
                        </span>
                      </div>

                      <div className="mt-4 pt-3 border-t border-stone-100 dark:border-neutral-800 space-y-1.5 text-xs text-stone-600 dark:text-stone-300">
                        <div className="flex justify-between">
                          <span>Scheduled Date:</span>
                          <span className="font-semibold">{booking.scheduled_date}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Billing:</span>
                          <span className="font-semibold">
                            {booking.charged_to_folio ? 'Charged to Room Folio' : 'Direct Payment'}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold text-stone-900 dark:text-white pt-1">
                          <span>Total Amount:</span>
                          <span className="text-emerald-600">₹{booking.total_amount_inr.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-stone-100 dark:border-neutral-800 flex gap-2">
                      {booking.status === 'confirmed' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleUpdateStatus(booking.id, 'completed')}
                          className="flex-1 py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                        >
                          ✓ Mark Completed
                        </button>
                      )}
                      {booking.status !== 'cancelled' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleUpdateStatus(booking.id, 'cancelled')}
                          className="py-1.5 px-3 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activities.map((act) => (
            <div
              key={act.id}
              className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-black text-stone-900 dark:text-white">{act.title}</h3>
                  <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                    ₹{act.price_inr}
                    <span className="text-[10px] text-stone-400 font-normal"> / pax</span>
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-500 leading-relaxed">{act.description}</p>
              </div>

              <div className="mt-4 pt-3 border-t border-stone-100 dark:border-neutral-800 flex justify-between text-xs text-stone-500">
                <span>⏱️ {act.duration_minutes} Mins</span>
                <span>👥 Max {act.max_participants} Pax</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
