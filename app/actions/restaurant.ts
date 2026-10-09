'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase';
import {
  RestaurantCategory,
  RestaurantItem,
  RestaurantOrder,
  RestaurantOrderStatus,
  RestaurantOrderItem,
  RestaurantServiceType,
  RestaurantPaymentMethod,
} from '@/types';
import { addIncidentalCharge, getBookingLedger } from './ledger';
import { calculateRestaurantOrderTaxes } from '@/lib/tax-engine';

export interface RestaurantActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

const DEFAULT_CATEGORIES: Array<{ name: string; description: string; sort_order: number }> = [
  { name: 'Breakfast & Morning Specials', description: 'Freshly prepared farm-to-table breakfast items', sort_order: 1 },
  { name: 'Starters & Coastal Bites', description: 'Crispy appetizers, kebabs and fresh coastal delights', sort_order: 2 },
  { name: 'Main Course & Specialties', description: 'Traditional coastal curries, gravies and chef specialties', sort_order: 3 },
  { name: 'Breads & Rice', description: 'Steamed rice, flavored biryanis, and fresh tandoor breads', sort_order: 4 },
  { name: 'Beverages & Coolers', description: 'Fresh coconut water, seasonal fruit juices, coffees and mocktails', sort_order: 5 },
  { name: 'Desserts', description: 'Authentic local sweets and ice creams', sort_order: 6 },
];

