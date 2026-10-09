import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { resolveTenantFromParam } from '@/lib/tenant-resolver';
import BookingInterfaceClient from '@/components/public/BookingInterfaceClient';
export const dynamic = 'force-dynamic';

interface BookingPageProps {
  params: Promise<{
    tenantId: string;
  }>;
}

export default async function TenantBookingPage({ params }: BookingPageProps) {
  const { tenantId } = await params;
  const decodedTenantParam = decodeURIComponent(tenantId);

  const supabase = await createServerSupabaseClient();

  // 1. Resolve Tenant securely with strict isolation
  const tenant = await resolveTenantFromParam(decodedTenantParam);

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
