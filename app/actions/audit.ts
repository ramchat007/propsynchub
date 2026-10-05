'use server';

import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { AuditLog, Profile } from '@/types';

export interface AuditActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

/**
 * FETCH CHRONOLOGICAL AUDIT LOGS FOR TENANT
 * Returns read-only audit records enriched with staff member details
 */
export async function getTenantAuditLogs(
  tenantId: string,
  limit = 100
): Promise<AuditActionResponse<AuditLog[]>> {
  try {
    if (!tenantId) {
      return { success: false, error: 'Tenant ID is required to fetch audit logs.' };
    }

    const supabase = await createServerSupabaseClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return { success: false, error: 'Unauthorized: Please log in to view audit logs.' };
    }

    const adminDb = createAdminClient();

    // 1. Fetch audit logs for this tenant
    const { data: rawLogs, error: logError } = await adminDb
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (logError) {
      // If table is pending migration in Supabase, return empty list with informative status
      return {
        success: true,
        data: [],
        message: 'Audit logs table is pending database migration in Supabase.',
      };
    }

    const logs: AuditLog[] = (rawLogs || []) as AuditLog[];

    // 2. Fetch associated staff/user profiles for display
    const userIds = Array.from(
      new Set(logs.map((l) => l.user_id).filter((uid): uid is string => Boolean(uid)))
    );

    const profileMap = new Map<string, Profile>();
    if (userIds.length > 0) {
      const { data: rawProfiles } = await adminDb
        .from('profiles')
        .select('*')
        .in('id', userIds);

      if (rawProfiles) {
        (rawProfiles as unknown as Profile[]).forEach((p) => {
          profileMap.set(p.id, p);
        });
      }
    }

    // 3. Enrich logs with profile data
    const enrichedLogs: AuditLog[] = logs.map((log) => {
      const profile = log.user_id ? profileMap.get(log.user_id) : null;
      return {
        ...log,
        user_profile: profile
          ? {
              full_name: profile.full_name,
              mobile_number: profile.mobile_number,
              role: profile.role,
            }
          : null,
      };
    });

    return {
      success: true,
      data: enrichedLogs,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to retrieve audit trail.';
    return { success: false, error: message, data: [] };
  }
}
