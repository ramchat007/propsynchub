'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AuditLog, AuditActionType } from '@/types';

interface AuditLogsClientProps {
  initialLogs: AuditLog[];
  tenantName: string;
}

const ACTION_COLORS: Record<AuditActionType, { bg: string; text: string }> = {
  INSERT: { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-700 dark:text-emerald-300' },
  UPDATE: { bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-700 dark:text-amber-300' },
  DELETE: { bg: 'bg-rose-100 dark:bg-rose-950/60', text: 'text-rose-700 dark:text-rose-300' },
};

const TABLE_BADGES: Record<string, { label: string; color: string }> = {
  pricing: { label: 'Pricing Rules', color: 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' },
  bookings: { label: 'Bookings', color: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300' },
  incidental_charges: { label: 'Incidentals', color: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300' },
  rooms: { label: 'Rooms', color: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300' },
};

export default function AuditLogsClient({ initialLogs, tenantName }: AuditLogsClientProps) {
  const [logs] = useState<AuditLog[]>(initialLogs);
  const [search, setSearch] = useState('');
  const [tableFilter, setTableFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');

  // Selected Log for Deep Inspection Modal
  const [inspectedLog, setInspectedLog] = useState<AuditLog | null>(null);

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.record_id.toLowerCase().includes(search.toLowerCase()) ||
      log.table_name.toLowerCase().includes(search.toLowerCase()) ||
      (log.user_profile?.full_name?.toLowerCase() || '').includes(search.toLowerCase()) ||
      (log.user_profile?.mobile_number || '').includes(search) ||
      (log.user_id || '').includes(search);

    const matchesTable = tableFilter === 'all' || log.table_name === tableFilter;
    const matchesAction = actionFilter === 'all' || log.action_type === actionFilter;

    return matchesSearch && matchesTable && matchesAction;
  });

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Audit Trail</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
            Accountability &amp; Audit Logs
          </h1>
          <p className="text-xs text-neutral-500">
            Chronological, immutable audit trail for {tenantName}. Tracks price updates, booking modifications, and incidental charges.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            PostgreSQL DB Triggers Active
          </span>
        </div>
      </div>

      {/* FILTER & SEARCH BAR */}
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs lg:flex-row lg:items-center lg:justify-between dark:border-neutral-800 dark:bg-neutral-900">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search by staff member, phone, record ID, or table..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Table Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase text-neutral-400">Table:</span>
            <select
              value={tableFilter}
              onChange={(e) => setTableFilter(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-transparent px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
            >
              <option value="all">All Tables</option>
              <option value="pricing">Pricing (Rates &amp; Multipliers)</option>
              <option value="bookings">Bookings (Status &amp; Dates)</option>
              <option value="incidental_charges">Incidental Charges (Ledger)</option>
              <option value="rooms">Rooms</option>
            </select>
          </div>

          {/* Action Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-bold uppercase text-neutral-400">Action:</span>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="rounded-xl border border-neutral-300 bg-transparent px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
            >
              <option value="all">All Operations</option>
              <option value="INSERT">INSERT (Created)</option>
              <option value="UPDATE">UPDATE (Modified)</option>
              <option value="DELETE">DELETE (Removed)</option>
            </select>
          </div>
        </div>
      </div>

      {/* AUDIT LOG TABLE */}
      <div className="rounded-2xl border border-neutral-200 bg-white shadow-xs overflow-hidden dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-100 bg-neutral-50/70 text-[11px] font-semibold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40">
              <tr>
                <th className="py-3 px-5">Timestamp</th>
                <th className="py-3 px-4">Staff Member / User</th>
                <th className="py-3 px-4">Table Affected</th>
                <th className="py-3 px-4 text-center">Operation</th>
                <th className="py-3 px-4">Record Identifier</th>
                <th className="py-3 px-5 text-right">Data Diff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log) => {
                  const actionStyle = ACTION_COLORS[log.action_type] || ACTION_COLORS.UPDATE;
                  const tableBadge = TABLE_BADGES[log.table_name] || {
                    label: log.table_name,
                    color: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
                  };

                  return (
                    <tr key={log.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                      {/* Timestamp */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="font-semibold text-neutral-800 dark:text-neutral-200">
                          {new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </div>
                        <div className="text-[10px] text-neutral-400">
                          {new Date(log.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </div>
                      </td>

                      {/* Staff User */}
                      <td className="py-3.5 px-4">
                        {log.user_profile ? (
                          <div>
                            <div className="font-bold text-neutral-900 dark:text-neutral-100">
                              {log.user_profile.full_name || 'Staff Member'}
                            </div>
                            <div className="font-mono text-[11px] text-neutral-500">
                              {log.user_profile.mobile_number}
                            </div>
                            <span className="inline-block rounded-md bg-neutral-100 px-1.5 py-0.2 text-[9px] font-bold text-neutral-600 uppercase dark:bg-neutral-800 dark:text-neutral-400">
                              {log.user_profile.role || 'Admin'}
                            </span>
                          </div>
                        ) : log.user_id ? (
                          <div>
                            <div className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300">
                              User #{log.user_id.slice(0, 8)}
                            </div>
                            <span className="text-[10px] text-neutral-400">Authenticated Staff</span>
                          </div>
                        ) : (
                          <div className="text-neutral-400 text-xs italic">
                            System / Webhook Trigger
                          </div>
                        )}
                      </td>

                      {/* Table */}
                      <td className="py-3.5 px-4">
                        <span className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-bold ${tableBadge.color}`}>
                          {tableBadge.label}
                        </span>
                      </td>

                      {/* Action Operation */}
                      <td className="py-3.5 px-4 text-center">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[10px] font-extrabold tracking-wide uppercase ${actionStyle.bg} ${actionStyle.text}`}>
                          {log.action_type}
                        </span>
                      </td>

                      {/* Record ID */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-neutral-600 dark:text-neutral-400">
                        {log.table_name === 'bookings' ? (
                          <Link
                            href={`/bookings/${log.record_id}`}
                            className="font-bold text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            #{log.record_id.slice(0, 8).toUpperCase()} →
                          </Link>
                        ) : (
                          <span>{log.record_id.slice(0, 12)}...</span>
                        )}
                      </td>

                      {/* View Changes */}
                      <td className="py-3.5 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => setInspectedLog(log)}
                          className="inline-flex items-center gap-1 rounded-xl border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-bold text-neutral-700 shadow-2xs hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200"
                        >
                          <span>Inspect Diff</span>
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-xs text-neutral-400">
                    No audit records match the current filters. Any new price alterations or booking modifications will immediately appear here.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* DEEP DIFF INSPECTION MODAL */}
      {/* ===================================================================== */}
      {inspectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase ${ACTION_COLORS[inspectedLog.action_type]?.bg} ${ACTION_COLORS[inspectedLog.action_type]?.text}`}>
                    {inspectedLog.action_type}
                  </span>
                  <span className="font-mono text-xs font-bold text-neutral-800 dark:text-neutral-200">
                    table: public.{inspectedLog.table_name}
                  </span>
                </div>
                <h3 className="mt-1 text-base font-bold text-neutral-900 dark:text-neutral-100">
                  Audit Entry Inspection · Record #{inspectedLog.record_id.slice(0, 8)}
                </h3>
              </div>

              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="text-neutral-400 hover:text-neutral-600 text-lg"
              >
                ✕
              </button>
            </div>

            {/* Metadata Summary */}
            <div className="mt-4 rounded-xl bg-neutral-50 p-3 text-xs space-y-1.5 dark:bg-neutral-800/60 font-sans">
              <div className="flex justify-between">
                <span className="text-neutral-400">Timestamp</span>
                <span className="font-mono font-semibold text-neutral-700 dark:text-neutral-300">
                  {new Date(inspectedLog.created_at).toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Modified By</span>
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  {inspectedLog.user_profile?.full_name || 'Staff'} ({inspectedLog.user_profile?.mobile_number || inspectedLog.user_id || 'System'})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Target Record ID</span>
                <span className="font-mono text-neutral-700 dark:text-neutral-300">{inspectedLog.record_id}</span>
              </div>
            </div>

            {/* Old vs New Data Diff View */}
            <div className="mt-5 space-y-4">
              {inspectedLog.old_data && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                    Previous State (OLD DATA)
                  </h4>
                  <pre className="mt-1.5 max-h-48 overflow-auto rounded-xl border border-rose-100 bg-rose-50/50 p-3 font-mono text-[11px] text-neutral-800 dark:border-rose-950 dark:bg-rose-950/20 dark:text-rose-200">
                    {JSON.stringify(inspectedLog.old_data, null, 2)}
                  </pre>
                </div>
              )}

              {inspectedLog.new_data && (
                <div>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    New State (NEW DATA)
                  </h4>
                  <pre className="mt-1.5 max-h-48 overflow-auto rounded-xl border border-emerald-100 bg-emerald-50/50 p-3 font-mono text-[11px] text-neutral-800 dark:border-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-200">
                    {JSON.stringify(inspectedLog.new_data, null, 2)}
                  </pre>
                </div>
              )}

              {!inspectedLog.old_data && !inspectedLog.new_data && (
                <div className="rounded-xl bg-neutral-50 p-4 text-center text-xs text-neutral-400">
                  No JSON payload recorded for this operation.
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedLog(null)}
                className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
