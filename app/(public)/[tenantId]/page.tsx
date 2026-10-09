import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import { resolveTenantFromParam } from '@/lib/tenant-resolver';
import ResortShowcaseClient from '@/components/public/ResortShowcaseClient';
import { Room, RoomCategory } from '@/types';
import { getResortActivities } from '@/app/actions/activities';
import { getResortReviews } from '@/app/actions/reviews';

export const dynamic = 'force-dynamic';

interface TenantPageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default async function TenantHomePage({ params }: TenantPageProps) {
  const { tenantId } = await params;
  const decodedTenantParam = decodeURIComponent(tenantId);

  const adminDb = createAdminClient();

  // 1. Resolve Tenant securely with strict isolation
  const tenant = await resolveTenantFromParam(decodedTenantParam);

  if (!tenant) {
    notFound();
  }

  // 2. Fetch Rooms, Categories, Activities, and Reviews in parallel
  const [roomsRes, catRes, actRes, revRes] = await Promise.all([
    adminDb.from('rooms').select('*').eq('tenant_id', tenant.id).order('created_at', { ascending: false }),
    adminDb.from('room_categories').select('*').eq('tenant_id', tenant.id),
    getResortActivities(tenant.id),
    getResortReviews(tenant.id, false),
  ]);

  const rooms: Room[] = (roomsRes.data as unknown as Room[]) || [];
  const categories: RoomCategory[] = (catRes.data as unknown as RoomCategory[]) || [];
  const activities = actRes.success && actRes.data ? actRes.data : [];
  const reviews = revRes.success && revRes.data ? revRes.data : [];

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-neutral-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-800 border-t-transparent" />
        </div>
      }
    >
      <ResortShowcaseClient
        tenant={tenant}
        rooms={rooms}
        categories={categories}
        tenantParam={decodedTenantParam}
        activities={activities}
        reviews={reviews}
      />
    </Suspense>
  );
}
