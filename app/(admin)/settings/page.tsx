import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import ResortSettingsClient from '@/components/admin/ResortSettingsClient';
import { getTenantRazorpayStatus } from '@/app/actions/payment';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const auth = await requireAdminAuth('/settings');

  // P1.3 Role Guard: Staff cannot view or edit financial credentials
  if (auth.role === 'staff') {
    redirect('/dashboard');
  }

  const tenantId = auth.tenantId!;
  const tenant = auth.tenant;

  if (!tenant) {
    redirect('/dashboard');
  }

  // Fetch current Razorpay configuration status (masked secret)
  const status = await getTenantRazorpayStatus(tenantId);

  return (
    <ResortSettingsClient
      tenant={tenant}
      razorpayKeyId={status.keyId}
      razorpayMaskedSecret={status.maskedSecret}
      isRazorpayConfigured={status.configured}
    />
  );
}
