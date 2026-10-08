import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import OccupancyCalendarClient from '@/components/admin/OccupancyCalendarClient';
import { Room, RoomCategory, Booking } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const auth = await requireAdminAuth('/calendar');
  const adminDb = createAdminClient();

  // 1. Fetch Categories for this authorized tenant
  const { data: catData } = await adminDb
    .from('room_categories')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('base_price_inr', { ascending: true });

  const categories: RoomCategory[] = (catData as unknown as RoomCategory[]) || [];

  // 2. Fetch Rooms (Physical Units) for this authorized tenant
  const { data: roomsData } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('room_number', { ascending: true });

  const rooms: Room[] = (roomsData as unknown as Room[]) || [];

  // 3. Fetch Bookings for this authorized tenant (Past 30 days to Next 90 days)
  const past30Days = new Date();
  past30Days.setDate(past30Days.getDate() - 30);
  const future90Days = new Date();
  future90Days.setDate(future90Days.getDate() + 90);

  const { data: bookingsData } = await adminDb
    .from('bookings')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .gte('check_out_date', past30Days.toISOString().split('T')[0])
    .lte('check_in_date', future90Days.toISOString().split('T')[0])
    .order('check_in_date', { ascending: true });

  const bookings: Booking[] = (bookingsData as unknown as Booking[]) || [];

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <OccupancyCalendarClient
        tenant={auth.tenant}
        rooms={rooms}
        categories={categories}
        bookings={bookings}
      />
    </div>
  );
}
