import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getResortActivities, getActivityBookings } from '@/app/actions/activities';
import ActivitiesAdminClient from '@/components/admin/ActivitiesAdminClient';

export const dynamic = 'force-dynamic';

export default async function ActivitiesPage() {
  const auth = await requireAdminAuth('/activities');

  const [actRes, bookRes] = await Promise.all([
    getResortActivities(auth.tenantId!),
    getActivityBookings(auth.tenantId!),
  ]);

  const activities = actRes.success && actRes.data ? actRes.data : [];
  const bookings = bookRes.success && bookRes.data ? bookRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900 dark:text-white">Resort Activities & Experiences</h1>
        <p className="text-xs text-stone-500 mt-1">
          Coordinate guest experience reservations, eco-tours, wellness sessions, and add-ons for {auth.tenant?.name || 'Resort'}.
        </p>
      </div>

      <ActivitiesAdminClient
        tenantId={auth.tenantId!}
        initialActivities={activities}
        initialBookings={bookings}
      />
    </div>
  );
}
