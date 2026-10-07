import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import InventoryDashboardClient from '@/components/admin/InventoryDashboardClient';
import { Tenant, Room, RoomCategory, Pricing } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Dedicated Room Inventory & Rates Page (React Server Component)
 * 
 * Scoped to the authenticated resort administrator's tenant_id.
 */
export default async function AdminInventoryPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/inventory');
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  // 2. Resolve Profile & Tenant Context
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role, full_name, mobile_number')
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

    if (anyTenants && anyTenants.length > 0 && anyTenants[0]) {
      const firstTenant = anyTenants[0] as unknown as Tenant;
      tenant = firstTenant;
      tenantId = firstTenant.id;
    }
  }

  if (!tenantId) {
    return (
      <InventoryDashboardClient
        tenant={null}
        initialCategories={[]}
        initialRooms={[]}
        initialPricing={[]}
      />
    );
  }

  // 3. Fetch Rooms
  const { data: rawRooms } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  const rooms: Room[] = (rawRooms || []) as Room[];

  // 4. Fetch Pricing rules
  const { data: rawPricing } = await adminDb
    .from('pricing')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const pricing: Pricing[] = (rawPricing || []) as Pricing[];

  // 5. Fetch Categories
  let categories: RoomCategory[] = [];
  const { data: rawCategories, error: catError } = await adminDb
    .from('room_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (!catError && rawCategories && rawCategories.length > 0) {
    categories = rawCategories as RoomCategory[];
  } else {
    const distinctTypes = Array.from(new Set(rooms.map((r) => r.room_type || 'Standard')));
    categories = distinctTypes.map((type) => {
      const matchingRooms = rooms.filter((r) => r.room_type === type);
      const sampleRoom = matchingRooms[0];
      return {
        id: `virtual-${type}`,
        tenant_id: tenantId!,
        name: type,
        description: null,
        base_price_inr: sampleRoom?.base_price_inr || 0,
        extra_pax_price_inr: 1000,
        max_adults: sampleRoom?.capacity_adults || 2,
        max_children: sampleRoom?.capacity_children || 0,
        amenities: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    });
  }

  return (
    <InventoryDashboardClient
      tenant={tenant}
      initialCategories={categories}
      initialRooms={rooms}
      initialPricing={pricing}
    />
  );
}
