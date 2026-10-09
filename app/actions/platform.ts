'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { Tenant } from '@/types';
import { PLATFORM_SUPERADMIN_EMAILS } from '@/lib/constants';
import { notifications } from '@/lib/notifications';

export interface PlatformActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

export interface PlatformResortItem extends Tenant {
  roomCount: number;
  categoryCount: number;
  bookingCount: number;
  primaryAdminEmail?: string;
}

/**
 * 1. GET ALL RESORTS (Platform Superadmin Only)
 */
export async function getPlatformResorts(): Promise<PlatformActionResponse<PlatformResortItem[]>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user || !user.email || !PLATFORM_SUPERADMIN_EMAILS.includes(user.email.toLowerCase())) {
      return { success: false, error: 'Unauthorized: Exclusive Platform Superadmin privileges required.' };
    }

    const adminDb = createAdminClient();

    // Fetch all tenants
    const { data: tenants, error: tenantsError } = await adminDb
      .from('tenants')
      .select('*')
      .order('created_at', { ascending: false });

    if (tenantsError) throw tenantsError;

    // Fetch rooms count per tenant
    const { data: rooms } = await adminDb.from('rooms').select('tenant_id');
    const { data: categories } = await adminDb.from('room_categories').select('tenant_id');
    const { data: bookings } = await adminDb.from('bookings').select('tenant_id');

    const roomCounts = new Map<string, number>();
    (rooms || []).forEach((r) => {
      roomCounts.set(r.tenant_id, (roomCounts.get(r.tenant_id) || 0) + 1);
    });

    const categoryCounts = new Map<string, number>();
    (categories || []).forEach((c) => {
      categoryCounts.set(c.tenant_id, (categoryCounts.get(c.tenant_id) || 0) + 1);
    });

    const bookingCounts = new Map<string, number>();
    (bookings || []).forEach((b) => {
      bookingCounts.set(b.tenant_id, (bookingCounts.get(b.tenant_id) || 0) + 1);
    });

    const enrichedResorts: PlatformResortItem[] = (tenants || []).map((t) => {
      const settings = (t.settings as Record<string, unknown>) || {};
      const adminEmails = Array.isArray(settings.admin_emails) ? (settings.admin_emails as string[]) : [];
      const primaryAdminEmail = adminEmails[0] || t.contact_email || 'Unassigned';

      return {
        ...(t as unknown as Tenant),
        roomCount: roomCounts.get(t.id) || 0,
        categoryCount: categoryCounts.get(t.id) || 0,
        bookingCount: bookingCounts.get(t.id) || 0,
        primaryAdminEmail,
      };
    });

    return { success: true, data: enrichedResorts };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to retrieve platform resorts.';
    return { success: false, error: msg };
  }
}

/**
 * 2. CREATE A NEW RESORT (Platform Superadmin Only)
 */
