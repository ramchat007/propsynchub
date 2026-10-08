import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getTenantSubscription, getPendingSubscriptionRequests } from '@/app/actions/subscription';
import { isSuperadmin } from '@/lib/subscription-plans';
import SubscriptionBillingClient from '@/components/admin/SubscriptionBillingClient';

export const dynamic = 'force-dynamic';

export default async function SubscriptionSettingsPage() {
  const auth = await requireAdminAuth('/settings/subscription');

  // Role Guard: Front desk staff cannot access billing or subscription controls
  if (auth.role === 'staff') {
    redirect('/dashboard');
  }

  const tenantId = auth.tenantId!;
  const tenantName = auth.tenant?.name || 'Resort Administration';
  const tenantSubdomain = auth.tenant?.subdomain || 'resort';

  const userEmail = (auth.user?.email || '').toLowerCase().trim();
  const userIsSuperadmin = isSuperadmin(userEmail);

  // Fetch subscription details
  const subResult = await getTenantSubscription(tenantId);
  const subscription = subResult.success && subResult.subscription
    ? subResult.subscription
    : {
        status: 'trial' as const,
        plan: 'pro' as const,
        billing_cycle: 'yearly' as const,
        trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        payment_mode: 'free_trial' as const,
        amount_inr: 0,
      };

  const daysRemaining = subResult.daysRemaining !== undefined ? subResult.daysRemaining : 14;
  const primaryColorHex =
    (auth.tenant?.settings?.primary_color_hex as string) ||
    (auth.tenant?.settings?.primaryColorHex as string) ||
    '#059669';

  // Fetch all pending requests across platform if superadmin
  let pendingRequests: Array<{
    tenantId: string;
    tenantName: string;
    subdomain: string;
    plan: 'starter' | 'pro' | 'enterprise';
    billingCycle: 'monthly' | 'yearly';
    amountInr?: number;
    utrReference?: string;
    notes?: string;
    submittedAt?: string;
  }> = [];

  if (userIsSuperadmin) {
    const pendingRes = await getPendingSubscriptionRequests();
    if (pendingRes.success && pendingRes.data) {
      pendingRequests = pendingRes.data;
    }
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <SubscriptionBillingClient
        tenantId={tenantId}
        tenantName={tenantName}
        tenantSubdomain={tenantSubdomain}
        subscription={subscription}
        daysRemaining={daysRemaining}
        isSuperadmin={userIsSuperadmin}
        primaryColorHex={primaryColorHex}
        pendingRequests={pendingRequests}
      />
    </div>
  );
}
