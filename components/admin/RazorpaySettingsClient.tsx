'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { saveTenantRazorpayKeys } from '@/app/actions/payment';
import { ToastContainer, ToastMessage } from './Toast';

interface RazorpaySettingsClientProps {
  tenantId: string;
  tenantName: string;
  initialKeyId: string | null;
  initialMaskedSecret: string | null;
  isConfigured: boolean;
}

export default function RazorpaySettingsClient({
  tenantId,
  tenantName,
  initialKeyId,
  initialMaskedSecret,
  isConfigured: initialConfigured,
}: RazorpaySettingsClientProps) {
  const [keyId, setKeyId] = useState(initialKeyId || '');
  const [keySecret, setKeySecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isConfigured, setIsConfigured] = useState(initialConfigured);
  const [maskedSecret, setMaskedSecret] = useState(initialMaskedSecret);

  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function handleSaveKeys(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);

    startTransition(async () => {
      const res = await saveTenantRazorpayKeys(formData);
      if (res.success) {
        addToast('success', res.message || 'Razorpay Test keys saved.');
        setIsConfigured(true);
        if (keySecret) {
          setMaskedSecret(
            keySecret.length > 4 ? `••••••••${keySecret.slice(-4)}` : '••••••••••••'
          );
          setKeySecret(''); // clear raw input after save
        }
      } else {
        addToast('error', res.error || 'Failed to save Razorpay keys.');
      }
    });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Payment Gateway Settings
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure Razorpay Test credentials for <strong className="text-neutral-800 dark:text-neutral-200">{tenantName}</strong>. Guest bookings will generate orders directly under this Razorpay account.
        </p>
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
            className="border-b-2 border-emerald-600 pb-3 text-xs sm:text-sm font-bold text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 flex items-center gap-2"
          >
            <span>💳</span> Payment Gateway
          </Link>
          <Link
            href="/settings/subscription"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>💎</span> Subscription &amp; SaaS
          </Link>
        </nav>
      </div>

      {/* Status Banner */}
      <div className={`rounded-2xl border p-5 transition ${
        isConfigured
          ? 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
          : 'bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold ${
              isConfigured
                ? 'bg-emerald-600 text-white'
                : 'bg-amber-600 text-white'
            }`}>
              {isConfigured ? '✓' : '!'}
            </span>
            <div>
              <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                {isConfigured ? 'Razorpay Test Mode Active' : 'Payment Keys Required'}
              </p>
              <p className="text-xs text-neutral-500">
                {isConfigured
                  ? `Active Key ID: ${keyId || initialKeyId} (${maskedSecret || 'Secret configured'})`
                  : 'Enter your Razorpay Test Key ID and Key Secret to enable checkout simulation.'}
              </p>
            </div>
          </div>
          <span className="rounded-full bg-neutral-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            TEST ENVIRONMENT
          </span>
        </div>
      </div>

      {/* Credentials Card */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
          Razorpay Test Credentials
        </h2>
        <p className="mt-1 text-xs text-neutral-500">
          Obtain these from your{' '}
          <a
            href="https://dashboard.razorpay.com/app/keys"
            target="_blank"
            rel="noopener noreferrer"
            className="text-emerald-600 underline font-medium hover:text-emerald-500"
          >
            Razorpay Dashboard → Settings → API Keys (Test Mode)
          </a>.
        </p>

        <form onSubmit={handleSaveKeys} className="mt-6 space-y-5">
          {/* Key ID */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Razorpay Key ID (Test Mode) *
            </label>
            <div className="mt-1.5 flex rounded-xl border border-neutral-300 shadow-2xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800">
              <span className="inline-flex items-center rounded-l-xl border-r border-neutral-300 bg-neutral-50 px-3 text-xs font-mono text-neutral-500 dark:border-neutral-700 dark:bg-neutral-850">
                Key ID
              </span>
              <input
                type="text"
                name="keyId"
                required
                value={keyId}
                onChange={(e) => setKeyId(e.target.value)}
                placeholder="rzp_test_xxxxxxxxxxxxxx"
                className="block w-full rounded-r-xl bg-transparent px-3.5 py-2.5 text-xs font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100"
              />
            </div>
            <p className="mt-1 text-[11px] text-neutral-400">
              Must start with <code className="font-mono">rzp_test_</code>. Safe to be exposed to client during checkout.
            </p>
          </div>

          {/* Key Secret */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
              Razorpay Key Secret (Test Mode) *
            </label>
            <div className="mt-1.5 relative flex rounded-xl border border-neutral-300 shadow-2xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800">
              <span className="inline-flex items-center rounded-l-xl border-r border-neutral-300 bg-neutral-50 px-3 text-xs font-mono text-neutral-500 dark:border-neutral-700 dark:bg-neutral-850">
                Secret
              </span>
              <input
                type={showSecret ? 'text' : 'password'}
                name="keySecret"
                required={!isConfigured}
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
                placeholder={isConfigured ? '•••••••••••••••• (Leave blank to keep existing)' : 'Enter Razorpay key secret'}
                className="block w-full rounded-r-xl bg-transparent px-3.5 py-2.5 text-xs font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100 pr-20"
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
              >
                {showSecret ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="mt-1 text-[11px] text-rose-500 dark:text-rose-400">
              🔒 Stored securely on the server. Never leaked to client-side browsers or public APIs.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={isPending || !keyId.trim()}
              className="inline-flex items-center rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {isPending ? 'Saving Credentials...' : 'Save Razorpay Test Keys'}
            </button>
          </div>
        </form>
      </div>

      {/* Multi-Tenant Architecture Note */}
      <div className="rounded-2xl border border-neutral-200/80 bg-neutral-50 p-5 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/60 dark:text-neutral-400 space-y-2">
        <p className="font-semibold text-neutral-900 dark:text-neutral-100">
          💡 How Multi-Tenant Payments Work
        </p>
        <p>
          PropSyncHub utilizes server-side dynamic initialization of the Razorpay Node SDK. When a guest reserves a room at your resort portal, the checkout engine queries your specific credentials on the server, generates an <code className="font-mono">order_id</code> tied to your account, and routes payouts straight to your balance.
        </p>
      </div>
    </div>
  );
}
