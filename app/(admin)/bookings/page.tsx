import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import BookingsListClient from '@/components/admin/BookingsListClient';
import { Booking, Room, Tenant } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminBookingsPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/bookings');
  }

  // 2. Resolve Profile & Tenant Context
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role')
    .eq('id', user.id)
    .single();

  let tenantId = profile?.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  const adminDb = createAdminClient();

  // Tenant resolution
  let tenant: Tenant | null = null;
  if (tenantId) {
    const { data: tenantData } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .maybeSingle();
    tenant = (tenantData as unknown as Tenant) || null;
  }

  if (!tenant) {
    const { data: anyTenants } = await adminDb
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .limit(1);
    if (anyTenants && anyTenants[0]) {
      tenant = anyTenants[0] as unknown as Tenant;
      tenantId = tenant.id;
    }
  }

  // 3. Fetch Bookings for this Tenant
  let bookings: Booking[] = [];
  if (tenantId) {
    const { data: rawBookings } = await adminDb
      .from('bookings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    bookings = (rawBookings as unknown as Booking[]) || [];
  }

  // 4. Fetch Rooms for Display
  let rooms: Room[] = [];
  if (tenantId) {
    const { data: rawRooms } = await adminDb
      .from('rooms')
      .select('*')
      .eq('tenant_id', tenantId);

    rooms = (rawRooms as unknown as Room[]) || [];
  }

  return (
    <BookingsListClient
      bookings={bookings}
      rooms={rooms}
      tenant={tenant}
    />
  );
}
