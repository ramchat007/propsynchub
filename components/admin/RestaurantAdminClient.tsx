'use client';

import React, { useState } from 'react';
import {
  RestaurantCategory,
  RestaurantItem,
  RestaurantOrder,
  RestaurantOrderStatus,
  RestaurantOrderItem,
  RestaurantServiceType,
  RestaurantPaymentMethod,
  Booking,
  Room,
} from '@/types';
import {
  updateRestaurantOrderStatus,
  saveRestaurantMenuItem,
  toggleMenuItemAvailability,
  createRestaurantOrder,
  postOrderToFolio,
  cancelRestaurantOrder,
  bulkImportRestaurantMenuItems,
  exportRestaurantMenuCsv,
} from '@/app/actions/restaurant';

interface RestaurantAdminClientProps {
  tenantId: string;
  initialCategories: RestaurantCategory[];
  initialItems: RestaurantItem[];
  initialOrders: RestaurantOrder[];
  activeBookings?: Booking[];
  rooms?: Room[];
}

const ORDER_STATUS_COLORS: Record<RestaurantOrderStatus, { bg: string; text: string; border: string }> = {
  PLACED: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-400', border: 'border-amber-200 dark:border-amber-800' },
  ACCEPTED: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-400', border: 'border-blue-200 dark:border-blue-800' },
  PREPARING: { bg: 'bg-purple-50 dark:bg-purple-950/30', text: 'text-purple-700 dark:text-purple-400', border: 'border-purple-200 dark:border-purple-800' },
  READY: { bg: 'bg-teal-50 dark:bg-teal-950/30', text: 'text-teal-700 dark:text-teal-400', border: 'border-teal-200 dark:border-teal-800' },
  SERVED: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  DELIVERED: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-200 dark:border-emerald-800' },
  CANCELLED: { bg: 'bg-rose-50 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-400', border: 'border-rose-200 dark:border-rose-800' },
};

