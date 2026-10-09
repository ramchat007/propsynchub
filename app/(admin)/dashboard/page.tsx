import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import HotelDashboardClient from '@/components/admin/HotelDashboardClient';
import { Room, Booking, HousekeepingTask } from '@/types';
import { getHousekeepingTasks } from '@/app/actions/housekeeping';

export const dynamic = 'force-dynamic';

/**
 * Hotel Command Center Admin Dashboard (React Server Component)
 * 
 * Strictly isolated to the authenticated resort administrator's tenant_id.
 */
export default async function AdminDashboardPage() {
  const auth = await requireAdminAuth('/dashboard');
  const adminDb = createAdminClient();

  // 1. Fetch Rooms strictly for this authorized tenant
  const { data: rawRooms } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('name', { ascending: true });

  const rooms: Room[] = (rawRooms || []) as Room[];

  // 2. Fetch Bookings strictly for this authorized tenant
  const { data: rawBookings } = await adminDb
    .from('bookings')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('created_at', { ascending: false });

  const bookings: Booking[] = (rawBookings || []) as Booking[];

  // 3. Fetch Housekeeping tasks to display assigned staff on room cards
  let housekeepingTasks: HousekeepingTask[] = [];
  try {
    const hkRes = await getHousekeepingTasks(auth.tenantId!);
    if (hkRes.success && hkRes.data) {
      housekeepingTasks = hkRes.data;
    }
  } catch {
    // Non-blocking fallback
  }

  return (
    <HotelDashboardClient
      tenant={auth.tenant}
      initialRooms={rooms}
      initialBookings={bookings}
      initialHousekeepingTasks={housekeepingTasks}
    />
  );
}
