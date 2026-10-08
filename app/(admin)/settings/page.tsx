import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import RazorpaySettingsClient from '@/components/admin/RazorpaySettingsClient';
import { getTenantRazorpayStatus } from '@/app/actions/payment';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const auth = await requireAdminAuth('/settings');

  // P1.3 Role Guard: Staff cannot view or edit financial credentials
  if (auth.role === 'staff') {
    redirect('/dashboard');
  }

  const tenantId = auth.tenantId!;
  const tenantName = auth.tenant?.name || 'Resort Administration';

  // Fetch current Razorpay configuration status (masked secret)
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
