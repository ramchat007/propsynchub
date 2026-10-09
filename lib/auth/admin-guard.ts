import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { Tenant, UserRole } from '@/types';

import { PLATFORM_SUPERADMIN_EMAILS, AUTHORIZED_ADMIN_EMAILS, PRIMARY_DEMO_TENANT_ID } from '@/lib/constants';
export { PLATFORM_SUPERADMIN_EMAILS, AUTHORIZED_ADMIN_EMAILS, PRIMARY_DEMO_TENANT_ID };

export interface AuthenticatedAdminContext {
  authorized: boolean;
  user: {
    id: string;
    email?: string;
  } | null;
  role: UserRole;
  tenantId: string | null;
  tenant: Tenant | null;
  error?: string;
}

/**
 * Resolves the authenticated user, verifies their resort staff/admin role,
 * and fetches the tenant they are authorized to manage.
 * 
 * Strict Multi-Tenant Security:
 * - If user is not logged in -> authorized: false
 * - If user is not an approved resort admin or staff member -> authorized: false
 * - Superadmin access is strictly limited to provisioned PLATFORM_SUPERADMIN_EMAILS
 * - Never falls back to a random tenant for unknown users.
 */
export async function getAuthenticatedAdminContext(): Promise<AuthenticatedAdminContext> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      user: null,
      role: 'guest',
      tenantId: null,
      tenant: null,
      error: 'Unauthenticated',
    };
  }

  const adminDb = createAdminClient();
  const email = (user.email || '').toLowerCase().trim();

  // 1. Check if user is a Platform Administrator (superadmin)
  // Non-negotiable rule: only explicitly provisioned PLATFORM_SUPERADMIN_EMAILS
  const isPlatformSuperAdmin = PLATFORM_SUPERADMIN_EMAILS.includes(email);

  if (isPlatformSuperAdmin) {
    const cookieStore = await cookies();
    const activeTenantCookie = cookieStore.get('active_tenant_id')?.value;
    let targetTenantId =
      activeTenantCookie || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || PRIMARY_DEMO_TENANT_ID;

    // Verify tenant exists and is active
    let { data: tenantData } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', targetTenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (!tenantData) {
      targetTenantId = PRIMARY_DEMO_TENANT_ID;
      const { data: fallbackTenant } = await adminDb
        .from('tenants')
        .select('*')
        .eq('id', targetTenantId)
        .maybeSingle();
      tenantData = fallbackTenant;
    }

    // Ensure database profile is synchronized as superadmin
    try {
      const { data: existingProfile } = await adminDb
        .from('profiles')
        .select('id, role, tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      if (!existingProfile) {
        await adminDb.from('profiles').insert({
          id: user.id,
          tenant_id: targetTenantId,
          mobile_number: user.phone || '+919999999999',
          full_name: email.split('@')[0],
          role: 'superadmin',
        });
      } else if (
        existingProfile.role !== 'superadmin' ||
        existingProfile.tenant_id !== targetTenantId
      ) {
        await adminDb
          .from('profiles')
          .update({
            role: 'superadmin',
            tenant_id: targetTenantId,
          })
          .eq('id', user.id);
      }
    } catch (profErr) {
      console.warn('[AdminGuard] Error synchronizing superadmin profile:', profErr);
    }

    const tenant = (tenantData as unknown as Tenant) || null;

    return {
      authorized: true,
      user: { id: user.id, email: user.email },
      role: 'superadmin',
      tenantId: targetTenantId,
      tenant,
    };
  }

  // 2. Check if user's email matches ANY active resort's official contact_email
  if (email) {
    const { data: tenantByEmail } = await adminDb
      .from('tenants')
      .select('*')
      .ilike('contact_email', email)
      .eq('is_active', true)
      .maybeSingle();

    if (tenantByEmail) {
      // Synchronize database profile as tenant_admin for this resort
      try {
        const { data: existingProfile } = await adminDb
          .from('profiles')
          .select('id, role, tenant_id')
          .eq('id', user.id)
          .maybeSingle();

        if (!existingProfile) {
          await adminDb.from('profiles').insert({
            id: user.id,
            tenant_id: tenantByEmail.id,
            mobile_number: tenantByEmail.contact_phone || '+919999999999',
            full_name: email.split('@')[0],
            role: 'tenant_admin',
          });
        } else if (
          existingProfile.role !== 'tenant_admin' ||
          existingProfile.tenant_id !== tenantByEmail.id
        ) {
          await adminDb
            .from('profiles')
            .update({
              role: 'tenant_admin',
              tenant_id: tenantByEmail.id,
            })
            .eq('id', user.id);
        }
      } catch (profErr) {
        console.warn('[AdminGuard] Error linking dynamic resort admin profile:', profErr);
      }

      return {
        authorized: true,
        user: { id: user.id, email: user.email },
        role: 'tenant_admin',
        tenantId: tenantByEmail.id,
        tenant: tenantByEmail as unknown as Tenant,
      };
    }
  }

  // 3. For all other users, inspect their assigned profile in PostgreSQL
  const { data: profile } = await adminDb
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .maybeSingle();

  const role = (profile?.role as UserRole) || 'guest';
  const isStaffOrAdmin =
    role === 'tenant_admin' ||
    role === 'resort_manager' ||
    role === 'front_desk' ||
    role === 'housekeeping' ||
    role === 'restaurant_staff' ||
    role === 'accountant' ||
    role === 'staff' ||
    role === 'superadmin';

  if (!isStaffOrAdmin || !profile?.tenant_id) {
    return {
      authorized: false,
      user: { id: user.id, email: user.email },
      role: 'guest',
      tenantId: null,
      tenant: null,
      error: `Access Denied: Your account (${email || 'User'}) is not registered as staff or administrator for any resort.`,
    };
  }

  // 4. Fetch the tenant assigned to this staff member
  const { data: staffTenant } = await adminDb
    .from('tenants')
    .select('*')
    .eq('id', profile.tenant_id)
    .eq('is_active', true)
    .maybeSingle();

  if (!staffTenant) {
    return {
      authorized: false,
      user: { id: user.id, email: user.email },
      role: 'guest',
      tenantId: null,
      tenant: null,
      error: 'Associated resort property is inactive or does not exist.',
    };
  }

  // Check specialized role from tenant settings if present (e.g. accountant, resort_manager, front_desk)
  const tenantSettings = (staffTenant.settings as Record<string, unknown>) || {};
  const staffRoles = (tenantSettings.staff_roles as Record<string, UserRole>) || {};
  const resolvedRole = staffRoles[user.id] || role;

  return {
    authorized: true,
    user: { id: user.id, email: user.email },
    role: resolvedRole,
    tenantId: staffTenant.id,
    tenant: staffTenant as unknown as Tenant,
  };
}

