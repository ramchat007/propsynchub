import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import OccupancyCalendarClient from '@/components/admin/OccupancyCalendarClient';
import { Tenant, Room, RoomCategory, Booking } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/calendar');
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 2. Resolve Profile & Tenant Context
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role, full_name')
    .eq('id', user.id)
    .maybeSingle();

  let tenantId = profile?.tenant_id && UUID_REGEX.test(profile.tenant_id) ? profile.tenant_id : undefined;
  if (!tenantId) {
    const envId = process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;
    if (envId && UUID_REGEX.test(envId)) {
      tenantId = envId;
    }
  }

  const adminDb = createAdminClient();

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

    if (anyTenants && anyTenants.length > 0) {
      tenant = anyTenants[0] as unknown as Tenant;
      tenantId = tenant.id;
    }
  }

  if (!tenant || !tenantId) {
    redirect('/onboarding');
  }

  // 3. Fetch Categories
  const { data: catData } = await adminDb
    .from('room_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('base_price_inr', { ascending: true });

  const categories: RoomCategory[] = (catData as unknown as RoomCategory[]) || [];

  // 4. Fetch Rooms (Physical Units)
  const { data: roomsData } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('room_number', { ascending: true });

  const rooms: Room[] = (roomsData as unknown as Room[]) || [];

  // 5. Fetch Bookings (Past 30 days to Next 90 days)
  const past30Days = new Date();
  past30Days.setDate(past30Days.getDate() - 30);
  const future90Days = new Date();
  future90Days.setDate(future90Days.getDate() + 90);

  const { data: bookingsData } = await adminDb
    .from('bookings')
    .select('*')
    .eq('tenant_id', tenantId)
    .gte('check_out_date', past30Days.toISOString().split('T')[0])
    .lte('check_in_date', future90Days.toISOString().split('T')[0])
    .order('check_in_date', { ascending: true });

  const bookings: Booking[] = (bookingsData as unknown as Booking[]) || [];

  return (
    <div className="p-6 sm:p-8 max-w-7xl mx-auto">
      <OccupancyCalendarClient
        tenant={tenant}
        rooms={rooms}
        categories={categories}
        bookings={bookings}
      />
    </div>
  );
}
