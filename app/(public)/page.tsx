import React from 'react';
import Link from 'next/link';

export default function PlatformHomePage() {
  return (
    <div className="min-h-screen bg-neutral-950 font-sans text-neutral-100 antialiased selection:bg-emerald-500 selection:text-black">
      {/* =================================================================== */}
      {/* 1. TOP SAAS PLATFORM NAVBAR */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-50 border-b border-neutral-800/80 bg-neutral-950/80 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-lg font-black text-white shadow-lg shadow-emerald-500/20">
              P
            </span>
            <div>
              <span className="text-xl font-black tracking-tight text-white">
                PropSyncHub
              </span>
              <span className="block text-[9px] font-bold tracking-widest text-emerald-400 uppercase">
                Hospitality Cloud OS
              </span>
            </div>
          </Link>

          <nav className="hidden items-center gap-8 text-xs font-semibold tracking-wider text-neutral-400 uppercase md:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#architecture" className="transition hover:text-white">
              White-Label Engine
            </a>
            <a href="#demo" className="transition hover:text-white">
              Live Demo
            </a>
            <a href="#pricing" className="transition hover:text-white">
              Subscription
            </a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-neutral-200 transition hover:border-neutral-700 hover:text-white"
            >
              Resort Owner Login
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-500 px-4 py-2.5 text-xs font-bold text-neutral-950 shadow-md shadow-emerald-500/20 transition hover:bg-emerald-400 active:scale-95"
            >
              <span>Get Started</span>
              <span>→</span>
            </Link>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. HERO SECTION */}
      {/* =================================================================== */}
      <section className="relative overflow-hidden px-4 pt-20 pb-24 text-center sm:px-6 lg:px-8">
        {/* Glow backdrop */}
        <div className="absolute top-1/2 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/15 blur-3xl" />

        <div className="mx-auto max-w-4xl space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-950/40 px-4 py-1.5 text-xs font-bold text-emerald-400 shadow-inner">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Multi-Tenant Architecture · Zero Code Required</span>
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-tight">
            The Operating System for{' '}
            <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
              Boutique Resorts &amp; Luxury Villas
            </span>
          </h1>

          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-neutral-400 sm:text-base">
            Eliminate 20% OTA commissions. PropSyncHub gives every property a turnkey, white-labeled luxury booking portal, unified restaurant and spa folios, and instant guest KYC—under your own custom domain.
          </p>

          <div className="flex flex-col items-center justify-center gap-4 pt-4 sm:flex-row">
            <Link
              href="/raigad-tropical"
              target="_blank"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-7 py-3.5 text-xs font-black text-neutral-950 shadow-xl transition hover:bg-neutral-200 active:scale-95 sm:w-auto"
            >
              <span>✨ Explore Live Demo: Raigad Tropical</span>
              <span className="text-neutral-500">↗</span>
            </Link>

            <Link
              href="/login"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-neutral-700 bg-neutral-900/80 px-7 py-3.5 text-xs font-bold text-neutral-200 backdrop-blur-sm transition hover:border-neutral-600 hover:text-white sm:w-auto"
            >
              <span>Register Your Resort</span>
              <span>➔</span>
            </Link>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. DUAL-WORLD ARCHITECTURE VISUALIZER */}
      {/* =================================================================== */}
      <section id="architecture" className="border-y border-neutral-800/80 bg-neutral-900/40 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
              Two Worlds · One Single Platform
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              How PropSyncHub Separates Your Brand from the Software
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-xs text-neutral-400 sm:text-sm">
              Your guests never see our name. They experience your resort as a 100% bespoke private brand.
            </p>
          </div>

          <div className="mt-14 grid grid-cols-1 gap-8 lg:grid-cols-2">
            {/* World 1: The Guest Experience */}
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-xl">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <span className="rounded-full bg-emerald-950/60 px-3 py-1 text-[11px] font-bold text-emerald-400 border border-emerald-800/50">
                  World 1: Guest Facing
                </span>
                <span className="font-mono text-[11px] text-neutral-500">
                  raigadtropical.com or .propsynchub.com
                </span>
              </div>

              <h3 className="mt-6 text-xl font-bold text-white">
                Turnkey Luxury Resort Showcase
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                A high-converting single-page resort portal dynamically styled with the property&apos;s primary colors, photo gallery, villa specs, and live availability.
              </p>

              <ul className="mt-6 space-y-3 text-xs text-neutral-300">
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>Zero PropSyncHub Branding:</strong> 100% white-labeled to the resort.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>Embedded Date Picker:</strong> Real-time night calculations &amp; extra pax charges.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>Direct Razorpay UPI / Cards:</strong> Payments route directly to resort owner&apos;s bank.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-emerald-400">✓</span>
                  <span><strong>WhatsApp Instant Chat:</strong> Connect guests directly to the concierge.</span>
                </li>
              </ul>

              <div className="mt-8 pt-4">
                <Link
                  href="/raigad-tropical"
                  target="_blank"
                  className="inline-flex items-center gap-2 text-xs font-bold text-emerald-400 hover:text-emerald-300"
                >
                  <span>Preview Raigad Tropical Showcase</span>
                  <span>↗</span>
                </Link>
              </div>
            </div>

            {/* World 2: The Resort Manager */}
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-xl">
              <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
                <span className="rounded-full bg-cyan-950/60 px-3 py-1 text-[11px] font-bold text-cyan-400 border border-cyan-800/50">
                  World 2: Property Manager
                </span>
                <span className="font-mono text-[11px] text-neutral-500">
                  propsynchub.com/dashboard
                </span>
              </div>

              <h3 className="mt-6 text-xl font-bold text-white">
                All-in-One Operations &amp; Ledger Desk
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                A single admin interface protected by mobile OTP. Staff manage rooms, post incidental dining orders to guest folios, and download tax invoices.
              </p>

              <ul className="mt-6 space-y-3 text-xs text-neutral-300">
                <li className="flex items-center gap-2.5">
                  <span className="text-cyan-400">✓</span>
                  <span><strong>Unified Room &amp; Dining Ledger:</strong> Add spa, dining &amp; damage fees.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-cyan-400">✓</span>
                  <span><strong>Immutable Audit Trail:</strong> DB triggers log every price &amp; booking change.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-cyan-400">✓</span>
                  <span><strong>Website &amp; Media CMS:</strong> Update photo gallery and story without coding.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="text-cyan-400">✓</span>
                  <span><strong>Multi-Tenant Isolation:</strong> Resort A cannot see or touch Resort B&apos;s data.</span>
                </li>
              </ul>

              <div className="mt-8 pt-4">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 text-xs font-bold text-cyan-400 hover:text-cyan-300"
                >
                  <span>Access Manager Dashboard</span>
                  <span>➔</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. PLATFORM CAPABILITIES GRID */}
      {/* =================================================================== */}
      <section id="features" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
            Core Modules
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Built for Modern Hospitality Independence
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-950 text-xl text-emerald-400 border border-emerald-800/60">
              💳
            </span>
            <h4 className="mt-4 text-base font-bold text-white">Direct Razorpay Payouts</h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Resort owners plug in their own Razorpay keys. Guest payments land directly in the owner&apos;s account. PropSyncHub takes zero commission cuts.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-950 text-xl text-cyan-400 border border-cyan-800/60">
              📋
            </span>
            <h4 className="mt-4 text-base font-bold text-white">Unified Folio &amp; Incidentals</h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Staff can post restaurant bills, spa sessions, minibar items, and damage fees directly to the active reservation folio. Generate itemized GST invoices.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-purple-950 text-xl text-purple-400 border border-purple-800/60">
              🛡️
            </span>
            <h4 className="mt-4 text-base font-bold text-white">PostgreSQL Audit Logging</h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Database-level triggers record every price update, booking cancellation, and ledger mutation with staff user IDs, timestamps, and full JSON diffs.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-950 text-xl text-amber-400 border border-amber-800/60">
              🌐
            </span>
            <h4 className="mt-4 text-base font-bold text-white">Subdomains &amp; Custom Domains</h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Launch instantly on a clean subdomain (<code className="text-emerald-400">resort.propsynchub.com</code>) or connect your own fully custom domain (<code className="text-emerald-400">firstresort.com</code>) via simple CNAME routing.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-950 text-xl text-rose-400 border border-rose-800/60">
              📱
            </span>
            <h4 className="mt-4 text-base font-bold text-white">Passwordless Mobile OTP</h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Resort staff and owners log in with their phone number and WhatsApp OTP. No forgotten passwords, secure sessions stored in cookies via @supabase/ssr.
            </p>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900/60 p-6">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-950 text-xl text-indigo-400 border border-indigo-800/60">
              🖼️
            </span>
            <h4 className="mt-4 text-base font-bold text-white">Website &amp; Media CMS</h4>
            <p className="mt-2 text-xs leading-relaxed text-neutral-400">
              Upload photos to Supabase Storage, toggle resort amenities, customize check-in rules, and edit your tagline right from the admin dashboard.
            </p>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. PRICING & SUBSCRIPTION MODEL */}
      {/* =================================================================== */}
      <section id="pricing" className="border-t border-neutral-800/80 bg-neutral-900/30 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="text-xs font-bold tracking-widest text-emerald-400 uppercase">
              Predictable Pricing
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
              Keep 100% of Your Booking Revenue
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-xs text-neutral-400 sm:text-sm">
              No hidden commission fees. Choose a transparent yearly subscription for your property.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 max-w-4xl mx-auto">
            {/* Starter Plan */}
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900/80 p-8 shadow-lg">
              <span className="rounded-full bg-neutral-800 px-3 py-1 text-[11px] font-bold text-neutral-300">
                Starter Plan
              </span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-white">₹15,000</span>
                <span className="text-xs text-neutral-400">/ year</span>
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                Ideal for independent villas and homestays launching direct bookings.
              </p>

              <ul className="mt-6 space-y-3 text-xs text-neutral-300 border-t border-neutral-800 pt-6">
                <li className="flex items-center gap-2">✓ Branded Subdomain (resort.propsynchub.com)</li>
                <li className="flex items-center gap-2">✓ Direct Booking Engine &amp; Date Picker</li>
                <li className="flex items-center gap-2">✓ Razorpay Payment Integration</li>
                <li className="flex items-center gap-2">✓ Unified Restaurant &amp; Spa Folio</li>
                <li className="flex items-center gap-2">✓ Mobile OTP Admin Access</li>
              </ul>

              <Link
                href="/login"
                className="mt-8 block w-full rounded-2xl border border-neutral-700 bg-neutral-800 py-3 text-center text-xs font-bold text-white transition hover:bg-neutral-700"
              >
                Choose Starter
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="relative rounded-3xl border-2 border-emerald-500 bg-gradient-to-b from-neutral-900 to-emerald-950/20 p-8 shadow-2xl">
              <span className="rounded-full bg-emerald-500 px-3 py-1 text-[11px] font-bold text-neutral-950">
                Most Popular
              </span>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-extrabold text-white">₹35,000</span>
                <span className="text-xs text-neutral-400">/ year</span>
              </div>
              <p className="mt-2 text-xs text-neutral-400">
                For boutique resorts requiring a custom domain and zero platform branding.
              </p>

              <ul className="mt-6 space-y-3 text-xs text-neutral-300 border-t border-neutral-800 pt-6">
                <li className="flex items-center gap-2 font-bold text-white">✓ Everything in Starter, plus:</li>
                <li className="flex items-center gap-2">✓ <strong>Custom Domain</strong> (e.g. raigadtropical.com)</li>
                <li className="flex items-center gap-2">✓ 100% White-Label (No &quot;Powered by&quot; link)</li>
                <li className="flex items-center gap-2">✓ Priority WhatsApp Guest Support Hook</li>
                <li className="flex items-center gap-2">✓ Multiple Staff Roles &amp; Permissions</li>
              </ul>

              <Link
                href="/login"
                className="mt-8 block w-full rounded-2xl bg-emerald-500 py-3 text-center text-xs font-black text-neutral-950 shadow-lg shadow-emerald-500/20 transition hover:bg-emerald-400"
              >
                Start 14-Day Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 6. PLATFORM FOOTER */}
      {/* =================================================================== */}
      <footer className="border-t border-neutral-900 bg-neutral-950 py-10 text-center text-xs text-neutral-600">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-400">PropSyncHub</span>
              <span>·</span>
              <span>Hospitality Property Management &amp; Direct Booking Cloud</span>
            </div>

            <div className="flex items-center gap-4 text-neutral-500">
              <Link href="/raigad-tropical" target="_blank" className="hover:text-white">
                Live Demo Resort ↗
              </Link>
              <Link href="/login" className="hover:text-white">
                Owner Login
              </Link>
            </div>
          </div>
          <p className="mt-6 text-[11px] text-neutral-700">
            © {new Date().getFullYear()} PropSyncHub Technologies. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
