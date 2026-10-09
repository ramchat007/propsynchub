'use client';

import React, { useState, useTransition } from 'react';
import { Room, RoomCategory, Pricing, Tenant, RoomBlock, SeasonalPricingRule } from '@/types';
import {
  addRoomCategory,
  editRoomCategory,
  deleteRoomCategory,
  addRoom,
  editRoomUnit,
  deleteRoomUnit,
  updateRoomStatus,
  updateRoomPricing,
  initializeDemoResort,
  createRoomBlock,
  resolveRoomBlock,
  addSeasonalPricingRule,
  deleteSeasonalPricingRule,
} from '@/app/actions/inventory';
import { ToastContainer, ToastMessage } from './Toast';

interface InventoryDashboardClientProps {
  tenant: Tenant | null;
  initialCategories: RoomCategory[];
  initialRooms: Room[];
  initialPricing: Pricing[];
  initialRoomBlocks?: RoomBlock[];
  initialSeasonalRules?: SeasonalPricingRule[];
  userRole?: string;
}

export default function InventoryDashboardClient({
  tenant,
  initialCategories,
  initialRooms,
  initialPricing,
  initialRoomBlocks = [],
  initialSeasonalRules = [],
}: InventoryDashboardClientProps) {
  // Main Tab Navigation
  const [activeTab, setActiveTab] = useState<'inventory' | 'maintenance' | 'pricing'>('inventory');

  // Navigation & Filter state
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Phase 2 Room Blocks & Seasonal Rules state
  const [roomBlocksList, setRoomBlocksList] = useState<RoomBlock[]>(initialRoomBlocks);
  const [seasonalRulesList, setSeasonalRulesList] = useState<SeasonalPricingRule[]>(initialSeasonalRules);

  // Modals state
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isBlockModalOpen, setIsBlockModalOpen] = useState(false);
  const [isPricingModalOpen, setIsPricingModalOpen] = useState(false);
  const [blockRoomId, setBlockRoomId] = useState<string>('');
  const [preselectedCategory, setPreselectedCategory] = useState<string>('');
  const [editingCategory, setEditingCategory] = useState<RoomCategory | null>(null);
  const [editingRoomUnit, setEditingRoomUnit] = useState<Room | null>(null);

  // Edit Pricing Modal state
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editBasePrice, setEditBasePrice] = useState<string>('');
  const [editExtraPaxPrice, setEditExtraPaxPrice] = useState<string>('');

  // Transitions for Server Actions
  const [isPending, startTransition] = useTransition();
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);

  // Toast notifications
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function removeToast(id: string) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Active tenant ID fallback
  const tenantId = tenant?.id || '';

  // Stats calculations
  const totalRooms = initialRooms.length;
  const availableRooms = initialRooms.filter((r) => r.status === 'available').length;
  const maintenanceRooms = initialRooms.filter((r) => r.status === 'maintenance').length;
  const blockedRooms = initialRooms.filter((r) => r.status === 'blocked').length;

  // Filtered rooms
  const filteredRooms = initialRooms.filter((room) => {
    const matchesStatus =
      selectedStatusFilter === 'all' ? true : room.status === selectedStatusFilter;
    const matchesSearch =
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (room.room_number && room.room_number.toLowerCase().includes(searchQuery.toLowerCase())) ||
      room.room_type.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Group rooms by category/type
  const categoriesMap: { [key: string]: { category?: RoomCategory; rooms: Room[] } } = {};

  // Register known categories
  initialCategories.forEach((cat) => {
    categoriesMap[cat.name] = { category: cat, rooms: [] };
  });

  // Distribute rooms into categories
  filteredRooms.forEach((room) => {
    const groupKey = room.room_type || 'Standard';
    if (!categoriesMap[groupKey]) {
      categoriesMap[groupKey] = { rooms: [] };
    }
    categoriesMap[groupKey].rooms.push(room);
  });

  // Handle Quick Room Status Toggle
  function handleStatusChange(room: Room, newStatus: 'available' | 'maintenance' | 'blocked') {
    if (room.status === newStatus) return;

    setPendingActionId(`status-${room.id}`);
    startTransition(async () => {
      const res = await updateRoomStatus(room.id, room.tenant_id, newStatus);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', `${room.name} marked as ${newStatus}`);
      } else {
        addToast('error', res.error || 'Failed to update room status');
      }
    });
  }

  // Handle Add Category Submission
  function handleCreateCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);

    setPendingActionId('add-category');
    startTransition(async () => {
      const res = await addRoomCategory(formData);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Room category added.');
        setIsCategoryModalOpen(false);
      } else {
        addToast('error', res.error || 'Failed to add room category.');
      }
    });
  }

  // Handle Add Room Submission
  function handleCreateRoom(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);

    setPendingActionId('add-room');
    startTransition(async () => {
      const res = await addRoom(formData);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Room created.');
        setIsRoomModalOpen(false);
      } else {
        addToast('error', res.error || 'Failed to add room.');
      }
    });
  }

  // Handle Edit Category Submission
  function handleUpdateCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingCategory) return;
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);
    formData.set('categoryId', editingCategory.id);

    setPendingActionId('edit-category');
    startTransition(async () => {
      const res = await editRoomCategory(formData);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Category updated successfully.');
        setEditingCategory(null);
      } else {
        addToast('error', res.error || 'Failed to update category.');
      }
    });
  }

  // Handle Delete Category
  function handleDeleteCategory(cat: RoomCategory) {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    setPendingActionId(`del-cat-${cat.id}`);
    startTransition(async () => {
      const res = await deleteRoomCategory(cat.id, tenantId);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Category removed.');
      } else {
        addToast('error', res.error || 'Failed to delete category.');
      }
    });
  }

  // Handle Edit Room Unit Submission
  function handleUpdateRoomUnit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingRoomUnit) return;
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);
    formData.set('roomId', editingRoomUnit.id);

    setPendingActionId('edit-unit');
    startTransition(async () => {
      const res = await editRoomUnit(formData);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Room unit updated.');
        setEditingRoomUnit(null);
      } else {
        addToast('error', res.error || 'Failed to edit room unit.');
      }
    });
  }

  // Handle Delete Room Unit
  function handleDeleteRoomUnit(room: Room) {
    if (!confirm(`Are you sure you want to delete room unit "${room.name}"?`)) return;

    setPendingActionId(`del-room-${room.id}`);
    startTransition(async () => {
      const res = await deleteRoomUnit(room.id, tenantId);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Room unit deleted.');
      } else {
        addToast('error', res.error || 'Failed to delete room unit.');
      }
    });
  }

  // Handle Update Pricing Submission
  function handleSavePricing(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editingRoom) return;

    const base = parseFloat(editBasePrice);
    const extraPax = editExtraPaxPrice ? parseFloat(editExtraPaxPrice) : undefined;

    setPendingActionId(`pricing-${editingRoom.id}`);
    startTransition(async () => {
      const res = await updateRoomPricing(
        editingRoom.id,
        editingRoom.tenant_id,
        base,
        extraPax
      );
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Pricing updated.');
        setEditingRoom(null);
      } else {
        addToast('error', res.error || 'Failed to update pricing.');
      }
    });
  }

  // Handle Seeding Starter Demo Resort if empty
  function handleSeedDemo() {
    setPendingActionId('seed-demo');
    startTransition(async () => {
      const res = await initializeDemoResort();
      setPendingActionId(null);
      if (res.success) {
        addToast('success', 'Demo resort inventory generated successfully!');
      } else {
        addToast('error', res.error || 'Failed to initialize demo resort.');
      }
    });
  }

  // Handle Create Room Block Submission
  function handleCreateBlock(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);

    setPendingActionId('create-block');
    startTransition(async () => {
      const res = await createRoomBlock(formData);
      setPendingActionId(null);
      if (res.success && res.data) {
        addToast('success', res.message || 'Room maintenance block scheduled.');
        setRoomBlocksList((prev) => [res.data as RoomBlock, ...prev.filter((b) => b.id !== (res.data as RoomBlock).id)]);
        setIsBlockModalOpen(false);
      } else {
        addToast('error', res.error || 'Failed to schedule room block.');
      }
    });
  }

  // Handle Resolve Room Block
  function handleResolveBlock(block: RoomBlock) {
    if (!confirm(`Resolve maintenance block on "${block.room_name || 'Room'}" and restore unit to available inventory?`)) return;

    setPendingActionId(`resolve-${block.id}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', tenantId);
      formData.set('blockId', block.id);

      const res = await resolveRoomBlock(formData);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Room block resolved and unit restored.');
        setRoomBlocksList((prev) =>
          prev.map((b) => (b.id === block.id ? { ...b, status: 'completed' as const } : b))
        );
      } else {
        addToast('error', res.error || 'Failed to resolve room block.');
      }
    });
  }

  // Handle Create Seasonal Pricing Rule Submission
  function handleCreatePricingRule(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    formData.set('tenantId', tenantId);

    setPendingActionId('create-rule');
    startTransition(async () => {
      const res = await addSeasonalPricingRule(formData);
      setPendingActionId(null);
      if (res.success && res.data) {
        addToast('success', res.message || 'Pricing rule created.');
        setSeasonalRulesList((prev) => [res.data as SeasonalPricingRule, ...prev.filter((r) => r.id !== (res.data as SeasonalPricingRule).id)]);
        setIsPricingModalOpen(false);
      } else {
        addToast('error', res.error || 'Failed to create pricing rule.');
      }
    });
  }

  // Handle Delete Seasonal Pricing Rule
  function handleDeletePricingRule(rule: SeasonalPricingRule) {
    if (!confirm(`Remove pricing rule "${rule.title}"?`)) return;

    setPendingActionId(`del-rule-${rule.id}`);
    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', tenantId);
      formData.set('ruleId', rule.id);

      const res = await deleteSeasonalPricingRule(formData);
      setPendingActionId(null);
      if (res.success) {
        addToast('success', res.message || 'Pricing rule removed.');
        setSeasonalRulesList((prev) => prev.filter((r) => r.id !== rule.id));
      } else {
        addToast('error', res.error || 'Failed to remove pricing rule.');
      }
    });
  }

  return (
    <div className="space-y-8">
      {/* Toast Notification Container */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />

      {/* Top Header & Property Details */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
              {tenant?.name || 'Resort Inventory & Rooms'}
            </h1>
          </div>
          <div className="mt-1.5 flex items-center gap-2 text-xs text-neutral-500">
            {tenant?.custom_domain ? (
              <a
                href={`https://${tenant.custom_domain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
              >
                <span>🌐 {tenant.custom_domain}</span>
                <span>↗</span>
              </a>
            ) : tenant?.subdomain ? (
              <a
                href={`/${tenant.subdomain}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-neutral-500 hover:text-emerald-600 hover:underline dark:hover:text-emerald-400"
              >
                <span>🌐 {tenant.subdomain}.propsynchub.com</span>
                <span>↗</span>
              </a>
            ) : (
              <span>Multi-tenant property inventory management</span>
            )}
          </div>
        </div>

        {/* Action Buttons depending on Tab */}
        <div className="flex items-center gap-2.5">
          {activeTab === 'inventory' && (
            <>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(true)}
                className="inline-flex items-center rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-semibold text-neutral-700 shadow-sm transition hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-750"
              >
                + New Category
              </button>
              <button
                type="button"
                onClick={() => {
                  setPreselectedCategory(initialCategories[0]?.name || '');
                  setIsRoomModalOpen(true);
                }}
                className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none"
              >
                + Add Room
              </button>
            </>
          )}

          {activeTab === 'maintenance' && (
            <button
              type="button"
              onClick={() => {
                setBlockRoomId(initialRooms[0]?.id || '');
                setIsBlockModalOpen(true);
              }}
              className="inline-flex items-center rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-amber-500 focus:outline-none"
            >
              + Schedule Block
            </button>
          )}

          {activeTab === 'pricing' && (
            <button
              type="button"
              onClick={() => setIsPricingModalOpen(true)}
              className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none"
            >
              + Add Rate Rule
            </button>
          )}
        </div>
      </div>

      {/* Main Feature Tabs */}
      <div className="flex border-b border-neutral-200 dark:border-neutral-800">
        <button
          onClick={() => setActiveTab('inventory')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'inventory'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <span>🏨 Rooms & Inventory</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {totalRooms}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('maintenance')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'maintenance'
              ? 'border-amber-600 text-amber-600 dark:border-amber-400 dark:text-amber-400'
              : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <span>🛠️ Maintenance & Out-of-Order</span>
          <span className={`rounded-full px-2 py-0.5 text-xs ${
            roomBlocksList.filter((b) => b.status === 'active').length > 0
              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
              : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
          }`}>
            {roomBlocksList.filter((b) => b.status === 'active').length}
          </span>
        </button>
        <button
          onClick={() => setActiveTab('pricing')}
          className={`flex items-center gap-2 border-b-2 px-5 py-3 text-xs sm:text-sm font-semibold transition ${
            activeTab === 'pricing'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-neutral-500 hover:border-neutral-300 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
          }`}
        >
          <span>📈 Seasonal Pricing Matrix</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {seasonalRulesList.length}
          </span>
        </button>
      </div>

      {/* TAB 1: ROOMS & INVENTORY VIEW */}
      {activeTab === 'inventory' && (
        <>
          {/* Metrics Summary Cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-xs font-medium text-neutral-500">Total Rooms</p>
          <p className="mt-2 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            {totalRooms}
          </p>
          <p className="mt-1 text-xs text-neutral-400">
            {Object.keys(categoriesMap).length} Categories · {initialPricing.length} Rate Rules
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-5 shadow-xs dark:border-emerald-950 dark:bg-emerald-950/20">
          <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">Available</p>
          <p className="mt-2 text-3xl font-extrabold text-emerald-700 dark:text-emerald-300">
            {availableRooms}
          </p>
          <p className="mt-1 text-xs text-emerald-600/70">Ready for guest check-in</p>
        </div>

        <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5 shadow-xs dark:border-amber-950 dark:bg-amber-950/20">
          <p className="text-xs font-semibold text-amber-800 dark:text-amber-400">Maintenance</p>
          <p className="mt-2 text-3xl font-extrabold text-amber-700 dark:text-amber-300">
            {maintenanceRooms}
          </p>
          <p className="mt-1 text-xs text-amber-600/70">Housekeeping or repairs</p>
        </div>

        <div className="rounded-2xl border border-rose-100 bg-rose-50/40 p-5 shadow-xs dark:border-rose-950 dark:bg-rose-950/20">
          <p className="text-xs font-semibold text-rose-800 dark:text-rose-400">Blocked</p>
          <p className="mt-2 text-3xl font-extrabold text-rose-700 dark:text-rose-300">
            {blockedRooms}
          </p>
          <p className="mt-1 text-xs text-rose-600/70">Off-market / reserved</p>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search room name, number, or category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-xs text-neutral-900 placeholder-neutral-400 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {['all', 'available', 'maintenance', 'blocked'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatusFilter(status)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                selectedStatusFilter === status
                  ? 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Empty State Handler */}
      {totalRooms === 0 && (
        <div className="rounded-2xl border-2 border-dashed border-neutral-200 p-12 text-center dark:border-neutral-800">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
          </div>
          <h3 className="mt-4 text-base font-semibold text-neutral-900 dark:text-neutral-100">
            No rooms in inventory yet
          </h3>
          <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
            Get started by adding your first room category and units, or initialize starter demo rooms.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              type="button"
              onClick={handleSeedDemo}
              disabled={isPending && pendingActionId === 'seed-demo'}
              className="inline-flex items-center rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-semibold text-white shadow-xs hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 disabled:opacity-50"
            >
              {isPending && pendingActionId === 'seed-demo' ? 'Generating...' : 'Seed Sample Inventory'}
            </button>
            <button
              type="button"
              onClick={() => setIsCategoryModalOpen(true)}
              className="inline-flex items-center rounded-xl border border-neutral-300 bg-white px-4 py-2.5 text-xs font-semibold text-neutral-700 shadow-xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              + Create Category
            </button>
          </div>
        </div>
      )}

      {/* Inventory Grouped by Category */}
      {Object.entries(categoriesMap).map(([categoryName, group]) => {
        const catInfo = group.category;
        const roomsInGroup = group.rooms;

        return (
          <div
            key={categoryName}
            className="overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
          >
            {/* Category Header */}
            <div className="flex flex-col gap-2 border-b border-neutral-200 bg-neutral-50/60 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800 dark:bg-neutral-850/40">
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600/10 font-bold text-xs text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
                  {categoryName.charAt(0)}
                </span>
                <div>
                  <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                    {categoryName}
                  </h2>
                  <p className="text-[11px] text-neutral-500">
                    {catInfo?.description || `${roomsInGroup.length} room units registered`}
                  </p>
                </div>
              </div>

              {/* Pricing & Capacity Header summary */}
              <div className="flex items-center gap-4 text-xs">
                {catInfo && (
                  <div className="flex items-center gap-3 text-neutral-600 dark:text-neutral-400">
                    <span>
                      Base:{' '}
                      <strong className="text-neutral-900 dark:text-neutral-100">
                        ₹{catInfo.base_price_inr.toLocaleString()}
                      </strong>
                    </span>
                    {catInfo.extra_pax_price_inr > 0 && (
                      <span>
                        Extra Pax:{' '}
                        <strong className="text-neutral-900 dark:text-neutral-100">
                          +₹{catInfo.extra_pax_price_inr.toLocaleString()}
                        </strong>
                      </span>
                    )}
                    <span className="hidden sm:inline-block">
                      Max: {catInfo.max_adults} Adults
                      {catInfo.max_children > 0 ? `, ${catInfo.max_children} Kids` : ''}
                    </span>
                  </div>
                )}
                {catInfo && (
                  <button
                    type="button"
                    onClick={() => setEditingCategory(catInfo)}
                    className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                  >
                    ✏️ Edit Category
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setPreselectedCategory(categoryName);
                    setIsRoomModalOpen(true);
                  }}
                  className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-500 shadow-2xs"
                >
                  + Add Unit
                </button>
                {catInfo && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(catInfo)}
                    title="Delete Category"
                    className="rounded-lg border border-rose-200 px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-950/40"
                  >
                    🗑️
                  </button>
                )}
              </div>
            </div>

            {/* Rooms Table */}
            {roomsInGroup.length === 0 ? (
              <div className="p-6 text-center text-xs text-neutral-400">
                No rooms matching the filter in this category.
              </div>
            ) : (
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800/60">
                {roomsInGroup.map((room) => {
                  const isUpdatingStatus =
                    isPending && pendingActionId === `status-${room.id}`;
                  const isUpdatingPricing =
                    isPending && pendingActionId === `pricing-${room.id}`;

                  return (
                    <div
                      key={room.id}
                      className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between hover:bg-neutral-50/50 dark:hover:bg-neutral-850/30 transition"
                    >
                      {/* Room Identifiers */}
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-100 font-bold text-xs text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                          {room.room_number || '#'}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                            {room.name}
                          </p>
                          <p className="text-xs text-neutral-400">
                            Capacity: {room.capacity_adults} Adults
                            {room.capacity_children > 0
                              ? `, ${room.capacity_children} Children`
                              : ''}
                          </p>
                        </div>
                      </div>

                      {/* Pricing and Status Controls */}
                      <div className="flex flex-wrap items-center gap-3 sm:gap-6">
                        {/* Current Pricing */}
                        <div className="text-right">
                          <p className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
                            ₹{room.base_price_inr.toLocaleString()}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingRoom(room);
                              setEditBasePrice(room.base_price_inr.toString());
                              setEditExtraPaxPrice(
                                catInfo?.extra_pax_price_inr?.toString() || '1000'
                              );
                            }}
                            disabled={isUpdatingPricing}
                            className="text-[11px] font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                          >
                            {isUpdatingPricing ? 'Saving...' : 'Edit Price'}
                          </button>
                        </div>

                        {/* Status Toggle Switcher */}
                        <div className="flex items-center gap-1.5">
                          {(['available', 'maintenance', 'blocked'] as const).map(
                            (statusVal) => {
                              const isActive = room.status === statusVal;
                              return (
                                <button
                                  key={statusVal}
                                  type="button"
                                  onClick={() => handleStatusChange(room, statusVal)}
                                  disabled={isUpdatingStatus}
                                  className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                                    isActive
                                      ? statusVal === 'available'
                                        ? 'bg-emerald-600 text-white'
                                        : statusVal === 'maintenance'
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-rose-600 text-white'
                                      : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
                                  } disabled:opacity-50`}
                                >
                                  {isUpdatingStatus && isActive ? '...' : statusVal}
                                </button>
                              );
                            }
                          )}
                        </div>

                        {/* Room Unit Actions */}
                        <div className="flex items-center gap-1.5 border-l border-neutral-200 pl-3 dark:border-neutral-800">
                          <button
                            type="button"
                            onClick={() => setEditingRoomUnit(room)}
                            className="rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                          >
                            ✏️ Edit Unit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteRoomUnit(room)}
                            title="Delete Room Unit"
                            className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-950/40"
                          >
                            🗑️
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
        </>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: MAINTENANCE & OUT-OF-ORDER DESK */}
      {/* ===================================================================== */}
      {activeTab === 'maintenance' && (
        <div className="space-y-6">
          {/* Banner explaining non-negotiable invariant */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex items-start gap-3">
              <div className="text-xl">🛡️</div>
              <div>
                <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
                  Maintenance & Out-of-Order Collision Protection
                </h4>
                <p className="mt-1 text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
                  Units placed under maintenance or out-of-order blocks are automatically excluded from direct booking and online availability.
                  PropSyncHub checks for active guest reservations prior to confirming any block — scheduling a block over an existing reservation is strictly rejected.
                </p>
              </div>
            </div>
          </div>

          {/* Maintenance Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium text-neutral-500">Active Blocks</p>
              <p className="mt-2 text-3xl font-extrabold text-amber-600 dark:text-amber-400">
                {roomBlocksList.filter((b) => b.status === 'active').length}
              </p>
              <p className="mt-1 text-xs text-neutral-400">Currently reducing sellable inventory</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium text-neutral-500">Total Recorded Blocks</p>
              <p className="mt-2 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
                {roomBlocksList.length}
              </p>
              <p className="mt-1 text-xs text-neutral-400">Includes resolved maintenance events</p>
            </div>
            <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-xs font-medium text-neutral-500">Units in Ready State</p>
              <p className="mt-2 text-3xl font-extrabold text-emerald-600 dark:text-emerald-400">
                {availableRooms}
              </p>
              <p className="mt-1 text-xs text-neutral-400">Ready for guest arrival</p>
            </div>
          </div>

          {/* Active Blocks Section */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Active Maintenance & Out-of-Order Blocks
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Active blocks currently affecting room availability
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setBlockRoomId(initialRooms[0]?.id || '');
                  setIsBlockModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-500"
              >
                <span>+</span>
                <span>Schedule Block</span>
              </button>
            </div>

            {roomBlocksList.filter((b) => b.status === 'active').length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
                  ✓
                </div>
                <h4 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  No Active Maintenance Blocks
                </h4>
                <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
                  All rooms are currently in service or available for guest reservation.
                </p>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
                {roomBlocksList
                  .filter((b) => b.status === 'active')
                  .map((block) => (
                    <div
                      key={block.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                            {block.room_name || `Unit ${block.room_number || block.room_id}`}
                          </span>
                          <span className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 capitalize dark:bg-amber-900/40 dark:text-amber-300">
                            {block.block_type.replace('_', ' ')}
                          </span>
                          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                            Off Market
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                          <span>
                            📅 {block.start_date} → {block.end_date}
                          </span>
                          <span>·</span>
                          <span>
                            Reason:{' '}
                            <strong className="text-neutral-700 dark:text-neutral-300">
                              {block.reason}
                            </strong>
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleResolveBlock(block)}
                          disabled={isPending && pendingActionId === `resolve-${block.id}`}
                          className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400 disabled:opacity-50"
                        >
                          {isPending && pendingActionId === `resolve-${block.id}`
                            ? 'Restoring...'
                            : 'Resolve & Restore Unit'}
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Resolved History Section */}
          {roomBlocksList.some((b) => b.status !== 'active') && (
            <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-400 mb-3">
                Completed Maintenance History
              </h4>
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {roomBlocksList
                  .filter((b) => b.status !== 'active')
                  .slice(0, 5)
                  .map((block) => (
                    <div
                      key={block.id}
                      className="py-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-neutral-700 dark:text-neutral-300">
                          {block.room_name || 'Room'}
                        </span>
                        <span className="text-neutral-400 capitalize">
                          ({block.block_type.replace('_', ' ')})
                        </span>
                        <span className="text-neutral-500">
                          · {block.start_date} to {block.end_date}
                        </span>
                      </div>
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                        Resolved
                      </span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: SEASONAL PRICING MATRIX */}
      {/* ===================================================================== */}
      {activeTab === 'pricing' && (
        <div className="space-y-6">
          {/* Precedence Hierarchy Info Card */}
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/50 p-5 dark:border-indigo-900/60 dark:bg-indigo-950/20">
            <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
              Authoritative Rate Precedence Hierarchy
            </h4>
            <p className="mt-1 text-xs text-indigo-800 dark:text-indigo-300 leading-relaxed">
              When calculating nightly guest stay pricing, PropSyncHub evaluates rules in strict order:
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
              <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-2.5 dark:bg-neutral-900/80 dark:border-indigo-800">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">1. Date Override</span>
                <p className="text-[11px] text-neutral-500 mt-0.5">Priority 400 (Diwali, NYE, Holidays)</p>
              </div>
              <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-2.5 dark:bg-neutral-900/80 dark:border-indigo-800">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">2. Seasonal Range</span>
                <p className="text-[11px] text-neutral-500 mt-0.5">Priority 300 (Monsoon, Peak Season)</p>
              </div>
              <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-2.5 dark:bg-neutral-900/80 dark:border-indigo-800">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">3. Weekend Surcharge</span>
                <p className="text-[11px] text-neutral-500 mt-0.5">Priority 200 (Friday & Saturday)</p>
              </div>
              <div className="rounded-xl border border-indigo-200/80 bg-white/80 p-2.5 dark:bg-neutral-900/80 dark:border-indigo-800">
                <span className="font-bold text-indigo-600 dark:text-indigo-400">4. Base Tariff</span>
                <p className="text-[11px] text-neutral-500 mt-0.5">Priority 100 (Default Standard Rate)</p>
              </div>
            </div>
          </div>

          {/* Rules List Section */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Active Dynamic Rate Rules
                </h3>
                <p className="text-xs text-neutral-500 mt-0.5">
                  Rules sorted by priority precedence
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPricingModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500"
              >
                <span>+</span>
                <span>Add Dynamic Rule</span>
              </button>
            </div>

            {seasonalRulesList.length === 0 ? (
              <div className="py-12 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
                  📊
                </div>
                <h4 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  No Dynamic Pricing Rules Configured
                </h4>
                <p className="mt-1 text-xs text-neutral-500 max-w-sm mx-auto">
                  Bookings will be calculated using base category rates and weekend surcharges.
                </p>
                <button
                  type="button"
                  onClick={() => setIsPricingModalOpen(true)}
                  className="mt-4 inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-500"
                >
                  Create First Rate Rule
                </button>
              </div>
            ) : (
              <div className="mt-4 divide-y divide-neutral-100 dark:divide-neutral-800">
                {seasonalRulesList.map((rule) => {
                  const ruleColor =
                    rule.rule_type === 'date_override'
                      ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                      : rule.rule_type === 'seasonal'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                      : rule.rule_type === 'weekend'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                      : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';

                  return (
                    <div
                      key={rule.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-neutral-900 dark:text-neutral-100">
                            {rule.title}
                          </span>
                          <span className={`rounded-md px-2 py-0.5 text-xs font-semibold uppercase ${ruleColor}`}>
                            {rule.rule_type.replace('_', ' ')}
                          </span>
                          <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-mono text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                            Priority {rule.priority}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                          <span>
                            📅 {rule.start_date} → {rule.end_date}
                          </span>
                          <span>·</span>
                          <span>
                            Effect:{' '}
                            {rule.fixed_price_inr ? (
                              <strong className="text-emerald-600 dark:text-emerald-400">
                                Fixed ₹{rule.fixed_price_inr.toLocaleString()}
                              </strong>
                            ) : rule.multiplier ? (
                              <strong className="text-indigo-600 dark:text-indigo-400">
                                {((rule.multiplier - 1) * 100).toFixed(0)}% Surge ({rule.multiplier}x)
                              </strong>
                            ) : rule.weekend_price_inr ? (
                              <strong className="text-blue-600 dark:text-blue-400">
                                Weekend ₹{rule.weekend_price_inr.toLocaleString()}
                              </strong>
                            ) : (
                              'Custom rate'
                            )}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleDeletePricingRule(rule)}
                          disabled={isPending && pendingActionId === `del-rule-${rule.id}`}
                          className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-neutral-800"
                          title="Remove rule"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Category Rates & Occupancy Matrix */}
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 mb-3">
              Base Tariffs & Occupancy Thresholds
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-200 text-neutral-400 uppercase tracking-wider dark:border-neutral-800">
                    <th className="pb-3 font-semibold">Category</th>
                    <th className="pb-3 font-semibold">Weekday Base</th>
                    <th className="pb-3 font-semibold">Weekend Base</th>
                    <th className="pb-3 font-semibold">Base Adults</th>
                    <th className="pb-3 font-semibold">Max Guests</th>
                    <th className="pb-3 font-semibold">Extra Adult</th>
                    <th className="pb-3 font-semibold">Extra Child</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 text-neutral-700 dark:text-neutral-300">
                  {initialCategories.map((cat) => {
                    const catAny = cat as unknown as Record<string, unknown>;
                    return (
                      <tr key={cat.id}>
                        <td className="py-3 font-semibold text-neutral-900 dark:text-neutral-100">
                          {cat.name}
                        </td>
                        <td className="py-3">₹{cat.base_price_inr.toLocaleString()}</td>
                        <td className="py-3 text-emerald-600 dark:text-emerald-400 font-medium">
                          ₹{((catAny.weekend_price_inr as number) || Math.round(cat.base_price_inr * 1.2)).toLocaleString()}
                        </td>
                        <td className="py-3">{(catAny.base_adults as number) || 2}</td>
                        <td className="py-3 font-medium">
                          {(catAny.max_total_guests as number) || cat.max_adults + cat.max_children}
                        </td>
                        <td className="py-3">
                          +₹{((catAny.extra_adult_price_inr as number) || cat.extra_pax_price_inr || 1000).toLocaleString()}
                        </td>
                        <td className="py-3">
                          +₹{((catAny.extra_child_price_inr as number) || 500).toLocaleString()}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 1: ADD ROOM CATEGORY */}
      {/* ===================================================================== */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Add Room Category
              </h3>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCategory} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Category Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Ocean View Suite"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  placeholder="Private balcony with king bed and sea view"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Base Rate (₹) *
                  </label>
                  <input
                    type="number"
                    name="basePrice"
                    min="0"
                    step="100"
                    required
                    defaultValue="5000"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Extra Pax Rate (₹)
                  </label>
                  <input
                    type="number"
                    name="extraPaxPrice"
                    min="0"
                    step="100"
                    defaultValue="1000"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Max Adults
                  </label>
                  <input
                    type="number"
                    name="maxAdults"
                    min="1"
                    defaultValue="2"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Max Children
                  </label>
                  <input
                    type="number"
                    name="maxChildren"
                    min="0"
                    defaultValue="1"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === 'add-category'}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === 'add-category'
                    ? 'Creating...'
                    : 'Save Category'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: ADD ROOM TO CATEGORY */}
      {/* ===================================================================== */}
      {isRoomModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Add Room Unit
              </h3>
              <button
                type="button"
                onClick={() => setIsRoomModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Room Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  placeholder="e.g. Sunset Villa 101"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Room Number
                  </label>
                  <input
                    type="text"
                    name="roomNumber"
                    placeholder="101"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Category *
                  </label>
                  <input
                    type="text"
                    name="roomType"
                    required
                    defaultValue={preselectedCategory || initialCategories[0]?.name || 'Standard'}
                    placeholder="Category name"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Base Rate (₹) *
                  </label>
                  <input
                    type="number"
                    name="basePrice"
                    min="0"
                    step="100"
                    required
                    defaultValue="5000"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Adults
                  </label>
                  <input
                    type="number"
                    name="capacityAdults"
                    min="1"
                    defaultValue="2"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Children
                  </label>
                  <input
                    type="number"
                    name="capacityChildren"
                    min="0"
                    defaultValue="0"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsRoomModalOpen(false)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === 'add-room'}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === 'add-room' ? 'Adding...' : 'Add Room'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 3: EDIT PRICING */}
      {/* ===================================================================== */}
      {editingRoom && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Update Pricing
                </h3>
                <p className="text-xs text-neutral-500">{editingRoom.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRoom(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSavePricing} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Base Price (₹) *
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  required
                  value={editBasePrice}
                  onChange={(e) => setEditBasePrice(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm font-bold text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Extra Pax Surcharge (₹)
                </label>
                <input
                  type="number"
                  min="0"
                  step="50"
                  value={editExtraPaxPrice}
                  onChange={(e) => setEditExtraPaxPrice(e.target.value)}
                  placeholder="1000"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingRoom(null)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === `pricing-${editingRoom.id}`}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === `pricing-${editingRoom.id}`
                    ? 'Saving...'
                    : 'Update Pricing'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 4: EDIT ROOM CATEGORY */}
      {/* ===================================================================== */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Edit Room Category
                </h3>
                <p className="text-xs text-neutral-500">{editingCategory.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateCategory} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Category Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingCategory.name}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Description
                </label>
                <textarea
                  name="description"
                  rows={2}
                  defaultValue={editingCategory.description || ''}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Base Rate (₹) *
                  </label>
                  <input
                    type="number"
                    name="basePrice"
                    min="0"
                    step="100"
                    required
                    defaultValue={editingCategory.base_price_inr}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Extra Pax Rate (₹)
                  </label>
                  <input
                    type="number"
                    name="extraPaxPrice"
                    min="0"
                    step="100"
                    defaultValue={editingCategory.extra_pax_price_inr}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Max Adults
                  </label>
                  <input
                    type="number"
                    name="maxAdults"
                    min="1"
                    defaultValue={editingCategory.max_adults}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Max Children
                  </label>
                  <input
                    type="number"
                    name="maxChildren"
                    min="0"
                    defaultValue={editingCategory.max_children}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingCategory(null)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === 'edit-category'}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === 'edit-category' ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: EDIT PHYSICAL ROOM UNIT */}
      {/* ===================================================================== */}
      {editingRoomUnit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Edit Room Unit
                </h3>
                <p className="text-xs text-neutral-500">{editingRoomUnit.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingRoomUnit(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateRoomUnit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Room Name *
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  defaultValue={editingRoomUnit.name}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Room Number
                  </label>
                  <input
                    type="text"
                    name="roomNumber"
                    defaultValue={editingRoomUnit.room_number || ''}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Category Assignment *
                  </label>
                  <select
                    name="categoryId"
                    defaultValue={editingRoomUnit.category_id || ''}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    {initialCategories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Base Rate (₹) *
                  </label>
                  <input
                    type="number"
                    name="basePrice"
                    min="0"
                    step="100"
                    required
                    defaultValue={editingRoomUnit.base_price_inr}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Status
                  </label>
                  <select
                    name="status"
                    defaultValue={editingRoomUnit.status}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    <option value="available">available (Ready / Clean)</option>
                    <option value="maintenance">maintenance</option>
                    <option value="blocked">blocked</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Capacity Adults
                  </label>
                  <input
                    type="number"
                    name="capacityAdults"
                    min="1"
                    defaultValue={editingRoomUnit.capacity_adults}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Capacity Children
                  </label>
                  <input
                    type="number"
                    name="capacityChildren"
                    min="0"
                    defaultValue={editingRoomUnit.capacity_children}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setEditingRoomUnit(null)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === 'edit-unit'}
                  className="inline-flex items-center rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === 'edit-unit' ? 'Saving...' : 'Update Unit'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 5: SCHEDULE ROOM BLOCK (Maintenance / Out of Order) */}
      {/* ===================================================================== */}
      {isBlockModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Schedule Room Block
              </h3>
              <button
                type="button"
                onClick={() => setIsBlockModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBlock} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Target Room Unit *
                </label>
                <select
                  name="roomId"
                  required
                  defaultValue={blockRoomId || initialRooms[0]?.id || ''}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  {initialRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} {r.room_number ? `(#${r.room_number})` : ''} — {r.room_type}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Block Type *
                </label>
                <select
                  name="blockType"
                  required
                  defaultValue="maintenance"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="maintenance">Maintenance (Repairs & Technical)</option>
                  <option value="deep_cleaning">Deep Cleaning & Sanitization</option>
                  <option value="renovation">Renovation / Refurbishment</option>
                  <option value="out_of_order">Out of Order (Unsellable)</option>
                  <option value="owner_stay">Owner / VIP Complimentary Stay</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Reason / Description *
                </label>
                <input
                  type="text"
                  name="reason"
                  required
                  placeholder="e.g. AC servicing and wall painting"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-amber-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <p className="text-[11px] text-amber-700 dark:text-amber-400">
                🛡️ PropSyncHub validates against active guest reservations. Blocks cannot conflict with existing bookings.
              </p>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsBlockModalOpen(false)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === 'create-block'}
                  className="inline-flex items-center rounded-xl bg-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-amber-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === 'create-block' ? 'Validating & Blocking...' : 'Schedule Block'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 6: ADD DYNAMIC RATE RULE */}
      {/* ===================================================================== */}
      {isPricingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
                Add Dynamic Rate Rule
              </h3>
              <button
                type="button"
                onClick={() => setIsPricingModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePricingRule} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                  Rule Title *
                </label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="e.g. Diwali Surge, Peak Monsoon, NYE"
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Rule Type *
                  </label>
                  <select
                    name="ruleType"
                    required
                    defaultValue="date_override"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    <option value="date_override">Date Override (Priority 400 - Highest)</option>
                    <option value="seasonal">Seasonal Range (Priority 300)</option>
                    <option value="weekend">Weekend Surge (Priority 200)</option>
                    <option value="promotional">Promotional (Priority 150)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Applies To Category
                  </label>
                  <select
                    name="categoryId"
                    defaultValue="all"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    <option value="all">All Room Categories</option>
                    {initialCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Start Date *
                  </label>
                  <input
                    type="date"
                    name="startDate"
                    required
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    End Date *
                  </label>
                  <input
                    type="date"
                    name="endDate"
                    required
                    defaultValue={new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Fixed Nightly Rate (₹)
                  </label>
                  <input
                    type="number"
                    name="fixedPriceInr"
                    min="0"
                    step="100"
                    placeholder="e.g. 12000"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                    Or Price Multiplier
                  </label>
                  <input
                    type="number"
                    name="multiplier"
                    step="0.05"
                    min="0.5"
                    max="5.0"
                    placeholder="e.g. 1.25 (+25%)"
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-indigo-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2 border-t border-neutral-100 pt-4 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsPricingModalOpen(false)}
                  className="rounded-xl border border-neutral-300 px-3.5 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending && pendingActionId === 'create-rule'}
                  className="inline-flex items-center rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-indigo-500 disabled:opacity-50"
                >
                  {isPending && pendingActionId === 'create-rule' ? 'Creating...' : 'Save Rate Rule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
