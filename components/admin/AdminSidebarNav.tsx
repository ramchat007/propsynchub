'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SignOutButton from './SignOutButton';

interface AdminSidebarNavProps {
  resortName?: string;
  resortSubdomain?: string;
  userRole?: 'superadmin' | 'tenant_admin' | 'staff' | 'guest';
  primaryBrandColor?: string;
}

export default function AdminSidebarNav({
  resortName = 'Resort PMS',
  resortSubdomain = 'raigad-tropical',
  userRole = 'tenant_admin',
  primaryBrandColor = '#059669',
}: AdminSidebarNavProps) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const safeResortName = typeof resortName === 'string' && resortName.trim() ? resortName.trim() : 'Resort PMS';
  const safeSubdomain = typeof resortSubdomain === 'string' && resortSubdomain.trim() ? resortSubdomain.trim() : 'raigad-tropical';
  const safeBrandColor = typeof primaryBrandColor === 'string' && primaryBrandColor.trim() ? primaryBrandColor.trim() : '#059669';
  const lettermark = safeResortName.charAt(0).toUpperCase() || 'R';

  const isHex6 = /^#[0-9A-Fa-f]{6}$/.test(safeBrandColor);
  const alphaBg = isHex6 ? `${safeBrandColor}18` : 'rgba(5, 150, 105, 0.1)';
  const alphaBorder = isHex6 ? `${safeBrandColor}40` : 'rgba(5, 150, 105, 0.25)';

  const navLinks = [
    {
      name: 'Dashboard',
      href: '/dashboard',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <rect width="7" height="9" x="3" y="3" rx="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect width="7" height="5" x="14" y="3" rx="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect width="7" height="9" x="14" y="12" rx="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <rect width="7" height="5" x="3" y="16" rx="1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      name: 'Reservations',
      href: '/bookings',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 2v4M16 2v4M3 10h18" />
          <rect width="18" height="18" x="3" y="4" rx="2" strokeWidth="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m9 16 2 2 4-4" />
        </svg>
      ),
    },
    {
      name: 'Occupancy Calendar',
      href: '/calendar',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      ),
    },
    {
      name: 'Rooms & Inventory',
      href: '/inventory',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2 20v-8a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v8M4 10V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v4M12 4v6M2 18h20" />
        </svg>
      ),
    },
    {
      name: 'Reports & Analytics',
      href: '/reports',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 3v18h18M18 9l-5 5-4-4-3 3" />
        </svg>
      ),
    },
    {
      name: 'Website CMS',
      href: '/settings/website',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" />
        </svg>
      ),
    },
    {
      name: 'Team & Staff',
      href: '/settings/team',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      ),
    },
    {
      name: 'Audit Trail',
      href: '/audit-logs',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5.586a1 1 0 0 1 .707.293l5.414 5.414a1 1 0 0 1 .293.707V19a2 2 0 0 1-2 2z" />
        </svg>
      ),
    },
    {
      name: 'Payment Settings',
      href: '/settings',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="3" strokeWidth="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      ),
    },
    {
      name: 'Subscription & SaaS',
      href: '/settings/subscription',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
      ),
    },
  ];

  const allowedLinks = navLinks.filter((link) => {
    if (userRole === 'staff') {
      return ['/dashboard', '/bookings', '/calendar', '/inventory'].includes(link.href);
    }
    return true;
  });

  return (
    <>
      {/* DESKTOP FIXED SIDEBAR */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 border-r border-white/10 bg-neutral-950 text-white lg:block">
        <div className="flex h-full flex-col justify-between">
          <div>
            {/* Resort Branding Header */}
            <div className="flex h-20 items-center gap-3 border-b border-white/10 px-6">
              <span
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl font-black text-white shadow-md transition-all"
                style={{ backgroundColor: safeBrandColor }}
              >
                {lettermark}
              </span>
              <div className="min-w-0">
                <p className="truncate font-serif text-base font-bold text-white">
                  {safeResortName}
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: safeBrandColor }}
                >
                  {userRole === 'staff' ? 'Front Desk Suite' : 'Resort Admin Suite'}
                </p>
              </div>
            </div>

            {/* Navigation links */}
            <nav className="space-y-1.5 px-4 py-6">
              {allowedLinks.map((item) => {
                const isActive =
                  item.href === '/settings'
                    ? pathname === '/settings'
                    : pathname === item.href ||
                      (item.href !== '/dashboard' && pathname.startsWith(item.href));

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    style={
                      isActive
                        ? { backgroundColor: safeBrandColor, color: '#ffffff' }
                        : undefined
                    }
                    className={`flex min-h-[44px] items-center gap-3 rounded-xl px-4 text-xs font-bold transition ${
                      isActive
                        ? 'shadow-md'
                        : 'text-neutral-300 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-white/10 p-4 space-y-2.5">
            {userRole !== 'staff' && (
              <Link
                href="/onboarding"
                style={{
                  backgroundColor: alphaBg,
                  borderColor: alphaBorder,
                  color: safeBrandColor,
                }}
                className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition hover:opacity-90"
              >
                <span>➕ Launch New Resort</span>
              </Link>
            )}

            <Link
              href={`/${safeSubdomain}`}
              target="_blank"
              className="flex min-h-[38px] w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-semibold text-neutral-200 transition hover:bg-white/10 hover:text-white"
            >
              <span>🌐 View Live Website</span>
              <span className="text-[10px] text-neutral-400">↗</span>
            </Link>

            <div className="flex items-center justify-between px-2 pt-1 text-xs">
              <span className="text-[11px] text-neutral-400 font-medium">Logged in as Admin</span>
              <SignOutButton />
            </div>
          </div>
        </div>
      </aside>

      {/* MOBILE TOP BAR WITH HAMBURGER */}
      <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-neutral-200 bg-white px-4 lg:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="rounded-xl border border-neutral-200 p-2 text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            aria-label="Open mobile menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-sm text-neutral-900 dark:text-white truncate">
            {safeResortName}
          </span>
        </div>

        <Link
          href={`/${safeSubdomain}`}
          target="_blank"
          style={{ backgroundColor: safeBrandColor }}
          className="rounded-lg px-3 py-1.5 text-xs font-bold text-white shadow-xs"
        >
          View Site ↗
        </Link>
      </div>

      {/* MOBILE FLYOUT MENU */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs lg:hidden">
          <div className="flex h-full w-72 flex-col justify-between bg-neutral-950 p-5 text-white">
            <div>
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-sm">{safeResortName}</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-stone-400 text-lg"
                >
                  ✕
                </button>
              </div>

              <nav className="mt-4 space-y-1.5">
                {allowedLinks.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex min-h-[42px] items-center gap-3 rounded-xl px-3 text-xs font-bold text-neutral-200 hover:bg-white/10"
                  >
                    {item.icon}
                    <span>{item.name}</span>
                  </Link>
                ))}
              </nav>
            </div>

            <div className="border-t border-white/10 pt-4 space-y-2">
              {userRole !== 'staff' && (
                <Link
                  href="/onboarding"
                  onClick={() => setMobileMenuOpen(false)}
                  style={{
                    backgroundColor: alphaBg,
                    borderColor: alphaBorder,
                    color: safeBrandColor,
                  }}
                  className="flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition hover:opacity-90"
                >
                  <span>➕ Launch New Resort</span>
                </Link>
              )}
              <SignOutButton />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
