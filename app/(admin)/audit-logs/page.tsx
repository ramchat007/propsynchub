import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getTenantAuditLogs } from '@/app/actions/audit';
import AuditLogsClient from '@/components/admin/AuditLogsClient';
import { AuditLog } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminAuditLogsPage() {
  const auth = await requireAdminAuth('/audit-logs');

  // P1.3 Role Guard: Staff cannot view audit logs
  if (auth.role === 'staff') {
    redirect('/dashboard');
  }

  const tenantId = auth.tenantId!;
  const tenantName = auth.tenant?.name || 'Your Resort';

  // Fetch Audit Logs for this Tenant
  let logs: AuditLog[] = [];
  const res = await getTenantAuditLogs(tenantId, 150);
  if (res.success && res.data) {
    logs = res.data;
  }

  return (
    <AuditLogsClient
      initialLogs={logs}
      tenantName={tenantName}
    />
  );
}
