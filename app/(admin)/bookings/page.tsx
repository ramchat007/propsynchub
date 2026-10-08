import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import BookingsListClient from '@/components/admin/BookingsListClient';
import { Booking, Room } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  const auth = await requireAdminAuth('/bookings');
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

  return (
    <BookingsListClient
      bookings={bookings}
      rooms={rooms}
      tenant={auth.tenant}
    />
  );
}
