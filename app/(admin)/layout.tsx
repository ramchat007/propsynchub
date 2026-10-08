import React from 'react';
import Link from 'next/link';
import AdminSidebarNav from '@/components/admin/AdminSidebarNav';
import { getAuthenticatedAdminContext } from '@/lib/auth/admin-guard';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const auth = await getAuthenticatedAdminContext();

  // Multi-tenant permission guard: Guests & unauthorized Google accounts cannot view operational desk
  if (!auth.authorized || auth.role === 'guest' || !auth.tenant) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-6 dark:bg-neutral-950">
        <div className="max-w-md w-full bg-white rounded-3xl p-8 border border-stone-200 shadow-xl text-center space-y-5 dark:bg-neutral-900 dark:border-neutral-800">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 text-2xl dark:bg-amber-950/60 dark:text-amber-400">
            🔒
          </div>
          <div>
            <h1 className="text-xl font-bold text-neutral-900 dark:text-white">Staff Access Required</h1>
            <p className="mt-2 text-xs text-stone-500 leading-relaxed dark:text-stone-400">
              {auth.user?.email ? (
                <>Your account (<strong>{auth.user.email}</strong>) is not registered as staff or administrator for any resort on PropSyncHub.</>
              ) : (
                <>Please sign in with a verified resort administrator account to access the operations desk.</>
              )}
            </p>
          </div>
          <div className="pt-2 space-y-2.5">
            <Link
              href="/"
              className="block w-full rounded-xl bg-emerald-600 py-3 text-xs font-bold text-white shadow-xs hover:bg-emerald-500 transition"
            >
              Return to PropSyncHub Home
            </Link>
            <Link
              href="/login"
              className="block w-full rounded-xl border border-stone-300 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition dark:border-neutral-700 dark:text-stone-300 dark:hover:bg-neutral-800"
            >
              Sign In with Authorized Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const resortName =
    typeof auth.tenant?.name === 'string' && auth.tenant.name.trim()
      ? auth.tenant.name.trim()
      : 'Resort PMS';
  const resortSubdomain =
    typeof auth.tenant?.subdomain === 'string' && auth.tenant.subdomain.trim()
      ? auth.tenant.subdomain.trim()
      : 'raigad-tropical';
  const userRole = auth.role || 'tenant_admin';
  const primaryBrandColor =
    typeof auth.tenant?.settings?.primary_color_hex === 'string' && auth.tenant.settings.primary_color_hex.trim()
      ? auth.tenant.settings.primary_color_hex.trim()
      : typeof auth.tenant?.settings?.primaryColorHex === 'string' && auth.tenant.settings.primaryColorHex.trim()
      ? auth.tenant.settings.primaryColorHex.trim()
      : '#059669';

  return (
    <div
      style={{ '--brand-primary': primaryBrandColor } as React.CSSProperties}
      className="min-h-screen bg-stone-50 font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100"
    >
      {/* 1. Sleek Left Sidebar Navigation with Dynamic Brand Color */}
      <AdminSidebarNav
        resortName={resortName}
        resortSubdomain={resortSubdomain}
        userRole={userRole}
        primaryBrandColor={primaryBrandColor}
      />

      {/* 2. Main Content Area */}
      <div className="lg:pl-72 flex flex-col min-h-screen">
        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
