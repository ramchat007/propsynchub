import React from 'react';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import AdminSidebarNav from '@/components/admin/AdminSidebarNav';

export const dynamic = 'force-dynamic';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let resortName = 'Raigad Tropical Resort';
  let resortSubdomain = 'raigad-tropical';

  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const adminDb = createAdminClient();
    let tenantId: string | null = null;

    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (profile?.tenant_id && UUID_REGEX.test(profile.tenant_id)) {
        tenantId = profile.tenant_id;
      }
    }

    if (!tenantId) {
      const envTenantId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;
      if (envTenantId && UUID_REGEX.test(envTenantId)) {
        tenantId = envTenantId;
      }
    }

    if (tenantId) {
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('name, subdomain')
        .eq('id', tenantId)
        .maybeSingle();

      if (tenant) {
        resortName = tenant.name || resortName;
        resortSubdomain = tenant.subdomain || resortSubdomain;
      }
    } else {
      const { data: activeTenants } = await adminDb
        .from('tenants')
        .select('name, subdomain')
        .eq('is_active', true)
        .limit(1);

      if (activeTenants && activeTenants[0]) {
        resortName = activeTenants[0].name || resortName;
        resortSubdomain = activeTenants[0].subdomain || resortSubdomain;
      }
    }
  } catch (err) {
    console.error('Error resolving tenant context in AdminLayout:', err);
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-neutral-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      {/* 1. Sleek Left Sidebar Navigation */}
      <AdminSidebarNav resortName={resortName} resortSubdomain={resortSubdomain} />

      {/* 2. Main Admin Workspace Container */}
      <div className="lg:pl-72 flex min-h-screen flex-col">
        {/* Sticky Top Header bar */}
        <header className="sticky top-0 z-30 hidden lg:flex h-16 items-center justify-between border-b border-neutral-200/80 bg-white/80 px-8 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/80">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Admin Suite
            </span>
            <span className="text-neutral-300 dark:text-neutral-700">/</span>
            <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200">
              {resortName}
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200/60 dark:bg-emerald-950/60 dark:border-emerald-800 dark:text-emerald-300">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Live PMS Sync Active
            </span>

            <a
              href={`/${resortSubdomain}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-3.5 py-1.5 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <span>🌐 Public Resort Site</span>
              <span className="text-[10px] text-neutral-400">↗</span>
            </a>
          </div>
        </header>

        {/* Content Workspace */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
