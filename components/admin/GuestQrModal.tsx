'use client';

import React, { useState } from 'react';
import { generateGuestPortalToken } from '@/lib/portal-token';
import { revokeGuestPortalAccess } from '@/app/actions/portal-auth';
import { Booking, Room, Tenant } from '@/types';

interface GuestQrModalProps {
  tenant: Tenant | null;
  booking: Booking;
  room: Room | null;
  onClose: () => void;
}

export default function GuestQrModal({
  tenant,
  booking,
  room,
  onClose,
}: GuestQrModalProps) {
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokedMessage, setRevokedMessage] = useState<string | null>(null);

  // Generate signed token
  const token = generateGuestPortalToken(
    booking.tenant_id,
    booking.id,
    { roomNumber: room?.room_number || room?.name }
  );

  const tenantParam = tenant?.subdomain || tenant?.id || 'resort';
  // If window is available, use window.location.origin
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://propsynchub.in';
  const portalUrl = `${origin}/${tenantParam}/portal/${booking.id}?token=${token}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(
    portalUrl
  )}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleRevoke = async () => {
    if (
      !confirm(
        'Are you sure you want to revoke this guest access token? Any active links or room QR scans will immediately require mobile identity re-verification.'
      )
    ) {
      return;
    }
    setRevoking(true);
    const res = await revokeGuestPortalAccess(booking.tenant_id, booking.id);
    if (res.success) {
      setRevokedMessage(res.message || 'Token revoked successfully.');
    } else {
      alert(res.error || 'Failed to revoke token.');
    }
    setRevoking(false);
  };

  const wifiSsid = ((tenant?.settings as Record<string, unknown>)?.wifi_ssid as string) || `${tenant?.name || 'Resort'} Guest WiFi`;
  const wifiPass = ((tenant?.settings as Record<string, unknown>)?.wifi_password as string) || 'Welcome@2026';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-neutral-900 shadow-2xl border border-stone-200 dark:border-neutral-800 p-6 sm:p-8 space-y-6 my-8 print:p-0 print:shadow-none print:m-0 print:border-none print:w-full">
        {/* Modal Top Actions (Hidden when printing) */}
        <div className="flex justify-between items-center border-b border-stone-100 dark:border-neutral-800 pb-3 print:hidden">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <h3 className="text-base font-black text-stone-900 dark:text-white">
              In-Room QR Code &amp; Guest Portal Card
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-lg font-bold"
          >
            ✕
          </button>
        </div>

        {/* PRINTABLE ROOM TENT CARD */}
        <div className="p-6 rounded-2xl border-2 border-dashed border-stone-200 dark:border-neutral-700 bg-stone-50/50 dark:bg-neutral-800/40 text-center space-y-4 print:border-none print:bg-white print:p-4 print:text-stone-900">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 block">
              {tenant?.name || 'Luxury Resort &amp; Spa'}
            </span>
            <h2 className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
              Welcome to {room?.name || 'Your Villa'}
            </h2>
            <p className="text-xs text-stone-500 font-semibold">
              Guest: {booking.guest_name} · Stay: {booking.check_in_date} to {booking.check_out_date}
            </p>
          </div>

          {/* QR Code Container */}
          <div className="flex justify-center my-3">
            <div className="p-3 bg-white rounded-2xl shadow-md border border-stone-200 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrImageUrl}
                alt="Guest Portal QR Code"
                width={190}
                height={190}
                className="w-48 h-48 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-1">
            <p className="text-xs font-black text-stone-900 dark:text-white">
              Scan with your smartphone camera
            </p>
            <p className="text-[11px] text-stone-500 max-w-xs mx-auto">
              Access In-Room Dining, Housekeeping Requests, Resort Experiences, and your Digital Folio Bill.
            </p>
          </div>

          {/* In-Room WiFi details */}
          <div className="pt-3 border-t border-stone-200 dark:border-neutral-700 grid grid-cols-2 gap-2 text-[11px]">
            <div className="text-left bg-white dark:bg-neutral-900 p-2 rounded-xl border border-stone-100 dark:border-neutral-800">
              <span className="text-[10px] text-stone-400 block uppercase font-bold">WiFi Network</span>
              <strong className="text-stone-800 dark:text-stone-200">{wifiSsid}</strong>
            </div>
            <div className="text-left bg-white dark:bg-neutral-900 p-2 rounded-xl border border-stone-100 dark:border-neutral-800">
              <span className="text-[10px] text-stone-400 block uppercase font-bold">WiFi Password</span>
              <strong className="text-stone-800 dark:text-stone-200">{wifiPass}</strong>
            </div>
          </div>

          <div className="text-[10px] text-stone-400 italic">
            🔒 Protected by cryptographic token · Non-transferable guest stay link
          </div>
        </div>

        {/* Revocation Alert if applied */}
        {revokedMessage && (
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
            {revokedMessage}
          </div>
        )}

        {/* Direct Link Controls (Hidden when printing) */}
        <div className="space-y-3 text-xs print:hidden">
          <div>
            <label className="block text-stone-500 font-semibold mb-1">
              Signed Direct Link (SMS / WhatsApp)
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={portalUrl}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-100 dark:bg-neutral-800 text-stone-700 dark:text-stone-300 font-mono text-[11px]"
              />
              <button
                type="button"
                onClick={handleCopy}
                className="px-4 py-2 rounded-xl font-bold bg-stone-900 hover:bg-stone-800 text-white dark:bg-white dark:text-stone-900 shrink-0 transition"
              >
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="flex flex-wrap justify-between items-center pt-2 gap-2">
            <button
              type="button"
              disabled={revoking}
              onClick={handleRevoke}
              className="px-3.5 py-2 rounded-xl font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800 transition disabled:opacity-50 text-xs"
            >
              {revoking ? 'Revoking...' : 'Revoke Active Token'}
            </button>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300 text-xs"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white text-xs shadow-sm"
              >
                🖨️ Print Room QR Card
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