const DEFAULT_ITEMS: Array<{
  category_name: string;
  name: string;
  description: string;
  price_inr: number;
  is_veg: boolean;
  prep_time_minutes: number;
  hsn_sac_code: string;
  tax_rate_percent: number;
  is_tax_inclusive: boolean;
}> = [
  {
    category_name: 'Breakfast & Morning Specials',
    name: 'Kokani Poha & Chai Combo',
    description: 'Fluffy beaten rice tempered with mustard, curry leaves, fresh grated coconut and peanuts.',
    price_inr: 160,
    is_veg: true,
    prep_time_minutes: 15,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Breakfast & Morning Specials',
    name: 'South Coast Medu Vada & Idli Platter',
    description: 'Crispy lentil vadas and steamed idlis served with coconut chutney and piping hot sambar.',
    price_inr: 220,
    is_veg: true,
    prep_time_minutes: 20,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Starters & Coastal Bites',
    name: 'Koliwada Fish Fry / Prawns Fry',
    description: 'Fresh coastal catch marinated in spiced flour and crisped to golden perfection.',
    price_inr: 450,
    is_veg: false,
    prep_time_minutes: 25,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Starters & Coastal Bites',
    name: 'Paneer Kurkure Tikka',
    description: 'Charcoal-grilled cottage cheese cubes coated in crushed crunchy spice herbs.',
    price_inr: 340,
    is_veg: true,
    prep_time_minutes: 20,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Main Course & Specialties',
    name: 'Malvani Chicken Curry & Wade Thali',
    description: 'Traditional slow-cooked coconut and roasted spice chicken curry served with authentic kombdi wade.',
    price_inr: 520,
    is_veg: false,
    prep_time_minutes: 30,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Main Course & Specialties',
    name: 'Paneer Butter Masala',
    description: 'Fresh paneer simmered in rich creamy tomato cashew gravy with fenugreek leaves.',
    price_inr: 380,
    is_veg: true,
    prep_time_minutes: 25,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Breads & Rice',
    name: 'Steamed Basmati Rice & Dal Fry',
    description: 'Aromatic long grain basmati rice paired with garlic-cumin tempered yellow lentils.',
    price_inr: 260,
    is_veg: true,
    prep_time_minutes: 20,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Beverages & Coolers',
    name: 'Fresh Tender Coconut Water',
    description: 'Naturally sweet coastal tender coconut served chilled with tender pulp.',
    price_inr: 120,
    is_veg: true,
    prep_time_minutes: 5,
    hsn_sac_code: '2202',
    tax_rate_percent: 0.0, // Natural fresh raw produce exempt from GST
    is_tax_inclusive: true,
  },
  {
    category_name: 'Beverages & Coolers',
    name: 'Solkadhi Cooler',
    description: 'Refreshing digestive coastal drink made from fresh kokum extract and thick coconut milk.',
    price_inr: 140,
    is_veg: true,
    prep_time_minutes: 10,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
  {
    category_name: 'Desserts',
    name: 'Ukdiche Modak (2 Pcs)',
    description: 'Steamed rice flour dumplings stuffed with jaggery and freshly grated coconut infused with cardamom.',
    price_inr: 210,
    is_veg: true,
    prep_time_minutes: 20,
    hsn_sac_code: '996331',
    tax_rate_percent: 5.0,
    is_tax_inclusive: true,
  },
];

/**
 * 1. GET RESTAURANT MENU (Categories and Items with Configurable Tax Treatment)
 */
export async function getRestaurantMenu(tenantId: string): Promise<
  RestaurantActionResponse<{
    categories: RestaurantCategory[];
    items: RestaurantItem[];
  }>
> {
  try {
    const adminDb = createAdminClient();

    let categories: RestaurantCategory[] = [];
    let items: RestaurantItem[] = [];

    // Attempt direct SQL table query
    const { data: catData, error: catError } = await adminDb
      .from('restaurant_categories')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    const { data: itemData, error: itemError } = await adminDb
      .from('restaurant_items')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('name', { ascending: true });

    if (!catError && !itemError && catData && catData.length > 0) {
      categories = catData as unknown as RestaurantCategory[];
      items = (itemData as unknown as RestaurantItem[]) || [];
    } else {
      // Dual-Persistence Fallback: check tenant settings JSON
      const { data: tenant } = await adminDb
        .from('tenants')
        .select('settings')
        .eq('id', tenantId)
        .single();

      const settings = (tenant?.settings as Record<string, unknown>) || {};
      const customMenu = settings.restaurant_menu as
        | { categories: RestaurantCategory[]; items: RestaurantItem[] }
        | undefined;

      if (customMenu && customMenu.categories && customMenu.categories.length > 0) {
        categories = customMenu.categories.filter((c) => c.is_active !== false);
        items = customMenu.items || [];
      } else {
        // Initialize default resort menu
        const now = new Date().toISOString();
        categories = DEFAULT_CATEGORIES.map((cat, idx) => ({
          id: `cat_${idx + 1}`,
          tenant_id: tenantId,
          name: cat.name,
          description: cat.description,
          sort_order: cat.sort_order,
          is_active: true,
          created_at: now,
        }));

        items = DEFAULT_ITEMS.map((item, idx) => {
          const matchedCat = categories.find((c) => c.name === item.category_name);
          return {
            id: `item_${idx + 1}`,
            tenant_id: tenantId,
            category_id: matchedCat?.id,
            category_name: item.category_name,
            name: item.name,
            description: item.description,
            price_inr: item.price_inr,
            is_veg: item.is_veg,
            is_available: true,
            prep_time_minutes: item.prep_time_minutes,
            hsn_sac_code: item.hsn_sac_code,
            tax_rate_percent: item.tax_rate_percent,
            is_tax_inclusive: item.is_tax_inclusive,
            created_at: now,
          };
        });

        // Save defaults in tenant settings
        try {
          await adminDb
            .from('tenants')
            .update({
              settings: {
                ...settings,
                restaurant_menu: { categories, items },
              },
            })
            .eq('id', tenantId);
        } catch (saveErr) {
          console.warn('[Restaurant Default Menu Init Notice]:', saveErr);
        }
      }
    }

    return {
      success: true,
      data: { categories, items },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch restaurant menu.';
    return { success: false, error: message };
  }
}

/**
 * 2. CREATE A RESTAURANT ORDER (Room Delivery, Dining, Takeaway)
 * Generates KOT ticket, applies configurable item-level tax, discounts, service charges,
 * and handles 100% idempotent room folio posting!
 */
export async function createRestaurantOrder(
  tenantId: string,
  orderPayload: {
    booking_id?: string;
    guest_name: string;
    guest_room?: string;
    guest_phone?: string;
    service_type: RestaurantServiceType;
    items: RestaurantOrderItem[];
    payment_method: RestaurantPaymentMethod;
    service_charge_percent?: number;
    discount_percent?: number;
    discount_inr?: number;
    notes?: string;
  }
): Promise<RestaurantActionResponse<RestaurantOrder>> {
  try {
    if (!tenantId) return { success: false, error: 'Resort tenant ID is required.' };
    if (!orderPayload.guest_name?.trim()) return { success: false, error: 'Guest name is required.' };
    if (!orderPayload.items || orderPayload.items.length === 0) {
      return { success: false, error: 'Order must contain at least one item.' };
    }

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // 1. Fetch tenant settings to get active tax schedules and pricing rules
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();
    const settings = (tenant?.settings as Record<string, unknown>) || {};

    // 2. Fetch menu items to resolve item-level tax rates and SAC codes
    const menuRes = await getRestaurantMenu(tenantId);
    const menuItems = menuRes.data?.items || [];
    const itemMap = new Map<string, RestaurantItem>();
    menuItems.forEach((i) => itemMap.set(i.id, i));

    // Map items with tax info and preparation notes
    const enrichedItems: RestaurantOrderItem[] = orderPayload.items.map((oi) => {
      const dbItem = itemMap.get(oi.item_id);
      return {
        ...oi,
        hsn_sac_code: oi.hsn_sac_code || dbItem?.hsn_sac_code || '996331',
        tax_rate_percent:
          oi.tax_rate_percent !== undefined
            ? oi.tax_rate_percent
            : dbItem?.tax_rate_percent,
        is_veg: oi.is_veg !== undefined ? oi.is_veg : dbItem?.is_veg,
        preparation_notes: oi.preparation_notes || oi.special_notes,
      };
    });

    // 3. Compute dynamic tax, discount, service charge via Authoritative Tax Engine
    // (Never assume 5% GST!)
    const taxCalculation = calculateRestaurantOrderTaxes(
      enrichedItems.map((i) => ({
        item_id: i.item_id,
        name: i.name,
        price_inr: Number(i.price_inr),
        quantity: Number(i.quantity) || 1,
        tax_rate_percent: i.tax_rate_percent,
        hsn_sac_code: i.hsn_sac_code,
      })),
      {
        serviceChargePercent: orderPayload.service_charge_percent,
        discountPercent: orderPayload.discount_percent,
        discountInr: orderPayload.discount_inr,
        tenantSettings: settings,
        orderDate: now,
      }
    );

    // 4. Generate sequential/timestamped Order Number & Kitchen Order Ticket (KOT)
    const orderTimestamp = Date.now().toString().slice(-6);
    const orderNumber = `ORD-${orderTimestamp}`;
    const kotNumber = `KOT-${Math.floor(1000 + Math.random() * 9000)}`;

    const newOrder: RestaurantOrder = {
      id: `ord_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      tenant_id: tenantId,
      booking_id: orderPayload.booking_id || undefined,
      order_number: orderNumber,
      kot_number: kotNumber,
      guest_name: orderPayload.guest_name.trim(),
      guest_room: orderPayload.guest_room?.trim() || undefined,
      guest_phone: orderPayload.guest_phone?.trim() || undefined,
      service_type: orderPayload.service_type,
      items: enrichedItems,
      subtotal_inr: taxCalculation.subtotal_inr,
      discount_inr: taxCalculation.discount_inr,
      discount_percent: orderPayload.discount_percent,
      service_charge_inr: taxCalculation.service_charge_inr,
      service_charge_percent: taxCalculation.service_charge_percent,
      tax_inr: taxCalculation.total_tax_inr,
      tax_breakdown: taxCalculation.tax_breakdown,
      total_inr: taxCalculation.total_inr,
      status: 'PLACED',
      payment_method: orderPayload.payment_method,
      is_paid: orderPayload.payment_method === 'online_razorpay',
      charged_to_folio: false,
      notes: orderPayload.notes?.trim() || undefined,
      created_at: now,
      updated_at: now,
    };

    // 5. Try inserting into restaurant_orders table
    try {
      const { data: dbOrder, error: dbError } = await adminDb
        .from('restaurant_orders')
        .insert({
          tenant_id: tenantId,
          booking_id: newOrder.booking_id || null,
          order_number: newOrder.order_number,
          guest_name: newOrder.guest_name,
          guest_room: newOrder.guest_room || null,
          guest_phone: newOrder.guest_phone || null,
          service_type: newOrder.service_type,
          items: newOrder.items,
          subtotal_inr: newOrder.subtotal_inr,
          tax_inr: newOrder.tax_inr,
          total_inr: newOrder.total_inr,
          status: newOrder.status,
          payment_method: newOrder.payment_method,
          is_paid: newOrder.is_paid,
          notes: newOrder.notes || null,
          created_at: now,
          updated_at: now,
        })
        .select()
        .maybeSingle();

      if (!dbError && dbOrder) {
        newOrder.id = dbOrder.id;
      }
    } catch {
      // Handled via dual-storage settings below
    }

    // 6. Dual-storage fallback: Maintain in tenant.settings.restaurant_orders
    const existingOrders = (settings.restaurant_orders as RestaurantOrder[]) || [];
    existingOrders.unshift(newOrder);

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          restaurant_orders: existingOrders.slice(0, 300),
        },
      })
      .eq('id', tenantId);

    // 7. If charged to room folio and booking ID is present, post idempotently
    if (orderPayload.payment_method === 'room_folio' && orderPayload.booking_id) {
      await postOrderToFolio(tenantId, newOrder.id, orderPayload.booking_id);
      newOrder.charged_to_folio = true;
    }

    // 8. Record audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        table_name: 'restaurant_orders',
        record_id: newOrder.id,
        action_type: 'INSERT',
        new_data: {
          order_number: newOrder.order_number,
          kot_number: newOrder.kot_number,
          guest_name: newOrder.guest_name,
          room: newOrder.guest_room,
          subtotal_inr: newOrder.subtotal_inr,
          tax_inr: newOrder.tax_inr,
          total_inr: newOrder.total_inr,
          payment_method: newOrder.payment_method,
        },
        created_at: now,
      });
    } catch {
      // Non-blocking
    }

    revalidatePath('/restaurant');
    if (orderPayload.booking_id) {
      revalidatePath(`/bookings/${orderPayload.booking_id}`);
    }

    return {
      success: true,
      message: `Order #${orderNumber} (KOT #${kotNumber}) sent to kitchen!`,
      data: newOrder,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to place restaurant order.';
    return { success: false, error: message };
  }
}

/**
 * 3. IDEMPOTENT ROOM FOLIO CHARGING
 * Posts a restaurant order to the guest folio exactly once.
 * Prevents double charging by checking `charged_to_folio` flag and existing ledger incidentals.
 */
export async function postOrderToFolio(
  tenantId: string,
  orderId: string,
  targetBookingId?: string
): Promise<RestaurantActionResponse<{ folioChargeId: string }>> {
  try {
    // 1. Retrieve the order
    const ordersRes = await getRestaurantOrders(tenantId);
    const orders = ordersRes.data || [];
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      return { success: false, error: 'Restaurant order not found.' };
    }

    const bookingId = targetBookingId || order.booking_id;
    if (!bookingId) {
      return { success: false, error: 'Cannot post to folio: No associated booking ID provided.' };
    }

    // 2. IDEMPOTENCY CHECK:
    // If order is already recorded as charged to folio, return idempotently without duplicate charge
    if (order.charged_to_folio && order.folio_charge_id) {
      return {
        success: true,
        message: `Order #${order.order_number} is already charged to room folio.`,
        data: { folioChargeId: order.folio_charge_id },
      };
    }

    // 3. LEDGER IDEMPOTENCY CHECK:
    // Verify whether an incidental charge for this order number already exists on the booking
    const ledgerRes = await getBookingLedger(bookingId, tenantId);
    if (ledgerRes.success && ledgerRes.data) {
      const existingInc = ledgerRes.data.incidentals.find(
        (inc) =>
          inc.item_name.includes(order.order_number) ||
          (inc.notes && inc.notes.includes(order.order_number))
      );
      if (existingInc) {
        // Record as linked and return
        await markOrderChargedToFolio(tenantId, orderId, existingInc.id, bookingId);
        return {
          success: true,
          message: `Order #${order.order_number} was previously posted to folio.`,
          data: { folioChargeId: existingInc.id },
        };
      }
    }

    // 4. Create Incidental Charge on Folio
    const itemsSummary = order.items.map((i) => `${i.name} x${i.quantity}`).join(', ');
    const folioFormData = new FormData();
    folioFormData.append('bookingId', bookingId);
    folioFormData.append('tenantId', tenantId);
    folioFormData.append(
      'itemName',
      `Restaurant Order #${order.order_number} (${itemsSummary.slice(0, 80)}${itemsSummary.length > 80 ? '...' : ''})`
    );
    folioFormData.append('category', 'restaurant');
    folioFormData.append('amountInr', order.total_inr.toString());
    folioFormData.append('quantity', '1');
    folioFormData.append(
      'notes',
      `Dining/Room Service Order #${order.order_number}. KOT: ${order.kot_number || 'N/A'}. Placed by: ${order.guest_name}. Subtotal: ₹${order.subtotal_inr}, Tax: ₹${order.tax_inr}.`
    );

    const chargeRes = await addIncidentalCharge(folioFormData);
    if (!chargeRes.success || !chargeRes.data) {
      return {
        success: false,
        error: chargeRes.error || 'Failed to post incidental charge to room folio.',
      };
    }

    const folioChargeId = chargeRes.data.id;

    // 5. Update Order Record with Folio Link
    await markOrderChargedToFolio(tenantId, orderId, folioChargeId, bookingId);

    revalidatePath('/restaurant');
    revalidatePath(`/bookings/${bookingId}`);

    return {
      success: true,
      message: `Order #${order.order_number} successfully posted to room folio (₹${order.total_inr.toLocaleString()}).`,
      data: { folioChargeId },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to post order to room folio.';
    return { success: false, error: message };
  }
}

/**
 * Internal helper to record folio charge linkage
 */
async function markOrderChargedToFolio(
  tenantId: string,
  orderId: string,
  folioChargeId: string,
  bookingId: string
) {
  const adminDb = createAdminClient();
  const now = new Date().toISOString();

  // Try updating table
  try {
    await adminDb
      .from('restaurant_orders')
      .update({
        booking_id: bookingId,
        payment_method: 'room_folio',
        updated_at: now,
      })
      .eq('id', orderId)
      .eq('tenant_id', tenantId);
  } catch {
    // Non-blocking
  }

  // Update in settings
  const { data: tenant } = await adminDb
    .from('tenants')
    .select('settings')
    .eq('id', tenantId)
    .single();

  const settings = (tenant?.settings as Record<string, unknown>) || {};
  const existingOrders = (settings.restaurant_orders as RestaurantOrder[]) || [];

  const updatedOrders = existingOrders.map((o) =>
    o.id === orderId
      ? {
          ...o,
          booking_id: bookingId,
          payment_method: 'room_folio' as const,
          charged_to_folio: true,
          folio_charge_id: folioChargeId,
          folio_posted_at: now,
          updated_at: now,
        }
      : o
  );

  await adminDb
    .from('tenants')
    .update({
      settings: {
        ...settings,
        restaurant_orders: updatedOrders,
      },
    })
    .eq('id', tenantId);
}

/**
 * 4. CANCEL RESTAURANT ORDER & SAFE FOLIO REVERSAL
 * Cancels an order with a mandatory reason, and automatically reverses/voids any folio charge.
 */
export async function cancelRestaurantOrder(
  tenantId: string,
  orderId: string,
  cancellationReason: string,
  cancelledBy?: string
): Promise<RestaurantActionResponse<RestaurantOrder>> {
  try {
    if (!cancellationReason || !cancellationReason.trim()) {
      return { success: false, error: 'Cancellation reason is mandatory.' };
    }

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const ordersRes = await getRestaurantOrders(tenantId);
    const orders = ordersRes.data || [];
    const order = orders.find((o) => o.id === orderId);

    if (!order) {
      return { success: false, error: 'Restaurant order not found.' };
    }

    // 1. If order was charged to folio, reverse the charge on the room ledger!
    if (order.charged_to_folio && order.booking_id) {
      const reversalFormData = new FormData();
      reversalFormData.append('bookingId', order.booking_id);
      reversalFormData.append('tenantId', tenantId);
      reversalFormData.append(
        'itemName',
        `[REVERSAL] Cancelled Order #${order.order_number}`
      );
      reversalFormData.append('category', 'restaurant');
      reversalFormData.append('amountInr', (-Math.abs(order.total_inr)).toString());
      reversalFormData.append('quantity', '1');
      reversalFormData.append(
        'notes',
        `Automatic credit reversal for cancelled restaurant order #${order.order_number}. Reason: ${cancellationReason.trim()}. Cancelled by: ${cancelledBy || 'Staff'}.`
      );

      await addIncidentalCharge(reversalFormData);
    }

    // 2. Update order record to CANCELLED
    const updatedOrder: RestaurantOrder = {
      ...order,
      status: 'CANCELLED',
      cancellation_reason: cancellationReason.trim(),
      cancelled_at: now,
      cancelled_by: cancelledBy || 'Kitchen Staff',
      charged_to_folio: false,
      updated_at: now,
    };

    // Try updating table
    try {
      await adminDb
        .from('restaurant_orders')
        .update({
          status: 'CANCELLED',
          updated_at: now,
        })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
    } catch {
      // Non-blocking
    }

    // Update in settings
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingOrders = (settings.restaurant_orders as RestaurantOrder[]) || [];

    const newOrders = existingOrders.map((o) => (o.id === orderId ? updatedOrder : o));

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          restaurant_orders: newOrders,
        },
      })
      .eq('id', tenantId);

    revalidatePath('/restaurant');
    if (order.booking_id) {
      revalidatePath(`/bookings/${order.booking_id}`);
    }

    return {
      success: true,
      message: `Order #${order.order_number} cancelled.${order.charged_to_folio ? ' Folio charge was automatically credited back.' : ''}`,
      data: updatedOrder,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to cancel restaurant order.';
    return { success: false, error: message };
  }
}

/**
 * 5. UPDATE ORDER STATUS (Placed -> Accepted -> Preparing -> Ready -> Served/Delivered)
 */
export async function updateRestaurantOrderStatus(
  tenantId: string,
  orderId: string,
  status: RestaurantOrderStatus
): Promise<RestaurantActionResponse<RestaurantOrder>> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // 1. Try updating SQL table
    try {
      await adminDb
        .from('restaurant_orders')
        .update({ status, updated_at: now })
        .eq('id', orderId)
        .eq('tenant_id', tenantId);
    } catch {
      // Handled via settings fallback
    }

    // 2. Settings update
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingOrders = (settings.restaurant_orders as RestaurantOrder[]) || [];

    const orderIdx = existingOrders.findIndex((o) => o.id === orderId);
    let updatedOrder: RestaurantOrder | null = null;

    if (orderIdx >= 0) {
      existingOrders[orderIdx] = {
        ...existingOrders[orderIdx],
        status,
        updated_at: now,
      };
      updatedOrder = existingOrders[orderIdx];

      await adminDb
        .from('tenants')
        .update({
          settings: {
            ...settings,
            restaurant_orders: existingOrders,
          },
        })
        .eq('id', tenantId);
    }

    revalidatePath('/restaurant');
    return {
      success: true,
      message: `Order status transitioned to ${status}.`,
      data: updatedOrder || undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to update order status.';
    return { success: false, error: message };
  }
}

