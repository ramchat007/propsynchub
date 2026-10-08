'use client';

import React, { useState, useTransition } from 'react';

export default function InquiryFormClient() {
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [formData, setFormData] = useState({
    resortName: '',
    contactPerson: '',
    whatsappNumber: '',
    email: '',
    location: '',
    roomCount: '1-5',
    notes: '',
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      // In a real environment, this sends to Supabase or WhatsApp/email webhook
      await new Promise((resolve) => setTimeout(resolve, 600));
      setSubmitted(true);
    });
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-xl rounded-3xl border border-emerald-500/40 bg-emerald-950/20 p-8 text-center backdrop-blur-md">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl text-white">
          ✓
        </div>
        <h3 className="mt-4 text-xl font-bold text-white">Inquiry Received!</h3>
        <p className="mt-2 text-xs leading-relaxed text-neutral-300">
          Thank you, <strong className="text-white">{formData.contactPerson || 'there'}</strong>. Our hospitality deployment team will connect with you on WhatsApp at <strong className="text-emerald-400">{formData.whatsappNumber}</strong> within 2 hours to discuss a tailored plan for <strong className="text-white">{formData.resortName}</strong>.
        </p>
        <button
          type="button"
          onClick={() => {
            setSubmitted(false);
            setFormData({
              resortName: '',
              contactPerson: '',
              whatsappNumber: '',
              email: '',
              location: '',
              roomCount: '1-5',
              notes: '',
            });
          }}
          className="mt-6 inline-flex rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-semibold text-neutral-300 hover:text-white"
        >
          Submit Another Property Inquiry
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-2xl rounded-3xl border border-neutral-800 bg-neutral-900/90 p-8 shadow-2xl backdrop-blur-md"
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Resort / Property Name */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Resort / Villa Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Raigad Tropical, Palm Breeze Villa"
            value={formData.resortName}
            onChange={(e) => setFormData({ ...formData, resortName: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Contact Person */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Owner / Manager Name *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Rohan Sharma"
            value={formData.contactPerson}
            onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* WhatsApp Mobile */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            WhatsApp Contact Number *
          </label>
          <input
            type="tel"
            required
            placeholder="e.g. +91 98000 00000"
            value={formData.whatsappNumber}
            onChange={(e) => setFormData({ ...formData, whatsappNumber: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none font-mono"
          />
        </div>

        {/* Email Address */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Email Address (Optional)
          </label>
          <input
            type="email"
            placeholder="owner@resort.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Location */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Property Location / City *
          </label>
          <input
            type="text"
            required
            placeholder="e.g. Raigad, Alibaug, Lonavala, Goa"
            value={formData.location}
            onChange={(e) => setFormData({ ...formData, location: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Room / Unit Count */}
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Number of Villas / Rooms *
          </label>
          <select
            value={formData.roomCount}
            onChange={(e) => setFormData({ ...formData, roomCount: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white focus:border-emerald-500 focus:outline-none"
          >
            <option value="1-5">1 – 5 Rooms / Standalone Villa</option>
            <option value="6-15">6 – 15 Boutique Rooms</option>
            <option value="16-30">16 – 30 Rooms</option>
            <option value="30+">30+ Rooms / Multiple Properties</option>
          </select>
        </div>

        {/* Specific Notes */}
        <div className="sm:col-span-2">
          <label className="block text-xs font-semibold uppercase tracking-wider text-neutral-300">
            Specific Requirements / Notes
          </label>
          <textarea
            rows={3}
            placeholder="Tell us about your direct booking goals, existing OTA commission pain points, or custom domain preferences..."
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3.5 py-2.5 text-xs text-white placeholder-neutral-500 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-8 flex flex-col items-center justify-between gap-4 sm:flex-row">
        <p className="text-[11px] text-neutral-400">
          🔒 Zero spam guarantee. We connect via WhatsApp to schedule an offline demo.
        </p>

        <button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-7 py-3.5 text-xs font-black text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400 disabled:opacity-60"
        >
          <span>{isPending ? 'Submitting...' : 'Request Private Consultation →'}</span>
        </button>
      </div>
    </form>
  );
}
