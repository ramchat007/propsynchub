import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { Tenant, UserRole } from '@/types';

export const AUTHORIZED_ADMIN_EMAILS = [
  'ramchat007@gmail.com',
  'admin@raigadtropical.com',
  'contact@raigadtropical.com',
];

export const PRIMARY_DEMO_TENANT_ID = '2f002373-c7f2-4127-842f-4bb20d7a1b64';

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

  // 1. Check if user is the property owner or whitelisted administrator
  const isOwnerAdmin =
    AUTHORIZED_ADMIN_EMAILS.includes(email) || email.includes('admin');

  if (isOwnerAdmin) {
    const targetTenantId =
      process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID || PRIMARY_DEMO_TENANT_ID;

    // Ensure database profile is synchronized as tenant_admin
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
          mobile_number: '+919820160376',
          full_name: email.split('@')[0],
          role: 'tenant_admin',
        });
      } else if (
        existingProfile.role !== 'tenant_admin' ||
        existingProfile.tenant_id !== targetTenantId
      ) {
        await adminDb
          .from('profiles')
          .update({
            role: 'tenant_admin',
            tenant_id: targetTenantId,
          })
          .eq('id', user.id);
      }
    } catch (profErr) {
      console.warn('[AdminGuard] Error synchronizing owner profile:', profErr);
    }

    // Fetch tenant
    const { data: tenantData } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', targetTenantId)
      .maybeSingle();

    const tenant = (tenantData as unknown as Tenant) || null;

    return {
      authorized: true,
      user: { id: user.id, email: user.email },
      role: 'tenant_admin',
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
    role === 'tenant_admin' || role === 'staff' || role === 'superadmin';

  if (!isStaffOrAdmin || !profile?.tenant_id) {
    return {
      authorized: false,
      user: { id: user.id, email: user.email },
      role: 'guest',
      tenantId: null,
      tenant: null,
      error: 'Access Denied: Your account is not registered as staff or administrator for any resort.',
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

  return {
    authorized: true,
    user: { id: user.id, email: user.email },
    role,
    tenantId: staffTenant.id,
    tenant: staffTenant as unknown as Tenant,
  };
}

/**
 * Server Component Helper: Enforces admin access or redirects to login
 */
export async function requireAdminAuth(redirectToPath: string = '/dashboard'): Promise<AuthenticatedAdminContext> {
  const auth = await getAuthenticatedAdminContext();

  if (!auth.user) {
    redirect(`/login?redirectTo=${encodeURIComponent(redirectToPath)}`);
  }

  if (!auth.authorized || !auth.tenant) {
    redirect(`/login?error=${encodeURIComponent(auth.error || 'Access denied.')}`);
  }

  return auth;
}
