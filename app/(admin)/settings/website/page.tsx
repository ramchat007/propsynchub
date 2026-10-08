import React from 'react';
import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import ResortWebsiteCmsClient from '@/components/admin/ResortWebsiteCmsClient';

export const dynamic = 'force-dynamic';

export default async function ResortWebsiteCmsPage() {
  const auth = await requireAdminAuth('/settings/website');

  // P1.3 Role Guard: Staff cannot edit website settings
  if (auth.role === 'staff') {
    redirect('/dashboard');
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <ResortWebsiteCmsClient tenant={auth.tenant!} />
    </div>
  );
}
