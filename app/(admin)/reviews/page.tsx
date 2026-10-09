import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getResortReviews } from '@/app/actions/reviews';
import ReviewsAdminClient from '@/components/admin/ReviewsAdminClient';

export const dynamic = 'force-dynamic';

export default async function ReviewsPage() {
  const auth = await requireAdminAuth('/reviews');
  // Load all reviews including unapproved ones for moderation desk
  const revRes = await getResortReviews(auth.tenantId!, true);
  const reviews = revRes.success && revRes.data ? revRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900 dark:text-white">Guest Reviews & Feedback</h1>
        <p className="text-xs text-stone-500 mt-1">
          Moderate verified guest stay reviews and publish testimonials to the public resort landing page for {auth.tenant?.name || 'Resort'}.
        </p>
      </div>

      <ReviewsAdminClient
        tenantId={auth.tenantId!}
        initialReviews={reviews}
      />
    </div>
  );
}
