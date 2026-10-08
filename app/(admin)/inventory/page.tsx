import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import InventoryDashboardClient from '@/components/admin/InventoryDashboardClient';
import { Room, RoomCategory, Pricing } from '@/types';

export const dynamic = 'force-dynamic';

/**
 * Dedicated Room Inventory & Rates Page (React Server Component)
 * 
 * Strictly isolated to the authenticated resort administrator's tenant_id.
 */
export default async function AdminInventoryPage() {
  const auth = await requireAdminAuth('/inventory');
  const adminDb = createAdminClient();

  // 1. Fetch Rooms strictly for this authorized tenant
  const { data: rawRooms } = await adminDb
    .from('rooms')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('name', { ascending: true });

  const rooms: Room[] = (rawRooms || []) as Room[];

  // 2. Fetch Pricing rules strictly for this authorized tenant
  const { data: rawPricing } = await adminDb
    .from('pricing')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
    .order('created_at', { ascending: false });

  const pricing: Pricing[] = (rawPricing || []) as Pricing[];

  // 3. Fetch Categories strictly for this authorized tenant
  let categories: RoomCategory[] = [];
  const { data: rawCategories, error: catError } = await adminDb
    .from('room_categories')
    .select('*')
    .eq('tenant_id', auth.tenantId!)
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
        tenant_id: auth.tenantId!,
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
      tenant={auth.tenant}
      initialCategories={categories}
      initialRooms={rooms}
      initialPricing={pricing}
    />
  );
}
