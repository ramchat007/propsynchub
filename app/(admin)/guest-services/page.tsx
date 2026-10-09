import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getServiceRequests } from '@/app/actions/service-requests';
import GuestServicesClient from '@/components/admin/GuestServicesClient';

export const dynamic = 'force-dynamic';

export default async function GuestServicesPage() {
  const auth = await requireAdminAuth('/guest-services');
  const reqRes = await getServiceRequests(auth.tenantId!);
  const requests = reqRes.success && reqRes.data ? reqRes.data : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900 dark:text-white">Guest Service Requests</h1>
        <p className="text-xs text-stone-500 mt-1">
          Monitor and resolve live guest requests, housekeeping supplies, and maintenance tickets for {auth.tenant?.name || 'Resort'}.
        </p>
      </div>

      <GuestServicesClient
        tenantId={auth.tenantId!}
        initialRequests={requests}
      />
    </div>
  );
}
