import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import HotelDashboardClient from '@/components/admin/HotelDashboardClient';
import { Room, Booking } from '@/types';

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

  return (
    <HotelDashboardClient
      tenant={auth.tenant}
      initialRooms={rooms}
      initialBookings={bookings}
    />
  );
}