export async function createPlatformResort(
  formData: FormData
): Promise<PlatformActionResponse<Tenant>> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser || !currentUser.email || !PLATFORM_SUPERADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
      return { success: false, error: 'Unauthorized: Platform administrator access required.' };
    }

    const name = formData.get('name')?.toString()?.trim();
    const rawSubdomain = formData.get('subdomain')?.toString()?.trim();
    const contactEmail = formData.get('contactEmail')?.toString()?.trim()?.toLowerCase() || '';
    const contactPhone = formData.get('contactPhone')?.toString()?.trim() || '';
    const address = formData.get('address')?.toString()?.trim() || '';
    const timeZone = formData.get('timeZone')?.toString()?.trim() || 'Asia/Kolkata';
    const currency = formData.get('currency')?.toString()?.trim() || 'INR';
    const primaryColorHex = formData.get('primaryColorHex')?.toString()?.trim() || '#059669';
    const ownerEmail = formData.get('ownerEmail')?.toString()?.trim()?.toLowerCase() || contactEmail;
    const paymentPolicy = formData.get('paymentPolicy')?.toString()?.trim() || 'FULL_PAYMENT';
    const advancePercentage = Number(formData.get('advancePercentage')) || 50;

    if (!name || !rawSubdomain) {
      return { success: false, error: 'Resort name and subdomain are required.' };
    }

    const cleanSubdomain = rawSubdomain
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const adminDb = createAdminClient();

    // Check if subdomain already exists
    const { data: existingTenant } = await adminDb
      .from('tenants')
      .select('id')
      .eq('subdomain', cleanSubdomain)
      .maybeSingle();

    if (existingTenant) {
      return { success: false, error: `Subdomain "${cleanSubdomain}" is already claimed.` };
    }

    // Insert tenant record
    const { data: newTenant, error: insertError } = await adminDb
      .from('tenants')
      .insert({
        name,
        subdomain: cleanSubdomain,
        contact_email: contactEmail || ownerEmail,
        contact_phone: contactPhone,
        is_active: true,
        settings: {
          address,
          time_zone: timeZone,
          currency,
          primary_color_hex: primaryColorHex,
          payment_policy: paymentPolicy,
          advance_percentage: advancePercentage,
          admin_emails: ownerEmail ? [ownerEmail] : [],
          onboarded_at: new Date().toISOString(),
          onboarded_by: currentUser.id,
          subscription: {
            status: 'trial',
            plan: 'pro',
            trial_ends_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
            payment_mode: 'free_trial',
            amount_inr: 0,
            submitted_at: new Date().toISOString(),
          },
        },
      })
      .select()
      .single();

    if (insertError || !newTenant) {
      throw new Error(insertError?.message || 'Failed to create resort.');
    }

    // If an owner email is specified, invite them
    if (ownerEmail) {
      try {
        const { data: existingUsers } = await adminDb.auth.admin.listUsers();
        const targetUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === ownerEmail
        );

        let targetUserId: string;
        if (!targetUser) {
          const syntheticPassword = `PSH_${Buffer.from(ownerEmail).toString('hex').slice(0, 8)}!2026`;
          const { data: createdUser } = await adminDb.auth.admin.createUser({
            email: ownerEmail,
            password: syntheticPassword,
            email_confirm: true,
            user_metadata: {
              full_name: `${name} Administrator`,
              tenant_id: newTenant.id,
            },
          });
          targetUserId = createdUser?.user?.id || '';
        } else {
          targetUserId = targetUser.id;
        }

        if (targetUserId) {
          await adminDb.from('profiles').upsert(
            {
              id: targetUserId,
              tenant_id: newTenant.id,
              full_name: `${name} Administrator`,
              mobile_number: contactPhone || '+919999999999',
              role: 'tenant_admin',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

          // Send invite email
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://propsynchub.in';
          await notifications.sendTeamInviteEmail({
            to: ownerEmail,
            inviteeName: `${name} Administrator`,
            resortName: name,
            role: 'tenant_admin',
            inviterName: 'PropSyncHub Platform Team',
            loginUrl: `${appUrl}/login`,
          });
        }
      } catch (inviteErr) {
        console.warn('[Platform Create Resort] Error inviting primary owner:', inviteErr);
      }
    }

    // Record audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: newTenant.id,
        user_id: currentUser.id,
        table_name: 'tenants',
        record_id: newTenant.id,
        action_type: 'INSERT',
        new_data: {
          name,
          subdomain: cleanSubdomain,
          contact_email: contactEmail,
          owner_email: ownerEmail,
        },
      });
    } catch {
      // ignore
    }

    revalidatePath('/admin-master');
    revalidatePath('/platform');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Resort "${name}" created successfully! Owner invite sent to ${ownerEmail}.`,
      data: newTenant as unknown as Tenant,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error creating resort.';
    return { success: false, error: msg };
  }
}

/**
 * 3. TOGGLE RESORT ACTIVE STATUS
 */
export async function toggleResortStatus(
  tenantId: string,
  isActive: boolean
): Promise<PlatformActionResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser || !currentUser.email || !PLATFORM_SUPERADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
      return { success: false, error: 'Unauthorized: Platform administrator access required.' };
    }

    const adminDb = createAdminClient();

    const { error } = await adminDb
      .from('tenants')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', tenantId);

    if (error) throw error;

    // Record audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: currentUser.id,
        table_name: 'tenants',
        record_id: tenantId,
        action_type: 'UPDATE',
        new_data: { is_active: isActive },
      });
    } catch {
      // ignore
    }

    revalidatePath('/admin-master');
    revalidatePath('/platform');
    return {
      success: true,
      message: `Resort status updated to ${isActive ? 'Active' : 'Deactivated'}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update resort status.';
    return { success: false, error: msg };
  }
}

/**
 * 4. APPOINT RESORT OWNER/ADMIN
 */
