import React from 'react';
import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import RazorpaySettingsClient from '@/components/admin/RazorpaySettingsClient';
import { getTenantRazorpayStatus } from '@/app/actions/payment';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login?redirectTo=/settings');
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 2. Resolve User Profile & Tenant ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'staff') {
    redirect('/dashboard');
  }

  let tenantId = profile?.tenant_id && UUID_REGEX.test(profile.tenant_id) ? profile.tenant_id : undefined;
  if (!tenantId) {
    const envId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;
    if (envId && UUID_REGEX.test(envId)) {
      tenantId = envId;
    }
  }

  let tenantName = 'Resort Administration';
  if (tenantId) {
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenant) tenantName = tenant.name;
  } else {
    const { data: anyTenants } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('is_active', true)
      .limit(1);

    if (anyTenants && anyTenants.length > 0 && anyTenants[0]) {
      tenantId = anyTenants[0].id;
      tenantName = anyTenants[0].name;
    }
  }

  if (!tenantId) {
    return (
      <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-bold">No active tenant found</h2>
        <p className="mt-1 text-xs text-neutral-500">
          Please initialize a resort first from the Dashboard.
        </p>
      </div>
    );
  }

  // 3. Fetch current Razorpay configuration status (masked secret)
  const status = await getTenantRazorpayStatus(tenantId);

  return (
    <RazorpaySettingsClient
      tenantId={tenantId}
      tenantName={tenantName}
      initialKeyId={status.keyId}
      initialMaskedSecret={status.maskedSecret}
      isConfigured={status.configured}
    />
  );
}
