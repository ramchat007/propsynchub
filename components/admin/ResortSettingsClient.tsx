'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Tenant } from '@/types';
import { updateResortGeneralSettings, UpdateResortGeneralSettingsPayload } from '@/app/actions/tenant';
import { saveTenantRazorpayKeys } from '@/app/actions/payment';
import { ToastContainer, ToastMessage } from './Toast';

interface ResortSettingsClientProps {
  tenant: Tenant;
  razorpayKeyId: string | null;
  razorpayMaskedSecret: string | null;
  isRazorpayConfigured: boolean;
}

export default function ResortSettingsClient({
  tenant,
  razorpayKeyId,
  razorpayMaskedSecret,
  isRazorpayConfigured: initialRazorpayConfigured,
}: ResortSettingsClientProps) {
  const [activeTab, setActiveTab] = useState<'profile' | 'payment' | 'modules'>('profile');
  const [isPending, startTransition] = useTransition();

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }

  const settings = (tenant.settings || {}) as Record<string, unknown>;
  const addressObj = (settings.address || {}) as {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  const entitlements = (settings.module_entitlements || {
    restaurant: true,
    activities: true,
    housekeeping: true,
    guest_services: true,
    reviews: true,
    accounting_exports: true,
    digital_guest_portal: true,
  }) as {
    restaurant?: boolean;
    activities?: boolean;
    housekeeping?: boolean;
    guest_services?: boolean;
    reviews?: boolean;
    accounting_exports?: boolean;
    digital_guest_portal?: boolean;
  };

  // Form State: Profile & Defaults
  const [name, setName] = useState(tenant.name || '');
  const [legalName, setLegalName] = useState((settings.legal_name as string) || tenant.name || '');
  const [contactEmail, setContactEmail] = useState(tenant.contact_email || '');
  const [contactPhone, setContactPhone] = useState(tenant.contact_phone || (settings.contact_phone as string) || '');
  const [logoUrl, setLogoUrl] = useState(tenant.logo_url || '');
  const [primaryColor, setPrimaryColor] = useState((settings.primary_color_hex as string) || '#059669');
  const [gstin, setGstin] = useState((settings.gstin as string) || '');
  const [pan, setPan] = useState((settings.pan as string) || '');

  // Address
  const [street, setStreet] = useState(addressObj.street || '');
  const [city, setCity] = useState(addressObj.city || '');
  const [state, setState] = useState(addressObj.state || '');
  const [postalCode, setPostalCode] = useState(addressObj.postal_code || '');
  const [country, setCountry] = useState(addressObj.country || 'India');

  // Operational Defaults
  const [checkInTime, setCheckInTime] = useState((settings.check_in_time as string) || '14:00');
  const [checkOutTime, setCheckOutTime] = useState((settings.check_out_time as string) || '11:00');
  const [paymentPolicy, setPaymentPolicy] = useState<'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY'>(
    (settings.payment_policy as 'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY') || 'ADVANCE'
  );
  const [advancePercentage, setAdvancePercentage] = useState(
    typeof settings.advance_percentage === 'number' ? settings.advance_percentage : 50
  );

  // Razorpay Gateway State
  const [keyId, setKeyId] = useState(razorpayKeyId || '');
  const [keySecret, setKeySecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [isConfigured, setIsConfigured] = useState(initialRazorpayConfigured);
  const [maskedSecret, setMaskedSecret] = useState(razorpayMaskedSecret);

  // Module Entitlements State
  const [moduleRestaurant, setModuleRestaurant] = useState(entitlements.restaurant !== false);
  const [moduleActivities, setModuleActivities] = useState(entitlements.activities !== false);
  const [moduleHousekeeping, setModuleHousekeeping] = useState(entitlements.housekeeping !== false);
  const [moduleGuestServices, setModuleGuestServices] = useState(entitlements.guest_services !== false);
  const [moduleReviews, setModuleReviews] = useState(entitlements.reviews !== false);
  const [moduleAccounting, setModuleAccounting] = useState(entitlements.accounting_exports !== false);
  const [modulePortal, setModulePortal] = useState(entitlements.digital_guest_portal !== false);

  // Handle Save Profile & Property Defaults
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    startTransition(async () => {
      const payload: UpdateResortGeneralSettingsPayload = {
        tenantId: tenant.id,
        name: name.trim(),
        legal_name: legalName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        logo_url: logoUrl.trim() || undefined,
        primary_color_hex: primaryColor,
        gstin: gstin.trim().toUpperCase() || undefined,
        pan: pan.trim().toUpperCase() || undefined,
        address: {
          street: street.trim(),
          city: city.trim(),
          state: state.trim(),
          postal_code: postalCode.trim(),
          country: country.trim(),
        },
        check_in_time: checkInTime,
        check_out_time: checkOutTime,
        payment_policy: paymentPolicy,
        advance_percentage: Number(advancePercentage),
        module_entitlements: {
          restaurant: moduleRestaurant,
          activities: moduleActivities,
          housekeeping: moduleHousekeeping,
          guest_services: moduleGuestServices,
          reviews: moduleReviews,
          accounting_exports: moduleAccounting,
          digital_guest_portal: modulePortal,
        },
      };

      const res = await updateResortGeneralSettings(payload);
      if (res.success) {
        addToast('success', res.message || 'Resort defaults updated successfully.');
      } else {
        addToast('error', res.error || 'Failed to update resort settings.');
      }
    });
  };

  // Handle Save Razorpay Keys
  const handleSaveRazorpay = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenant.id);

    startTransition(async () => {
      const res = await saveTenantRazorpayKeys(formData);
      if (res.success) {
        addToast('success', res.message || 'Razorpay keys saved successfully.');
        setIsConfigured(true);
        if (keySecret) {
          setMaskedSecret(keySecret.length > 4 ? `••••••••${keySecret.slice(-4)}` : '••••••••••••');
          setKeySecret('');
        }
      } else {
        addToast('error', res.error || 'Failed to save Razorpay keys.');
      }
    });
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {/* Page Header */}
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-black tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
            Resort Configuration &amp; Defaults
          </h1>
          <span className="rounded-full bg-emerald-100 dark:bg-emerald-950 px-2.5 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            {tenant.subdomain}.propsynchub.com
          </span>
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Manage fundamental property details established during onboarding: Legal entity name, GSTIN, PAN, brand identity, check-in/out schedules, advance deposit policies, and payment gateway.
        </p>
      </div>

      {/* Top Settings Navigation Links */}
      <div className="border-b border-stone-200 dark:border-neutral-800">
        <nav className="-mb-px flex space-x-6 overflow-x-auto no-scrollbar">
          <Link
            href="/settings"
            className="border-b-2 border-emerald-600 pb-3 text-xs sm:text-sm font-bold text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 flex items-center gap-2 whitespace-nowrap"
          >
            <span>🏨</span> Resort Defaults &amp; Payments
          </Link>
          <Link
            href="/settings/team"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2 whitespace-nowrap"
          >
            <span>👥</span> Team &amp; Staff
          </Link>
          <Link
            href="/settings/website"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2 whitespace-nowrap"
          >
            <span>🌐</span> Website CMS
          </Link>
          <Link
            href="/settings/tax"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2 whitespace-nowrap"
          >
            <span>📜</span> Taxes &amp; Meal Plans
          </Link>
          <Link
            href="/settings/subscription"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2 whitespace-nowrap"
          >
            <span>💎</span> Subscription &amp; SaaS
          </Link>
        </nav>
      </div>

      {/* Tab Switcher */}
      <div className="flex border-b border-stone-200 dark:border-neutral-800 gap-4 text-xs font-bold">
        <button
          type="button"
          onClick={() => setActiveTab('profile')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            activeTab === 'profile'
              ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'text-stone-500 hover:text-stone-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <span>🏨</span> Resort Profile &amp; Default Policies
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('payment')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            activeTab === 'payment'
              ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'text-stone-500 hover:text-stone-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <span>💳</span> Razorpay Payment Gateway
          {isConfigured ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('modules')}
          className={`pb-2.5 transition flex items-center gap-1.5 ${
            activeTab === 'modules'
              ? 'border-b-2 border-neutral-900 text-neutral-900 dark:border-white dark:text-white'
              : 'text-stone-500 hover:text-stone-800 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <span>🧩</span> Module Entitlements
        </button>
      </div>

      {/* TAB 1: RESORT PROFILE & PROPERTY DEFAULTS */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          {/* 1. Basic Identity */}
          <div className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <span>🏷️</span> Resort Identity &amp; Branding
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Resort Display Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Seagull Beach Resort"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Subdomain Slug (Read-Only)
                </label>
                <div className="flex items-center">
                  <input
                    type="text"
                    disabled
                    value={tenant.subdomain}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-100 dark:bg-neutral-800/50 text-stone-500 font-mono"
                  />
                  <Link
                    href={`/${tenant.subdomain}`}
                    target="_blank"
                    className="ml-2 px-3 py-2 rounded-xl bg-stone-100 dark:bg-neutral-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 font-bold whitespace-nowrap"
                  >
                    View ↗
                  </Link>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Brand Primary Accent Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-9 p-0.5 rounded-lg border border-stone-200 dark:border-neutral-700 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    placeholder="#059669"
                    className="flex-1 px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Logo URL (Asset Link)
                </label>
                <input
                  type="text"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://... or uploaded asset link"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>
            </div>
          </div>

          {/* 2. Legal, GST & Contact Information */}
          <div className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <span>🏛️</span> Legal Registration, GST &amp; Contact Details
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Legal Entity / Firm Name (for Invoices &amp; Receipts)
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="e.g. Seagull Hospitality LLP"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  GSTIN (15 Characters)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AAPCR1234F1Z5"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Permanent Account Number (PAN - 10 Chars)
                </label>
                <input
                  type="text"
                  maxLength={10}
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="AAPCR1234F"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono uppercase"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Resort Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="reservations@resort.com"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Resort Phone / WhatsApp
                </label>
                <input
                  type="text"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono"
                />
              </div>
            </div>

            {/* Address */}
            <div className="pt-2 border-t border-stone-100 dark:border-neutral-800 space-y-3">
              <span className="block text-xs font-bold text-stone-600 dark:text-stone-400">
                Resort Physical Address
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] text-stone-400 mb-1">Street / Area</label>
                  <input
                    type="text"
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    placeholder="Near Beach Road"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">City / Town</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Malvan"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">State</label>
                  <input
                    type="text"
                    value={state}
                    onChange={(e) => setState(e.target.value)}
                    placeholder="Maharashtra"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">PIN / Postal Code</label>
                  <input
                    type="text"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    placeholder="416606"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-stone-400 mb-1">Country</label>
                  <input
                    type="text"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    placeholder="India"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 3. Operational Timings & Deposit Policy */}
          <div className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-xs">
            <h3 className="text-sm font-bold text-stone-900 dark:text-white flex items-center gap-2">
              <span>⏰</span> Check-In Timings &amp; Reservation Advance Policy
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Standard Check-In Time
                </label>
                <input
                  type="time"
                  value={checkInTime}
                  onChange={(e) => setCheckInTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Standard Check-Out Time
                </label>
                <input
                  type="time"
                  value={checkOutTime}
                  onChange={(e) => setCheckOutTime(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Default Payment Policy
                </label>
                <select
                  value={paymentPolicy}
                  onChange={(e) => setPaymentPolicy(e.target.value as 'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY')}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                >
                  <option value="ADVANCE">Advance Deposit Required</option>
                  <option value="FULL_PAYMENT">100% Full Payment Upfront</option>
                  <option value="PAY_AT_PROPERTY">Pay at Property (Zero Advance)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Advance Requirement (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={paymentPolicy !== 'ADVANCE'}
                  value={advancePercentage}
                  onChange={(e) => setAdvancePercentage(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isPending}
              className="px-6 py-2.5 rounded-xl font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition shadow-xs text-xs disabled:opacity-50"
            >
              {isPending ? 'Saving Settings...' : 'Save Resort Defaults'}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: RAZORPAY PAYMENT GATEWAY */}
      {activeTab === 'payment' && (
        <div className="space-y-6">
          <div
            className={`rounded-2xl border p-5 transition ${
              isConfigured
                ? 'bg-emerald-50/60 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
                : 'bg-amber-50/60 border-amber-200 dark:bg-amber-950/20 dark:border-amber-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-8 w-8 items-center justify-center rounded-xl text-sm font-bold ${
                    isConfigured ? 'bg-emerald-600 text-white' : 'bg-amber-600 text-white'
                  }`}
                >
                  {isConfigured ? '✓' : '!'}
                </span>
                <div>
                  <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {isConfigured
                      ? 'Razorpay Test Mode Active'
                      : 'Razorpay Not Configured'}
                  </h3>
                  <p className="text-xs text-neutral-500">
                    {isConfigured
                      ? `Operating in test mode with Key ID: ${keyId}`
                      : 'Add your test API keys to enable online booking deposits.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <form onSubmit={handleSaveRazorpay} className="space-y-4">
            <div className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-xs text-xs">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Razorpay Key ID
                </label>
                <input
                  type="text"
                  name="keyId"
                  required
                  value={keyId}
                  onChange={(e) => setKeyId(e.target.value)}
                  placeholder="rzp_test_..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300 mb-1">
                  Razorpay Key Secret
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    name="keySecret"
                    value={keySecret}
                    onChange={(e) => setKeySecret(e.target.value)}
                    placeholder={maskedSecret || 'Enter Key Secret'}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret((v) => !v)}
                    className="absolute right-3 top-2.5 text-stone-400 hover:text-stone-600 text-xs font-semibold"
                  >
                    {showSecret ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="px-6 py-2.5 rounded-xl font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition shadow-xs text-xs disabled:opacity-50"
              >
                {isPending ? 'Saving Keys...' : 'Save Razorpay Keys'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: MODULE ENTITLEMENTS */}
      {activeTab === 'modules' && (
        <div className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-4 shadow-xs">
          <div>
            <h3 className="text-sm font-bold text-stone-900 dark:text-white">
              Platform Modules &amp; Feature Entitlements
            </h3>
            <p className="text-xs text-stone-500">
              Enable or disable specific operational capabilities for your resort organization.
            </p>
          </div>

          <div className="divide-y divide-stone-100 dark:divide-neutral-800 text-xs">
            {[
              {
                title: 'Restaurant & Room Dining POS',
                desc: 'Digital KOT, table dining, room delivery, and direct room folio charging.',
                val: moduleRestaurant,
                setter: setModuleRestaurant,
              },
              {
                title: 'Housekeeping & Turndown Management',
                desc: 'Turnover room rack, cleaning task assignment, and supervisor inspection board.',
                val: moduleHousekeeping,
                setter: setModuleHousekeeping,
              },
              {
                title: 'Guest Activities & Coastal Excursions',
                desc: 'Water sports, coastal tours, vehicle hires, and activity billing.',
                val: moduleActivities,
                setter: setModuleActivities,
              },
              {
                title: 'Guest Services & Amenities Butler',
                desc: 'Towels, toiletries, extra bedding, luggage assistance, and instant guest requests.',
                val: moduleGuestServices,
                setter: setModuleGuestServices,
              },
              {
                title: 'Digital Guest Portal & Room QR Services',
                desc: 'Self-service room QR code ordering, WiFi access, and instant concierge requests.',
                val: modulePortal,
                setter: setModulePortal,
              },
              {
                title: 'Accounting Ledger & Tally / Excel Exports',
                desc: 'Automated revenue settlement logs and accounting spreadsheet exports.',
                val: moduleAccounting,
                setter: setModuleAccounting,
              },
              {
                title: 'Guest Feedback & Review System',
                desc: 'Automated post-stay checkout feedback collection and rating tracking.',
                val: moduleReviews,
                setter: setModuleReviews,
              },
            ].map((m, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between">
                <div>
                  <p className="font-bold text-stone-900 dark:text-white">{m.title}</p>
                  <p className="text-stone-500 text-[11px]">{m.desc}</p>
                </div>
                <input
                  type="checkbox"
                  checked={m.val}
                  onChange={(e) => m.setter(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-3">
            <button
              type="button"
              onClick={handleSaveProfile}
              disabled={isPending}
              className="px-6 py-2.5 rounded-xl font-bold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 transition shadow-xs text-xs disabled:opacity-50"
            >
              {isPending ? 'Saving...' : 'Update Module Entitlements'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
