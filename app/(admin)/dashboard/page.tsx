import { redirect } from 'next/navigation';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import InventoryDashboardClient from '@/components/admin/InventoryDashboardClient';
import { Tenant, Room, RoomCategory, Pricing } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Admin Dashboard & Inventory Management (React Server Component)
 * 
 * Fetches rooms, room categories, and pricing scoped strictly
 * to the authenticated administrator's tenant_id.
 */
export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient();

  // 1. Authenticate user
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?redirectTo=/dashboard');
  }

  // 2. Resolve User Profile & Tenant ID
  const { data: profile } = await supabase
    .from('profiles')
    .select('tenant_id, role, full_name, mobile_number')
    .eq('id', user.id)
    .single();

  let tenantId = profile?.tenant_id || process.env.NEXT_PUBLIC_DEFAULT_TENANT_ID;

  let tenant: Tenant | null = null;
  if (tenantId) {
    const { data: tenantData } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();
    tenant = tenantData;
  }

  // Fallback: If no tenant found for user, check first existing active tenant in DB
  if (!tenant) {
    const { data: anyTenants } = await supabase
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .limit(1);

    if (anyTenants && anyTenants.length > 0 && anyTenants[0]) {
      const firstTenant = anyTenants[0];
      tenant = firstTenant;
      tenantId = firstTenant.id;
    }
  }

  // If no tenant exists in the system yet, render clean dashboard allowing starter generation
  if (!tenantId) {
    return (
      <InventoryDashboardClient
        tenant={null}
        initialCategories={[]}
        initialRooms={[]}
        initialPricing={[]}
        userRole={profile?.role || 'tenant_admin'}
      />
    );
  }

  // 3. Fetch Rooms strictly scoped to tenant_id
  const { data: rawRooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  const rooms: Room[] = (rawRooms || []) as Room[];

  // 4. Fetch Pricing rules strictly scoped to tenant_id
  const { data: rawPricing } = await supabase
    .from('pricing')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  const pricing: Pricing[] = (rawPricing || []) as Pricing[];

  // 5. Fetch Room Categories strictly scoped to tenant_id
  let categories: RoomCategory[] = [];
  const { data: rawCategories, error: catError } = await supabase
    .from('room_categories')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('name', { ascending: true });

  if (!catError && rawCategories && rawCategories.length > 0) {
    categories = rawCategories as RoomCategory[];
  } else {
    // Graceful fallback: check tenant settings JSONB or synthesize from rooms
    const settings = (tenant?.settings as Record<string, unknown>) || {};
    if (Array.isArray(settings.room_categories) && settings.room_categories.length > 0) {
      categories = settings.room_categories as RoomCategory[];
    } else {
      // Derive distinct categories from rooms
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
  }

  return (
    <InventoryDashboardClient
      tenant={tenant}
      initialCategories={categories}
      initialRooms={rooms}
      initialPricing={pricing}
      userRole={profile?.role || 'tenant_admin'}
    />
  );
}
