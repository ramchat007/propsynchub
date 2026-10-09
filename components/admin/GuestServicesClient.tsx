'use client';

import React, { useState } from 'react';
import { ServiceRequest, ServiceRequestStatus } from '@/types';
import { updateServiceRequestStatus } from '@/app/actions/service-requests';

interface GuestServicesClientProps {
  tenantId: string;
  initialRequests: ServiceRequest[];
}

const STATUS_CONFIG: Record<ServiceRequestStatus, { bg: string; text: string; border: string }> = {
  PENDING: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  ACCEPTED: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  IN_PROGRESS: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  COMPLETED: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  CANCELLED: { bg: 'bg-stone-50 dark:bg-stone-900', text: 'text-stone-500', border: 'border-stone-200 dark:border-stone-800' },
};

const CATEGORY_ICONS: Record<string, string> = {
  housekeeping: '🧹',
  extra_towels: '🧖',
  extra_bed: '🛏️',
  maintenance: '🔧',
  room_service: '🍽️',
  concierge: '🛎️',
  other: '📋',
};

export default function GuestServicesClient({
  tenantId,
  initialRequests,
}: GuestServicesClientProps) {
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests);
  const [filter, setFilter] = useState<'active' | 'all' | 'completed'>('active');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const activeRequests = requests.filter(
    (r) => r.status === 'PENDING' || r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS'
  );

  const filteredRequests = requests.filter((r) => {
    if (filter === 'active') {
      return r.status === 'PENDING' || r.status === 'ACCEPTED' || r.status === 'IN_PROGRESS';
    }
    if (filter === 'completed') {
      return r.status === 'COMPLETED';
    }
    return true;
  });

  const handleUpdateStatus = async (requestId: string, status: ServiceRequestStatus) => {
    setLoadingId(requestId);
    const res = await updateServiceRequestStatus(tenantId, requestId, status);
    if (res.success && res.data) {
      setRequests((prev) => prev.map((r) => (r.id === requestId ? res.data! : r)));
    } else {
      alert(res.error || 'Failed to update request status');
    }
    setLoadingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Metrics Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
          <p className="text-xs font-semibold text-stone-500 uppercase">Active Requests</p>
          <p className="mt-1 text-2xl font-black text-amber-600">{activeRequests.length}</p>
        </div>
        <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Completed</p>
          <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">
            {requests.filter((r) => r.status === 'COMPLETED').length}
          </p>
        </div>
        <div className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
          <p className="text-xs font-semibold text-stone-500 uppercase">Total Logged</p>
          <p className="mt-1 text-2xl font-black text-stone-900 dark:text-white">{requests.length}</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {(['active', 'all', 'completed'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              filter === tab
                ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-400'
            }`}
          >
            {tab === 'active'
              ? `Active Requests (${activeRequests.length})`
              : tab === 'completed'
              ? 'Completed'
              : 'All Requests'}
          </button>
        ))}
      </div>

      {/* Requests Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredRequests.length === 0 ? (
          <div className="col-span-full p-12 text-center rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <span className="text-3xl">🛎️</span>
            <p className="mt-2 text-stone-500 text-xs font-bold">No guest service requests in this view.</p>
          </div>
        ) : (
          filteredRequests.map((req) => {
            const config = STATUS_CONFIG[req.status] || STATUS_CONFIG.PENDING;
            const icon = CATEGORY_ICONS[req.category] || '🛎️';
            const isLoading = loadingId === req.id;

            return (
              <div
                key={req.id}
                className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-lg">{icon}</span>
                        <span className="text-[10px] font-extrabold uppercase text-stone-400">
                          {req.category.replace('_', ' ')}
                        </span>
                      </div>
                      <h3 className="text-base font-black text-stone-900 dark:text-white mt-1">
                        {req.title}
                      </h3>
                      <p className="text-xs font-semibold text-stone-500">
                        Guest: <strong className="text-stone-900 dark:text-white">{req.guest_name}</strong>{' '}
                        {req.room_number ? `(Room #${req.room_number})` : ''}
                      </p>
                    </div>

                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${config.bg} ${config.text} ${config.border}`}
                    >
                      ● {req.status}
                    </span>
                  </div>

                  {req.description && (
                    <div className="mt-3 p-3 rounded-xl bg-stone-50 dark:bg-neutral-800 text-xs text-stone-600 dark:text-stone-300">
                      {req.description}
                    </div>
                  )}

                  {req.staff_notes && (
                    <p className="mt-2 text-[11px] text-stone-400 italic">
                      Staff Note: {req.staff_notes}
                    </p>
                  )}
                </div>

                {/* Status Action Buttons */}
                <div className="mt-5 pt-3 border-t border-stone-100 dark:border-neutral-800 flex flex-wrap gap-1.5">
                  {req.status === 'PENDING' && (
                    <button
                      disabled={isLoading}
                      onClick={() => handleUpdateStatus(req.id, 'ACCEPTED')}
                      className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                    >
                      Accept
                    </button>
                  )}
                  {req.status === 'ACCEPTED' && (
                    <button
                      disabled={isLoading}
                      onClick={() => handleUpdateStatus(req.id, 'IN_PROGRESS')}
                      className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition disabled:opacity-50"
                    >
                      In Progress
                    </button>
                  )}
                  {(req.status === 'ACCEPTED' || req.status === 'IN_PROGRESS') && (
                    <button
                      disabled={isLoading}
                      onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                      className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                    >
                      ✓ Completed
                    </button>
                  )}
                  {req.status !== 'COMPLETED' && req.status !== 'CANCELLED' && (
                    <button
                      disabled={isLoading}
                      onClick={() => handleUpdateStatus(req.id, 'CANCELLED')}
                      className="py-1.5 px-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 transition disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
