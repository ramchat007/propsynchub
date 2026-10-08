'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { TeamMember, UserRole } from '@/types';
import { notifications } from '@/lib/notifications';
import { AUTHORIZED_ADMIN_EMAILS } from '@/lib/auth/admin-guard';

export interface TeamActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * 1. FETCH ALL TEAM MEMBERS FOR RESORT
 * Retrieves active administrators and front desk staff assigned to the property.
 */
export async function getResortTeamMembers(
  tenantId: string
): Promise<TeamActionResponse<TeamMember[]>> {
  try {
    if (!tenantId) {
      return { success: false, error: 'Tenant ID is required.', data: [] };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Unauthorized: Session required.', data: [] };
    }

    const adminDb = createAdminClient();

    // Fetch tenant profiles with staff or admin role
    const { data: profiles, error: profileErr } = await adminDb
      .from('profiles')
      .select('id, tenant_id, full_name, mobile_number, role, avatar_url, created_at, updated_at')
      .eq('tenant_id', tenantId)
      .in('role', ['tenant_admin', 'staff', 'superadmin'])
      .order('created_at', { ascending: true });

    if (profileErr) {
      throw new Error(profileErr.message);
    }

    // Retrieve emails from auth.users
    const { data: authUsers } = await adminDb.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    const userEmailMap = new Map<string, string>();
    authUsers?.users?.forEach((u) => {
      if (u.id && u.email) {
        userEmailMap.set(u.id, u.email);
      }
    });

    const teamMembers: TeamMember[] = (profiles || []).map((p) => {
      const email = userEmailMap.get(p.id) || (p.mobile_number ? `${p.mobile_number}@phone` : 'unknown');
      return {
        id: p.id,
        tenant_id: p.tenant_id,
        email,
        full_name: p.full_name || email.split('@')[0],
        mobile_number: p.mobile_number,
        role: p.role as UserRole,
        avatar_url: p.avatar_url,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    return {
      success: true,
      data: teamMembers,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error retrieving team members.';
    return { success: false, error: message, data: [] };
  }
}

/**
 * 2. INVITE STAFF OR RESORT ADMIN
 * Provisions identity and grants role-based access to the resort operations desk.
 */
export async function inviteTeamMember(
  formData: FormData
): Promise<TeamActionResponse<{ memberId: string }>> {
  try {
    const tenantId = formData.get('tenantId')?.toString()?.trim();
    const rawEmail = formData.get('email')?.toString()?.trim()?.toLowerCase();
    const fullName = formData.get('fullName')?.toString()?.trim() || '';
    const role = (formData.get('role')?.toString()?.trim() || 'staff') as UserRole;
    const mobileNumber = formData.get('mobileNumber')?.toString()?.trim() || '';

    if (!tenantId) {
      return { success: false, error: 'Resort ID is required.' };
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!rawEmail || !emailRegex.test(rawEmail)) {
      return { success: false, error: 'Please enter a valid email address.' };
    }

    if (role !== 'staff' && role !== 'tenant_admin') {
      return { success: false, error: 'Role must be either Front Desk Staff or Resort Administrator.' };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !currentUser) {
      return { success: false, error: 'Unauthorized: Session required.' };
    }

    const adminDb = createAdminClient();

    // Verify current user is a tenant_admin for this resort
    const { data: currentProfile } = await adminDb
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', currentUser.id)
      .maybeSingle();

    const isPlatformOwner =
      currentUser.email && AUTHORIZED_ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
    const isTenantAdmin = currentProfile?.role === 'tenant_admin' && currentProfile?.tenant_id === tenantId;

    if (!isPlatformOwner && !isTenantAdmin) {
      return { success: false, error: 'Permission denied: Only Resort Administrators can invite staff.' };
    }

    // Fetch tenant name for email template
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('name, subdomain, settings')
      .eq('id', tenantId)
      .single();

    const resortName = tenant?.name || 'Resort Operations';

    // 1. Check if user already exists in auth.users
    const { data: existingUsers } = await adminDb.auth.admin.listUsers();
    const targetUser = existingUsers?.users?.find(
      (u) => u.email?.toLowerCase() === rawEmail
    );

    let targetUserId: string;

    if (!targetUser) {
      // 2. Provision new user identity
      const syntheticPassword = `PSH_${Buffer.from(rawEmail).toString('hex').slice(0, 8)}!2026`;
      const { data: createdUser, error: createError } = await adminDb.auth.admin.createUser({
        email: rawEmail,
        password: syntheticPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName || rawEmail.split('@')[0],
          invited_by: currentUser.id,
          tenant_id: tenantId,
        },
      });

      if (createError || !createdUser?.user) {
        throw new Error(createError?.message || 'Failed to provision team member identity.');
      }

      targetUserId = createdUser.user.id;
    } else {
      targetUserId = targetUser.id;

      // Check if user is already assigned to this resort
      const { data: existingTargetProfile } = await adminDb
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', targetUserId)
        .maybeSingle();

      if (existingTargetProfile?.tenant_id === tenantId && existingTargetProfile.role === role) {
        return {
          success: false,
          error: `User "${rawEmail}" is already an active ${role === 'tenant_admin' ? 'Administrator' : 'Staff member'} for this resort.`,
        };
      }
    }

    // 3. Upsert profile with assigned role and resort tenant_id
    const { error: profileUpsertError } = await adminDb.from('profiles').upsert(
      {
        id: targetUserId,
        tenant_id: tenantId,
        full_name: fullName || rawEmail.split('@')[0],
        mobile_number: mobileNumber || '+919999999999',
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

    if (profileUpsertError) {
      throw new Error(profileUpsertError.message);
    }

    // 4. Update tenant settings admin_emails if administrator
    if (role === 'tenant_admin') {
      const currentSettings = (tenant?.settings as Record<string, unknown>) || {};
      const currentAdminEmails = Array.isArray(currentSettings.admin_emails)
        ? (currentSettings.admin_emails as string[])
        : [];

      if (!currentAdminEmails.includes(rawEmail)) {
        await adminDb
          .from('tenants')
          .update({
            settings: {
              ...currentSettings,
              admin_emails: [...currentAdminEmails, rawEmail],
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantId);
      }
    }

    // 5. Send invite email notification
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://propsynchub.netlify.app';
    const loginUrl = `${appUrl}/login`;

    await notifications.sendTeamInviteEmail({
      to: rawEmail,
      inviteeName: fullName || rawEmail.split('@')[0],
      resortName,
      role: role as 'tenant_admin' | 'staff',
      inviterName: currentUser.email || 'Resort Management',
      loginUrl,
    });

    // 6. Record audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: currentUser.id,
        table_name: 'profiles',
        record_id: targetUserId,
        action_type: 'INSERT',
        new_data: {
          email: rawEmail,
          full_name: fullName,
          role,
          tenant_id: tenantId,
        },
      });
    } catch (auditErr) {
      console.warn('[Team Invite Audit Warning]:', auditErr);
    }

    revalidatePath('/settings/team');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: `Invitation sent to ${rawEmail} as ${role === 'tenant_admin' ? 'Resort Administrator' : 'Front Desk Staff'}!`,
      data: { memberId: targetUserId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error inviting team member.';
    return { success: false, error: message };
  }
}

/**
 * 3. UPDATE TEAM MEMBER ROLE
 * Promotes staff member to administrator or adjusts to front desk staff.
 */
export async function updateTeamMemberRole(
  formData: FormData
): Promise<TeamActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString()?.trim();
    const memberId = formData.get('memberId')?.toString()?.trim();
    const newRole = formData.get('newRole')?.toString()?.trim() as UserRole;

    if (!tenantId || !memberId || !newRole) {
      return { success: false, error: 'Missing required parameters.' };
    }

    if (newRole !== 'staff' && newRole !== 'tenant_admin') {
      return { success: false, error: 'Invalid role selection.' };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return { success: false, error: 'Unauthorized.' };
    }

    if (currentUser.id === memberId) {
      return { success: false, error: 'You cannot alter your own administrative role.' };
    }

    const adminDb = createAdminClient();

    // Verify current user permissions
    const { data: currentProfile } = await adminDb
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', currentUser.id)
      .maybeSingle();

    const isPlatformOwner =
      currentUser.email && AUTHORIZED_ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
    const isTenantAdmin = currentProfile?.role === 'tenant_admin' && currentProfile?.tenant_id === tenantId;

    if (!isPlatformOwner && !isTenantAdmin) {
      return { success: false, error: 'Permission denied: Only Resort Administrators can update roles.' };
    }

    // Verify member belongs to this resort
    const { data: targetProfile } = await adminDb
      .from('profiles')
      .select('role, tenant_id, full_name')
      .eq('id', memberId)
      .single();

    if (!targetProfile || targetProfile.tenant_id !== tenantId) {
      return { success: false, error: 'Target user does not belong to this resort.' };
    }

    // Update role
    const { error: updateError } = await adminDb
      .from('profiles')
      .update({
        role: newRole,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (updateError) {
      throw updateError;
    }

    // Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: currentUser.id,
        table_name: 'profiles',
        record_id: memberId,
        action_type: 'UPDATE',
        old_data: { role: targetProfile.role },
        new_data: { role: newRole },
      });
    } catch {
      // Ignored
    }

    revalidatePath('/settings/team');
    return {
      success: true,
      message: `Role updated to ${newRole === 'tenant_admin' ? 'Resort Administrator' : 'Front Desk Staff'}.`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating team member role.';
    return { success: false, error: message };
  }
}

/**
 * 4. REMOVE TEAM MEMBER ACCESS
 * Revokes resort permissions by resetting user role to guest.
 */
export async function removeTeamMember(
  formData: FormData
): Promise<TeamActionResponse> {
  try {
    const tenantId = formData.get('tenantId')?.toString()?.trim();
    const memberId = formData.get('memberId')?.toString()?.trim();

    if (!tenantId || !memberId) {
      return { success: false, error: 'Missing required parameters.' };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user: currentUser },
    } = await supabase.auth.getUser();

    if (!currentUser) {
      return { success: false, error: 'Unauthorized.' };
    }

    if (currentUser.id === memberId) {
      return { success: false, error: 'You cannot remove your own access.' };
    }

    const adminDb = createAdminClient();

    // Verify current user permissions
    const { data: currentProfile } = await adminDb
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', currentUser.id)
      .maybeSingle();

    const isPlatformOwner =
      currentUser.email && AUTHORIZED_ADMIN_EMAILS.includes(currentUser.email.toLowerCase());
    const isTenantAdmin = currentProfile?.role === 'tenant_admin' && currentProfile?.tenant_id === tenantId;

    if (!isPlatformOwner && !isTenantAdmin) {
      return { success: false, error: 'Permission denied: Only Resort Administrators can remove staff.' };
    }

    // Check if target is primary platform owner
    const { data: targetUser } = await adminDb.auth.admin.getUserById(memberId);
    if (targetUser?.user?.email && AUTHORIZED_ADMIN_EMAILS.includes(targetUser.user.email.toLowerCase())) {
      return { success: false, error: 'The primary resort owner account cannot be removed.' };
    }

    // Revoke access by changing role to guest and removing tenant_id
    const { error: revokeError } = await adminDb
      .from('profiles')
      .update({
        role: 'guest',
        tenant_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', memberId);

    if (revokeError) {
      throw revokeError;
    }

    // Also remove from admin_emails array in tenant settings if present
    if (targetUser?.user?.email) {
      const emailToRemove = targetUser.user.email.toLowerCase();
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      const settings = (tenant?.settings as Record<string, unknown>) || {};
      if (Array.isArray(settings.admin_emails)) {
        const updatedAdmins = (settings.admin_emails as string[]).filter(
          (e) => e.toLowerCase() !== emailToRemove
        );
        await adminDb
          .from('tenants')
          .update({
            settings: { ...settings, admin_emails: updatedAdmins },
            updated_at: new Date().toISOString(),
          })
          .eq('id', tenantId);
      }
    }

    // Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: currentUser.id,
        table_name: 'profiles',
        record_id: memberId,
        action_type: 'DELETE',
        new_data: { revoked: true, revoked_at: new Date().toISOString() },
      });
    } catch {
      // Ignored
    }

    revalidatePath('/settings/team');
    return {
      success: true,
      message: 'Team member access has been successfully revoked.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error removing team member.';
    return { success: false, error: message };
  }
}
