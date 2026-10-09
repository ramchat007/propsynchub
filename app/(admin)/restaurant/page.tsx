import React from 'react';
import { requireAdminAuth } from '@/lib/auth/admin-guard';
import { createAdminClient } from '@/lib/supabase';
import { getRestaurantMenu, getRestaurantOrders } from '@/app/actions/restaurant';
import RestaurantAdminClient from '@/components/admin/RestaurantAdminClient';
import { Booking, Room } from '@/types';

export const dynamic = 'force-dynamic';

export default async function RestaurantAdminPage() {
  const auth = await requireAdminAuth('/restaurant');
  const adminDb = createAdminClient();

  const [menuRes, ordersRes, rawBookings, rawRooms] = await Promise.all([
    getRestaurantMenu(auth.tenantId!),
    getRestaurantOrders(auth.tenantId!),
    adminDb
      .from('bookings')
      .select('*')
      .eq('tenant_id', auth.tenantId!)
      .in('status', ['confirmed', 'checked_in'])
      .order('created_at', { ascending: false }),
    adminDb
      .from('rooms')
      .select('*')
      .eq('tenant_id', auth.tenantId!)
      .order('name', { ascending: true }),
  ]);

  const categories = menuRes.success && menuRes.data ? menuRes.data.categories : [];
  const items = menuRes.success && menuRes.data ? menuRes.data.items : [];
  const orders = ordersRes.success && ordersRes.data ? ordersRes.data : [];
  const activeBookings: Booking[] = (rawBookings.data as unknown as Booking[]) || [];
  const rooms: Room[] = (rawRooms.data as unknown as Room[]) || [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black text-stone-900 dark:text-white">Restaurant & Kitchen Operations</h1>
        <p className="text-xs text-stone-500 mt-1">
          Kitchen Order Tickets (KOT), item-level GST tax compliance, preparation notes, and room folio posting for {auth.tenant?.name || 'Resort'}.
        </p>
      </div>

      <RestaurantAdminClient
        tenantId={auth.tenantId!}
        initialCategories={categories}
        initialItems={items}
        initialOrders={orders}
        activeBookings={activeBookings}
        rooms={rooms}
      />
    </div>
  );
}

