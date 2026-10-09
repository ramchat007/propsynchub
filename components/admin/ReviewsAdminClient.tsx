'use client';

import React, { useState } from 'react';
import { ResortReview } from '@/types';
import { moderateReview } from '@/app/actions/reviews';

interface ReviewsAdminClientProps {
  tenantId: string;
  initialReviews: ResortReview[];
}

export default function ReviewsAdminClient({
  tenantId,
  initialReviews,
}: ReviewsAdminClientProps) {
  const [reviews, setReviews] = useState<ResortReview[]>(initialReviews);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const avgRating =
    reviews.length > 0
      ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
      : '5.0';

  const publishedCount = reviews.filter((r) => r.is_approved).length;

  const handleModerate = async (reviewId: string, approve: boolean) => {
    setLoadingId(reviewId);
    const res = await moderateReview(tenantId, reviewId, approve);
    if (res.success) {
      setReviews((prev) =>
        prev.map((r) => (r.id === reviewId ? { ...r, is_approved: approve } : r))
      );
    } else {
      alert(res.error || 'Failed to update review status');
    }
    setLoadingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
          <p className="text-xs font-semibold text-stone-500 uppercase">Average Rating</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-2xl font-black text-amber-500">★ {avgRating}</span>
            <span className="text-xs text-stone-400 font-semibold">/ 5.0</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-sm">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 uppercase">Published to Website</p>
          <p className="mt-1 text-2xl font-black text-emerald-700 dark:text-emerald-400">{publishedCount}</p>
        </div>
        <div className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm">
          <p className="text-xs font-semibold text-stone-500 uppercase">Total Guest Reviews</p>
          <p className="mt-1 text-2xl font-black text-stone-900 dark:text-white">{reviews.length}</p>
        </div>
      </div>

      {/* Reviews List */}
      <div className="space-y-4">
        {reviews.length === 0 ? (
          <div className="p-12 text-center rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
            <span className="text-3xl">⭐</span>
            <p className="mt-2 text-stone-500 text-xs font-bold">No guest reviews submitted yet.</p>
          </div>
        ) : (
          reviews.map((rev) => {
            const isLoading = loadingId === rev.id;

            return (
              <div
                key={rev.id}
                className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500 font-black text-sm">
                      {'★'.repeat(rev.rating)}
                      {'☆'.repeat(5 - rev.rating)}
                    </span>
                    <span className="text-xs font-bold text-stone-900 dark:text-white">{rev.guest_name}</span>
                    <span className="text-[10px] text-stone-400">
                      • {new Date(rev.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-300 leading-relaxed font-normal">
                    &ldquo;{rev.comment}&rdquo;
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${
                      rev.is_approved
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-stone-400'
                    }`}
                  >
                    {rev.is_approved ? '✓ Published' : 'Hidden'}
                  </span>

                  {rev.is_approved ? (
                    <button
                      disabled={isLoading}
                      onClick={() => handleModerate(rev.id, false)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-neutral-800 dark:text-stone-300 transition disabled:opacity-50"
                    >
                      Hide
                    </button>
                  ) : (
                    <button
                      disabled={isLoading}
                      onClick={() => handleModerate(rev.id, true)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                    >
                      Publish
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
