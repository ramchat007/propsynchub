'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  checkSubdomainAvailability,
  uploadBrandLogo,
  completeOwnerOnboarding,
} from '@/app/actions/tenant';

interface OnboardingWizardClientProps {
  userEmail?: string;
}

const COLOR_PRESETS = [
  { name: 'Emerald Oasis', hex: '#059669', bg: 'bg-emerald-600' },
  { name: 'Sapphire Ocean', hex: '#2563eb', bg: 'bg-blue-600' },
  { name: 'Royal Indigo', hex: '#4f46e5', bg: 'bg-indigo-600' },
  { name: 'Tropical Teal', hex: '#0d9488', bg: 'bg-teal-600' },
  { name: 'Sunset Coral', hex: '#f43f5e', bg: 'bg-rose-500' },
  { name: 'Golden Amber', hex: '#d97706', bg: 'bg-amber-600' },
  { name: 'Luxury Gold', hex: '#ca8a04', bg: 'bg-yellow-600' },
  { name: 'Modern Slate', hex: '#334155', bg: 'bg-slate-700' },
];

export default function OnboardingWizardClient({
  userEmail,
}: OnboardingWizardClientProps) {
  const router = useRouter();

  // Step state: 1 (Brand Identity), 2 (Domain Configuration), 3 (Assets & Review)
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Step 1: Brand Identity Form
  const [resortName, setResortName] = useState('');
  const [primaryColorHex, setPrimaryColorHex] = useState('#059669');

  // Step 2: Domain Configuration Form
  const [subdomain, setSubdomain] = useState('');
  const [isCheckingSubdomain, startSubdomainCheckTransition] = useTransition();
  const [subdomainStatus, setSubdomainStatus] = useState<{
    checked: boolean;
    available: boolean;
    message?: string;
    error?: string;
  }>({ checked: false, available: false });

  // Step 3: Assets & Review Form
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [clientAdminEmail, setClientAdminEmail] = useState('');
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Submission State
  const [isSubmitting, startSubmitTransition] = useTransition();
  const [submitError, setSubmitError] = useState<string | null>(null);

  /**
   * Helper to slugify resort name into a suggested subdomain
   */
  function handleResortNameChange(name: string) {
    setResortName(name);
    // If user hasn't manually edited subdomain yet, generate suggestion
    if (!subdomainStatus.checked && (!subdomain || subdomain === slugify(resortName))) {
      setSubdomain(slugify(name));
      setSubdomainStatus({ checked: false, available: false });
    }
  }

  function slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 30);
  }

  /**
   * Proceed from Step 1 to Step 2
   */
  function handleProceedToStep2(e: React.FormEvent) {
    e.preventDefault();
    if (!resortName.trim()) return;

    if (!subdomain) {
      setSubdomain(slugify(resortName));
    }
    setCurrentStep(2);
  }

  /**
   * Real-time Subdomain Validation & Proceed to Step 3
   */
  function handleValidateAndProceedToStep3(e: React.FormEvent) {
    e.preventDefault();
    setSubdomainStatus({ checked: false, available: false });

    const clean = slugify(subdomain);
    if (!clean) {
      setSubdomainStatus({
        checked: true,
        available: false,
        error: 'Please enter a valid subdomain.',
      });
      return;
    }

    startSubdomainCheckTransition(async () => {
      const res = await checkSubdomainAvailability(clean);
      if (res.available) {
        setSubdomainStatus({
          checked: true,
          available: true,
          message: res.message,
        });
        setSubdomain(res.subdomain);
        // Advance to Step 3
        setCurrentStep(3);
      } else {
        setSubdomainStatus({
          checked: true,
          available: false,
          error: res.error || 'This subdomain is not available.',
        });
      }
    });
  }

  /**
   * Handle File Upload to Supabase Storage 'brand_assets'
   */
  async function handleLogoFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingLogo(true);
    setLogoUploadError(null);

    try {
      const formData = new FormData();
      formData.set('logo', file);

      const res = await uploadBrandLogo(formData);
      if (res.success && res.url) {
        setLogoUrl(res.url);
      } else {
        setLogoUploadError(res.error || 'Failed to upload logo.');
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error uploading file.';
      setLogoUploadError(message);
    } finally {
      setIsUploadingLogo(false);
    }
  }

  /**
   * Final Onboarding Submission
   */
  function handleFinalSubmit() {
    setSubmitError(null);

    startSubmitTransition(async () => {
      const formData = new FormData();
      formData.set('resortName', resortName.trim());
      formData.set('subdomain', subdomain.trim());
      formData.set('primaryColorHex', primaryColorHex);
      if (logoUrl) formData.set('logoUrl', logoUrl);
      if (clientAdminEmail) formData.set('clientAdminEmail', clientAdminEmail.trim());

      const res = await completeOwnerOnboarding(formData);
      if (res.success) {
        router.push(res.redirectTo || '/dashboard');
      } else {
        setSubmitError(res.error || 'Failed to complete onboarding. Please try again.');
      }
    });
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
      {/* ===================================================================== */}
      {/* PROGRESS TRACKER */}
      {/* ===================================================================== */}
      <div className="mb-8">
        <div className="flex items-center justify-between">
          {[
            { step: 1, title: 'Brand Identity', desc: 'Name & Colors' },
            { step: 2, title: 'Domain Setup', desc: 'Resort Subdomain' },
            { step: 3, title: 'Assets & Review', desc: 'Logo & Launch' },
          ].map((item) => (
            <div key={item.step} className="flex flex-1 items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-9 w-9 items-center justify-center rounded-2xl text-xs font-black transition-all ${
                    currentStep === item.step
                      ? 'bg-neutral-900 text-white shadow-md ring-4 ring-neutral-200 dark:bg-white dark:text-neutral-900 dark:ring-neutral-800'
                      : currentStep > item.step
                      ? 'bg-emerald-600 text-white dark:bg-emerald-500'
                      : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800'
                  }`}
                >
                  {currentStep > item.step ? '✓' : item.step}
                </div>
                <span className="mt-2 text-[11px] font-bold text-neutral-800 dark:text-neutral-200 hidden sm:block">
                  {item.title}
                </span>
                <span className="text-[10px] text-neutral-400 hidden sm:block">
                  {item.desc}
                </span>
              </div>
              {item.step < 3 && (
                <div
                  className={`mx-2 h-0.5 flex-1 transition-all ${
                    currentStep > item.step
                      ? 'bg-emerald-600 dark:bg-emerald-500'
                      : 'bg-neutral-200 dark:bg-neutral-800'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ERROR ALERT */}
      {submitError && (
        <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300">
          <p className="font-bold">Onboarding Notice</p>
          <p className="mt-0.5">{submitError}</p>
        </div>
      )}

      {/* ===================================================================== */}
      {/* STEP 1: BRAND IDENTITY */}
      {/* ===================================================================== */}
      {currentStep === 1 && (
        <form
          onSubmit={handleProceedToStep2}
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8"
        >
          <div>
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              Step 1 of 3
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Define Your Resort Brand
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Welcome to PropSyncHub! Enter your property name and brand colors to configure your resort space.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            {/* Resort Name */}
            <div>
              <label
                htmlFor="resort-name"
                className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
              >
                Resort / Hotel Name *
              </label>
              <input
                id="resort-name"
                type="text"
                required
                value={resortName}
                onChange={(e) => handleResortNameChange(e.target.value)}
                placeholder="e.g. Royal Palms Resort &amp; Spa"
                className="mt-1.5 w-full rounded-2xl border border-neutral-300 bg-transparent px-4 py-3 text-sm text-neutral-900 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:text-neutral-100 dark:focus:border-white"
              />
            </div>

            {/* Primary Brand Color */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Primary Brand Color
              </label>
              <p className="mt-0.5 text-xs text-neutral-400">
                Used on your public booking page, buttons, and guest vouchers.
              </p>

              {/* Presets Grid */}
              <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-8">
                {COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setPrimaryColorHex(preset.hex)}
                    className={`group relative flex h-10 w-full items-center justify-center rounded-xl transition-all ${
                      preset.bg
                    } ${
                      primaryColorHex.toLowerCase() === preset.hex.toLowerCase()
                        ? 'ring-4 ring-neutral-900/30 dark:ring-white/40 scale-105 shadow-sm'
                        : 'opacity-90 hover:opacity-100'
                    }`}
                    title={preset.name}
                  >
                    {primaryColorHex.toLowerCase() === preset.hex.toLowerCase() && (
                      <span className="text-white text-xs font-bold">✓</span>
                    )}
                  </button>
                ))}
              </div>

              {/* Custom Picker and HEX input */}
              <div className="mt-3 flex items-center gap-3">
                <input
                  type="color"
                  value={primaryColorHex}
                  onChange={(e) => setPrimaryColorHex(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-xl border border-neutral-300 bg-transparent p-1 dark:border-neutral-700"
                />
                <input
                  type="text"
                  value={primaryColorHex}
                  onChange={(e) => setPrimaryColorHex(e.target.value)}
                  placeholder="#059669"
                  className="w-32 rounded-xl border border-neutral-300 bg-transparent px-3 py-2 font-mono text-xs text-neutral-800 dark:border-neutral-700 dark:text-neutral-200"
                />
                <span className="text-xs text-neutral-400">Selected Accent</span>
              </div>
            </div>

            {/* Live Visual Card Preview */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                Live Brand Preview
              </span>
              <div className="mt-2 flex items-center justify-between rounded-xl bg-white p-3 shadow-2xs dark:bg-neutral-900">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-xl font-black text-white shadow-xs text-sm"
                    style={{ backgroundColor: primaryColorHex }}
                  >
                    {resortName ? resortName.charAt(0).toUpperCase() : 'R'}
                  </div>
                  <div>
                    <h4 className="font-bold text-neutral-900 dark:text-neutral-100">
                      {resortName || 'Your Resort Name'}
                    </h4>
                    <p className="text-[11px] text-neutral-400">Direct Reservations</p>
                  </div>
                </div>

                <button
                  type="button"
                  tabIndex={-1}
                  className="rounded-lg px-3 py-1.5 font-bold text-white text-[11px] shadow-xs"
                  style={{ backgroundColor: primaryColorHex }}
                >
                  Book Now
                </button>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-end">
            <button
              type="submit"
              disabled={!resortName.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-6 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              <span>Next: Domain Configuration</span>
              <span>→</span>
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* STEP 2: DOMAIN CONFIGURATION */}
      {/* ===================================================================== */}
      {currentStep === 2 && (
        <form
          onSubmit={handleValidateAndProceedToStep3}
          className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8"
        >
          <div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              Step 2 of 3
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Configure Your Subdomain
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Choose the dedicated web address guests will use to view room availability and book stays.
            </p>
          </div>

          <div className="mt-6 space-y-5">
            <div>
              <label
                htmlFor="subdomain-input"
                className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
              >
                Desired Subdomain *
              </label>

              <div className="mt-1.5 flex rounded-2xl border border-neutral-300 bg-transparent focus-within:border-neutral-900 dark:border-neutral-700 dark:focus-within:border-white">
                <input
                  id="subdomain-input"
                  type="text"
                  required
                  value={subdomain}
                  onChange={(e) => {
                    setSubdomain(slugify(e.target.value));
                    setSubdomainStatus({ checked: false, available: false });
                  }}
                  placeholder="royal-palms"
                  className="w-full rounded-l-2xl bg-transparent px-4 py-3 text-sm font-mono text-neutral-900 focus:outline-none dark:text-neutral-100"
                />
                <span className="flex items-center rounded-r-2xl bg-neutral-100 px-4 text-xs font-bold text-neutral-500 dark:bg-neutral-800">
                  .propsynchub.com
                </span>
              </div>

              {/* Live URL Preview */}
              <div className="mt-3 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-800/40">
                <span className="block text-[11px] font-bold text-neutral-400 uppercase">
                  Live Public URL Preview
                </span>
                <p className="mt-1 font-mono text-sm font-black text-indigo-600 dark:text-indigo-400">
                  https://{subdomain || 'your-resort'}.propsynchub.com
                </p>
                <p className="mt-1 text-[11px] text-neutral-400">
                  Local Dev Equivalent: <code className="font-mono">http://localhost:3000/{subdomain || 'your-resort'}/book</code>
                </p>
              </div>

              {/* Subdomain Inline Status Feedback */}
              {subdomainStatus.checked && (
                <div
                  className={`mt-3 rounded-xl p-3 text-xs font-semibold ${
                    subdomainStatus.available
                      ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
                  }`}
                >
                  {subdomainStatus.available ? (
                    <span className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      {subdomainStatus.message}
                    </span>
                  ) : (
                    <span>{subdomainStatus.error}</span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-8 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(1)}
              className="rounded-2xl border border-neutral-300 px-5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
            >
              ← Back
            </button>

            <button
              type="submit"
              disabled={isCheckingSubdomain || !subdomain.trim()}
              className="inline-flex items-center gap-2 rounded-2xl bg-neutral-900 px-6 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {isCheckingSubdomain ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Validating Domain...</span>
                </>
              ) : (
                <>
                  <span>Next: Assets &amp; Review</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* ===================================================================== */}
      {/* STEP 3: ASSETS & FINAL REVIEW */}
      {/* ===================================================================== */}
      {currentStep === 3 && (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <div>
            <span className="rounded-full bg-purple-50 px-3 py-1 text-[11px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
              Step 3 of 3
            </span>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              Brand Assets &amp; Launch
            </h2>
            <p className="mt-1 text-xs text-neutral-500">
              Upload your resort logo (optional) and review your configuration before launching.
            </p>
          </div>

          <div className="mt-6 space-y-6">
            {/* Logo Upload Component */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                Resort Logo (Supabase Storage: brand_assets)
              </label>

              <div className="mt-2 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 p-6 text-center hover:border-neutral-400 dark:border-neutral-700">
                {logoUrl ? (
                  <div className="flex flex-col items-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={logoUrl}
                      alt="Brand Logo"
                      className="h-20 w-20 rounded-2xl object-cover shadow-sm ring-2 ring-emerald-500"
                    />
                    <span className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ Logo uploaded to brand_assets bucket
                    </span>
                    <button
                      type="button"
                      onClick={() => setLogoUrl(null)}
                      className="mt-1 text-[11px] text-neutral-400 underline hover:text-rose-500"
                    >
                      Remove &amp; upload different image
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                      <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    </div>

                    <div className="text-xs">
                      <label
                        htmlFor="logo-file-input"
                        className="cursor-pointer font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Click to upload brand logo
                      </label>
                      <input
                        id="logo-file-input"
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        onChange={handleLogoFileChange}
                        className="hidden"
                      />
                      <p className="text-[11px] text-neutral-400">PNG, JPG, WEBP, or SVG (Max 5MB)</p>
                    </div>

                    {isUploadingLogo && (
                      <p className="text-xs text-indigo-600 font-semibold animate-pulse">
                        Uploading to Supabase Storage...
                      </p>
                    )}

                    {logoUploadError && (
                      <p className="text-xs text-rose-600 font-semibold">{logoUploadError}</p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Optional Client / Resort Administrator Assignment */}
            <div className="space-y-2 rounded-2xl border border-neutral-200 bg-neutral-50/60 p-4 dark:border-neutral-800 dark:bg-neutral-800/20">
              <label className="block text-xs font-bold text-neutral-800 dark:text-neutral-200">
                Client / Resort Owner Email (Optional)
              </label>
              <p className="text-[11px] text-neutral-500 leading-tight">
                Creating this resort on behalf of a client? Enter their email below. They will be provisioned as the Resort Administrator and receive an invitation to access the dashboard.
              </p>
              <input
                type="email"
                placeholder="e.g. owner@newresort.com (Leave blank to assign to yourself)"
                value={clientAdminEmail}
                onChange={(e) => setClientAdminEmail(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-white px-3.5 py-2.5 text-xs text-neutral-900 placeholder:text-neutral-400 focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>

            {/* Final Confirmation Summary */}
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-800/40">
              <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                Final Confirmation Summary
              </h3>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Resort Name</span>
                  <span className="font-bold text-neutral-900 dark:text-neutral-100">{resortName}</span>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-neutral-500">Brand Color</span>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full shadow-xs"
                      style={{ backgroundColor: primaryColorHex }}
                    />
                    <span className="font-mono">{primaryColorHex}</span>
                  </div>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Public URL</span>
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {subdomain}.propsynchub.com
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Brand Logo</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {logoUrl ? 'Custom Image Attached' : 'Default Lettermark'}
                  </span>
                </div>

                <div className="flex justify-between">
                  <span className="text-neutral-500">Administrator</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    {clientAdminEmail || userEmail || 'Current Account'}
                  </span>
                </div>

                <div className="flex justify-between border-t border-neutral-200 pt-2 dark:border-neutral-700">
                  <span className="text-neutral-500">Assigned Account Role</span>
                  <span className="rounded-md bg-emerald-100 px-2 py-0.5 font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                    tenant_admin (Resort Owner)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 flex justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrentStep(2)}
              className="rounded-2xl border border-neutral-300 px-5 py-2.5 text-xs font-bold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={handleFinalSubmit}
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 rounded-2xl bg-emerald-600 px-7 py-3 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Launching Resort...</span>
                </>
              ) : (
                <span>Launch My Resort &amp; Go to Dashboard 🚀</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
