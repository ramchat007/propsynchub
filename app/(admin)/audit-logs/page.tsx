import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { getTenantAuditLogs } from '@/app/actions/audit';
import AuditLogsClient from '@/components/admin/AuditLogsClient';
import { Tenant, AuditLog } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogsPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/audit-logs');
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 2. Resolve Profile & Tenant ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .maybeSingle();

  let tenantId = profile?.tenant_id && UUID_REGEX.test(profile.tenant_id) ? profile.tenant_id : undefined;
  if (!tenantId) {
    const envId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;
    if (envId && UUID_REGEX.test(envId)) {
      tenantId = envId;
    }
  }

  const adminDb = createAdminClient();

  // Resolve tenant name
  let tenantName = 'Your Resort';
  if (tenantId) {
    const { data: tenantData } = await adminDb
      .from('tenants')
      .select('name')
      .eq('id', tenantId)
      .maybeSingle();

    if (tenantData) {
      tenantName = (tenantData as unknown as Tenant).name;
    }
  }

  // 3. Fetch Audit Logs for this Tenant
  let logs: AuditLog[] = [];
  if (tenantId) {
    const res = await getTenantAuditLogs(tenantId, 150);
    if (res.success && res.data) {
      logs = res.data;
    }
  }

  return (
    <AuditLogsClient
      initialLogs={logs}
      tenantName={tenantName}
    />
  );
}
