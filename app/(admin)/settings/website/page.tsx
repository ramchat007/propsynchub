import React from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import ResortWebsiteCmsClient from '@/components/admin/ResortWebsiteCmsClient';
import { Tenant } from '@/types';

export const dynamic = 'force-dynamic';

export default async function ResortWebsiteCmsPage() {
  const supabase = await createServerSupabaseClient();
  const adminDb = createAdminClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/settings/website');
  }

  // 2. Resolve User Profile & Tenant ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  const tenantId = profile?.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  let tenant: Tenant | null = null;
  if (tenantId) {
    const { data: tenantData } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantData) tenant = tenantData as unknown as Tenant;
  }

  if (!tenant) {
    const { data: fallbackTenants } = await adminDb
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (fallbackTenants && fallbackTenants[0]) {
      tenant = fallbackTenants[0] as unknown as Tenant;
    }
  }

  if (!tenant) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-bold">No active resort found</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Please complete resort onboarding or initialize demo data.
        </p>
      </div>
    );
  }

  return <ResortWebsiteCmsClient tenant={tenant} />;
}
