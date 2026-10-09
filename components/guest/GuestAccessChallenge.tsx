'use client';

import React, { useState } from 'react';
import { verifyGuestMobileAndIssueToken } from '@/app/actions/portal-auth';

interface GuestAccessChallengeProps {
  tenantId: string;
  bookingId: string;
  resortName: string;
  guestFirstNameHint?: string;
}

export default function GuestAccessChallenge({
  tenantId,
  bookingId,
  resortName,
  guestFirstNameHint,
}: GuestAccessChallengeProps) {
  const [mobileInput, setMobileInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!mobileInput.trim()) {
      setError('Please enter your registered mobile number.');
      return;
    }

    setLoading(true);
    const res = await verifyGuestMobileAndIssueToken(tenantId, bookingId, mobileInput.trim());
    if (res.success) {
      // Reload page now that HttpOnly token cookie is set
      window.location.reload();
    } else {
      setError(res.error || 'Verification failed. Please check the mobile number.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-900 text-stone-100 flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md bg-stone-850 bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl flex items-center justify-center mx-auto text-2xl">
            🔒
          </div>
          <span className="text-[11px] font-bold tracking-widest uppercase text-emerald-400 block">
            {resortName}
          </span>
          <h1 className="text-2xl font-black text-white">
            Guest Stay Authentication
          </h1>
          <p className="text-xs text-stone-400 leading-relaxed">
            {guestFirstNameHint ? `Welcome, ${guestFirstNameHint}! ` : ''}
            To protect your privacy and financial folio details, please verify the registered mobile number on this reservation.
          </p>
        </div>

        {/* Verification Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-stone-300 mb-1.5">
              Registered Mobile Number
            </label>
            <div className="relative">
              <input
                type="tel"
                required
                value={mobileInput}
                onChange={(e) => setMobileInput(e.target.value)}
                placeholder="Enter 10-digit mobile number or last 4 digits"
                className="w-full px-4 py-3 rounded-2xl bg-neutral-800 border border-neutral-700 text-white placeholder-stone-500 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
            </div>
            <p className="text-[11px] text-stone-500 mt-1.5">
              Tip: You can also open the direct signed link sent in your reservation confirmation SMS or email.
            </p>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition shadow-lg shadow-emerald-900/30 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span>Verifying Identity...</span>
            ) : (
              <>
                <span>Access Stay Portal & Folio</span>
                <span>➔</span>
              </>
            )}
          </button>
        </form>

        <div className="pt-4 border-t border-neutral-800 text-center">
          <p className="text-[11px] text-stone-500">
            Need help? Contact the resort reception directly or scan the authenticated QR card inside your guest room.
          </p>
        </div>
      </div>
    </div>
  );
}