/**
 * 6. GET ALL RESTAURANT ORDERS (For Kitchen Desk or Guest Portal)
 */
export async function getRestaurantOrders(
  tenantId: string,
  bookingId?: string
): Promise<RestaurantActionResponse<RestaurantOrder[]>> {
  try {
    const adminDb = createAdminClient();

    // 1. Fetch settings orders (rich payload with KOT, tax_breakdown, etc.)
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const settingsOrders = (settings.restaurant_orders as RestaurantOrder[]) || [];

    // 2. Fetch table orders
    let tableOrders: RestaurantOrder[] = [];
    try {
      const { data: dbOrders, error: dbError } = await adminDb
        .from('restaurant_orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (!dbError && dbOrders) {
        tableOrders = dbOrders as unknown as RestaurantOrder[];
      }
    } catch {
      // Ignore
    }

    // Merge: prefer settings orders for rich fields, fallback to db orders
    const orderMap = new Map<string, RestaurantOrder>();
    tableOrders.forEach((o) => orderMap.set(o.id, o));
    settingsOrders.forEach((o) => {
      const existing = orderMap.get(o.id);
      orderMap.set(o.id, { ...(existing || {}), ...o });
    });

    let merged = Array.from(orderMap.values());
    merged.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    if (bookingId) {
      merged = merged.filter((o) => o.booking_id === bookingId);
    }

    return { success: true, data: merged };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch restaurant orders.';
    return { success: false, error: message };
  }
}

