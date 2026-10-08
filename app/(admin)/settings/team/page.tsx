import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getResortTeamMembers } from '@/app/actions/team';
import ResortTeamClient from '@/components/admin/ResortTeamClient';

export const dynamic = 'force-dynamic';

export default async function ResortTeamPage() {
  const auth = await requireAdminAuth('/settings/team');

  // P1.3 Role Guard: Front desk staff cannot view or modify team permissions
  if (auth.role === 'staff') {
    redirect('/dashboard');
  }

  const tenantId = auth.tenantId!;
  const resortName = auth.tenant?.name || 'Resort Administration';

  // Fetch active team roster
  const result = await getResortTeamMembers(tenantId);
  const initialMembers = result.success && result.data ? result.data : [];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <ResortTeamClient
        tenantId={tenantId}
        resortName={resortName}
        initialMembers={initialMembers}
        currentUserId={auth.user?.id || ''}
      />
    </div>
  );
}
