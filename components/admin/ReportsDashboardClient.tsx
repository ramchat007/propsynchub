'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Booking, Room, Tenant, IncidentalCharge, UserRole, Gstr1AccountingSupportExport, ModuleEntitlements } from '@/types';
import {
  exportGstr1AccountingSupportData,
  exportSalesRegisterCsv,
  updateTenantModuleEntitlements,
} from '@/app/actions/reports';
import {
  ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER,
  DEFAULT_MODULE_ENTITLEMENTS,
} from '@/lib/constants';

interface ReportsDashboardClientProps {
  tenant: Tenant | null;
  bookings: Booking[];
  rooms: Room[];
  incidentals: IncidentalCharge[];
  userRole?: UserRole;
}

export default function ReportsDashboardClient({
  tenant,
  bookings,
  rooms,
  incidentals,
  userRole = 'tenant_admin',
}: ReportsDashboardClientProps) {
  const [timeFilter, setTimeFilter] = useState<'all' | 'this_month' | 'last_30_days'>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Export state
  const defaultStartDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const defaultEndDate = new Date().toISOString().slice(0, 10);
  const [exportStartDate, setExportStartDate] = useState(defaultStartDate);
  const [exportEndDate, setExportEndDate] = useState(defaultEndDate);
  const [isExportingGstr1, setIsExportingGstr1] = useState(false);
  const [isExportingSalesRegister, setIsExportingSalesRegister] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);
  const [gstr1ModalData, setGstr1ModalData] = useState<Gstr1AccountingSupportExport | null>(null);

  // Module Entitlements state
  const existingEntitlements = (tenant?.settings?.module_entitlements as Partial<ModuleEntitlements>) || {};
  const [moduleEntitlements, setModuleEntitlements] = useState<ModuleEntitlements>({
    restaurant: existingEntitlements.restaurant ?? DEFAULT_MODULE_ENTITLEMENTS.restaurant,
    activities: existingEntitlements.activities ?? DEFAULT_MODULE_ENTITLEMENTS.activities,
    housekeeping: existingEntitlements.housekeeping ?? DEFAULT_MODULE_ENTITLEMENTS.housekeeping,
    guest_services: existingEntitlements.guest_services ?? DEFAULT_MODULE_ENTITLEMENTS.guest_services,
    reviews: existingEntitlements.reviews ?? DEFAULT_MODULE_ENTITLEMENTS.reviews,
    accounting_exports: existingEntitlements.accounting_exports ?? DEFAULT_MODULE_ENTITLEMENTS.accounting_exports,
    digital_guest_portal: existingEntitlements.digital_guest_portal ?? DEFAULT_MODULE_ENTITLEMENTS.digital_guest_portal,
  });
  const [showEntitlementsModal, setShowEntitlementsModal] = useState(false);
  const [isSavingEntitlements, setIsSavingEntitlements] = useState(false);
  const [entitlementFeedback, setEntitlementFeedback] = useState<string | null>(null);

  const canExport = ['superadmin', 'tenant_admin', 'resort_manager', 'accountant'].includes(userRole);
  const canManageEntitlements = ['superadmin', 'tenant_admin'].includes(userRole);

  // Helper to trigger browser download
  const downloadCsvFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handler: Export GSTR-1
  const handleExportGstr1 = async () => {
    if (!tenant?.id) return;
    setExportError(null);
    setExportSuccessMsg(null);
    setIsExportingGstr1(true);

    try {
      const res = await exportGstr1AccountingSupportData(
        tenant.id,
        exportStartDate,
        exportEndDate
      );

      if (!res.success || !res.csv || !res.data) {
        setExportError(res.error || 'Failed to generate GSTR-1 export.');
        return;
      }

      const filename = `gstr1_accounting_support_${tenant.subdomain || 'resort'}_${exportStartDate}_to_${exportEndDate}.csv`;
      downloadCsvFile(res.csv, filename);
      setGstr1ModalData(res.data);
      setExportSuccessMsg(`GSTR-1 Accounting Support CSV downloaded successfully (${res.data.summary_totals.total_invoices} invoices).`);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Error generating GSTR-1 file.');
    } finally {
      setIsExportingGstr1(false);
    }
  };

  // Handler: Export Sales Register
  const handleExportSalesRegister = async () => {
    if (!tenant?.id) return;
    setExportError(null);
    setExportSuccessMsg(null);
    setIsExportingSalesRegister(true);

    try {
      const res = await exportSalesRegisterCsv(
        tenant.id,
        exportStartDate,
        exportEndDate
      );

      if (!res.success || !res.csv) {
        setExportError(res.error || 'Failed to generate Sales Register export.');
        return;
      }

      const filename = `sales_register_${tenant.subdomain || 'resort'}_${exportStartDate}_to_${exportEndDate}.csv`;
      downloadCsvFile(res.csv, filename);
      setExportSuccessMsg(`Sales Register CSV downloaded successfully for period ${exportStartDate} to ${exportEndDate}.`);
    } catch (err: unknown) {
      setExportError(err instanceof Error ? err.message : 'Error generating Sales Register file.');
    } finally {
      setIsExportingSalesRegister(false);
    }
  };

  // Handler: Save Module Entitlements
  const handleSaveEntitlements = async () => {
    if (!tenant?.id) return;
    setIsSavingEntitlements(true);
    setEntitlementFeedback(null);

    try {
      const res = await updateTenantModuleEntitlements(tenant.id, moduleEntitlements);
      if (res.success) {
        setEntitlementFeedback('Module entitlements updated successfully.');
        setTimeout(() => {
          setShowEntitlementsModal(false);
          setEntitlementFeedback(null);
        }, 1200);
      } else {
        setEntitlementFeedback(res.error || 'Failed to update entitlements.');
      }
    } catch (err: unknown) {
      setEntitlementFeedback(err instanceof Error ? err.message : 'Error updating module entitlements.');
    } finally {
      setIsSavingEntitlements(false);
    }
  };

  // 1. Filter bookings by time frame
  const now = new Date();
  const filteredBookings = bookings.filter((b) => {
    if (timeFilter === 'this_month') {
      const bDate = new Date(b.created_at);
      if (bDate.getMonth() !== now.getMonth() || bDate.getFullYear() !== now.getFullYear()) {
        return false;
      }
    } else if (timeFilter === 'last_30_days') {
      const bDate = new Date(b.created_at);
      const diffTime = Math.abs(now.getTime() - bDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      if (diffDays > 30) return false;
    }

    if (statusFilter !== 'all' && b.booking_status !== statusFilter) {
      return false;
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchName = b.guest_name.toLowerCase().includes(term);
      const matchPhone = b.guest_mobile_number.includes(term);
      const matchId = b.id.toLowerCase().includes(term);
      if (!matchName && !matchPhone && !matchId) return false;
    }

    return true;
  });

  // 2. Hospitality Financial Metrics
  const activeBookings = filteredBookings.filter((b) => b.booking_status !== 'cancelled');
  
  // Total room tariff revenue
  const totalRoomRevenue = activeBookings.reduce((sum, b) => sum + Number(b.total_amount_inr || 0), 0);

  // Total incidentals
  const bookingIdsSet = new Set(activeBookings.map((b) => b.id));
  const activeIncidentals = incidentals.filter((i) => bookingIdsSet.has(i.booking_id));
  const totalIncidentalRevenue = activeIncidentals.reduce(
    (sum, i) => sum + Number(i.amount_inr || 0) * (i.quantity || 1),
    0
  );

  const grossRevenue = totalRoomRevenue + totalIncidentalRevenue;

  // OTA Commission Saved Benchmark (18% typical OTA take rate)
  const otaCommissionRate = 0.18;
  const otaCommissionsSaved = Math.round(grossRevenue * otaCommissionRate);

  // Total Booked Nights calculation
  let totalBookedNights = 0;
  activeBookings.forEach((b) => {
    try {
      const d1 = new Date(b.check_in_date);
      const d2 = new Date(b.check_out_date);
      const diff = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)));
      totalBookedNights += diff;
    } catch {
      totalBookedNights += 1;
    }
  });

  // ADR (Average Daily Rate)
  const adr = totalBookedNights > 0 ? Math.round(totalRoomRevenue / totalBookedNights) : 0;

  // RevPAR (Revenue Per Available Room)
  const totalAvailableRooms = Math.max(1, rooms.length);
  const revPar = Math.round(totalRoomRevenue / totalAvailableRooms);

  // Estimated Occupancy Rate (based on 30-day capacity baseline)
  const estimatedCapacityNights = Math.max(1, totalAvailableRooms * (timeFilter === 'last_30_days' ? 30 : 60));
  const occupancyPercentage = Math.min(100, Math.round((totalBookedNights / estimatedCapacityNights) * 100));

  // 3. Category Breakdown for Incidentals
  const diningTotal = activeIncidentals
    .filter((i) => i.category === 'restaurant' || i.category === 'room_service')
    .reduce((sum, i) => sum + Number(i.amount_inr) * i.quantity, 0);

  const spaTotal = activeIncidentals
    .filter((i) => i.category === 'spa')
    .reduce((sum, i) => sum + Number(i.amount_inr) * i.quantity, 0);

  const otherIncidentalsTotal = totalIncidentalRevenue - diningTotal - spaTotal;

  // 4. Payment Status Breakdown
  const paidBookings = activeBookings.filter((b) => b.payment_status === 'paid');
  const paidAmount = paidBookings.reduce((sum, b) => sum + Number(b.total_amount_inr), 0);
  const pendingAmount = grossRevenue - paidAmount;

  return (
    <div className="space-y-8">
      {/* =================================================================== */}
      {/* 1. TOP HEADER & CONTROLS */}
      {/* =================================================================== */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-neutral-200 pb-6 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
              Reports &amp; Financial Intelligence
            </h1>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-500/20">
              Direct Booking ROI
            </span>
          </div>
          <p className="mt-1 text-xs text-neutral-500">
            Performance analytics, OTA commission savings, revenue breakdowns, and GST audit logs for {tenant?.name || 'your property'}.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Module Entitlements Button (Admin Only) */}
          {canManageEntitlements && (
            <button
              type="button"
              onClick={() => setShowEntitlementsModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
            >
              <span>⚙️ Module Entitlements</span>
            </button>
          )}

          {/* Time range selector */}
          <select
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as 'all' | 'last_30_days' | 'this_month')}
            className="rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-2xs focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-200"
          >
            <option value="all">All-Time Performance</option>
            <option value="last_30_days">Last 30 Days</option>
            <option value="this_month">This Month</option>
          </select>

          {/* Export / Print */}
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-300 bg-white px-3.5 py-2 text-xs font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
          >
            <span>🖨️ Print Financial Statement</span>
          </button>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 2. CORE ROI & HOSPITALITY METRIC CARDS */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {/* Card 1: Gross Direct Revenue */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Gross Direct Revenue
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
              ₹
            </span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            ₹{grossRevenue.toLocaleString()}
          </p>
          <div className="mt-2 text-[11px] text-neutral-500 flex justify-between">
            <span>Rooms: ₹{totalRoomRevenue.toLocaleString()}</span>
            <span>Folio: ₹{totalIncidentalRevenue.toLocaleString()}</span>
          </div>
        </div>

        {/* Card 2: OTA Commission Saved (KEY CASE STUDY METRIC) */}
        <div className="rounded-3xl border border-emerald-500/40 bg-gradient-to-br from-emerald-50 to-teal-50/40 p-6 shadow-xs dark:border-emerald-700/50 dark:from-emerald-950/40 dark:to-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-900 dark:text-emerald-300">
              OTA Commissions Saved
            </span>
            <span className="rounded-full bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-900 dark:text-emerald-300">
              18% Benchmark
            </span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-emerald-800 dark:text-emerald-300">
            ₹{otaCommissionsSaved.toLocaleString()}
          </p>
          <p className="mt-2 text-[11px] text-emerald-700/80 dark:text-emerald-400">
            💰 Retained directly in your account vs. MakeMyTrip / Booking.com
          </p>
        </div>

        {/* Card 3: ADR & RevPAR */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              ADR &amp; RevPAR
            </span>
            <span className="text-xs font-bold text-neutral-500">
              {totalBookedNights} Nights
            </span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            ₹{adr.toLocaleString()}
          </p>
          <div className="mt-2 text-[11px] text-neutral-500 flex justify-between">
            <span>Avg Daily Rate: ₹{adr.toLocaleString()}</span>
            <span>RevPAR: ₹{revPar.toLocaleString()}</span>
          </div>
        </div>

        {/* Card 4: Occupancy & Volume */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Occupancy &amp; Bookings
            </span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
              {rooms.length} Units
            </span>
          </div>
          <p className="mt-3 text-3xl font-extrabold text-neutral-900 dark:text-neutral-100">
            {occupancyPercentage}%
          </p>
          <p className="mt-2 text-[11px] text-neutral-500">
            {activeBookings.length} Active Reservations · {totalBookedNights} Nights Booked
          </p>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 3. CHARTERED ACCOUNTANT & TAX WORKING PAPERS (ACCOUNTING-SUPPORT EXPORTS) */}
      {/* =================================================================== */}
      <div className="rounded-3xl border-2 border-amber-300/80 bg-gradient-to-br from-amber-50/50 via-white to-orange-50/30 p-6 shadow-xs dark:border-amber-700/50 dark:from-amber-950/20 dark:via-neutral-900 dark:to-neutral-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="rounded-lg bg-amber-500/20 px-2 py-0.5 font-mono text-[11px] font-bold text-amber-800 dark:text-amber-300">
                GST STATUTORY COMPLIANCE
              </span>
              <span className="rounded-lg bg-neutral-200/80 px-2 py-0.5 text-[11px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                CA Working Papers
              </span>
            </div>
            <h2 className="mt-2 text-lg font-bold text-neutral-900 dark:text-neutral-100 sm:text-xl">
              Accounting-Support Exports &amp; GSTR-1 Reconciliation
            </h2>

            {/* MANDATORY STATUTORY DISCLAIMER BOX */}
            <div className="mt-3 rounded-2xl border border-amber-300 bg-amber-100/60 p-3.5 text-xs text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/40 dark:text-amber-200">
              <p className="font-semibold leading-relaxed">
                {ACCOUNTING_SUPPORT_EXPORT_DISCLAIMER}
              </p>
            </div>
          </div>

          {/* Export Controls & Date Picker */}
          <div className="flex flex-col gap-3 sm:items-end">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase text-neutral-500">From Date</label>
                <input
                  type="date"
                  value={exportStartDate}
                  onChange={(e) => setExportStartDate(e.target.value)}
                  className="rounded-xl border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-100"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-bold uppercase text-neutral-500">To Date</label>
                <input
                  type="date"
                  value={exportEndDate}
                  onChange={(e) => setExportEndDate(e.target.value)}
                  className="rounded-xl border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 dark:border-neutral-700 dark:bg-neutral-850 dark:text-neutral-100"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleExportGstr1}
                disabled={isExportingGstr1 || !canExport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-amber-500 disabled:opacity-50 transition"
              >
                <span>{isExportingGstr1 ? '⏳ Compiling GSTR-1...' : '📥 Export GSTR-1 (Support CSV)'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportSalesRegister}
                disabled={isExportingSalesRegister || !canExport}
                className="inline-flex items-center gap-1.5 rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-white transition"
              >
                <span>{isExportingSalesRegister ? '⏳ Generating Ledger...' : '📥 Export Sales Register CSV'}</span>
              </button>
            </div>

            {!canExport && (
              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                🔒 Restricted: Role &apos;{userRole}&apos; does not have financial export clearance.
              </p>
            )}
          </div>
        </div>

        {/* Feedback messages */}
        {exportError && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
            ❌ {exportError}
          </div>
        )}
        {exportSuccessMsg && (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
            ✅ {exportSuccessMsg}
          </div>
        )}
      </div>

      {/* =================================================================== */}
      {/* 4. VISUAL DISTRIBUTION CHARTS */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Revenue Stream Breakdown */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Revenue Streams (Room vs. Incidentals)
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Track secondary revenue from dining, spa, and activities billed to guest folios.
          </p>

          <div className="mt-6 space-y-4 text-xs">
            {/* Room Tariffs */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="text-neutral-700 dark:text-neutral-300">Room Accommodation Tariffs</span>
                <span>₹{totalRoomRevenue.toLocaleString()} ({grossRevenue > 0 ? Math.round((totalRoomRevenue / grossRevenue) * 100) : 0}%)</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  style={{ width: `${grossRevenue > 0 ? (totalRoomRevenue / grossRevenue) * 100 : 0}%` }}
                  className="h-full bg-emerald-500 rounded-full"
                />
              </div>
            </div>

            {/* Restaurant Dining */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="text-neutral-700 dark:text-neutral-300">Restaurant &amp; Dining Orders</span>
                <span>₹{diningTotal.toLocaleString()} ({grossRevenue > 0 ? Math.round((diningTotal / grossRevenue) * 100) : 0}%)</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  style={{ width: `${grossRevenue > 0 ? (diningTotal / grossRevenue) * 100 : 0}%` }}
                  className="h-full bg-orange-500 rounded-full"
                />
              </div>
            </div>

            {/* Spa & Wellness */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="text-neutral-700 dark:text-neutral-300">Spa &amp; Hydrotherapy Sessions</span>
                <span>₹{spaTotal.toLocaleString()} ({grossRevenue > 0 ? Math.round((spaTotal / grossRevenue) * 100) : 0}%)</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  style={{ width: `${grossRevenue > 0 ? (spaTotal / grossRevenue) * 100 : 0}%` }}
                  className="h-full bg-teal-500 rounded-full"
                />
              </div>
            </div>

            {/* Other Incidentals */}
            <div>
              <div className="flex justify-between font-semibold">
                <span className="text-neutral-700 dark:text-neutral-300">Activities, Minibar &amp; Extras</span>
                <span>₹{otherIncidentalsTotal.toLocaleString()} ({grossRevenue > 0 ? Math.round((otherIncidentalsTotal / grossRevenue) * 100) : 0}%)</span>
              </div>
              <div className="mt-1.5 h-2.5 w-full rounded-full bg-neutral-100 dark:bg-neutral-800 overflow-hidden">
                <div
                  style={{ width: `${grossRevenue > 0 ? (otherIncidentalsTotal / grossRevenue) * 100 : 0}%` }}
                  className="h-full bg-indigo-500 rounded-full"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Collection & Settlement Status */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
            Payment Settlement &amp; Collections
          </h3>
          <p className="text-xs text-neutral-500 mt-1">
            Overview of paid vs. pending folio balances across reservations.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 dark:border-emerald-950 dark:bg-emerald-950/20">
              <span className="text-xs font-semibold text-emerald-800 dark:text-emerald-400">
                Settled / Collected (PAID)
              </span>
              <p className="mt-2 text-2xl font-black text-emerald-700 dark:text-emerald-300">
                ₹{paidAmount.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-emerald-600/80">
                {paidBookings.length} Settled Reservations
              </p>
            </div>

            <div className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4 dark:border-amber-950 dark:bg-amber-950/20">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-400">
                Pending Checkout Settlement
              </span>
              <p className="mt-2 text-2xl font-black text-amber-700 dark:text-amber-300">
                ₹{pendingAmount.toLocaleString()}
              </p>
              <p className="mt-1 text-[11px] text-amber-600/80">
                Due upon guest checkout
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-neutral-50 p-4 text-xs dark:bg-neutral-800/40">
            <div className="flex items-center justify-between font-semibold">
              <span className="text-neutral-700 dark:text-neutral-300">Collection Efficiency Rate</span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400">
                {grossRevenue > 0 ? Math.round((paidAmount / grossRevenue) * 100) : 0}% Collected
              </span>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-neutral-200 dark:bg-neutral-700 overflow-hidden">
              <div
                style={{ width: `${grossRevenue > 0 ? (paidAmount / grossRevenue) * 100 : 0}%` }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 5. FINANCIAL AUDIT & GST ACCOUNTING TABLE */}
      {/* =================================================================== */}
      <div className="rounded-3xl border border-neutral-200 bg-white shadow-xs overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col gap-3 border-b border-neutral-100 p-5 sm:flex-row sm:items-center sm:justify-between dark:border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-neutral-100">
              Financial Audit &amp; Guest Folio Statement Ledger
            </h2>
            <p className="text-xs text-neutral-500">
              Complete itemized billing ledger for accounting, GST records, and offline bank reconciliation.
            </p>
          </div>

          {/* Quick Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Search ref, guest, or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
            >
              <option value="all">All Statuses</option>
              <option value="confirmed">Confirmed</option>
              <option value="checked_in">Checked In</option>
              <option value="checked_out">Checked Out</option>
              <option value="pending">Pending</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-neutral-50/80 text-[11px] font-semibold text-neutral-500 uppercase border-b border-neutral-100 dark:bg-neutral-800/40 dark:border-neutral-800">
              <tr>
                <th className="py-3 px-4">Ref #</th>
                <th className="py-3 px-4">Guest Name &amp; Contact</th>
                <th className="py-3 px-4">Stay Dates</th>
                <th className="py-3 px-4 text-right">Room Tariff</th>
                <th className="py-3 px-4 text-center">Payment Status</th>
                <th className="py-3 px-4">Payment Ref / UTR</th>
                <th className="py-3 px-4 text-center">Booking Status</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredBookings.length > 0 ? (
                filteredBookings.map((b) => (
                  <tr key={b.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                    <td className="py-3.5 px-4 font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      #{b.id.slice(0, 8).toUpperCase()}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-neutral-900 dark:text-neutral-100">{b.guest_name}</div>
                      <div className="font-mono text-[11px] text-neutral-400">{b.guest_mobile_number}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px]">
                      <div>{b.check_in_date} → {b.check_out_date}</div>
                    </td>
                    <td className="py-3.5 px-4 text-right font-mono font-bold text-neutral-900 dark:text-neutral-100">
                      ₹{Number(b.total_amount_inr).toLocaleString()}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                          b.payment_status === 'paid'
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                        }`}
                      >
                        {b.payment_status}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                      {b.razorpay_payment_id || '—'}
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <span className="capitalize text-neutral-700 dark:text-neutral-300 font-semibold">
                        {b.booking_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-center">
                      <Link
                        href={`/bookings/${b.id}`}
                        className="inline-flex items-center rounded-lg bg-neutral-100 px-2.5 py-1 text-[11px] font-bold text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200"
                      >
                        Ledger →
                      </Link>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-xs text-neutral-400">
                    No reservations matching the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
            {filteredBookings.length > 0 && (
              <tfoot className="bg-neutral-50/70 border-t border-neutral-200 dark:bg-neutral-850 dark:border-neutral-800 font-bold text-xs">
                <tr>
                  <td colSpan={3} className="py-3 px-4 text-right uppercase text-[11px] text-neutral-500">
                    Total Bookings Tariff Sum:
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                    ₹{totalRoomRevenue.toLocaleString()}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* =================================================================== */}
      {/* 6. MODAL: GSTR-1 TAX BREAKDOWN PREVIEW */}
      {/* =================================================================== */}
      {gstr1ModalData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
              <div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300">
                  ACCOUNTING-SUPPORT WORKING PAPERS
                </span>
                <h3 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                  GSTR-1 Outward Supplies Summary ({gstr1ModalData.period_start} to {gstr1ModalData.period_end})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setGstr1ModalData(null)}
                className="rounded-full bg-neutral-100 p-2 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-6 text-xs">
              {/* Disclaimer reminder */}
              <div className="rounded-xl bg-amber-50 p-3 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 border border-amber-200 dark:border-amber-900">
                {gstr1ModalData.export_disclaimer}
              </div>

              {/* Summary Stats Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 font-mono">
                <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-400 font-sans">Gross Turnover</span>
                  <p className="mt-1 text-base font-extrabold text-neutral-900 dark:text-white">
                    ₹{gstr1ModalData.summary_totals.gross_turnover_inr.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-400 font-sans">Taxable Value</span>
                  <p className="mt-1 text-base font-extrabold text-neutral-900 dark:text-white">
                    ₹{gstr1ModalData.summary_totals.total_taxable_value_inr.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-400 font-sans">Total GST Liability</span>
                  <p className="mt-1 text-base font-extrabold text-amber-600 dark:text-amber-400">
                    ₹{gstr1ModalData.summary_totals.total_tax_liability_inr.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
                  <span className="text-[10px] uppercase text-neutral-400 font-sans">Net Invoices</span>
                  <p className="mt-1 text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                    {gstr1ModalData.summary_totals.total_invoices}
                  </p>
                </div>
              </div>

              {/* Table 12 HSN/SAC breakdown */}
              <div>
                <h4 className="font-bold text-neutral-900 dark:text-white mb-2">
                  Table 12: HSN/SAC Outward Supplies Summary
                </h4>
                <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 dark:bg-neutral-800 text-[10px] font-bold uppercase text-neutral-500">
                      <tr>
                        <th className="p-2.5">HSN/SAC</th>
                        <th className="p-2.5">Description</th>
                        <th className="p-2.5 text-right">Taxable (₹)</th>
                        <th className="p-2.5 text-right">CGST (₹)</th>
                        <th className="p-2.5 text-right">SGST (₹)</th>
                        <th className="p-2.5 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800 font-mono">
                      {gstr1ModalData.hsn_sac_summary.map((h, idx) => (
                        <tr key={idx}>
                          <td className="p-2.5 font-bold text-neutral-900 dark:text-white">{h.hsn_sac_code}</td>
                          <td className="p-2.5 font-sans text-neutral-600 dark:text-neutral-400">{h.description}</td>
                          <td className="p-2.5 text-right">{h.taxable_value_inr.toLocaleString()}</td>
                          <td className="p-2.5 text-right">{h.cgst_inr.toLocaleString()}</td>
                          <td className="p-2.5 text-right">{h.sgst_inr.toLocaleString()}</td>
                          <td className="p-2.5 text-right font-bold text-neutral-900 dark:text-white">
                            {h.total_value_inr.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Table 4 B2B list if present */}
              {gstr1ModalData.b2b_supplies.length > 0 && (
                <div>
                  <h4 className="font-bold text-neutral-900 dark:text-white mb-2">
                    Table 4: B2B Registered Client Supplies ({gstr1ModalData.b2b_supplies.length})
                  </h4>
                  <div className="overflow-x-auto rounded-xl border border-neutral-200 dark:border-neutral-800">
                    <table className="w-full text-left font-mono">
                      <thead className="bg-neutral-50 dark:bg-neutral-800 text-[10px] font-bold uppercase text-neutral-500 font-sans">
                        <tr>
                          <th className="p-2">Invoice #</th>
                          <th className="p-2">GSTIN</th>
                          <th className="p-2">Client</th>
                          <th className="p-2 text-right">Taxable</th>
                          <th className="p-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
                        {gstr1ModalData.b2b_supplies.map((s, idx) => (
                          <tr key={idx}>
                            <td className="p-2 font-bold">{s.invoice_number}</td>
                            <td className="p-2 text-neutral-500">{s.gstin}</td>
                            <td className="p-2 font-sans">{s.receiver_name}</td>
                            <td className="p-2 text-right">₹{s.taxable_value_inr.toLocaleString()}</td>
                            <td className="p-2 text-right font-bold">₹{s.invoice_value_inr.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setGstr1ModalData(null)}
                className="rounded-xl bg-neutral-900 px-5 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900"
              >
                Close Summary
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 7. MODAL: MODULE ENTITLEMENTS CONFIGURATION */}
      {/* =================================================================== */}
      {showEntitlementsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="relative w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-4 dark:border-neutral-800">
              <div>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-900 dark:bg-emerald-950 dark:text-emerald-300">
                  TENANT MODULE CONTROLS
                </span>
                <h3 className="mt-1 text-lg font-bold text-neutral-900 dark:text-white">
                  Resort Module Entitlements
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowEntitlementsModal(false)}
                className="rounded-full bg-neutral-100 p-2 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              Enable or disable functional operational modules for <strong>{tenant?.name}</strong>. Disabled modules are removed from staff navigation and guarded server-side.
            </p>

            <div className="mt-5 space-y-3">
              {[
                { id: 'restaurant', label: 'Restaurant & Dining POS', desc: 'Item-level GST, sequential KOTs, kitchen display' },
                { id: 'activities', label: 'Resort Activities & Add-ons', desc: 'Recreational tours, spa packages, folio billing' },
                { id: 'housekeeping', label: 'Housekeeping Desk', desc: '4-step cleaning/inspection queue, defect logger' },
                { id: 'guest_services', label: 'Guest Service Requests', desc: 'In-stay service tickets, extra bed, room amenities' },
                { id: 'reviews', label: 'Guest Stay Reviews', desc: 'Verified stay reviews strictly tied to checkout' },
                { id: 'accounting_exports', label: 'Accounting & GSTR-1 Exports', desc: 'CA working paper exports and detailed sales registers' },
                { id: 'digital_guest_portal', label: 'Digital Guest Portal & QR Codes', desc: 'In-room printable QR cards, mobile check-in portal' },
              ].map((mod) => (
                <label
                  key={mod.id}
                  className="flex items-start gap-3 rounded-2xl border border-neutral-200 p-3 hover:bg-neutral-50 dark:border-neutral-800 dark:hover:bg-neutral-850 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(moduleEntitlements[mod.id as keyof ModuleEntitlements])}
                    onChange={(e) =>
                      setModuleEntitlements({
                        ...moduleEntitlements,
                        [mod.id]: e.target.checked,
                      })
                    }
                    className="mt-0.5 h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="flex-1 text-xs">
                    <span className="font-bold text-neutral-900 dark:text-white">{mod.label}</span>
                    <p className="text-[11px] text-neutral-500">{mod.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {entitlementFeedback && (
              <p className="mt-3 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                {entitlementFeedback}
              </p>
            )}

            <div className="mt-6 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setShowEntitlementsModal(false)}
                className="rounded-xl border border-neutral-300 px-4 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveEntitlements}
                disabled={isSavingEntitlements}
                className="rounded-xl bg-emerald-600 px-5 py-2 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                {isSavingEntitlements ? 'Saving...' : 'Save Entitlements'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