/**
 * 7. TOGGLE MENU ITEM AVAILABILITY (Kitchen 86'd / In-Stock Switch)
 */
export async function toggleMenuItemAvailability(
  tenantId: string,
  itemId: string,
  isAvailable: boolean
): Promise<RestaurantActionResponse<RestaurantItem>> {
  try {
    const adminDb = createAdminClient();

    // Table update
    try {
      await adminDb
        .from('restaurant_items')
        .update({ is_available: isAvailable, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('tenant_id', tenantId);
    } catch {
      // Non-blocking
    }

    // Settings update
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const menu = (settings.restaurant_menu as { categories: RestaurantCategory[]; items: RestaurantItem[] }) || {
      categories: [],
      items: [],
    };

    let updatedItem: RestaurantItem | null = null;
    menu.items = menu.items.map((i) => {
      if (i.id === itemId) {
        updatedItem = { ...i, is_available: isAvailable };
        return updatedItem;
      }
      return i;
    });

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          restaurant_menu: menu,
        },
      })
      .eq('id', tenantId);

    revalidatePath('/restaurant');
    return {
      success: true,
      message: `Item marked ${isAvailable ? 'AVAILABLE' : 'OUT OF STOCK (86)'}.`,
      data: updatedItem || undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to toggle item availability.';
    return { success: false, error: message };
  }
}

