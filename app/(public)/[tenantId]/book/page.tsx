import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import BookingInterfaceClient from '@/components/public/BookingInterfaceClient';
import { Tenant } from '@/types';

export const dynamic = 'force-dynamic';

interface BookingPageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default async function TenantBookingPage({ params }: BookingPageProps) {
  const { tenantId } = await params;
  const decodedTenantParam = decodeURIComponent(tenantId);

  const adminDb = createAdminClient();
  const supabase = await createServerSupabaseClient();

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

  // Fallback: If not found by custom domain/subdomain, check first active tenant or fallback demo
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

  const DEFAULT_FALLBACK_TENANT: Tenant = {
    id: '2f002373-c7f2-4127-842f-4bb20d7a1b64',
    name: 'Raigad Tropical',
    subdomain: 'raigad-tropical',
    custom_domain: null,
    contact_email: 'contact@raigadtropical.com',
    contact_phone: '+91 98000 00000',
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    settings: {
      address: 'Alibaug-Murud Coastal Road, Raigad, Maharashtra 402401',
      hero_title: 'Raigad Tropical Resort & Luxury Villas',
      hero_subtitle: 'Experience coastal tranquility, coconut groves, and private pool luxury.',
      primary_color: '#047857',
    },
  };

  if (!tenant) {
    if (
      decodedTenantParam.toLowerCase() === 'raigad-tropical' ||
      decodedTenantParam === '2f002373-c7f2-4127-842f-4bb20d7a1b64' ||
      !decodedTenantParam
    ) {
      tenant = DEFAULT_FALLBACK_TENANT;
    }
  }

  if (!tenant) {
    notFound();
  }

  // 2. Check current Supabase Auth session for initialUser
  const { data: { user } } = await supabase.auth.getUser();

  let initialUser = null;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, mobile_number')
      .eq('id', user.id)
      .maybeSingle();

    initialUser = {
      id: user.id,
      email: user.email || '',
      phone: user.phone || profile?.mobile_number || '',
      fullName: profile?.full_name || '',
    };
  }

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <BookingInterfaceClient
        tenant={tenant}
        tenantParam={decodedTenantParam}
        initialUser={initialUser}
      />
    </Suspense>
  );
}
