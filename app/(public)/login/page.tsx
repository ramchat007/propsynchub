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
  const explicitRedirect = searchParams.get('callbackUrl') || searchParams.get('redirectTo') || '/dashboard';
  const urlError = searchParams.get('error');

  // Active method: 'whatsapp' (default)
  const [step, setStep] = useState<'phone' | 'otp'>('phone');

  // Input states
  const [countryCode, setCountryCode] = useState('+91');
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);

  // Loading & feedback states
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [loadingText, setLoadingText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(urlError || null);
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

  /**
   * GOOGLE SOCIAL SIGN-IN (100% Free via Supabase Auth)
   */
  async function handleGoogleSignIn() {
    try {
      setIsGoogleLoading(true);
      setErrorMessage(null);

      const callbackUrl = `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(explicitRedirect)}`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: callbackUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to initialize Google authentication.';
      setErrorMessage(msg);
      setIsGoogleLoading(false);
    }
  }

  /**
   * STEP 1: Send OTP to Mobile via WhatsApp (Meta Cloud API)
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
        throw new Error(res.error || 'Failed to send WhatsApp verification code.');
      }

      setStep('otp');
      setResendCooldown(60);
      setSuccessMessage(res.message || `OTP sent to ${countryCode} ${cleanNumber} via WhatsApp.`);

      setTimeout(() => {
        otpInputRefs.current[0]?.focus();
      }, 100);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error sending WhatsApp verification code.';
      setErrorMessage(message);
    } finally {
      setIsLoading(false);
      setLoadingText('');
    }
  }

  /**
   * STEP 2: Verify 6-digit WhatsApp OTP & Establish Session
   */
  async function handleVerifyOtp(e?: React.FormEvent, customToken?: string) {
    if (e) e.preventDefault();

    const otpToken = customToken || otpDigits.join('').trim();
    if (otpToken.length !== 6) {
      setErrorMessage('Please enter the full 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setLoadingText('Verifying WhatsApp OTP & Signing In...');
    setErrorMessage(null);

    try {
      const res = await verifyMobileOtp(mobileNumber, otpToken, countryCode);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Invalid or expired OTP.');
      }

      // Sync browser client state
      try {
        await supabase.auth.signInWithPassword({
          email: res.data.email,
          password: res.data.password,
        });
      } catch (clientAuthErr) {
        console.warn('[PropSyncHub] Client-side auth sync bypassed (server cookies established):', clientAuthErr);
      }

      setSuccessMessage('Authentication verified! Redirecting to dashboard...');

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
   * Quick Test Fill for Local Development
   */
  function handleFillTestAccount() {
    setMobileNumber(DEFAULT_TEST_PHONE);
    setOtpDigits(['1', '2', '3', '4', '5', '6']);
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-stone-50 px-4 py-12 sm:px-6 lg:px-8 dark:bg-neutral-950">
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
            Resort Operations, Direct Bookings &amp; Admin Desk
          </p>
        </div>

        {/* Main Auth Card */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl sm:p-8 dark:border-neutral-800 dark:bg-neutral-900">
          
          {/* =============================================================== */}
          {/* OPTION 1: GOOGLE ONE-TAP & SOCIAL LOGIN (100% Free) */}
          {/* =============================================================== */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignIn}
              disabled={isGoogleLoading || isLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-300 bg-white py-3 px-4 text-xs font-bold text-neutral-800 shadow-xs transition hover:bg-neutral-50 hover:border-neutral-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-750"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
              <span>{isGoogleLoading ? 'Connecting Google Account...' : 'Continue with Google (Free One-Tap)'}</span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
            </div>
            <span className="relative bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-neutral-400 dark:bg-neutral-900">
              Or Sign In with WhatsApp OTP
            </span>
          </div>

          {/* Feedback Alerts */}
          {errorMessage && (
            <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              <div className="flex items-center space-x-2">
                <span>⚠️ {errorMessage}</span>
              </div>
            </div>
          )}

          {successMessage && (
            <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/40 dark:text-emerald-300">
              <div className="flex items-center space-x-2">
                <span>✓ {successMessage}</span>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* OPTION 2: WHATSAPP OTP (Free via Meta Cloud API / Sandbox) */}
          {/* =============================================================== */}
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/30 p-4 dark:border-emerald-800/30 dark:bg-emerald-950/20 mb-4">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-900 dark:text-emerald-200">
              <span className="text-base">💬</span>
              <span>WhatsApp Instant OTP (Meta Cloud API)</span>
            </div>
            <p className="mt-1 text-[11px] text-neutral-500 dark:text-neutral-400">
              Receive your 6-digit login token directly on your verified WhatsApp number.
            </p>
          </div>

          {/* STEP 1: MOBILE NUMBER INPUT */}
          {step === 'phone' && (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="mobile-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                >
                  WhatsApp Mobile Number
                </label>

                <div className="mt-2 flex rounded-2xl border border-neutral-300 shadow-xs focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800">
                  <select
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    disabled={isLoading}
                    className="cursor-pointer rounded-l-2xl border-r border-neutral-300 bg-neutral-50 px-3 py-2.5 text-xs font-semibold text-neutral-800 focus:outline-none dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-200"
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
                    placeholder="Enter 10-digit mobile number"
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
                    disabled={isLoading}
                    required
                    className="block w-full rounded-r-2xl bg-transparent px-3.5 py-2.5 text-sm font-mono text-neutral-900 placeholder-neutral-400 focus:outline-none dark:text-neutral-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !mobileNumber.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-60"
              >
                <span>{isLoading ? (loadingText || 'Dispatching code...') : 'Send WhatsApp Code →'}</span>
              </button>
            </form>
          )}

          {/* STEP 2: 6-DIGIT OTP VERIFICATION */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="otp-0"
                    className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                  >
                    Enter 6-Digit WhatsApp Code
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
                  Sent to WhatsApp: <span className="font-semibold text-neutral-700 dark:text-neutral-300">{countryCode} {mobileNumber}</span>
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
                      className="h-12 w-12 rounded-xl border border-neutral-300 text-center text-xl font-bold text-neutral-900 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || otpDigits.some((d) => d === '')}
                className="flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {isLoading ? (loadingText || 'Verifying...') : 'Verify & Enter Dashboard'}
              </button>

              <div className="flex items-center justify-between text-xs text-neutral-500">
                <span>Didn&apos;t receive code?</span>
                <button
                  type="button"
                  onClick={() => handleSendOtp()}
                  disabled={resendCooldown > 0 || isLoading}
                  className="font-medium text-emerald-600 hover:underline disabled:opacity-50 dark:text-emerald-400"
                >
                  {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP via WhatsApp'}
                </button>
              </div>
            </form>
          )}

          {/* Discreet Local Development Helper */}
          <div className="mt-6 border-t border-neutral-100 pt-4 text-center dark:border-neutral-800">
            <button
              type="button"
              onClick={handleFillTestAccount}
              className="text-[11px] text-neutral-400 hover:text-neutral-600 underline dark:text-neutral-500 dark:hover:text-neutral-400"
            >
              🛠️ Fill Test Account ({DEFAULT_TEST_PHONE} / {PREDEFINED_TEST_OTP})
            </button>
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
        <div className="flex min-h-screen items-center justify-center bg-stone-50 dark:bg-neutral-950">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