/**
 * 8. CREATE OR UPDATE MENU ITEM (Admin Management with Item Tax Support)
 */
export async function saveRestaurantMenuItem(
  tenantId: string,
  item: Partial<RestaurantItem> & { name: string; price_inr: number }
): Promise<RestaurantActionResponse<RestaurantItem>> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    const itemId = item.id || `item_${Date.now().toString(36)}`;
    const itemData: RestaurantItem = {
      id: itemId,
      tenant_id: tenantId,
      name: item.name.trim(),
      category_id: item.category_id,
      category_name: item.category_name,
      description: item.description?.trim(),
      price_inr: Number(item.price_inr),
      is_veg: item.is_veg !== false,
      is_jain: Boolean(item.is_jain),
      is_available: item.is_available !== false,
      prep_time_minutes: item.prep_time_minutes || 20,
      image_url: item.image_url,
      hsn_sac_code: item.hsn_sac_code || '996331',
      tax_rate_percent: item.tax_rate_percent !== undefined ? Number(item.tax_rate_percent) : 5.0,
      is_tax_inclusive: item.is_tax_inclusive !== undefined ? item.is_tax_inclusive : true,
      created_at: item.created_at || now,
    };

    // Try SQL table
    try {
      await adminDb
        .from('restaurant_items')
        .upsert({
          id: itemData.id,
          tenant_id: tenantId,
          name: itemData.name,
          category_id: itemData.category_id || null,
          description: itemData.description || null,
          price_inr: itemData.price_inr,
          is_veg: itemData.is_veg,
          is_available: itemData.is_available,
          prep_time_minutes: itemData.prep_time_minutes,
          image_url: itemData.image_url || null,
          updated_at: now,
        });
    } catch {
      // Non-blocking
    }

    // Fallback to tenant settings JSON
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const menu = (settings.restaurant_menu as { categories: RestaurantCategory[]; items: RestaurantItem[] }) || {
      categories: [],
      items: [],
    };

    const existingIdx = menu.items.findIndex((i) => i.id === itemId);
    if (existingIdx >= 0) {
      menu.items[existingIdx] = itemData;
    } else {
      menu.items.push(itemData);
    }

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          restaurant_menu: menu,
        },
      })
      .eq('id', tenantId);

    revalidatePath('/restaurant');
    return { success: true, message: 'Menu item saved successfully.', data: itemData };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save menu item.';
    return { success: false, error: message };
  }
}

