'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import SignOutButton from './SignOutButton';
import { Tenant, UserRole, ModuleEntitlements } from '@/types';
import { switchActiveResort } from '@/app/actions/tenant';

interface AdminSidebarNavProps {
  resortName?: string;
  resortSubdomain?: string;
  userRole?: UserRole;
  primaryBrandColor?: string;
  currentTenantId?: string;
  userResorts?: Tenant[];
  moduleEntitlements?: Partial<ModuleEntitlements>;
}

const roleLabels: Record<string, string> = {
  superadmin: 'Platform Master',
  tenant_admin: 'Resort Admin Suite',
  resort_manager: 'Manager Suite',
  front_desk: 'Front Desk Suite',
  housekeeping: 'Housekeeping Desk',
  restaurant_staff: 'Restaurant Desk',
  accountant: 'Financial Accounts',
  staff: 'Front Desk Suite',
  guest: 'Guest Account',
};

export default function AdminSidebarNav({
  resortName = 'Resort PMS',
  resortSubdomain = 'raigad-tropical',
  userRole = 'tenant_admin',
  primaryBrandColor = '#059669',
  currentTenantId = '',
  userResorts = [],
  moduleEntitlements,
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
      name: 'Housekeeping Desk',
      href: '/housekeeping',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      ),
    },
    {
      name: 'Restaurant & Orders',
      href: '/restaurant',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      name: 'Guest Services',
      href: '/guest-services',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      ),
    },
    {
      name: 'Activities & Add-ons',
      href: '/activities',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      name: 'Guest Reviews',
      href: '/reviews',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
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
      name: 'Taxes & Meal Plans',
      href: '/settings/tax',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
        </svg>
      ),
    },
    {
      name: 'Payment Settings',
      href: '/settings',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <circle cx="12" cy="12" r="3" strokeWidth="2" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83-2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
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
    {
      name: 'Platform Master',
      href: '/admin-master',
      icon: (
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
  ];

  const allowedLinks = navLinks.filter((link) => {
    // Platform Master link is strictly and ONLY for superadmin
    if (link.href === '/admin-master') {
      return userRole === 'superadmin';
    }

    // Filter out modules disabled in tenant settings
    if (moduleEntitlements) {
      if (link.href === '/restaurant' && moduleEntitlements.restaurant === false) return false;
      if (link.href === '/activities' && moduleEntitlements.activities === false) return false;
      if (link.href === '/housekeeping' && moduleEntitlements.housekeeping === false) return false;
      if (link.href === '/guest-services' && moduleEntitlements.guest_services === false) return false;
      if (link.href === '/reviews' && moduleEntitlements.reviews === false) return false;
    }

    if (userRole === 'superadmin' || userRole === 'tenant_admin') {
      return true;
    }

    if (userRole === 'resort_manager') {
      return [
        '/dashboard',
        '/bookings',
        '/calendar',
        '/inventory',
        '/housekeeping',
        '/restaurant',
        '/guest-services',
        '/activities',
        '/reviews',
        '/reports',
        '/settings/team',
      ].includes(link.href);
    }

    if (userRole === 'front_desk' || userRole === 'staff') {
      return [
        '/dashboard',
        '/bookings',
        '/calendar',
        '/inventory',
        '/housekeeping',
        '/guest-services',
        '/restaurant',
        '/activities',
      ].includes(link.href);
    }

    if (userRole === 'housekeeping') {
      return ['/dashboard', '/housekeeping', '/inventory'].includes(link.href);
    }

    if (userRole === 'restaurant_staff') {
      return ['/dashboard', '/restaurant'].includes(link.href);
    }

    if (userRole === 'accountant') {
      return ['/dashboard', '/bookings', '/reports', '/settings', '/audit-logs'].includes(link.href);
    }

    return ['/dashboard'].includes(link.href);
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
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-base font-bold text-white">
                  {safeResortName}
                </p>
                <p
                  className="text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ color: safeBrandColor }}
                >
                  {roleLabels[userRole] || 'Resort Operations'}
                </p>
              </div>
            </div>

            {/* Multi-Resort Selector (Requirement 8) */}
            {userResorts && userResorts.length > 1 && (
              <div className="border-b border-white/10 bg-white/5 px-4 py-2.5">
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                  <span>Switch Resort</span>
                  <span className="rounded bg-neutral-800 px-1.5 py-0.2 text-[9px] text-neutral-300">
                    {userResorts.length} properties
                  </span>
                </div>
                <select
                  value={currentTenantId}
                  onChange={async (e) => {
                    const targetId = e.target.value;
                    if (targetId && targetId !== currentTenantId) {
                      await switchActiveResort(targetId);
                      window.location.reload();
                    }
                  }}
                  className="mt-1.5 w-full rounded-lg border border-white/15 bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white transition focus:border-white/40 focus:outline-none"
                >
                  {userResorts.map((r) => (
                    <option key={r.id} value={r.id} className="bg-neutral-950 text-white">
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

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
