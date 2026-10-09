import React from 'react';
import { requireSuperAdminAuth } from '@/lib/auth/admin-guard';
import { getPlatformResorts } from '@/app/actions/platform';
import PlatformAdminClient from '@/components/admin/PlatformAdminClient';

export const dynamic = 'force-dynamic';

export default async function AdminMasterPage() {
  // Enforces exclusive platform superadmin access (ramchat007@gmail.com)
  const auth = await requireSuperAdminAuth('/admin-master');

  const res = await getPlatformResorts();
  const resorts = res.success && res.data ? res.data : [];

  return (
    <PlatformAdminClient
      initialResorts={resorts}
      currentUserId={auth.user?.id || ''}
    />
  );
}
