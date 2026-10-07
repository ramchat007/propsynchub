import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import ResortShowcaseClient from '@/components/public/ResortShowcaseClient';
import { Tenant, Room, RoomCategory } from '@/types';

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

  // 1. Resolve Tenant from Supabase (by id, subdomain, or custom_domain)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedTenantParam);

  let tenantQuery = adminDb.from('tenants').select('*');
  if (isUuid) {
    tenantQuery = tenantQuery.eq('id', decodedTenantParam);
  } else {
    tenantQuery = tenantQuery.or(`subdomain.eq.${decodedTenantParam},custom_domain.eq.${decodedTenantParam}`);
  }

  const { data: tenantData } = await tenantQuery.maybeSingle();
  let tenant: Tenant | null = tenantData;

  // Fallback to active tenant if not matched directly
  if (!tenant) {
    const { data: fallbackTenants } = await adminDb
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (fallbackTenants && fallbackTenants.length > 0 && fallbackTenants[0]) {
      tenant = fallbackTenants[0];
    }
  }

  if (!tenant) {
    notFound();
  }

  // 2. Fetch Rooms for this Resort
  const { data: rawRooms } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', tenant.id)
    .order('created_at', { ascending: false });

  const rooms: Room[] = (rawRooms as unknown as Room[]) || [];

  // 3. Fetch Categories
  const { data: rawCategories } = await adminDb
    .from('room_categories')
    .select('*')
    .eq('tenant_id', tenant.id);

  const categories: RoomCategory[] = (rawCategories as unknown as RoomCategory[]) || [];

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
      />
    </Suspense>
  );
}
