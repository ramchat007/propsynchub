import React from 'react';
import Link from 'next/link';
import SignOutButton from '@/components/admin/SignOutButton';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 border-b border-neutral-200/80 bg-white/80 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-6">
            <Link href="/dashboard" className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 font-bold text-white shadow-xs">
                P
              </span>
              <span className="text-base font-bold tracking-tight">PropSyncHub</span>
            </Link>
            <nav className="hidden md:flex items-center gap-4 text-xs font-semibold">
              <Link
                href="/dashboard"
                className="rounded-lg px-3 py-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Inventory &amp; Rooms
              </Link>
              <Link
                href="/bookings"
                className="rounded-lg px-3 py-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Bookings &amp; Ledger
              </Link>
              <Link
                href="/audit-logs"
                className="rounded-lg px-3 py-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Audit Trail
              </Link>
              <Link
                href="/settings/website"
                className="rounded-lg px-3 py-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Website CMS
              </Link>
              <Link
                href="/settings"
                className="rounded-lg px-3 py-1.5 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
              >
                Payment Settings
              </Link>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/raigad-tropical"
              target="_blank"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              <span>🌐 View Resort Site</span>
              <span className="text-[11px] text-neutral-400">↗</span>
            </Link>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              ● Live Sync
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
