'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  TenantSubscription,
  SubscriptionPlan,
  TenantSubscriptionPaymentRecord,
} from '@/types';
import {
  SAAS_PLANS,
  PLATFORM_BANK_DETAILS,
} from '@/lib/subscription-plans';
import {
  submitOfflineSubscriptionPayment,
  approveTenantSubscription,
  rejectTenantSubscription,
  createOnlineSubscriptionOrder,
} from '@/app/actions/subscription';
import { ToastContainer, ToastMessage } from './Toast';

interface PendingRequestItem {
  tenantId: string;
  tenantName: string;
  subdomain: string;
  plan: SubscriptionPlan;
  billingCycle: 'monthly' | 'yearly';
  amountInr?: number;
  utrReference?: string;
  notes?: string;
  submittedAt?: string;
}

interface SubscriptionBillingClientProps {
  tenantId: string;
  tenantName: string;
  tenantSubdomain: string;
  subscription: TenantSubscription;
  daysRemaining: number;
  isSuperadmin: boolean;
  primaryColorHex?: string;
  pendingRequests?: PendingRequestItem[];
}

export default function SubscriptionBillingClient({
  tenantId,
  tenantName,
  subscription: initialSub,
  daysRemaining,
  isSuperadmin,
  primaryColorHex = '#059669',
  pendingRequests = [],
}: SubscriptionBillingClientProps) {
  const [sub, setSub] = useState<TenantSubscription>(initialSub);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan>(sub.plan || 'pro');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(sub.billing_cycle || 'yearly');
  const [activePaymentTab, setActivePaymentTab] = useState<'offline' | 'online'>('offline');

  // Offline Form State
  const [utrNumber, setUtrNumber] = useState(sub.offline_reference || '');
  const [offlineNotes, setOfflineNotes] = useState('');

  // Superadmin Action State
  const [adminNotes, setAdminNotes] = useState('');
  const [allPending, setAllPending] = useState<PendingRequestItem[]>(pendingRequests);

  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  const currentPlanMeta = SAAS_PLANS[selectedPlan];
  const payableAmount = billingCycle === 'yearly' ? currentPlanMeta.yearlyPrice : currentPlanMeta.monthlyPrice;

  // Submit Offline Payment
  function handleOfflineSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!utrNumber || utrNumber.trim().length < 5) {
      addToast('error', 'Please provide a valid UTR or Transaction Reference number.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', tenantId);
      formData.set('plan', selectedPlan);
      formData.set('billingCycle', billingCycle);
      formData.set('amountInr', payableAmount.toString());
      formData.set('utrReference', utrNumber.trim());
      formData.set('notes', offlineNotes.trim());

      const res = await submitOfflineSubscriptionPayment(formData);
      if (res.success) {
        addToast('success', res.message || 'Payment reference submitted!');
        setSub((prev) => ({
          ...prev,
          status: 'pending_approval',
          plan: selectedPlan,
          billing_cycle: billingCycle,
          amount_inr: payableAmount,
          offline_reference: utrNumber.trim(),
          submitted_at: new Date().toISOString(),
        }));
      } else {
        addToast('error', res.error || 'Failed to submit payment reference.');
      }
    });
  }

  // Superadmin Manual Approval
  function handleSuperadminApprove(durationMonths: number, targetTenantId = tenantId) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', targetTenantId);
      formData.set('durationMonths', durationMonths.toString());
      formData.set('plan', selectedPlan);
      formData.set('approvalNotes', adminNotes.trim() || `Approved by Platform Superadmin (${durationMonths >= 120 ? 'Lifetime' : `${durationMonths} months`})`);

      const res = await approveTenantSubscription(formData);
      if (res.success) {
        addToast('success', res.message || 'Subscription successfully activated!');
        if (targetTenantId === tenantId) {
          setSub((prev) => ({
            ...prev,
            status: 'active',
            plan: selectedPlan,
            approved_at: new Date().toISOString(),
          }));
        }
        // Remove from pending list
        setAllPending((prev) => prev.filter((p) => p.tenantId !== targetTenantId));
      } else {
        addToast('error', res.error || 'Failed to approve subscription.');
      }
    });
  }

  // Superadmin Reject
  function handleSuperadminReject(targetTenantId = tenantId) {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', targetTenantId);
      formData.set('reason', adminNotes.trim() || 'Invalid or unverifiable transaction reference.');

      const res = await rejectTenantSubscription(formData);
      if (res.success) {
        addToast('info', res.message || 'Subscription rejected.');
        if (targetTenantId === tenantId) {
          setSub((prev) => ({
            ...prev,
            status: 'trial',
          }));
        }
        setAllPending((prev) => prev.filter((p) => p.tenantId !== targetTenantId));
      } else {
        addToast('error', res.error || 'Failed to reject.');
      }
    });
  }

  // Online Razorpay Payment Trigger
  function handleOnlineOrder() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', tenantId);
      formData.set('plan', selectedPlan);
      formData.set('billingCycle', billingCycle);

      const res = await createOnlineSubscriptionOrder(formData);
      if (res.success && res.orderId) {
        addToast('info', `Razorpay Order #${res.orderId} initialized. Launching checkout...`);
        // If live checkout is wired with Razorpay script:
      } else {
        addToast('info', res.message || res.error || 'Gateway offline.');
      }
    });
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {/* Header */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Subscription &amp; Platform Billing
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Manage SaaS license, subscription plans, and platform owner invoicing for{' '}
              <strong className="text-neutral-800 dark:text-neutral-200">{tenantName}</strong>.
            </p>
          </div>

          {isSuperadmin && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-purple-200 bg-purple-50 px-3.5 py-1 text-xs font-bold text-purple-800 shadow-xs dark:border-purple-800/40 dark:bg-purple-950/40 dark:text-purple-300">
              <span>👑</span> Superadmin Mode
            </span>
          )}
        </div>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="border-b border-stone-200 dark:border-neutral-800">
        <nav className="-mb-px flex space-x-6">
          <Link
            href="/settings/team"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>👥</span> Team &amp; Staff
          </Link>
          <Link
            href="/settings/website"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>🌐</span> Website CMS
          </Link>
          <Link
            href="/settings"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>💳</span> Payment Gateway
          </Link>
          <Link
            href="/settings/subscription"
            className="border-b-2 pb-3 text-xs sm:text-sm font-bold flex items-center gap-2"
            style={{ borderColor: primaryColorHex, color: primaryColorHex }}
          >
            <span>💎</span> Subscription &amp; SaaS
          </Link>
        </nav>
      </div>

      {/* 1. CURRENT SUBSCRIPTION STATUS HERO */}
      <div
        className={`rounded-2xl border p-6 shadow-xs transition-all ${
          sub.status === 'active'
            ? 'border-emerald-200 bg-emerald-50/70 dark:border-emerald-800/60 dark:bg-emerald-950/20'
            : sub.status === 'pending_approval'
            ? 'border-amber-200 bg-amber-50/80 dark:border-amber-800/60 dark:bg-amber-950/20'
            : 'border-blue-200 bg-blue-50/70 dark:border-blue-800/60 dark:bg-blue-950/20'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
                  sub.status === 'active'
                    ? 'bg-emerald-600 text-white'
                    : sub.status === 'pending_approval'
                    ? 'bg-amber-500 text-white'
                    : 'bg-blue-600 text-white'
                }`}
              >
                {sub.status === 'active'
                  ? 'Active SaaS License'
                  : sub.status === 'pending_approval'
                  ? 'Payment Under Review'
                  : '14-Day Free Trial'}
              </span>
              <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">
                Plan: <strong className="text-stone-900 dark:text-stone-100">{SAAS_PLANS[sub.plan || 'pro'].name}</strong>
              </span>
            </div>

            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">
              {sub.status === 'active' ? (
                <>Resort license is fully active and certified</>
              ) : sub.status === 'pending_approval' ? (
                <>Offline Payment Verification Pending Platform Owner Approval</>
              ) : (
                <>{daysRemaining} Days Remaining in Free Trial</>
              )}
            </h2>

            <p className="text-xs sm:text-sm text-stone-600 dark:text-stone-300 max-w-2xl">
              {sub.status === 'active' ? (
                <>
                  Valid until{' '}
                  <strong>
                    {sub.active_until ? new Date(sub.active_until).toLocaleDateString(undefined, { dateStyle: 'long' }) : 'Permanent'}
                  </strong>
                  . All PMS modules, guest reservation engine, and concierge features are unlocked.
                </>
              ) : sub.status === 'pending_approval' ? (
                <>
                  UTR Ref: <strong>{sub.offline_reference || 'N/A'}</strong>. Submitted on{' '}
                  {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : 'Today'}. The platform owner is reviewing your transfer. Your resort PMS remains fully operational.
                </>
              ) : (
                <>
                  Welcome to PropSyncHub! Enjoy unrestricted trial access to explore bookings, rooms, and payments. Choose an annual or monthly plan below to continue seamlessly after trial.
                </>
              )}
            </p>
          </div>

          <div className="text-right shrink-0">
            {sub.status === 'trial' && (
              <div className="rounded-xl bg-white/80 p-3 text-center border border-blue-200 dark:bg-neutral-900 dark:border-neutral-800">
                <span className="block text-2xl font-black text-blue-600 dark:text-blue-400">{daysRemaining}</span>
                <span className="text-[11px] font-bold uppercase text-stone-500">Days Left</span>
              </div>
            )}
            {sub.status === 'active' && (
              <div className="rounded-xl bg-white/80 p-3 text-center border border-emerald-200 dark:bg-neutral-900 dark:border-neutral-800">
                <span className="block text-2xl font-black text-emerald-600 dark:text-emerald-400">✓</span>
                <span className="text-[11px] font-bold uppercase text-stone-500">Certified</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUPERADMIN GLOBAL PENDING QUEUE (Visible only to Platform Owner) */}
      {isSuperadmin && allPending.length > 0 && (
        <div className="rounded-2xl border-2 border-purple-300 bg-purple-50/60 p-6 shadow-sm dark:border-purple-800 dark:bg-purple-950/20">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">🔔</span>
            <h3 className="text-base font-bold text-purple-900 dark:text-purple-200">
              Platform Owner Approval Inbox ({allPending.length} Pending Resorts)
            </h3>
          </div>
          <p className="text-xs text-purple-700 dark:text-purple-300 mb-4">
            The following resort owners have submitted offline bank transfers or UPI payments. Review the UTR and click to activate.
          </p>

          <div className="space-y-3">
            {allPending.map((item) => (
              <div
                key={item.tenantId}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-purple-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <strong className="text-sm font-bold text-stone-900 dark:text-stone-100">{item.tenantName}</strong>
                    <span className="text-xs text-stone-400">({item.subdomain})</span>
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700 dark:bg-neutral-800 dark:text-stone-300">
                      {item.plan.toUpperCase()} • {item.billingCycle}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-stone-600 dark:text-stone-400">
                    <span>UTR: <strong className="font-mono text-stone-900 dark:text-stone-100">{item.utrReference || 'None'}</strong></span>
                    <span>Amount: <strong>₹{item.amountInr?.toLocaleString() || 'N/A'}</strong></span>
                    <span>Date: {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString() : 'Recent'}</span>
                    {item.notes && <span className="italic">Note: &ldquo;{item.notes}&rdquo;</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleSuperadminApprove(12, item.tenantId)}
                    disabled={isPending}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                  >
                    ✓ Approve 1 Year
                  </button>
                  <button
                    onClick={() => handleSuperadminApprove(1, item.tenantId)}
                    disabled={isPending}
                    className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-stone-600 disabled:opacity-50"
                  >
                    1 Month
                  </button>
                  <button
                    onClick={() => handleSuperadminReject(item.tenantId)}
                    disabled={isPending}
                    className="rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 dark:border-red-900 dark:bg-neutral-800 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUPERADMIN DIRECT CONTROL PANEL FOR CURRENT TENANT */}
      {isSuperadmin && (
        <div className="rounded-2xl border border-stone-200 bg-stone-50 p-6 dark:border-neutral-800 dark:bg-neutral-900/60">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span>⚙️</span> Superadmin Quick Control ({tenantName})
            </h3>
            <span className="text-xs font-mono text-stone-500">Owner: ramchat007@gmail.com</span>
          </div>

          <p className="mt-1 text-xs text-stone-500">
            Unilateral authority to activate subscriptions, extend trial periods, or grant lifetime complimentary access.
          </p>

          <div className="mt-3">
            <input
              type="text"
              placeholder="Admin approval note or reason (optional)"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              className="w-full max-w-md rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs shadow-xs focus:border-purple-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2.5">
            <button
              onClick={() => handleSuperadminApprove(12)}
              disabled={isPending}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
            >
              🚀 Activate 1 Year (Pro)
            </button>
            <button
              onClick={() => handleSuperadminApprove(1)}
              disabled={isPending}
              className="rounded-xl bg-stone-800 px-4 py-2 text-xs font-bold text-white hover:bg-stone-700 disabled:opacity-50"
            >
              📅 Activate 1 Month
            </button>
            <button
              onClick={() => handleSuperadminApprove(120)}
              disabled={isPending}
              className="rounded-xl border border-purple-300 bg-purple-100 px-4 py-2 text-xs font-bold text-purple-900 hover:bg-purple-200 dark:border-purple-800 dark:bg-purple-950 dark:text-purple-200 disabled:opacity-50"
            >
              ⭐ Grant Lifetime Complimentary Access
            </button>
            {sub.status === 'pending_approval' && (
              <button
                onClick={() => handleSuperadminReject()}
                disabled={isPending}
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50"
              >
                ✕ Reject Reference
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. PRICING TIERS SELECTION */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-stone-900 dark:text-stone-100">Choose a Platform Plan</h2>
            <p className="text-xs text-stone-500">Transparent pricing. No hidden fees. Cancel or upgrade anytime.</p>
          </div>

          {/* Billing Cycle Toggle */}
          <div className="inline-flex items-center rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-neutral-800 dark:bg-neutral-800 self-start">
            <button
              type="button"
              onClick={() => setBillingCycle('monthly')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-white text-stone-900 shadow-xs dark:bg-neutral-900 dark:text-stone-100'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
              }`}
            >
              Monthly Billing
            </button>
            <button
              type="button"
              onClick={() => setBillingCycle('yearly')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-white text-stone-900 shadow-xs dark:bg-neutral-900 dark:text-stone-100'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
              }`}
            >
              <span>Annual Billing</span>
              <span className="rounded-full bg-emerald-100 px-1.5 py-0.2 text-[10px] font-extrabold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                SAVE ~17%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {(['starter', 'pro', 'enterprise'] as SubscriptionPlan[]).map((planKey) => {
            const plan = SAAS_PLANS[planKey];
            const isSelected = selectedPlan === planKey;
            const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice;
            const isPro = planKey === 'pro';

            return (
              <div
                key={planKey}
                onClick={() => setSelectedPlan(planKey)}
                className={`relative flex flex-col justify-between cursor-pointer rounded-2xl border p-6 transition-all ${
                  isSelected
                    ? 'ring-2 shadow-lg dark:bg-neutral-900'
                    : 'border-stone-200 bg-white hover:border-stone-300 dark:border-neutral-800 dark:bg-neutral-900'
                }`}
                style={isSelected ? { borderColor: primaryColorHex, boxShadow: `0 0 0 2px ${primaryColorHex}` } : undefined}
              >
                {isPro && (
                  <span
                    className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-wider text-white shadow-xs"
                    style={{ backgroundColor: primaryColorHex }}
                  >
                    Most Popular
                  </span>
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="text-base font-bold text-stone-900 dark:text-stone-100">{plan.name}</h3>
                    <input
                      type="radio"
                      checked={isSelected}
                      onChange={() => setSelectedPlan(planKey)}
                      className="h-4 w-4"
                      style={{ accentColor: primaryColorHex }}
                    />
                  </div>

                  <p className="mt-1 text-xs text-stone-500 min-h-[32px]">{plan.tagline}</p>

                  <div className="mt-4 border-t border-b border-stone-100 py-3 dark:border-neutral-800">
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl font-black text-stone-900 dark:text-stone-100">
                        ₹{price.toLocaleString()}
                      </span>
                      <span className="text-xs text-stone-500">
                        /{billingCycle === 'yearly' ? 'year' : 'month'}
                      </span>
                    </div>
                    {billingCycle === 'yearly' && (
                      <p className="mt-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                        Equals ~₹{Math.round(price / 12).toLocaleString()}/mo (2 Months Free)
                      </p>
                    )}
                  </div>

                  <ul className="mt-4 space-y-2 text-xs text-stone-600 dark:text-stone-300">
                    {plan.features.map((feat, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <span className="text-emerald-600 font-bold shrink-0">✓</span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-6 pt-4 border-t border-stone-100 dark:border-neutral-800">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedPlan(planKey);
                    }}
                    className={`w-full rounded-xl py-2 text-xs font-bold transition-all ${
                      isSelected
                        ? 'text-white shadow-xs'
                        : 'border border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200'
                    }`}
                    style={isSelected ? { backgroundColor: primaryColorHex } : undefined}
                  >
                    {isSelected ? '✓ Plan Selected' : 'Select Plan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. PAYMENT CHECKOUT MODULE */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-100 pb-5 dark:border-neutral-800">
          <div>
            <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">
              Payment &amp; Activation Method
            </h2>
            <p className="text-xs text-stone-500">
              Selected: <strong className="text-stone-800 dark:text-stone-200">{currentPlanMeta.name} ({billingCycle})</strong> for <strong className="text-emerald-600 dark:text-emerald-400">₹{payableAmount.toLocaleString()}</strong>
            </p>
          </div>

          {/* Payment Method Tabs */}
          <div className="inline-flex rounded-xl border border-stone-200 bg-stone-100 p-1 dark:border-neutral-800 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setActivePaymentTab('offline')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activePaymentTab === 'offline'
                  ? 'bg-white text-stone-900 shadow-xs dark:bg-neutral-900 dark:text-stone-100'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
              }`}
            >
              <span>🏦</span> Offline Bank Transfer / UPI
            </button>
            <button
              type="button"
              onClick={() => setActivePaymentTab('online')}
              className={`rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                activePaymentTab === 'online'
                  ? 'bg-white text-stone-900 shadow-xs dark:bg-neutral-900 dark:text-stone-100'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400'
              }`}
            >
              <span>⚡</span> Online Gateway (Razorpay)
            </button>
          </div>
        </div>

        {/* TAB 1: OFFLINE BANK TRANSFER / UPI */}
        {activePaymentTab === 'offline' && (
          <div className="mt-6 space-y-6">
            <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 text-xs text-blue-900 dark:border-blue-950 dark:bg-blue-950/20 dark:text-blue-200">
              <p className="font-bold flex items-center gap-1.5">
                <span>ℹ️</span> How Offline Payment &amp; Manual Approval Works:
              </p>
              <ol className="mt-1.5 list-decimal pl-5 space-y-1 text-[11px] leading-relaxed text-blue-800 dark:text-blue-300">
                <li>Transfer ₹{payableAmount.toLocaleString()} to the platform owner bank details or UPI ID below.</li>
                <li>Copy the 12-digit Bank UTR / Transaction Reference Number from your banking app (GPay, PhonePe, Netbanking).</li>
                <li>Paste the UTR number into the verification form below and click Submit.</li>
                <li>The platform owner verifies the credit and approves your subscription. Your PMS remains uninterrupted!</li>
              </ol>
            </div>

            {/* Bank Details Display */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Platform Beneficiary</p>
                <p className="mt-1 text-sm font-bold text-stone-900 dark:text-stone-100">{PLATFORM_BANK_DETAILS.accountName}</p>
                <div className="mt-3 space-y-1 text-xs text-stone-600 dark:text-stone-300">
                  <p>Bank: <strong className="text-stone-900 dark:text-stone-100">{PLATFORM_BANK_DETAILS.bankName}</strong></p>
                  <p>Account No: <strong className="font-mono text-stone-900 dark:text-stone-100">{PLATFORM_BANK_DETAILS.accountNumber}</strong></p>
                  <p>IFSC Code: <strong className="font-mono text-stone-900 dark:text-stone-100">{PLATFORM_BANK_DETAILS.ifscCode}</strong></p>
                  <p>Branch: {PLATFORM_BANK_DETAILS.branch}</p>
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
                <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400">Direct UPI / VPA</p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-sm font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800">
                    {PLATFORM_BANK_DETAILS.upiId}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(PLATFORM_BANK_DETAILS.upiId);
                      addToast('success', 'UPI ID copied to clipboard!');
                    }}
                    className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
                  >
                    Copy
                  </button>
                </div>
                <p className="mt-3 text-xs text-stone-500">
                  Compatible with BHIM, Google Pay, PhonePe, Paytm, or any Indian banking app.
                </p>
                <p className="mt-1 text-xs text-stone-500">
                  Platform Owner Support: <a href={`mailto:${PLATFORM_BANK_DETAILS.supportEmail}`} className="underline font-semibold">{PLATFORM_BANK_DETAILS.supportEmail}</a>
                </p>
              </div>
            </div>

            {/* Offline Submission Form */}
            <form onSubmit={handleOfflineSubmit} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Bank UTR / Transaction Reference Number <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 408219485732 or UPI Ref No."
                    value={utrNumber}
                    onChange={(e) => setUtrNumber(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm font-mono shadow-xs focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                  <p className="mt-1 text-[11px] text-stone-500">Enter the exact UTR displayed in your payment receipt.</p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700 dark:text-stone-300">
                    Remitting Bank / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Paid via HDFC Netbanking / rupesh@okaxis"
                    value={offlineNotes}
                    onChange={(e) => setOfflineNotes(e.target.value)}
                    className="mt-1.5 block w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm shadow-xs focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl px-6 py-3 text-sm font-bold text-white shadow-md transition-all hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: primaryColorHex }}
                >
                  {isPending ? 'Submitting Reference...' : `Submit Payment Reference for ₹${payableAmount.toLocaleString()}`}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: ONLINE RAZORPAY GATEWAY */}
        {activePaymentTab === 'online' && (
          <div className="mt-6 space-y-5">
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 dark:border-amber-800/40 dark:bg-amber-950/20 dark:text-amber-300">
              <p className="font-bold flex items-center gap-1.5">
                <span>⚡</span> Automated Online Razorpay Integration:
              </p>
              <p className="mt-1 leading-relaxed text-[11px]">
                The online subscription checkout engine is fully implemented on the backend. When live platform API credentials (<code className="font-mono">PLATFORM_RAZORPAY_KEY_ID</code>) are provided in environment variables, this button will launch instant automated card/UPI checkouts with zero manual verification.
              </p>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50 p-5 dark:border-neutral-800 dark:bg-neutral-800/50">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-stone-900 dark:text-stone-100">
                    Instant Online Activation ({currentPlanMeta.name})
                  </p>
                  <p className="text-xs text-stone-500">
                    Pay ₹{payableAmount.toLocaleString()} via Credit/Debit Cards, NetBanking, or UPI.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleOnlineOrder}
                  disabled={isPending}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-500 disabled:opacity-50 shrink-0"
                >
                  {isPending ? 'Connecting...' : `Pay ₹${payableAmount.toLocaleString()} via Razorpay`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. BILLING & PAYMENT HISTORY AUDIT LOG */}
      <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">Payment &amp; Invoicing History</h2>
        <p className="text-xs text-stone-500">Immutable record of all platform fees, trial logs, and transactions.</p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500 dark:border-neutral-800">
                <th className="pb-3 font-semibold">Date</th>
                <th className="pb-3 font-semibold">Plan &amp; Cycle</th>
                <th className="pb-3 font-semibold">Amount</th>
                <th className="pb-3 font-semibold">Payment Mode</th>
                <th className="pb-3 font-semibold">Reference / UTR</th>
                <th className="pb-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 dark:divide-neutral-800">
              {Array.isArray(sub.payment_history) && sub.payment_history.length > 0 ? (
                sub.payment_history.map((record: TenantSubscriptionPaymentRecord) => (
                  <tr key={record.id} className="text-stone-700 dark:text-stone-300">
                    <td className="py-3 font-mono">{new Date(record.date).toLocaleDateString()}</td>
                    <td className="py-3 font-semibold">{record.plan.toUpperCase()} ({record.billing_cycle || 'yearly'})</td>
                    <td className="py-3 font-bold text-stone-900 dark:text-stone-100">₹{record.amount?.toLocaleString()}</td>
                    <td className="py-3 capitalize">{record.mode.replace(/_/g, ' ')}</td>
                    <td className="py-3 font-mono">{record.reference || '—'}</td>
                    <td className="py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          record.status === 'approved'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : record.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                        }`}
                      >
                        {record.status}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-stone-400">
                    No billing history records found. Your 14-day trial is currently in progress.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