/**
 * 9. BULK IMPORT RESTAURANT MENU ITEMS FROM EXCEL / CSV
 * Parses spreadsheet rows, normalizes categories & Jain dietary flags,
 * and saves items in bulk.
 */
export async function bulkImportRestaurantMenuItems(
  tenantId: string,
  rawItems: Array<{
    name: string;
    category?: string;
    price: number | string;
    dietary?: string; // 'veg' | 'jain' | 'non_veg'
    description?: string;
    hsn_sac?: string;
    tax_rate?: number | string;
    is_available?: boolean | string;
  }>
): Promise<RestaurantActionResponse<{ count: number }>> {
  try {
    if (!tenantId) {
      return { success: false, error: 'Tenant identifier is required.' };
    }
    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return { success: false, error: 'No menu items provided for import.' };
    }

    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // Fetch existing menu to merge categories and items
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const existingMenu = (settings.restaurant_menu as {
      categories: RestaurantCategory[];
      items: RestaurantItem[];
    }) || { categories: [], items: [] };

    const categoriesList = [...existingMenu.categories];
    const categoryNameSet = new Set(categoriesList.map((c) => c.name.toLowerCase().trim()));

    const itemsToSave: RestaurantItem[] = [];

    for (const raw of rawItems) {
      const name = (raw.name || '').trim();
      if (!name) continue;

      const categoryName = (raw.category || 'General').trim();
      if (categoryName && !categoryNameSet.has(categoryName.toLowerCase())) {
        categoryNameSet.add(categoryName.toLowerCase());
        categoriesList.push({
          id: `cat_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
          tenant_id: tenantId,
          name: categoryName,
          description: `Dishes under ${categoryName}`,
          sort_order: categoriesList.length + 1,
          is_active: true,
          created_at: now,
        });
      }

      const dietaryStr = (raw.dietary || '').toLowerCase().trim();
      const isJain = dietaryStr.includes('jain');
      const isVeg = isJain || dietaryStr.includes('veg') && !dietaryStr.includes('non');

      const price = Number(raw.price) || 0;
      const taxRate = raw.tax_rate !== undefined ? Number(raw.tax_rate) : 5.0;
      const isAvailable =
        typeof raw.is_available === 'boolean'
          ? raw.is_available
          : typeof raw.is_available === 'string'
          ? !['false', '0', 'no', 'out of stock', '86'].includes(raw.is_available.toLowerCase().trim())
          : true;

      const itemRecord: RestaurantItem = {
        id: `item_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 8)}`,
        tenant_id: tenantId,
        name,
        category_name: categoryName,
        description: (raw.description || '').trim(),
        price_inr: price,
        is_veg: isVeg,
        is_jain: isJain,
        is_available: isAvailable,
        prep_time_minutes: 20,
        hsn_sac_code: (raw.hsn_sac || '996331').trim(),
        tax_rate_percent: taxRate,
        is_tax_inclusive: true,
        created_at: now,
      };

      itemsToSave.push(itemRecord);
    }

    if (itemsToSave.length === 0) {
      return { success: false, error: 'No valid rows found in spreadsheet.' };
    }

    // Merge into tenant settings
    const updatedItems = [...existingMenu.items, ...itemsToSave];

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          restaurant_menu: {
            categories: categoriesList,
            items: updatedItems,
          },
        },
      })
      .eq('id', tenantId);

    // Try batch insertion to SQL table
    try {
      const sqlRows = itemsToSave.map((i) => ({
        id: i.id,
        tenant_id: tenantId,
        name: i.name,
        description: i.description || null,
        price_inr: i.price_inr,
        is_veg: i.is_veg,
        is_available: i.is_available,
        prep_time_minutes: i.prep_time_minutes,
        updated_at: now,
      }));
      await adminDb.from('restaurant_items').upsert(sqlRows);
    } catch {
      // Non-blocking
    }

    revalidatePath('/restaurant');

    return {
      success: true,
      message: `Successfully imported ${itemsToSave.length} menu items from spreadsheet!`,
      data: { count: itemsToSave.length },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error importing menu items.';
    return { success: false, error: message };
  }
}

/**
 * 10. EXPORT RESTAURANT MENU AS CSV
 * Generates an Excel/spreadsheet-compatible CSV containing all dishes,
 * categories, pricing, Jain/Veg dietary indicators, and GST rates.
 */
export async function exportRestaurantMenuCsv(
  tenantId: string
): Promise<{ success: boolean; csv?: string; count?: number; error?: string }> {
  try {
    if (!tenantId) {
      return { success: false, error: 'Tenant identifier is required.' };
    }

    const menuRes = await getRestaurantMenu(tenantId);
    const items = menuRes.data?.items || [];

    const lines: string[] = [];
    lines.push(
      '"Item Name","Category","Price (INR)","Dietary (Veg/Non-Veg/Jain)","Description","HSN/SAC Code","Tax Rate (%)","Available"'
    );

    items.forEach((item) => {
      const dietary = item.is_jain ? 'Jain' : item.is_veg ? 'Veg' : 'Non-Veg';
      const cleanName = item.name.replace(/"/g, '""');
      const cleanCat = (item.category_name || 'General').replace(/"/g, '""');
      const cleanDesc = (item.description || '').replace(/"/g, '""');
      const sac = item.hsn_sac_code || '996331';
      const taxRate = item.tax_rate_percent !== undefined ? item.tax_rate_percent : 5.0;
      const avail = item.is_available ? 'Yes' : 'No';

      lines.push(
        `"${cleanName}","${cleanCat}",${item.price_inr},"${dietary}","${cleanDesc}","${sac}",${taxRate},"${avail}"`
      );
    });

    return {
      success: true,
      csv: lines.join('\n'),
      count: items.length,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to export menu.';
    return { success: false, error: message };
  }
}

