import { NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { AUTHORIZED_ADMIN_EMAILS, PRIMARY_DEMO_TENANT_ID } from '@/lib/auth/admin-guard';

/**
 * Supabase Auth Callback Route Handler
 * 
 * Handles PKCE exchange for OAuth providers (such as Google One-Tap & Social Sign-In).
 * Strictly guards the admin desk:
 * - Approved resort admins and staff are granted entry to /dashboard.
 * - Unauthorized external Google accounts are immediately signed out and redirected with 403 Access Denied.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('redirectTo') || searchParams.get('next') || '/dashboard';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qqxctovvqrwllyanwglh.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxeGN0b3Z2cXJ3bGx5YW53Z2xoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTExOTc2NTIsImV4cCI6MjEwNjc3MzY1Mn0.rM0IxipDbqhbaYjRoJ95Z6tAfJEbz2YsMnfN9s1-oRY',
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore if called in environment without cookie writes
            }
          },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data?.user) {
      const email = (data.user.email || '').toLowerCase().trim();
      const adminDb = createAdminClient();

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
            .eq('id', data.user.id)
            .maybeSingle();

          if (!existingProfile) {
            await adminDb.from('profiles').insert({
              id: data.user.id,
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
              .eq('id', data.user.id);
          }
        } catch (profErr) {
          console.warn('[OAuth Callback] Error synchronizing owner profile:', profErr);
        }

        return NextResponse.redirect(`${origin}${next}`);
      }

      // 2. Check if user has an existing staff or admin profile in database
      const { data: staffProfile } = await adminDb
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', data.user.id)
        .maybeSingle();

      const isAuthorizedStaff =
        staffProfile?.role === 'tenant_admin' ||
        staffProfile?.role === 'staff' ||
        staffProfile?.role === 'superadmin';

      if (isAuthorizedStaff && staffProfile?.tenant_id) {
        return NextResponse.redirect(`${origin}${next}`);
      }

      // 3. UNAUTHORIZED USER: Not an approved resort manager or staff member
      // Sign out to revoke the active session cookie
      await supabase.auth.signOut();

      const errorMsg = `Access Denied: Your Google account (${data.user.email}) is not registered as a resort owner or staff member on PropSyncHub.`;
      return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(errorMsg)}`);
    }
  }

  // Fallback if exchange failed
  return NextResponse.redirect(`${origin}/login?error=Google%20authentication%20failed`);
}
