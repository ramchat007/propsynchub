'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSupabaseBrowserClient } from '@/lib/supabase';
import { requestEmailOtp, verifyEmailOtpAction } from '@/app/actions/auth';
import { PREDEFINED_TEST_OTP } from '@/lib/constants';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const explicitRedirect = searchParams.get('callbackUrl') || searchParams.get('redirectTo') || '/dashboard';
  const urlError = searchParams.get('error');

  // Multi-step flow: 'email' -> 'otp'
  const [step, setStep] = useState<'email' | 'otp'>('email');

  // Inputs
  const [email, setEmail] = useState('');
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
   * STEP 1: Request 6-digit Email OTP
   */
  async function handleSendEmailOtp(e?: React.FormEvent) {
    if (e) e.preventDefault();

    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!cleanEmail || !emailRegex.test(cleanEmail)) {
      setErrorMessage('Please enter a valid email address.');
      return;
    }

    setIsLoading(true);
    setLoadingText('Dispatching secure verification code...');

    try {
      const res = await requestEmailOtp(cleanEmail);
      if (!res.success) {
        throw new Error(res.error || 'Failed to send verification code.');
      }

      setStep('otp');
      setResendCooldown(60);
      setSuccessMessage(res.message || `Verification code sent to ${cleanEmail}.`);

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
   * STEP 2: Verify 6-digit Email OTP & Establish Session
   */
  async function handleVerifyEmailOtp(e?: React.FormEvent, customToken?: string) {
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
      const res = await verifyEmailOtpAction(email, otpToken);
      if (!res.success || !res.data) {
        throw new Error(res.error || 'Invalid or expired verification code.');
      }

      // Sync browser client state
      try {
        await supabase.auth.signInWithPassword({
          email: res.data.email,
          password: res.data.password,
        });
      } catch (clientAuthErr) {
        console.warn('[PropSyncHub] Client session synced via server cookies:', clientAuthErr);
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
          : 'Invalid verification code. Please check your code and try again.';
      setErrorMessage(message);
      setIsLoading(false);
      setLoadingText('');
    }
  }

  /**
   * Quick Test Account Fill
   */
  function handleFillTestAdmin() {
    setEmail('admin@raigadtropical.com');
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
          handleVerifyEmailOtp(undefined, newDigits.join(''));
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
      handleVerifyEmailOtp(undefined, newDigits.join(''));
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
          {/* 1. GOOGLE ONE-TAP SIGN-IN */}
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
              Or Sign In with Email OTP
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
          {/* 2. EMAIL OTP FORM */}
          {/* =============================================================== */}
          {step === 'email' && (
            <form onSubmit={handleSendEmailOtp} className="space-y-4">
              <div>
                <label
                  htmlFor="email-input"
                  className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300"
                >
                  Work Email or Guest Email
                </label>
                <div className="mt-2">
                  <input
                    id="email-input"
                    type="email"
                    placeholder="name@resort.com or guest@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isLoading}
                    required
                    className="block w-full rounded-2xl border border-neutral-300 bg-transparent px-4 py-2.5 text-sm text-neutral-900 placeholder-neutral-400 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || !email.trim()}
                className="flex w-full items-center justify-center rounded-2xl bg-emerald-600 py-3 px-4 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isLoading ? loadingText || 'Sending...' : 'Send Verification Code →'}
              </button>

              {/* Quick Dev Preset */}
              <div className="mt-4 pt-4 border-t border-dashed border-neutral-200 dark:border-neutral-800 text-center">
                <button
                  type="button"
                  onClick={handleFillTestAdmin}
                  className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 underline dark:text-emerald-400"
                >
                  ⚡ Auto-fill Test Resort Admin (admin@raigadtropical.com)
                </button>
              </div>
            </form>
          )}

          {/* STEP 2: 6-DIGIT OTP INPUT */}
          {step === 'otp' && (
            <form onSubmit={(e) => handleVerifyEmailOtp(e)} className="space-y-5">
              <div>
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
                    Enter 6-Digit Code
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setStep('email');
                      setErrorMessage(null);
                    }}
                    className="text-xs text-neutral-500 hover:text-emerald-600 hover:underline"
                  >
                    Change Email
                  </button>
                </div>

                <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                  Code sent to <span className="font-bold text-neutral-800 dark:text-neutral-200">{email}</span>
                </p>

                {/* 6 Digit Inputs */}
                <div className="mt-4 flex justify-between gap-2">
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleOtpChange(idx, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(idx, e)}
                      disabled={isLoading}
                      className="h-12 w-12 rounded-xl border border-neutral-300 bg-transparent text-center font-mono text-xl font-bold text-neutral-900 shadow-xs focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 dark:border-neutral-700 dark:text-white"
                    />
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading || otpDigits.some((d) => d === '')}
                className="flex w-full items-center justify-center rounded-2xl bg-emerald-600 py-3 px-4 text-xs font-bold text-white shadow-md transition hover:bg-emerald-700 disabled:opacity-50"
              >
                {isLoading ? loadingText || 'Verifying...' : 'Verify & Enter Dashboard →'}
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <span className="text-neutral-500">Didn&apos;t get the email?</span>
                {resendCooldown > 0 ? (
                  <span className="font-mono text-neutral-400">Resend in {resendCooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleSendEmailOtp()}
                    disabled={isLoading}
                    className="font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                  >
                    Resend Code
                  </button>
                )}
              </div>

              <div className="rounded-xl bg-stone-100 p-2.5 text-center text-[11px] text-stone-600 dark:bg-neutral-800 dark:text-stone-300">
                <span>Test Mode active · Default Test Code: </span>
                <button
                  type="button"
                  onClick={() => {
                    setOtpDigits(['1', '2', '3', '4', '5', '6']);
                    handleVerifyEmailOtp(undefined, PREDEFINED_TEST_OTP);
                  }}
                  className="font-mono font-bold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  {PREDEFINED_TEST_OTP} (Click to Fill)
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Footer info */}
        <p className="text-center text-[11px] text-neutral-400">
          PropSyncHub Multi-Tenant Resort Booking &amp; PMS Architecture
        </p>
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
