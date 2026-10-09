import { redirect } from 'next/navigation';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import ReportsDashboardClient from '@/components/admin/ReportsDashboardClient';
import { Booking, Room, IncidentalCharge } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminReportsPage() {
  const auth = await requireAdminAuth('/reports');

  // P1.3 Role Guard: Staff, Housekeeping, Restaurant Staff cannot view financial reports
  if (
    auth.role === 'staff' ||
    auth.role === 'housekeeping' ||
    auth.role === 'restaurant_staff' ||
    auth.role === 'guest'
  ) {
    redirect('/dashboard');
  }

  const adminDb = createAdminClient();

  // 1. Fetch Bookings strictly for this authorized Tenant
  const { data: rawBookings } = await adminDb
    .from('bookings')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('created_at', { ascending: false });

  const bookings: Booking[] = (rawBookings as unknown as Booking[]) || [];

  // 2. Fetch Rooms strictly for this authorized Tenant
  const { data: rawRooms } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', auth.tenantId!);

  const rooms: Room[] = (rawRooms as unknown as Room[]) || [];

  // 3. Fetch Incidental Charges strictly for this authorized Tenant
  const { data: rawIncidentals } = await adminDb
    .from('incidental_charges')
    .select('*')
    .eq('tenant_id', auth.tenantId!);

  const incidentals: IncidentalCharge[] = (rawIncidentals as unknown as IncidentalCharge[]) || [];

  return (
    <ReportsDashboardClient
      tenant={auth.tenant}
      bookings={bookings}
      rooms={rooms}
      incidentals={incidentals}
      userRole={auth.role}
    />
  );
}
