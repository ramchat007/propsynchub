'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import {
  requestMobileOtp,
  verifyMobileOtp,
} from '@/app/actions/auth';
import { PREDEFINED_TEST_OTP, DEFAULT_TEST_PHONE } from '@/lib/constants';

const COUNTRY_CODES = [
  { code: '+91', country: 'India (IN)', flag: '🇮🇳' },
  { code: '+1', country: 'USA / Canada (US/CA)', flag: '🇺🇸' },
  { code: '+44', country: 'United Kingdom (UK)', flag: '🇬🇧' },
  { code: '+971', country: 'United Arab Emirates (UAE)', flag: '🇦🇪' },
  { code: '+65', country: 'Singapore (SG)', flag: '🇸🇬' },
  { code: '+61', country: 'Australia (AU)', flag: '🇦🇺' },
  { code: '+966', country: 'Saudi Arabia (SA)', flag: '🇸🇦' },
];

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitRedirect = searchParams.get('callbackUrl') || searchParams.get('redirectTo');

  // Step state: 'phone' (Step 1) | 'otp' (Step 2)
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  // Input states
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState(DEFAULT_TEST_PHONE);
  const [otpDigits, setOtpDigits] = useState(['1', '2', '3', '4', '5', '6']);

  // Loading & feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Resend cooldown timer
  const [resendCooldown, setResendCooldown] = useState(0);

  // Input refs for OTP auto-focus
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const supabase = getSupabaseBrowserClient();

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const fullPhoneNumber = `${countryCode}${mobileNumber.replace(/\D/g, '')}`;

  /**
   * STEP 1: Send OTP to Mobile Number
   */
  async function handleSendOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanNumber = mobileNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 7 || cleanNumber.length > 15) {
      setErrorMessage('Please enter a valid mobile number (7-15 digits).');
      return;
    }

    setIsLoading(true);
    setLoadingText('Dispatching WhatsApp OTP...');

    try {
      const res = await requestMobileOtp(cleanNumber, countryCode);
      if (!res.success) {
        throw new Error(res.error || 'Failed to send OTP.');
      }

      setStep('otp');
      setResendCooldown(60);
      setSuccessMessage(
        res.message || `OTP sent to ${countryCode} ${cleanNumber}. (Test OTP: ${PREDEFINED_TEST_OTP})`
      );

      // Pre-fill default test OTP for convenience
      setOtpDigits(['1', '2', '3', '4', '5', '6']);

      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error sending verification code.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }

  /**
   * STEP 2: Verify 6-digit OTP & Establish Supabase Session Cookies
   */
  async function handleVerifyOtp(e?: React.FormEvent, customToken?: string) {
    if (e) e.preventDefault();

    const otpToken = customToken || otpDigits.join('').trim();
    if (otpToken.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setLoadingText('Verifying OTP & Establishing Session...');
    setErrorMessage(null);

    try {
      // 1. Verify OTP and resolve internal authentication credentials
      const res = await verifyMobileOtp(mobileNumber, otpToken, countryCode);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Invalid or expired OTP.');
      }

      // 2. Client-side authentication to establish session cookies via @supabase/ssr
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: res.data.email,
        password: res.data.password,
      });

      if (authError || !authData.session) {
        throw new Error(authError?.message || 'Failed to establish authenticated session.');
      }

      setSuccessMessage('Authentication verified! Redirecting...');

      // 3. Resolve destination route
      const destination = explicitRedirect || res.data.defaultRedirect;

      router.refresh();
      setTimeout(() => {
        window.location.href = destination;
      }, 300);
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Invalid verification code. Please check your OTP and try again.';
      setErrorMessage(message);
      setIsLoading(false);
      setLoadingText('');
    }
  }

  /**
   * ⚡ ONE-CLICK QUICK TEST LOGIN
   * Immediately authenticates with your mobile number (9820160376) and OTP 123456
   */
  async function handleOneClickLogin(targetPhone = DEFAULT_TEST_PHONE) {
    setMobileNumber(targetPhone);
    setOtpDigits(['1', '2', '3', '4', '5', '6']);
    setErrorMessage(null);
    setSuccessMessage(`Logging in with test mobile ${targetPhone}...`);
    setIsLoading(true);
    setLoadingText('Signing in with test credentials...');

    try {
      const res = await verifyMobileOtp(targetPhone, PREDEFINED_TEST_OTP, '+91');
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Quick login failed.');
      }

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: res.data.email,
        password: res.data.password,
      });

      if (authError || !authData.session) {
        throw new Error(authError?.message || 'Failed to establish session.');
      }

      const destination = explicitRedirect || res.data.defaultRedirect;
      router.refresh();
      setTimeout(() => {
        window.location.href = destination;
      }, 300);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Quick login failed.';
      setErrorMessage(message);
      setIsLoading(false);
      setLoadingText('');
    }
  }

  // Handle individual OTP input changes
  function handleOtpChange(index: number, value: string) {
    if (value.length > 1) {
      const pasted = value.replace(/\D/g, '').slice(0, 6).split('');
      if (pasted.length > 0) {
        const newDigits = [...otpDigits];
        pasted.forEach((d, i) => {
          if (index + i < 6) newDigits[index + i] = d;
        });
        setOtpDigits(newDigits);
        const nextIndex = Math.min(index + pasted.length, 5);
        otpInputRefs.current[nextIndex]?.focus();

        if (newDigits.every((d) => d !== '')) {
          handleVerifyOtp(undefined, newDigits.join(''));
        }
      }
      return;
    }

    const digit = value.replace(/\D/g, '');
    const newDigits = [...otpDigits];
    newDigits[index] = digit;
    setOtpDigits(newDigits);

    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }

    if (digit && index === 5 && newDigits.every((d) => d !== '')) {
      handleVerifyOtp(undefined, newDigits.join(''));
    }
  }

  function handleOtpKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-neutral-950">
      <div className="w-full max-w-md space-y-6">
        {/* Brand Header */}
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-md">
            <span className="text-2xl font-black">P</span>
          </div>
          <h2 className="mt-4 text-2xl font-extrabold tracking-tight text-neutral-900 dark:text-neutral-100">
            PropSyncHub
          </h2>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Multi-Tenant Resort Platform &amp; Direct Booking Engine
          </p>
        </div>

        {/* ⚡ ONE-CLICK QUICK TEST LOGIN BANNER */}
        <div className="rounded-2xl border-2 border-emerald-500/40 bg-gradient-to-br from-emerald-50 to-teal-50/50 p-4 shadow-sm dark:border-emerald-700/50 dark:from-emerald-950/40 dark:to-neutral-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                ⚡
              </span>
              <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                Test Mode Ready
              </span>
            </div>
            <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-mono font-bold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-300">
              OTP: {PREDEFINED_TEST_OTP}
            </span>
          </div>

          <p className="mt-1.5 text-xs text-neutral-600 dark:text-neutral-300">
            Click below to instantly log in with your mobile number without waiting for an SMS provider:
          </p>

          <button
            type="button"
            onClick={() => handleOneClickLogin(DEFAULT_TEST_PHONE)}
            disabled={isLoading}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 disabled:opacity-50"
          >
            <span>⚡ One-Click Login with +91 9820160376</span>
          </button>
        </div>

        {/* Main Auth Form Card */}
        <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          {/* Step Indicator */}
          <div className="mb-6 flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
            <div className="flex items-center space-x-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  step === 'phone'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300'
                }`}
              >
                1
              </span>
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                Mobile Number
              </span>
            </div>
            <div className="h-0.5 w-6 bg-neutral-200 dark:bg-neutral-700" />
            <div className="flex items-center space-x-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                  step === 'otp'
                    ? 'bg-emerald-600 text-white'
                    : 'bg-neutral-100 text-neutral-400 dark:bg-neutral-800 dark:text-neutral-500'
                }`}
              >
                2
              </span>
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
                Predefined OTP ({PREDEFINED_TEST_OTP})
              </span>
            </div>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              <div className="flex items-center space-x-2">
                <span>⚠️ {errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
              <div className="flex items-center space-x-2">
                <span>✓ {successMessage}</span>
              </div>
            </div>
          )}

          {/* ================================================================= */}
          {/* STEP 1: MOBILE NUMBER INPUT */}
          {/* ================================================================= */}
          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="mobile-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                >
                  Enter Mobile Number
                </label>
                <p className="mt-1 text-xs text-neutral-500">
                  Pre-configured for test mode. Predefined OTP: <code className="font-mono font-bold text-emerald-600">{PREDEFINED_TEST_OTP}</code>
                </p>

                <div className="mt-3 flex rounded-xl border border-neutral-300 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    disabled={isLoading}
                    className="cursor-pointer rounded-l-xl border-r border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs font-semibold text-neutral-800 focus:outline-none dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-200"
                  >
                    {COUNTRY_CODES.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.flag} {item.code}
                      </option>
                    ))}
                  </select>

                  <input
                    id="mobile-input"
                    type="tel"
                    inputMode="numeric"
                    placeholder="9820160376"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
                    disabled={isLoading}
                    required
                    className="block w-full rounded-r-xl bg-transparent px-3.5 py-2.5 text-sm font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !mobileNumber.trim()}
                className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {isLoading ? (loadingText || 'Sending OTP...') : 'Continue to OTP Verification →'}
              </button>
            </form>
          )}

          {/* ================================================================= */}
          {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
          {/* ================================================================= */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="otp-0"
                    className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                  >
                    Enter 6-Digit OTP
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('phone');
                      setErrorMessage(null);
                    }}
                    className="text-xs font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    Change Number
                  </button>
                </div>
                <p className="mt-1 text-xs text-neutral-500">
                  Target: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{countryCode} {mobileNumber}</span> · (Test OTP: <code className="font-mono font-bold text-emerald-600">{PREDEFINED_TEST_OTP}</code>)
                </p>

                {/* 6 Digit Input Boxes */}
                <div className="mt-4 flex justify-between gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      id={`otp-${idx}`}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      disabled={isLoading}
                      className="h-12 w-12 rounded-xl border border-neutral-300 text-center text-xl font-bold text-neutral-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || otpDigits.some((d) => d === '')}
                className="flex w-full items-center justify-center rounded-xl bg-emerald-600 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {isLoading ? (loadingText || 'Verifying...') : 'Verify & Enter PropSyncHub'}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={() => setOtpDigits(['1', '2', '3', '4', '5', '6'])}
                  className="text-xs text-neutral-500 underline hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  Auto-fill Test OTP (123456)
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 border-t border-neutral-100 pt-4 text-center text-[11px] text-neutral-400 dark:border-neutral-800 dark:text-neutral-500">
            Test mode enabled. Phone number <code className="font-mono">{DEFAULT_TEST_PHONE}</code> configured with predefined OTP <code className="font-mono">{PREDEFINED_TEST_OTP}</code>.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
