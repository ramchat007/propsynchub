import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { getHousekeepingTasks, getMaintenanceTickets } from '@/app/actions/housekeeping';
import { getResortTeamMembers } from '@/app/actions/team';
import HousekeepingClient from '@/components/admin/HousekeepingClient';

export const dynamic = 'force-dynamic';

export default async function HousekeepingPage() {
  const auth = await requireAdminAuth('/housekeeping');
  const [taskRes, maintRes, teamRes] = await Promise.all([
    getHousekeepingTasks(auth.tenantId!),
    getMaintenanceTickets(auth.tenantId!),
    getResortTeamMembers(auth.tenantId!),
  ]);

  const tasks = taskRes.success && taskRes.data ? taskRes.data : [];
  const maintenanceTickets = maintRes.success && maintRes.data ? maintRes.data : [];
  const teamMembers = teamRes.success && teamRes.data ? teamRes.data : [];
  const currentUserName = auth.user?.email || 'Floor Supervisor';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900 dark:text-white">Housekeeping & Floor Operations</h1>
        <p className="text-xs text-stone-500 mt-1">
          Real-time room cleanliness lifecycle, floor attendant assignment, supervisor inspection sign-offs, and floor maintenance for {auth.tenant?.name || 'Resort'}.
        </p>
      </div>

      <HousekeepingClient
        tenantId={auth.tenantId!}
        initialTasks={tasks}
        initialMaintenanceTickets={maintenanceTickets}
        teamMembers={teamMembers}
        currentUserName={currentUserName}
      />
    </div>
  );
}