/**
 * Retrieves all resorts the authenticated user is authorized to manage.
 * Used for multi-resort selector in header/sidebar.
 */
export async function getAuthorizedResorts(): Promise<Tenant[]> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const adminDb = createAdminClient();
  const email = (user.email || '').toLowerCase().trim();

  // Superadmins can access all active resorts
  if (PLATFORM_SUPERADMIN_EMAILS.includes(email)) {
    const { data: allTenants } = await adminDb
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .order('name');
    return (allTenants || []) as unknown as Tenant[];
  }

  // Check profiles table
  const { data: profile } = await adminDb
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.role === 'guest' || !profile.tenant_id) {
    // Also check if listed in tenant settings.admin_emails or contact_email
    const { data: contactTenants } = await adminDb
      .from('tenants')
      .select('*')
      .ilike('contact_email', email)
      .eq('is_active', true);
    return (contactTenants || []) as unknown as Tenant[];
  }

  const { data: assignedTenant } = await adminDb
    .from('tenants')
    .select('*')
    .eq('id', profile.tenant_id)
    .eq('is_active', true);

  return (assignedTenant || []) as unknown as Tenant[];
}

/**
 * Server Component Helper: Enforces admin access or redirects to login
 */
export async function requireAdminAuth(
  redirectToPath: string = '/dashboard',
  allowedRoles?: UserRole[]
): Promise<AuthenticatedAdminContext> {
  const auth = await getAuthenticatedAdminContext();

  if (!auth.user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectToPath)}`);
  }

  if (!auth.authorized || !auth.tenant) {
    redirect(`/login?error=${encodeURIComponent(auth.error || 'Access denied.')}`);
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(auth.role)) {
    // If user's role is not in allowed roles, redirect to dashboard or appropriate sub-view
    redirect('/dashboard');
  }

  return auth;
}

/**
 * Server Component Helper: Enforces exclusive platform superadmin access (/admin-master)
 * Strictly verifies authenticated user in PLATFORM_SUPERADMIN_EMAILS and role 'superadmin'.
 */
export async function requireSuperAdminAuth(
  redirectToPath: string = '/admin-master'
): Promise<AuthenticatedAdminContext> {
  const auth = await getAuthenticatedAdminContext();

  if (!auth.user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectToPath)}`);
  }

  const email = (auth.user.email || '').toLowerCase().trim();
  const isSuper = auth.role === 'superadmin' && PLATFORM_SUPERADMIN_EMAILS.includes(email);

  if (!isSuper) {
    redirect(`/dashboard?error=${encodeURIComponent('Access Denied: Platform Superadmin privileges required.')}`);
  }

  return auth;
}