export async function appointResortAdmin(
  tenantId: string,
  adminEmail: string,
  fullName?: string
): Promise<PlatformActionResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser || !currentUser.email || !PLATFORM_SUPERADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
      return { success: false, error: 'Unauthorized: Platform administrator access required.' };
    }

    const cleanEmail = adminEmail.trim().toLowerCase();
    const adminDb = createAdminClient();

    // Fetch tenant
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('name, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) return { success: false, error: 'Resort not found.' };

    const { data: existingUsers } = await adminDb.auth.admin.listUsers();
    const targetUser = existingUsers?.users?.find((u) => u.email?.toLowerCase() === cleanEmail);

    let targetUserId: string;
    if (!targetUser) {
      const syntheticPassword = `PSH_${Buffer.from(cleanEmail).toString('hex').slice(0, 8)}!2026`;
      const { data: createdUser, error: createErr } = await adminDb.auth.admin.createUser({
        email: cleanEmail,
        password: syntheticPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || cleanEmail.split('@')[0],
          tenant_id: tenantId,
        },
      });
      if (createErr || !createdUser?.user) throw createErr || new Error('Failed to create user identity.');
      targetUserId = createdUser.user.id;
    } else {
      targetUserId = targetUser.id;
    }

    // Upsert profile
    await adminDb.from('profiles').upsert(
      {
        id: targetUserId,
        tenant_id: tenantId,
        full_name: fullName || cleanEmail.split('@')[0],
        mobile_number: '+919999999999',
        role: 'tenant_admin',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    // Update settings admin_emails
    const settings = (tenant.settings as Record<string, unknown>) || {};
    const adminEmails = Array.isArray(settings.admin_emails) ? (settings.admin_emails as string[]) : [];
    if (!adminEmails.includes(cleanEmail)) {
      await adminDb
        .from('tenants')
        .update({
          settings: { ...settings, admin_emails: [...adminEmails, cleanEmail] },
          updated_at: new Date().toISOString(),
        })
        .eq('id', tenantId);
    }

    // Send notification
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://propsynchub.in';
    await notifications.sendTeamInviteEmail({
      to: cleanEmail,
      inviteeName: fullName || cleanEmail.split('@')[0],
      resortName: tenant.name,
      role: 'tenant_admin',
      inviterName: 'Platform Operations',
      loginUrl: `${appUrl}/login`,
    });

    revalidatePath('/admin-master');
    revalidatePath('/platform');
    return {
      success: true,
      message: `Administrator "${cleanEmail}" appointed for ${tenant.name}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to appoint administrator.';
    return { success: false, error: msg };
  }
}

/**
 * 5. UPDATE RESORT CUSTOM DOMAIN & STATUS (Platform Superadmin Only)
 */
export async function updateResortDomain(
  tenantId: string,
  rawDomain: string,
  domainStatus: 'unverified' | 'pending_dns' | 'active' = 'active'
): Promise<PlatformActionResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser || !currentUser.email || !PLATFORM_SUPERADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
      return { success: false, error: 'Unauthorized: Exclusive Platform Superadmin privileges required.' };
    }

    const adminDb = createAdminClient();
    const cleanDomain = rawDomain
      ? rawDomain
          .toLowerCase()
          .trim()
          .replace(/^https?:\/\//, '')
          .replace(/\/.*$/, '')
      : null;

    // Check if domain is already claimed by another tenant
    if (cleanDomain) {
      const { data: existingDomainTenant } = await adminDb
        .from('tenants')
        .select('id, name')
        .eq('custom_domain', cleanDomain)
        .neq('id', tenantId)
        .maybeSingle();

      if (existingDomainTenant) {
        return {
          success: false,
          error: `Domain "${cleanDomain}" is already claimed by ${existingDomainTenant.name}.`,
        };
      }
    }

    // Fetch existing settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('name, settings')
      .eq('id', tenantId)
      .single();

    if (!tenant) return { success: false, error: 'Resort not found.' };

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...existingSettings,
      domain_config: {
        custom_domain: cleanDomain,
        domain_status: domainStatus,
        verified_at: domainStatus === 'active' ? new Date().toISOString() : null,
      },
    };

    const { error: updateError } = await adminDb
      .from('tenants')
      .update({
        custom_domain: cleanDomain,
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateError) throw updateError;

    // Record audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: currentUser.id,
        table_name: 'tenants',
        record_id: tenantId,
        action_type: 'UPDATE',
        new_data: { custom_domain: cleanDomain, domain_status: domainStatus },
      });
    } catch {
      // ignore
    }

    revalidatePath('/admin-master');
    revalidatePath('/platform');
    return {
      success: true,
      message: cleanDomain
        ? `Custom domain "${cleanDomain}" set with status "${domainStatus}".`
        : 'Custom domain cleared.',
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to update custom domain.';
    return { success: false, error: msg };
  }
}

/**
 * 6. SWITCH SUPERADMIN ACTIVE TENANT (Cross-Tenant Admin View)
 */
export async function switchPlatformActiveResort(
  targetTenantId: string
): Promise<PlatformActionResponse> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser || !currentUser.email || !PLATFORM_SUPERADMIN_EMAILS.includes(currentUser.email.toLowerCase())) {
      return { success: false, error: 'Unauthorized: Exclusive Platform Superadmin privileges required.' };
    }

    const adminDb = createAdminClient();
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('id, name')
      .eq('id', targetTenantId)
      .maybeSingle();

    if (!tenant) return { success: false, error: 'Target resort not found.' };

    const cookieStore = await cookies();
    cookieStore.set('active_tenant_id', targetTenantId, {
      path: '/',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    revalidatePath('/dashboard');
    revalidatePath('/bookings');
    revalidatePath('/calendar');
    revalidatePath('/inventory');
    revalidatePath('/housekeeping');
    revalidatePath('/restaurant');
    revalidatePath('/guest-services');
    revalidatePath('/activities');
    revalidatePath('/reviews');
    revalidatePath('/reports');
    revalidatePath('/settings');

    return {
      success: true,
      message: `Active management context switched to ${tenant.name}.`,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Failed to switch active resort.';
    return { success: false, error: msg };
  }
}