export default function RestaurantAdminClient({
  tenantId,
  initialCategories,
  initialItems,
  initialOrders,
  activeBookings = [],
  rooms = [],
}: RestaurantAdminClientProps) {
  const [activeTab, setActiveTab] = useState<'orders' | 'menu'>('orders');
  const [orders, setOrders] = useState<RestaurantOrder[]>(initialOrders);
  const [items, setItems] = useState<RestaurantItem[]>(initialItems);
  const [orderFilter, setOrderFilter] = useState<'active' | 'all' | 'delivered' | 'cancelled'>('active');
  const [loadingOrderId, setLoadingOrderId] = useState<string | null>(null);

  // KOT Slip Modal State
  const [viewingKotOrder, setViewingKotOrder] = useState<RestaurantOrder | null>(null);

  // Cancellation Modal State
  const [cancellingOrder, setCancellingOrder] = useState<RestaurantOrder | null>(null);
  const [cancellationReason, setCancellationReason] = useState('');
  const [isCancelling, setIsCancelling] = useState(false);

  // Post to Folio Modal State
  const [folioTargetOrder, setFolioTargetOrder] = useState<RestaurantOrder | null>(null);
  const [selectedBookingId, setSelectedBookingId] = useState('');
  const [isPostingFolio, setIsPostingFolio] = useState(false);

  // Add Item Modal State (including Jain dietary option)
  const [showAddItemModal, setShowAddItemModal] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState(initialCategories[0]?.name || 'Starters & Coastal Bites');
  const [newItemPrice, setNewItemPrice] = useState('300');
  const [newItemDietary, setNewItemDietary] = useState<'veg' | 'jain' | 'nonveg'>('veg');
  const [newItemDesc, setNewItemDesc] = useState('');
  const [newItemSac, setNewItemSac] = useState('996331');
  const [newItemTaxRate, setNewItemTaxRate] = useState('5');
  const [newItemTaxInclusive, setNewItemTaxInclusive] = useState(true);

  // Bulk Menu Import / Export Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvRawText, setCsvRawText] = useState('');
  const [parsedImportItems, setParsedImportItems] = useState<
    Array<{
      name: string;
      category?: string;
      price: number;
      dietary?: string;
      description?: string;
      hsn_sac?: string;
      tax_rate?: number;
      is_available?: boolean;
    }>
  >([]);
  const [isImporting, setIsImporting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // New Order (POS / Room Dining) Modal State
  const [showNewOrderModal, setShowNewOrderModal] = useState(false);
  const [newOrderGuestName, setNewOrderGuestName] = useState('');
  const [newOrderRoom, setNewOrderRoom] = useState('');
  const [newOrderBookingId, setNewOrderBookingId] = useState('');
  const [newOrderServiceType, setNewOrderServiceType] = useState<RestaurantServiceType>('room_delivery');
  const [newOrderPaymentMethod, setNewOrderPaymentMethod] = useState<RestaurantPaymentMethod>('room_folio');
  const [newOrderNotes, setNewOrderNotes] = useState('');
  const [newOrderDiscountPercent, setNewOrderDiscountPercent] = useState('0');
  const [newOrderServiceChargePercent, setNewOrderServiceChargePercent] = useState('0');
  const [newOrderCart, setNewOrderCart] = useState<Record<string, { quantity: number; notes: string }>>({});
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  const activeOrders = orders.filter(
    (o) => o.status !== 'SERVED' && o.status !== 'DELIVERED' && o.status !== 'CANCELLED'
  );

  const filteredOrders = orders.filter((o) => {
    if (orderFilter === 'active') {
      return o.status !== 'SERVED' && o.status !== 'DELIVERED' && o.status !== 'CANCELLED';
    }
    if (orderFilter === 'delivered') {
      return o.status === 'SERVED' || o.status === 'DELIVERED';
    }
    if (orderFilter === 'cancelled') {
      return o.status === 'CANCELLED';
    }
    return true;
  });

  // Handle status update
  const handleStatusUpdate = async (orderId: string, newStatus: RestaurantOrderStatus) => {
    setLoadingOrderId(orderId);
    const res = await updateRestaurantOrderStatus(tenantId, orderId, newStatus);
    if (res.success && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === orderId ? res.data! : o)));
    } else {
      alert(res.error || 'Failed to update order status');
    }
    setLoadingOrderId(null);
  };

  // Handle 1-click availability toggle
  const handleToggleAvailability = async (item: RestaurantItem) => {
    const newStatus = !item.is_available;
    const res = await toggleMenuItemAvailability(tenantId, item.id, newStatus);
    if (res.success && res.data) {
      setItems((prev) => prev.map((i) => (i.id === item.id ? res.data! : i)));
    } else {
      alert(res.error || 'Failed to update item availability');
    }
  };

  // Handle create menu item (supports Veg, Jain, Non-Veg)
  const handleCreateMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice) return;

    const matchedCat = initialCategories.find((c) => c.name === newItemCategory);
    const isJain = newItemDietary === 'jain';
    const isVeg = newItemDietary !== 'nonveg';

    const res = await saveRestaurantMenuItem(tenantId, {
      name: newItemName.trim(),
      category_id: matchedCat?.id,
      category_name: newItemCategory,
      price_inr: parseFloat(newItemPrice),
      is_veg: isVeg,
      is_jain: isJain,
      is_available: true,
      description: newItemDesc.trim(),
      prep_time_minutes: 20,
      hsn_sac_code: newItemSac.trim() || '996331',
      tax_rate_percent: parseFloat(newItemTaxRate) || 5.0,
      is_tax_inclusive: newItemTaxInclusive,
    });

    if (res.success && res.data) {
      setItems((prev) => [...prev, res.data!]);
      setShowAddItemModal(false);
      setNewItemName('');
      setNewItemDesc('');
      setNewItemDietary('veg');
      alert('Menu item saved successfully!');
    } else {
      alert(res.error || 'Failed to add item');
    }
  };

  // 1-Click Menu CSV Export
  const handleExportCsv = async () => {
    setIsExporting(true);
    try {
      const res = await exportRestaurantMenuCsv(tenantId);
      if (res.success && res.csv) {
        const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `resort_menu_${tenantId.slice(0, 8)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        alert(res.error || 'Failed to export menu.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error exporting menu';
      alert(msg);
    }
    setIsExporting(false);
  };

  // Sample CSV Template Download
  const downloadSampleCsv = () => {
    const sample = `"Item Name","Category","Price (INR)","Dietary (Veg/Non-Veg/Jain)","Description","HSN/SAC Code","Tax Rate (%)","Available"
"Malvani Surmai Fry","Seafood Specials",450,"Non-Veg","Fresh catch pan seared with Malvani coastal spices","996331",5,"Yes"
"Paneer Angara Tikka","Tandoor Starters",320,"Veg","Smoky cottage cheese cubes charred in clay tandoor","996331",5,"Yes"
"Jain Dal Tadka","Main Course",240,"Jain","Yellow lentils cooked without onion or garlic with cumin ghee tadka","996331",5,"Yes"
"Jain Paneer Butter Masala","Main Course",340,"Jain","Cottage cheese simmered in tomato cashew gravy without root vegetables","996331",5,"Yes"
"Solkadhi","Beverages",90,"Veg","Digestive Konkani kokum drink with fresh coconut milk","996331",5,"Yes"`;

    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sample_menu_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to parse CSV lines safely
  const parseCsvLines = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return [];

    const parsed: Array<{
      name: string;
      category?: string;
      price: number;
      dietary?: string;
      description?: string;
      hsn_sac?: string;
      tax_rate?: number;
      is_available?: boolean;
    }> = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Regex CSV parse handling quoted commas
      const matches = line.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g);
      if (!matches) continue;
      const cols = matches.map((m) => {
        let v = m.replace(/^,/, '').trim();
        if (v.startsWith('"') && v.endsWith('"')) {
          v = v.substring(1, v.length - 1).replace(/""/g, '"');
        }
        return v;
      });

      const name = cols[0] || '';
      if (!name) continue;

      const category = cols[1] || 'General';
      const price = parseFloat(cols[2]) || 0;
      const dietary = cols[3] || 'Veg';
      const description = cols[4] || '';
      const hsn_sac = cols[5] || '996331';
      const tax_rate = parseFloat(cols[6]) || 5.0;
      const is_available = cols[7]
        ? !['no', 'false', '0', 'out of stock', '86'].includes(cols[7].toLowerCase().trim())
        : true;

      parsed.push({
        name,
        category,
        price,
        dietary,
        description,
        hsn_sac,
        tax_rate,
        is_available,
      });
    }

    return parsed;
  };

  // Handle CSV file selection
  const handleCsvFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || '';
      setCsvRawText(text);
      const rows = parseCsvLines(text);
      setParsedImportItems(rows);
    };
    reader.readAsText(file);
  };

  // Execute Bulk Menu Import
  const handleConfirmBulkImport = async () => {
    if (parsedImportItems.length === 0) {
      alert('Please select or paste a valid CSV file with menu rows.');
      return;
    }

    setIsImporting(true);
    try {
      const res = await bulkImportRestaurantMenuItems(tenantId, parsedImportItems);
      if (res.success) {
        alert(res.message || `Successfully imported ${parsedImportItems.length} dishes!`);
        setShowImportModal(false);
        setCsvRawText('');
        setParsedImportItems([]);
        window.location.reload();
      } else {
        alert(res.error || 'Failed to import menu items.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error importing menu';
      alert(msg);
    }
    setIsImporting(false);
  };

  // Handle Cancel Order
  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellingOrder || !cancellationReason.trim()) return;

    setIsCancelling(true);
    const res = await cancelRestaurantOrder(
      tenantId,
      cancellingOrder.id,
      cancellationReason.trim(),
      'Kitchen Supervisor'
    );

    if (res.success && res.data) {
      setOrders((prev) => prev.map((o) => (o.id === cancellingOrder.id ? res.data! : o)));
      setCancellingOrder(null);
      setCancellationReason('');
      alert(res.message);
    } else {
      alert(res.error || 'Failed to cancel order.');
    }
    setIsCancelling(false);
  };

  // Handle Post to Folio
  const handleConfirmPostToFolio = async () => {
    if (!folioTargetOrder) return;
    const targetBooking = selectedBookingId || folioTargetOrder.booking_id;
    if (!targetBooking) {
      alert('Please select an active guest booking to charge this order.');
      return;
    }

    setIsPostingFolio(true);
    const res = await postOrderToFolio(tenantId, folioTargetOrder.id, targetBooking);
    if (res.success && res.data) {
      setOrders((prev) =>
        prev.map((o) =>
          o.id === folioTargetOrder.id
            ? {
                ...o,
                charged_to_folio: true,
                folio_charge_id: res.data!.folioChargeId,
                payment_method: 'room_folio',
              }
            : o
        )
      );
      setFolioTargetOrder(null);
      alert(res.message);
    } else {
      alert(res.error || 'Failed to post order to room folio.');
    }
    setIsPostingFolio(false);
  };

  // Handle POS / Staff Order Submission
  const handleCreateNewOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cartEntries = Object.entries(newOrderCart).filter(([, val]) => val.quantity > 0);
    if (cartEntries.length === 0) {
      alert('Please add at least one item to the order.');
      return;
    }
    if (!newOrderGuestName.trim()) {
      alert('Guest name or Room number is required.');
      return;
    }

    setIsSubmittingOrder(true);
    const orderItems: RestaurantOrderItem[] = cartEntries.map(([itemId, val]) => {
      const item = items.find((i) => i.id === itemId);
      return {
        item_id: itemId,
        name: item?.name || 'Menu Item',
        price_inr: item?.price_inr || 0,
        quantity: val.quantity,
        preparation_notes: val.notes.trim() || undefined,
        hsn_sac_code: item?.hsn_sac_code || '996331',
        tax_rate_percent: item?.tax_rate_percent !== undefined ? item.tax_rate_percent : 5.0,
        is_veg: item?.is_veg,
      };
    });

    const res = await createRestaurantOrder(tenantId, {
      booking_id: newOrderBookingId || undefined,
      guest_name: newOrderGuestName.trim(),
      guest_room: newOrderRoom.trim() || undefined,
      service_type: newOrderServiceType,
      items: orderItems,
      payment_method: newOrderPaymentMethod,
      discount_percent: parseFloat(newOrderDiscountPercent) || 0,
      service_charge_percent: parseFloat(newOrderServiceChargePercent) || 0,
      notes: newOrderNotes.trim() || undefined,
    });

    if (res.success && res.data) {
      setOrders((prev) => [res.data!, ...prev]);
      setShowNewOrderModal(false);
      setNewOrderCart({});
      setNewOrderGuestName('');
      setNewOrderRoom('');
      setNewOrderBookingId('');
      setNewOrderNotes('');
      alert(res.message || 'Order created and sent to kitchen!');
    } else {
      alert(res.error || 'Failed to create order.');
    }
    setIsSubmittingOrder(false);
  };

  // Handle Room Selection in New Order
  const handleSelectBookingForNewOrder = (bId: string) => {
    setNewOrderBookingId(bId);
    const bk = activeBookings.find((b) => b.id === bId);
    if (bk) {
      setNewOrderGuestName(bk.guest_name);
      const rm = rooms.find((r) => r.id === bk.room_id);
      setNewOrderRoom(rm?.room_number || rm?.name || '');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Action Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-stone-200 dark:border-neutral-800 pb-4">
        {/* Navigation Tabs */}
        <div className="flex gap-2">
          <button
            onClick={() => setActiveTab('orders')}
            className={`pb-2 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'orders'
                ? 'text-stone-900 dark:text-white border-b-2 border-emerald-600'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            🍳 Kitchen Order Board & KOTs
            {activeOrders.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-600 text-white font-extrabold">
                {activeOrders.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('menu')}
            className={`pb-2 px-4 text-xs font-bold transition-all relative ${
              activeTab === 'menu'
                ? 'text-stone-900 dark:text-white border-b-2 border-emerald-600'
                : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
            }`}
          >
            📋 Menu & Tax Schedules ({items.length} Items)
          </button>
        </div>

        {/* Global Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowNewOrderModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-stone-900 hover:bg-stone-800 text-white dark:bg-white dark:text-stone-900 dark:hover:bg-stone-100 shadow-sm transition flex items-center gap-1.5"
          >
            <span>+</span>
            <span>New Kitchen Order (POS)</span>
          </button>
          {activeTab === 'menu' && (
            <button
              onClick={() => setShowAddItemModal(true)}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm transition"
            >
              + Add Menu Item
            </button>
          )}
        </div>
      </div>

      {activeTab === 'orders' ? (
        <div className="space-y-6">
          {/* Status Filters */}
          <div className="flex flex-wrap gap-2">
            {(['active', 'all', 'delivered', 'cancelled'] as const).map((filterKey) => (
              <button
                key={filterKey}
                onClick={() => setOrderFilter(filterKey)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  orderFilter === filterKey
                    ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900 shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-400'
                }`}
              >
                {filterKey === 'active'
                  ? `Active Kitchen (${activeOrders.length})`
                  : filterKey === 'delivered'
                  ? 'Completed / Served'
                  : filterKey === 'cancelled'
                  ? 'Cancelled & Reversed'
                  : 'All Orders'}
              </button>
            ))}
          </div>

          {/* Orders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredOrders.length === 0 ? (
              <div className="col-span-full p-12 text-center rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900">
                <span className="text-3xl">👨‍🍳</span>
                <h4 className="mt-2 text-stone-700 dark:text-stone-300 font-bold text-sm">No orders in this queue</h4>
                <p className="mt-1 text-stone-400 text-xs">
                  Place an order above or through the in-room guest dining portal.
                </p>
              </div>
            ) : (
              filteredOrders.map((order) => {
                const color = ORDER_STATUS_COLORS[order.status] || ORDER_STATUS_COLORS.PLACED;
                const isLoading = loadingOrderId === order.id;

                return (
                  <div
                    key={order.id}
                    className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex flex-col justify-between transition hover:border-stone-300 dark:hover:border-neutral-700"
                  >
                    <div>
                      {/* Top Header: KOT Number & Status */}
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md">
                              {order.kot_number || 'KOT'}
                            </span>
                            <span className="font-mono text-[11px] font-bold text-stone-400">
                              #{order.order_number}
                            </span>
                          </div>
                          <h3 className="text-base font-black text-stone-900 dark:text-white mt-1">
                            {order.guest_name}
                          </h3>
                          <p className="text-xs text-stone-500 font-semibold">
                            {order.service_type === 'room_delivery'
                              ? `🛏️ Room Delivery ${order.guest_room ? `(Room ${order.guest_room})` : ''}`
                              : order.service_type === 'dining'
                              ? '🍽️ Restaurant Dining'
                              : '🥡 Takeaway'}
                          </p>
                        </div>
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${color.bg} ${color.text} ${color.border}`}
                        >
                          ● {order.status}
                        </span>
                      </div>

                      {/* Items & Preparation Notes */}
                      <div className="mt-4 pt-3 border-t border-stone-100 dark:border-neutral-800 space-y-2.5">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="text-xs">
                            <div className="flex justify-between items-start">
                              <span className="text-stone-800 dark:text-stone-200 font-medium">
                                <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${item.is_veg === false ? 'bg-rose-500' : 'bg-emerald-500'}`} />
                                {item.name} <strong className="text-emerald-600 font-extrabold">x{item.quantity}</strong>
                              </span>
                              <span className="font-bold text-stone-700 dark:text-stone-300">
                                ₹{item.price_inr * item.quantity}
                              </span>
                            </div>
                            {/* Preparation Notes */}
                            {(item.preparation_notes || item.special_notes) && (
                              <div className="mt-0.5 ml-3.5 px-2 py-1 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 rounded text-[11px] text-amber-800 dark:text-amber-300 font-semibold">
                                🍳 Prep: {item.preparation_notes || item.special_notes}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* General Order Notes */}
                      {order.notes && (
                        <div className="mt-2 text-[11px] text-stone-500 italic bg-stone-50 dark:bg-neutral-800/50 p-2 rounded-lg">
                          Note: {order.notes}
                        </div>
                      )}

                      {/* Cancellation Notice */}
                      {order.status === 'CANCELLED' && order.cancellation_reason && (
                        <div className="mt-3 p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 text-[11px] text-rose-700 dark:text-rose-300">
                          <strong className="block font-black">Cancelled: {order.cancellation_reason}</strong>
                          {order.cancelled_by && <span className="text-[10px]">By: {order.cancelled_by}</span>}
                        </div>
                      )}

                      {/* Tax Breakdown & Bill Calculation */}
                      <div className="mt-4 pt-3 border-t border-stone-100 dark:border-neutral-800 space-y-1 text-[11px] text-stone-500 dark:text-stone-400">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span className="font-mono">₹{order.subtotal_inr.toLocaleString()}</span>
                        </div>
                        {order.discount_inr && order.discount_inr > 0 ? (
                          <div className="flex justify-between text-emerald-600">
                            <span>Discount:</span>
                            <span className="font-mono">-₹{order.discount_inr.toLocaleString()}</span>
                          </div>
                        ) : null}
                        {order.service_charge_inr && order.service_charge_inr > 0 ? (
                          <div className="flex justify-between">
                            <span>Service Charge:</span>
                            <span className="font-mono">₹{order.service_charge_inr.toLocaleString()}</span>
                          </div>
                        ) : null}
                        <div className="flex justify-between">
                          <span>GST (Itemized):</span>
                          <span className="font-mono">₹{order.tax_inr.toLocaleString()}</span>
                        </div>
                        <div className="pt-1 border-t border-stone-100 dark:border-neutral-800 flex justify-between items-center text-xs">
                          <strong className="text-stone-900 dark:text-white font-black">Total Bill:</strong>
                          <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                            ₹{order.total_inr.toLocaleString()}
                          </strong>
                        </div>
                      </div>

                      {/* Billing & Idempotent Folio Badge */}
                      <div className="mt-3 pt-2 border-t border-stone-100 dark:border-neutral-800 flex justify-between items-center text-[11px]">
                        <div>
                          {order.charged_to_folio ? (
                            <span className="inline-flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                              ✓ Posted to Room Folio
                            </span>
                          ) : order.payment_method === 'room_folio' ? (
                            <span className="font-bold text-amber-700 dark:text-amber-400">
                              Room Folio Pending
                            </span>
                          ) : order.payment_method === 'online_razorpay' ? (
                            <span className="font-bold text-blue-700 dark:text-blue-400">
                              Paid Online (Razorpay)
                            </span>
                          ) : (
                            <span className="font-bold text-stone-600 dark:text-stone-400">
                              Pay at Counter
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setViewingKotOrder(order)}
                          className="text-[11px] font-bold text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white underline"
                        >
                          View KOT Slip
                        </button>
                      </div>
                    </div>

                    {/* Operational Action Buttons */}
                    <div className="mt-5 pt-3 border-t border-stone-100 dark:border-neutral-800 flex flex-wrap gap-1.5">
                      {order.status === 'PLACED' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusUpdate(order.id, 'ACCEPTED')}
                          className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white transition disabled:opacity-50"
                        >
                          Accept Order
                        </button>
                      )}
                      {order.status === 'ACCEPTED' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusUpdate(order.id, 'PREPARING')}
                          className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white transition disabled:opacity-50"
                        >
                          Start Cooking
                        </button>
                      )}
                      {order.status === 'PREPARING' && (
                        <button
                          disabled={isLoading}
                          onClick={() => handleStatusUpdate(order.id, 'READY')}
                          className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white transition disabled:opacity-50"
                        >
                          Mark Ready
                        </button>
                      )}
                      {order.status === 'READY' && (
                        <button
                          disabled={isLoading}
                          onClick={() =>
                            handleStatusUpdate(
                              order.id,
                              order.service_type === 'room_delivery' ? 'DELIVERED' : 'SERVED'
                            )
                          }
                          className="flex-1 py-1.5 px-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                        >
                          {order.service_type === 'room_delivery' ? 'Dispatched & Delivered' : 'Served to Guest'}
                        </button>
                      )}

                      {/* Post to Room Folio button if not already posted */}
                      {!order.charged_to_folio && order.status !== 'CANCELLED' && (
                        <button
                          disabled={isLoading}
                          onClick={() => {
                            setFolioTargetOrder(order);
                            setSelectedBookingId(order.booking_id || '');
                          }}
                          className="py-1.5 px-2.5 rounded-xl text-xs font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800 transition disabled:opacity-50"
                        >
                          ⚡ Post to Folio
                        </button>
                      )}

                      {/* Cancel Order */}
                      {order.status !== 'CANCELLED' && order.status !== 'DELIVERED' && order.status !== 'SERVED' && (
                        <button
                          disabled={isLoading}
                          onClick={() => setCancellingOrder(order)}
                          className="py-1.5 px-2.5 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-300 transition disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ) : (
        /* MENU & TAX MANAGEMENT TAB */
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-stone-900 dark:text-white">Active Resort Menu Items</h2>
              <p className="text-xs text-stone-500">
                Item-level GST rate configuration, SAC codes, Jain/Veg dietary indicators, and bulk CSV management.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportCsv}
                disabled={isExporting}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-white dark:bg-neutral-800 border border-stone-300 dark:border-neutral-700 hover:bg-stone-50 dark:hover:bg-neutral-700 text-stone-700 dark:text-stone-200 transition shadow-xs flex items-center gap-1.5"
                title="Download entire menu as CSV spreadsheet"
              >
                <span>{isExporting ? '⏳ Exporting...' : '📥 Export Menu (CSV)'}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowImportModal(true)}
                className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 text-amber-800 dark:text-amber-300 transition shadow-xs flex items-center gap-1.5"
                title="Upload spreadsheet to bulk import or update menu"
              >
                <span>📤 Import Menu (CSV)</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAddItemModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-sm"
              >
                + Add Menu Item
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {item.is_jain ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300">
                            🕊️ Jain
                          </span>
                        ) : item.is_veg ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300">
                            🌱 Veg
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-300">
                            🍗 Non-Veg
                          </span>
                        )}
                        <span className="text-[10px] font-bold text-stone-400 uppercase">{item.category_name}</span>
                      </div>
                      <h4 className="text-sm font-bold text-stone-900 dark:text-white mt-1">{item.name}</h4>
                    </div>
                    <span className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                      ₹{item.price_inr}
                    </span>
                  </div>

                  {item.description && (
                    <p className="mt-2 text-xs text-stone-500 line-clamp-2">{item.description}</p>
                  )}

                  {/* Tax Treatment Tag */}
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold text-stone-600 dark:text-stone-300">
                    <span className="bg-stone-100 dark:bg-neutral-800 px-2 py-0.5 rounded-md">
                      SAC: {item.hsn_sac_code || '996331'}
                    </span>
                    <span className="bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800">
                      GST: {item.tax_rate_percent !== undefined ? `${item.tax_rate_percent}%` : '5%'}
                    </span>
                    <span className="bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 px-2 py-0.5 rounded-md">
                      {item.is_tax_inclusive !== false ? 'Tax Inclusive' : 'Tax Extra'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-stone-100 dark:border-neutral-800 flex justify-between items-center text-xs">
                  <span className="text-stone-400 text-[11px]">
                    {item.prep_time_minutes ? `${item.prep_time_minutes} min prep` : 'Fresh prepared'}
                  </span>
                  <button
                    onClick={() => handleToggleAvailability(item)}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                      item.is_available
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        : 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {item.is_available ? 'Available' : 'Sold Out (86)'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* KOT SLIP VIEW MODAL */}
      {viewingKotOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4">
            <div className="text-center border-b border-dashed border-stone-300 dark:border-neutral-700 pb-3">
              <span className="text-xs uppercase font-extrabold text-stone-400 tracking-wider">Kitchen Order Ticket</span>
              <h3 className="text-xl font-black text-stone-900 dark:text-white mt-0.5">
                {viewingKotOrder.kot_number || 'KOT'}
              </h3>
              <p className="text-xs text-stone-500 font-mono">Order: #{viewingKotOrder.order_number}</p>
              <p className="text-[11px] text-stone-400 mt-1">
                {new Date(viewingKotOrder.created_at).toLocaleString()}
              </p>
            </div>

            <div className="text-xs space-y-1">
              <div className="flex justify-between font-bold text-stone-700 dark:text-stone-300">
                <span>Guest: {viewingKotOrder.guest_name}</span>
                <span>
                  {viewingKotOrder.service_type === 'room_delivery'
                    ? `Room: ${viewingKotOrder.guest_room || 'N/A'}`
                    : viewingKotOrder.service_type === 'dining'
                    ? 'Dining Table'
                    : 'Takeaway'}
                </span>
              </div>
            </div>

            <div className="border-t border-b border-dashed border-stone-300 dark:border-neutral-700 py-3 space-y-2">
              {viewingKotOrder.items.map((i, idx) => (
                <div key={idx} className="text-xs">
                  <div className="flex justify-between font-bold text-stone-900 dark:text-white">
                    <span>{i.name}</span>
                    <span className="font-mono">x{i.quantity}</span>
                  </div>
                  {(i.preparation_notes || i.special_notes) && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold pl-2">
                      ⚠️ Note: {i.preparation_notes || i.special_notes}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {viewingKotOrder.notes && (
              <p className="text-[11px] text-stone-500 italic bg-stone-50 dark:bg-neutral-800 p-2 rounded">
                Special Instructions: {viewingKotOrder.notes}
              </p>
            )}

            <div className="pt-2 flex justify-between gap-2">
              <button
                type="button"
                onClick={() => setViewingKotOrder(null)}
                className="w-full py-2 rounded-xl font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300 text-xs"
              >
                Close Slip
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                🖨️ Print Ticket
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCELLATION & FOLIO REVERSAL MODAL */}
      {cancellingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4">
            <h3 className="text-base font-black text-rose-600 dark:text-rose-400">
              Cancel Order #{cancellingOrder.order_number}
            </h3>
            <p className="text-xs text-stone-500">
              Please enter the operational reason for cancelling this order.
              {cancellingOrder.charged_to_folio && (
                <span className="block mt-1 font-bold text-amber-600 dark:text-amber-400">
                  ⚠️ This order is charged to the guest room folio (₹{cancellingOrder.total_inr}). Cancelling will automatically post an authorized credit reversal of -₹{cancellingOrder.total_inr} to maintain zero billing discrepancies.
                </span>
              )}
            </p>

            <form onSubmit={handleConfirmCancelOrder} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-600 dark:text-stone-400 mb-1">
                  Cancellation Reason (Mandatory)
                </label>
                <input
                  type="text"
                  required
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  placeholder="e.g. Guest cancelled order / Kitchen out of stock / Entered by mistake"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isCancelling}
                  onClick={() => setCancellingOrder(null)}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300"
                >
                  Keep Order
                </button>
                <button
                  type="submit"
                  disabled={isCancelling}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white disabled:opacity-50"
                >
                  {isCancelling ? 'Processing...' : 'Confirm Cancellation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POST TO FOLIO MODAL */}
      {folioTargetOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4">
            <h3 className="text-base font-black text-stone-900 dark:text-white">
              Charge Order #{folioTargetOrder.order_number} to Room Folio
            </h3>
            <p className="text-xs text-stone-500">
              Amount to charge: <strong className="text-emerald-600">₹{folioTargetOrder.total_inr.toLocaleString()}</strong>.
              This operation is protected by idempotent checks so it will never post a duplicate entry.
            </p>

            <div className="space-y-2 text-xs">
              <label className="block font-bold text-stone-600 dark:text-stone-400">
                Select Active In-House Guest Booking
              </label>
              <select
                value={selectedBookingId}
                onChange={(e) => setSelectedBookingId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
              >
                <option value="">-- Choose In-House Booking --</option>
                {activeBookings.map((b) => {
                  const rm = rooms.find((r) => r.id === b.room_id);
                  return (
                    <option key={b.id} value={b.id}>
                      {b.guest_name} ({rm?.room_number || rm?.name || 'Assigned Room'}) - Stay: {b.check_in_date}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                disabled={isPostingFolio}
                onClick={() => setFolioTargetOrder(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isPostingFolio || !selectedBookingId}
                onClick={handleConfirmPostToFolio}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
              >
                {isPostingFolio ? 'Posting...' : 'Post to Room Folio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADD MENU ITEM MODAL */}
      {showAddItemModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-black text-stone-900 dark:text-white">Add New Restaurant Item</h3>
            <form onSubmit={handleCreateMenuItem} className="space-y-3 text-xs">
              <div>
                <label className="block text-stone-500 font-semibold mb-1">Item Name</label>
                <input
                  type="text"
                  required
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  placeholder="e.g. Surmai Tawa Fry"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-stone-500 font-semibold mb-1">Category</label>
                <select
                  value={newItemCategory}
                  onChange={(e) => setNewItemCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                >
                  {initialCategories.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Price (₹)</label>
                  <input
                    type="number"
                    required
                    min="10"
                    value={newItemPrice}
                    onChange={(e) => setNewItemPrice(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Dietary Preference</label>
                  <select
                    value={newItemDietary}
                    onChange={(e) => setNewItemDietary(e.target.value as 'veg' | 'jain' | 'nonveg')}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  >
                    <option value="veg">🌱 Pure Vegetarian</option>
                    <option value="jain">🕊️ Jain (No Onion/Garlic/Root Veg)</option>
                    <option value="nonveg">🍗 Non-Vegetarian</option>
                  </select>
                </div>
              </div>

              {/* Tax Settings */}
              <div className="p-3 bg-stone-50 dark:bg-neutral-800/40 border border-stone-200 dark:border-neutral-800 rounded-xl space-y-3">
                <span className="block font-bold text-stone-700 dark:text-stone-300">
                  GST Tax Treatment (Configurable)
                </span>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="block text-stone-400 font-semibold mb-1">SAC / HSN</label>
                    <input
                      type="text"
                      value={newItemSac}
                      onChange={(e) => setNewItemSac(e.target.value)}
                      placeholder="996331"
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-stone-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-stone-400 font-semibold mb-1">GST Rate (%)</label>
                    <select
                      value={newItemTaxRate}
                      onChange={(e) => setNewItemTaxRate(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-stone-900 dark:text-white"
                    >
                      <option value="5">5% (Standard F&B)</option>
                      <option value="18">18% (Luxury / Tariff &gt;= ₹7.5k)</option>
                      <option value="12">12% (Catering / Packaged)</option>
                      <option value="0">0% (Fresh / Exempt Produce)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-stone-400 font-semibold mb-1">Inclusivity</label>
                    <select
                      value={newItemTaxInclusive ? 'inclusive' : 'exclusive'}
                      onChange={(e) => setNewItemTaxInclusive(e.target.value === 'inclusive')}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 text-stone-900 dark:text-white"
                    >
                      <option value="inclusive">GST Included</option>
                      <option value="exclusive">GST Extra</option>
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-stone-500 font-semibold mb-1">Description</label>
                <textarea
                  rows={2}
                  value={newItemDesc}
                  onChange={(e) => setNewItemDesc(e.target.value)}
                  placeholder="Brief description of flavors, ingredients..."
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddItemModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POS / NEW KITCHEN ORDER MODAL */}
      {showNewOrderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-black text-stone-900 dark:text-white">
              Create New Kitchen Order (POS / Room Dining)
            </h3>

            <form onSubmit={handleCreateNewOrderSubmit} className="space-y-4 text-xs">
              {/* Service & Guest Details */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Service Type</label>
                  <select
                    value={newOrderServiceType}
                    onChange={(e) => setNewOrderServiceType(e.target.value as RestaurantServiceType)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  >
                    <option value="room_delivery">🛏️ Room Delivery</option>
                    <option value="dining">🍽️ Restaurant Dining</option>
                    <option value="takeaway">🥡 Takeaway</option>
                  </select>
                </div>
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">In-House Guest (Optional)</label>
                  <select
                    value={newOrderBookingId}
                    onChange={(e) => handleSelectBookingForNewOrder(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  >
                    <option value="">-- Non-Resident / Walk-in --</option>
                    {activeBookings.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.guest_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Guest Name *</label>
                  <input
                    type="text"
                    required
                    value={newOrderGuestName}
                    onChange={(e) => setNewOrderGuestName(e.target.value)}
                    placeholder="e.g. Rajesh Desai"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Room / Table #</label>
                  <input
                    type="text"
                    value={newOrderRoom}
                    onChange={(e) => setNewOrderRoom(e.target.value)}
                    placeholder="e.g. Villa 101 or Table 4"
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Payment Method</label>
                  <select
                    value={newOrderPaymentMethod}
                    onChange={(e) => setNewOrderPaymentMethod(e.target.value as RestaurantPaymentMethod)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  >
                    <option value="room_folio">Room Folio (Charge to Stay)</option>
                    <option value="pay_at_restaurant">Cash / UPI at Counter</option>
                    <option value="online_razorpay">Razorpay Online</option>
                  </select>
                </div>
              </div>

              {/* Menu Item Selector */}
              <div className="border border-stone-200 dark:border-neutral-800 rounded-xl p-3 space-y-2">
                <span className="block font-bold text-stone-700 dark:text-stone-300">Select Items & Preparation Notes</span>
                <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                  {items.map((it) => {
                    const cartEntry = newOrderCart[it.id] || { quantity: 0, notes: '' };
                    return (
                      <div
                        key={it.id}
                        className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 p-2 rounded-lg bg-stone-50 dark:bg-neutral-800/40 text-xs"
                      >
                        <div className="flex-1">
                          <span className="font-bold text-stone-900 dark:text-white">{it.name}</span>
                          <span className="ml-2 font-mono text-emerald-600">₹{it.price_inr}</span>
                          {it.is_jain ? (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300">
                              🕊️ Jain
                            </span>
                          ) : it.is_veg ? (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300">
                              🌱 Veg
                            </span>
                          ) : (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300">
                              🍗 Non-Veg
                            </span>
                          )}
                          {!it.is_available && (
                            <span className="ml-2 text-[10px] text-rose-500 font-bold uppercase">(86&apos;d Out of Stock)</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <input
                            type="text"
                            placeholder="Prep note (e.g. less spicy)"
                            value={cartEntry.notes}
                            onChange={(e) =>
                              setNewOrderCart((prev) => ({
                                ...prev,
                                [it.id]: {
                                  quantity: prev[it.id]?.quantity || 1,
                                  notes: e.target.value,
                                },
                              }))
                            }
                            className="flex-1 sm:w-40 px-2 py-1 text-[11px] rounded border border-stone-200 dark:border-neutral-700 bg-white dark:bg-neutral-900"
                          />
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                const current = cartEntry.quantity;
                                if (current > 0) {
                                  setNewOrderCart((prev) => ({
                                    ...prev,
                                    [it.id]: { ...cartEntry, quantity: current - 1 },
                                  }));
                                }
                              }}
                              className="w-6 h-6 rounded bg-stone-200 dark:bg-neutral-700 font-bold"
                            >
                              -
                            </button>
                            <span className="w-5 text-center font-bold">{cartEntry.quantity}</span>
                            <button
                              type="button"
                              onClick={() => {
                                setNewOrderCart((prev) => ({
                                  ...prev,
                                  [it.id]: { ...cartEntry, quantity: cartEntry.quantity + 1 },
                                }));
                              }}
                              className="w-6 h-6 rounded bg-emerald-600 text-white font-bold"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Discounts & Service Charge */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Discount (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={newOrderDiscountPercent}
                    onChange={(e) => setNewOrderDiscountPercent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Service Charge (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={newOrderServiceChargePercent}
                    onChange={(e) => setNewOrderServiceChargePercent(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-stone-500 font-semibold mb-1">General Notes / Allergies</label>
                <input
                  type="text"
                  value={newOrderNotes}
                  onChange={(e) => setNewOrderNotes(e.target.value)}
                  placeholder="e.g. Guest allergic to peanuts, serve with extra cutlery"
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSubmittingOrder}
                  onClick={() => setShowNewOrderModal(false)}
                  className="px-4 py-2 rounded-xl font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingOrder}
                  className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50"
                >
                  {isSubmittingOrder ? 'Submitting to Kitchen...' : 'Fire Kitchen Order Ticket (KOT)'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* BULK IMPORT MENU MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start border-b border-stone-200 dark:border-neutral-800 pb-3">
              <div>
                <h3 className="text-base font-black text-stone-900 dark:text-white">
                  Bulk Import Menu (Spreadsheet / CSV)
                </h3>
                <p className="text-xs text-stone-500">
                  Upload an Excel/CSV file with your full restaurant catalog including prices, categories, and Jain dietary flags.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setParsedImportItems([]);
                  setCsvRawText('');
                }}
                className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 text-sm font-bold p-1"
              >
                ✕
              </button>
            </div>

            {/* Template Download Pill */}
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
              <div className="text-xs text-amber-900 dark:text-amber-200">
                <p className="font-bold">Need the spreadsheet template format?</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Includes required columns: Item Name, Category, Price, Dietary (Veg/Non-Veg/Jain), HSN/SAC, Tax Rate.
                </p>
              </div>
              <button
                type="button"
                onClick={downloadSampleCsv}
                className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white transition shadow-2xs whitespace-nowrap"
              >
                📥 Download Template CSV
              </button>
            </div>

            {/* File Upload Zone */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  1. Select CSV / Spreadsheet File
                </label>
                <input
                  type="file"
                  accept=".csv, text/csv"
                  onChange={handleCsvFileUpload}
                  className="block w-full text-xs text-stone-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950/50 dark:file:text-emerald-300"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700 dark:text-stone-300 mb-1">
                  2. Or Paste Raw CSV Content Below
                </label>
                <textarea
                  rows={4}
                  value={csvRawText}
                  onChange={(e) => {
                    const txt = e.target.value;
                    setCsvRawText(txt);
                    const rows = parseCsvLines(txt);
                    setParsedImportItems(rows);
                  }}
                  placeholder='"Item Name","Category","Price (INR)","Dietary (Veg/Non-Veg/Jain)"...'
                  className="w-full px-3 py-2 text-xs font-mono rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
              </div>
            </div>

            {/* Preview Section */}
            {parsedImportItems.length > 0 && (
              <div className="border border-stone-200 dark:border-neutral-800 rounded-xl p-3 space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-emerald-600 dark:text-emerald-400">
                    ✓ Ready to Import {parsedImportItems.length} Dishes
                  </span>
                  <span className="text-[11px] text-stone-400">
                    Previewing first 5 rows:
                  </span>
                </div>
                <div className="max-h-40 overflow-y-auto border rounded-lg border-stone-100 dark:border-neutral-800 text-[11px]">
                  <table className="w-full text-left">
                    <thead className="bg-stone-50 dark:bg-neutral-800 text-stone-500">
                      <tr>
                        <th className="p-2">Name</th>
                        <th className="p-2">Category</th>
                        <th className="p-2">Price</th>
                        <th className="p-2">Dietary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100 dark:divide-neutral-800">
                      {parsedImportItems.slice(0, 5).map((row, idx) => (
                        <tr key={idx}>
                          <td className="p-2 font-bold text-stone-900 dark:text-white">{row.name}</td>
                          <td className="p-2 text-stone-500">{row.category}</td>
                          <td className="p-2 font-mono text-emerald-600">₹{row.price}</td>
                          <td className="p-2">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                                (row.dietary || '').toLowerCase().includes('jain')
                                  ? 'bg-amber-100 text-amber-800'
                                  : (row.dietary || '').toLowerCase().includes('veg') && !(row.dietary || '').toLowerCase().includes('non')
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {row.dietary || 'Veg'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Modal Actions */}
            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowImportModal(false);
                  setParsedImportItems([]);
                  setCsvRawText('');
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isImporting || parsedImportItems.length === 0}
                onClick={handleConfirmBulkImport}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-50 shadow-sm"
              >
                {isImporting ? 'Importing Dishes...' : `Confirm & Import ${parsedImportItems.length} Dishes`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
