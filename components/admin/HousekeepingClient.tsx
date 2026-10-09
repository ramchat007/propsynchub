'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  HousekeepingTask,
  HousekeepingStatus,
  MaintenanceTicket,
  MaintenanceCategory,
  MaintenanceSeverity,
  TeamMember,
} from '@/types';
import {
  startCleaning,
  completeCleaningAndSubmitInspection,
  supervisorApproveRoom,
  supervisorRejectRoom,
  assignHousekeepingStaff,
  reportMaintenanceIssue,
  resolveMaintenanceIssue,
  updateHousekeepingStatus,
} from '@/app/actions/housekeeping';

interface HousekeepingClientProps {
  tenantId: string;
  initialTasks: HousekeepingTask[];
  initialMaintenanceTickets?: MaintenanceTicket[];
  teamMembers?: TeamMember[];
  currentUserName?: string;
}

const STATUS_CONFIG: Record<
  HousekeepingStatus,
  { bg: string; text: string; border: string; label: string; dot: string }
> = {
  ready: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    border: 'border-emerald-200 dark:border-emerald-800/60',
    label: 'Ready to Sell',
    dot: 'bg-emerald-500',
  },
  cleaning: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-700 dark:text-blue-300',
    border: 'border-blue-200 dark:border-blue-800/60',
    label: 'Cleaning in Progress',
    dot: 'bg-blue-500',
  },
  inspected: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-700 dark:text-amber-300',
    border: 'border-amber-200 dark:border-amber-800/60',
    label: 'Awaiting Inspection',
    dot: 'bg-amber-500',
  },
  dirty: {
    bg: 'bg-rose-50 dark:bg-rose-950/20',
    text: 'text-rose-700 dark:text-rose-300',
    border: 'border-rose-200 dark:border-rose-800/60',
    label: 'Dirty / Needs Cleaning',
    dot: 'bg-rose-500',
  },
};

const STANDARD_REJECTION_REASONS = [
  'Linen / Bed sheets not changed or stained',
  'Bathroom wet, water stains, or mirrors uncleaned',
  'Trash bin not cleared or fresh liners missing',
  'Amenities & toiletries restock missing',
  'Dust on surfaces, tables, or headboard',
  'Floor sticky or needs mopping',
  'Foul odor / needs ventilation',
  'Other / Custom supervisor observation',
];

export default function HousekeepingClient({
  tenantId,
  initialTasks,
  initialMaintenanceTickets = [],
  teamMembers = [],
  currentUserName = 'Floor Supervisor',
}: HousekeepingClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [tasks, setTasks] = useState<HousekeepingTask[]>(initialTasks);
  const [maintenanceTickets, setMaintenanceTickets] = useState<MaintenanceTicket[]>(initialMaintenanceTickets);
  const [activeTab, setActiveTab] = useState<'rooms' | 'maintenance'>('rooms');
  const [statusFilter, setStatusFilter] = useState<'all' | HousekeepingStatus | 'maintenance'>('all');
  const [search, setSearch] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Supervisor Inspection Rejection Modal State
  const [rejectModalTask, setRejectModalTask] = useState<HousekeepingTask | null>(null);
  const [rejectionReason, setRejectionReason] = useState(STANDARD_REJECTION_REASONS[0]);
  const [rejectionCustomNotes, setRejectionCustomNotes] = useState('');

  // Report Maintenance Modal State
  const [isMaintenanceModalOpen, setIsMaintenanceModalOpen] = useState(false);
  const [maintRoomId, setMaintRoomId] = useState(initialTasks[0]?.room_id || '');
  const [maintTitle, setMaintTitle] = useState('');
  const [maintCategory, setMaintCategory] = useState<MaintenanceCategory>('plumbing');
  const [maintSeverity, setMaintSeverity] = useState<MaintenanceSeverity>('normal');
  const [maintDescription, setMaintDescription] = useState('');

  // KPI Metrics
  const totalRooms = tasks.length;
  const readyRooms = tasks.filter((t) => t.status === 'ready' && !t.has_active_maintenance).length;
  const cleaningRooms = tasks.filter((t) => t.status === 'cleaning' && !t.has_active_maintenance).length;
  const inspectedRooms = tasks.filter((t) => t.status === 'inspected' && !t.has_active_maintenance).length;
  const dirtyRooms = tasks.filter((t) => t.status === 'dirty' && !t.has_active_maintenance).length;
  const activeMaintCount = maintenanceTickets.filter((t) => t.status === 'open' || t.status === 'in_progress').length;

  // Filtered Tasks
  const filteredTasks = tasks.filter((task) => {
    if (statusFilter === 'maintenance') {
      if (!task.has_active_maintenance) return false;
    } else if (statusFilter !== 'all') {
      if (task.status !== statusFilter) return false;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      const matchesNum = task.room_number.toLowerCase().includes(q);
      const matchesCat = task.category_name?.toLowerCase().includes(q);
      const matchesStaff = task.assigned_staff_name?.toLowerCase().includes(q);
      const matchesMaint = task.maintenance_issue?.toLowerCase().includes(q);
      return matchesNum || matchesCat || matchesStaff || matchesMaint;
    }

    return true;
  });

  // ============================================================================
  // WORKFLOW HANDLERS
  // ============================================================================

  const handleStartCleaning = (task: HousekeepingTask) => {
    startTransition(async () => {
      const res = await startCleaning(tenantId, task.room_id, task.assigned_staff_name || currentUserName);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Cleaning started.' });
        setTasks((prev) =>
          prev.map((t) =>
            t.room_id === task.room_id
              ? {
                  ...t,
                  status: 'cleaning',
                  cleaning_started_at: new Date().toISOString(),
                  inspection_status: 'pending',
                }
              : t
          )
        );
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to start cleaning.' });
      }
    });
  };

  const handleCompleteCleaning = (task: HousekeepingTask) => {
    startTransition(async () => {
      const res = await completeCleaningAndSubmitInspection(tenantId, task.room_id);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Submitted for inspection.' });
        setTasks((prev) =>
          prev.map((t) =>
            t.room_id === task.room_id
              ? {
                  ...t,
                  status: 'inspected',
                  cleaning_completed_at: new Date().toISOString(),
                  inspection_status: 'pending',
                }
              : t
          )
        );
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to submit cleaning.' });
      }
    });
  };

  const handleSupervisorApprove = (task: HousekeepingTask) => {
    startTransition(async () => {
      const res = await supervisorApproveRoom(tenantId, task.room_id, currentUserName);
      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Room approved and ready.' });
        setTasks((prev) =>
          prev.map((t) =>
            t.room_id === task.room_id
              ? {
                  ...t,
                  status: 'ready',
                  inspection_status: 'approved',
                  inspected_at: new Date().toISOString(),
                  inspected_by_name: currentUserName,
                  rejection_reason: undefined,
                }
              : t
          )
        );
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to approve room.' });
      }
    });
  };

  const handleOpenRejectModal = (task: HousekeepingTask) => {
    setRejectModalTask(task);
    setRejectionReason(STANDARD_REJECTION_REASONS[0]);
    setRejectionCustomNotes('');
  };

  const handleExecuteSupervisorReject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectModalTask) return;

    const fullReason =
      rejectionReason === 'Other / Custom supervisor observation'
        ? rejectionCustomNotes.trim() || 'Unsatisfactory cleanliness'
        : rejectionReason + (rejectionCustomNotes ? ` — ${rejectionCustomNotes.trim()}` : '');

    startTransition(async () => {
      const res = await supervisorRejectRoom(
        tenantId,
        rejectModalTask.room_id,
        currentUserName,
        fullReason,
        rejectionCustomNotes.trim() || undefined
      );

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Room returned to cleaning.' });
        setTasks((prev) =>
          prev.map((t) =>
            t.room_id === rejectModalTask.room_id
              ? {
                  ...t,
                  status: 'cleaning',
                  priority: 'urgent',
                  inspection_status: 'rejected',
                  rejection_reason: fullReason,
                  inspected_at: new Date().toISOString(),
                  inspected_by_name: currentUserName,
                }
              : t
          )
        );
        setRejectModalTask(null);
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to return room.' });
      }
    });
  };

  const handleStaffAssign = (task: HousekeepingTask, staffName: string) => {
    if (!staffName) return;
    const staff = teamMembers.find((m) => m.full_name === staffName || m.email === staffName);
    const staffId = staff?.id || 'staff_custom';

    startTransition(async () => {
      const res = await assignHousekeepingStaff(tenantId, task.room_id, staffId, staffName, task.priority);
      if (res.success) {
        setTasks((prev) =>
          prev.map((t) =>
            t.room_id === task.room_id ? { ...t, assigned_staff_name: staffName, assigned_staff_id: staffId } : t
          )
        );
      }
    });
  };

  const handlePriorityChange = (task: HousekeepingTask, priority: 'low' | 'normal' | 'high' | 'urgent') => {
    startTransition(async () => {
      const res = await assignHousekeepingStaff(
        tenantId,
        task.room_id,
        task.assigned_staff_id || 'unassigned',
        task.assigned_staff_name || 'Staff',
        priority
      );
      if (res.success) {
        setTasks((prev) => prev.map((t) => (t.room_id === task.room_id ? { ...t, priority } : t)));
      }
    });
  };

  const handleReportMaintenance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!maintTitle.trim()) return;

    const targetRoom = tasks.find((t) => t.room_id === maintRoomId);

    startTransition(async () => {
      const res = await reportMaintenanceIssue({
        tenantId,
        roomId: maintRoomId || undefined,
        roomNumber: targetRoom?.room_number,
        title: maintTitle.trim(),
        category: maintCategory,
        severity: maintSeverity,
        description: maintDescription.trim() || undefined,
        reportedByName: currentUserName,
      });

      if (res.success && res.data) {
        setFeedback({ type: 'success', message: res.message || 'Maintenance ticket reported.' });
        setMaintenanceTickets((prev) => [res.data!, ...prev]);
        if (maintRoomId && (maintSeverity === 'block_unit' || maintSeverity === 'urgent')) {
          setTasks((prev) =>
            prev.map((t) =>
              t.room_id === maintRoomId
                ? {
                    ...t,
                    has_active_maintenance: true,
                    maintenance_issue: `${maintCategory.toUpperCase()}: ${maintTitle.trim()}`,
                  }
                : t
            )
          );
        }
        setIsMaintenanceModalOpen(false);
        setMaintTitle('');
        setMaintDescription('');
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to report maintenance.' });
      }
    });
  };

  const handleResolveMaintenance = (ticket: MaintenanceTicket) => {
    startTransition(async () => {
      const res = await resolveMaintenanceIssue(
        tenantId,
        ticket.id,
        ticket.room_id || undefined,
        `Resolved by ${currentUserName}`
      );

      if (res.success) {
        setFeedback({ type: 'success', message: res.message || 'Maintenance ticket resolved.' });
        setMaintenanceTickets((prev) =>
          prev.map((t) => (t.id === ticket.id ? { ...t, status: 'resolved', resolved_at: new Date().toISOString() } : t))
        );
        if (ticket.room_id) {
          setTasks((prev) =>
            prev.map((t) =>
              t.room_id === ticket.room_id
                ? { ...t, status: 'dirty', has_active_maintenance: false, maintenance_issue: undefined }
                : t
            )
          );
        }
        router.refresh();
      } else {
        setFeedback({ type: 'error', message: res.error || 'Failed to resolve maintenance.' });
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* =================================================================== */}
      {/* 1. OPERATIONAL KPI PULSE CARDS                                      */}
      {/* =================================================================== */}
      <section className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500">Total Units</p>
          <p className="mt-1 text-2xl font-black text-stone-900 dark:text-white sm:text-3xl">{totalRooms}</p>
          <p className="mt-0.5 text-[11px] text-stone-400">All inventory units</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-2xs dark:border-emerald-900/40 dark:bg-emerald-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
            Ready to Sell
          </p>
          <p className="mt-1 text-2xl font-black text-emerald-800 dark:text-emerald-300 sm:text-3xl">{readyRooms}</p>
          <p className="mt-0.5 text-[11px] text-emerald-700/80 dark:text-emerald-400/80">Inspected &amp; Clean</p>
        </div>

        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-2xs dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
            Cleaning in Progress
          </p>
          <p className="mt-1 text-2xl font-black text-blue-800 dark:text-blue-300 sm:text-3xl">{cleaningRooms}</p>
          <p className="mt-0.5 text-[11px] text-blue-700/80 dark:text-blue-400/80">Attendant active</p>
        </div>

        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 shadow-2xs dark:border-amber-900/40 dark:bg-amber-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
            Due Inspection
          </p>
          <p className="mt-1 text-2xl font-black text-amber-800 dark:text-amber-300 sm:text-3xl">{inspectedRooms}</p>
          <p className="mt-0.5 text-[11px] text-amber-700/80 dark:text-amber-400/80">Supervisor sign-off</p>
        </div>

        <div className="rounded-2xl border border-rose-200 bg-rose-50/50 p-4 shadow-2xs dark:border-rose-900/40 dark:bg-rose-950/20">
          <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700 dark:text-rose-400">
            Dirty / In Maintenance
          </p>
          <p className="mt-1 text-2xl font-black text-rose-800 dark:text-rose-300 sm:text-3xl">
            {dirtyRooms} {activeMaintCount > 0 ? `(${activeMaintCount} 🔧)` : ''}
          </p>
          <p className="mt-0.5 text-[11px] text-rose-700/80 dark:text-rose-400/80">Needs sanitization</p>
        </div>
      </section>

      {/* FEEDBACK BANNER */}
      {feedback && (
        <div
          className={`flex items-center justify-between rounded-xl border p-3 text-xs ${
            feedback.type === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-300'
          }`}
        >
          <span>{feedback.message}</span>
          <button onClick={() => setFeedback(null)} className="text-neutral-400 hover:text-neutral-600">
            ✕
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* 2. CONSOLE NAVIGATION & ACTION HEADER                                */}
      {/* =================================================================== */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-stone-200 pb-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('rooms')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'rooms'
                ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800'
            }`}
          >
            🧹 Room Cleanliness Board ({totalRooms})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('maintenance')}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition ${
              activeTab === 'maintenance'
                ? 'bg-amber-600 text-white'
                : 'text-stone-600 hover:bg-stone-100 dark:text-stone-300 dark:hover:bg-neutral-800'
            }`}
          >
            🔧 Floor Maintenance Tickets ({activeMaintCount})
          </button>
        </div>

        <button
          type="button"
          onClick={() => setIsMaintenanceModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 shadow-2xs hover:bg-stone-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300"
        >
          <span>🔧 Report Maintenance Issue</span>
        </button>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: ROOM CLEANLINESS BOARD                                       */}
      {/* =================================================================== */}
      {activeTab === 'rooms' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  { id: 'all', label: `All (${totalRooms})` },
                  { id: 'dirty', label: `Dirty (${dirtyRooms})` },
                  { id: 'cleaning', label: `Cleaning (${cleaningRooms})` },
                  { id: 'inspected', label: `Due Inspection (${inspectedRooms})` },
                  { id: 'ready', label: `Ready (${readyRooms})` },
                  { id: 'maintenance', label: `Maintenance (${activeMaintCount})` },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition ${
                    statusFilter === tab.id
                      ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                      : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="w-full sm:w-64">
              <input
                type="text"
                placeholder="Search unit #, attendant..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>

          {/* Room Cards Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTasks.map((task) => {
              const cfg = STATUS_CONFIG[task.status] || STATUS_CONFIG.ready;
              const hasMaint = task.has_active_maintenance;

              return (
                <div
                  key={task.room_id}
                  className={`flex flex-col justify-between rounded-2xl border p-4.5 shadow-2xs transition ${cfg.bg} ${
                    hasMaint ? 'border-amber-300 dark:border-amber-900' : cfg.border
                  }`}
                >
                  <div>
                    {/* Card Header */}
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-md bg-stone-900 px-2 py-0.5 font-mono text-[11px] font-bold text-white dark:bg-stone-100 dark:text-stone-900">
                            #{task.room_number}
                          </span>
                          <span className="text-sm font-bold text-stone-900 dark:text-white">
                            {task.category_name}
                          </span>
                        </div>
                      </div>

                      {/* Status Pill */}
                      <div className="flex items-center gap-1.5">
                        {hasMaint && (
                          <span className="rounded-md border border-amber-300 bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            🔧 Maintenance
                          </span>
                        )}
                        <span
                          className={`rounded-md border bg-white px-2 py-0.5 text-[10px] font-bold dark:bg-neutral-900 ${cfg.text} ${cfg.border}`}
                        >
                          ● {cfg.label}
                        </span>
                      </div>
                    </div>

                    {/* Floor Defect Warning if present */}
                    {task.maintenance_issue && (
                      <div className="mt-2.5 rounded-lg border border-amber-300/80 bg-amber-100/60 p-2 text-[11px] text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
                        <span className="font-bold">⚠️ Floor Maintenance:</span> {task.maintenance_issue}
                      </div>
                    )}

                    {/* Rejection Notice if inspection previously failed */}
                    {task.inspection_status === 'rejected' && task.rejection_reason && (
                      <div className="mt-2.5 rounded-lg border border-rose-300 bg-rose-100/70 p-2.5 text-[11px] text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                        <p className="font-bold flex items-center gap-1">
                          <span>❌ Supervisor Inspection Rejected</span>
                        </p>
                        <p className="mt-0.5">{task.rejection_reason}</p>
                        {task.inspected_by_name && (
                          <p className="mt-0.5 text-[10px] opacity-80">
                            By {task.inspected_by_name} at {new Date(task.inspected_at || '').toLocaleTimeString()}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Attendant & Priority Assignments */}
                    <div className="mt-3.5 space-y-2 rounded-xl border border-stone-200/60 bg-white/80 p-3 text-xs dark:border-neutral-800 dark:bg-neutral-850">
                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 font-medium">Floor Attendant:</span>
                        <select
                          value={task.assigned_staff_name || ''}
                          onChange={(e) => handleStaffAssign(task, e.target.value)}
                          className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
                        >
                          <option value="">Unassigned</option>
                          {teamMembers.map((m) => (
                            <option key={m.id} value={m.full_name || m.email}>
                              {m.full_name || m.email}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-stone-500 font-medium">Turnaround Priority:</span>
                        <select
                          value={task.priority}
                          onChange={(e) =>
                            handlePriorityChange(
                              task,
                              e.target.value as 'low' | 'normal' | 'high' | 'urgent'
                            )
                          }
                          className={`rounded-lg border px-2 py-0.5 text-[11px] font-bold ${
                            task.priority === 'urgent'
                              ? 'border-rose-300 bg-rose-50 text-rose-700'
                              : task.priority === 'high'
                              ? 'border-amber-300 bg-amber-50 text-amber-700'
                              : 'border-stone-300 bg-white text-stone-700 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-300'
                          }`}
                        >
                          <option value="normal">Normal Priority</option>
                          <option value="high">High Priority</option>
                          <option value="urgent">⚡ Urgent (Arriving Today)</option>
                          <option value="low">Low Priority</option>
                        </select>
                      </div>

                      {/* Timestamps */}
                      <div className="pt-2 border-t border-stone-100 text-[10px] text-stone-500 space-y-0.5 dark:border-neutral-800">
                        {task.cleaning_started_at && (
                          <p>
                            🕒 Started: {new Date(task.cleaning_started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        {task.cleaning_completed_at && (
                          <p>
                            ✓ Cleaned: {new Date(task.cleaning_completed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {task.turnaround_minutes ? ` (${task.turnaround_minutes}m turnaround)` : ''}
                          </p>
                        )}
                        {task.status === 'ready' && task.inspected_by_name && (
                          <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                            🛡️ Approved by {task.inspected_by_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 1-Click Operational Step Controls */}
                  <div className="mt-4 pt-3 border-t border-stone-200/60 dark:border-neutral-800 flex flex-wrap gap-1.5">
                    {task.status === 'dirty' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleStartCleaning(task)}
                        className="w-full rounded-xl bg-blue-600 py-2 text-center text-xs font-bold text-white shadow-2xs hover:bg-blue-500"
                      >
                        🧹 Start Cleaning
                      </button>
                    )}

                    {task.status === 'cleaning' && (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleCompleteCleaning(task)}
                        className="w-full rounded-xl bg-amber-600 py-2 text-center text-xs font-bold text-white shadow-2xs hover:bg-amber-500"
                      >
                        🔍 Finish &amp; Submit for Inspection
                      </button>
                    )}

                    {task.status === 'inspected' && (
                      <>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleSupervisorApprove(task)}
                          className="flex-1 rounded-xl bg-emerald-600 py-2 text-center text-xs font-bold text-white shadow-2xs hover:bg-emerald-500"
                        >
                          ✓ Approve (Ready)
                        </button>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => handleOpenRejectModal(task)}
                          className="flex-1 rounded-xl bg-rose-600 py-2 text-center text-xs font-bold text-white shadow-2xs hover:bg-rose-500"
                        >
                          ✕ Reject &amp; Return
                        </button>
                      </>
                    )}

                    {task.status === 'ready' && (
                      <div className="flex w-full items-center justify-between">
                        <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                          ✓ Guest Ready
                        </span>
                        <button
                          type="button"
                          disabled={isPending}
                          onClick={() => updateHousekeepingStatus(tenantId, task.room_id, 'dirty')}
                          className="text-[10px] text-stone-500 hover:text-rose-600"
                        >
                          Revert to Dirty
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: FLOOR MAINTENANCE TICKETS                                    */}
      {/* =================================================================== */}
      {activeTab === 'maintenance' && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-stone-200 pb-3 dark:border-neutral-800">
            <div>
              <h3 className="text-base font-bold text-stone-900 dark:text-white">Active Maintenance Tickets</h3>
              <p className="text-xs text-stone-500">
                Floor defects directly impacting room operational status and physical inventory.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsMaintenanceModalOpen(true)}
              className="rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-500"
            >
              + Log New Defect
            </button>
          </div>

          <div className="mt-4 divide-y divide-stone-100 dark:divide-neutral-800">
            {maintenanceTickets.length === 0 ? (
              <div className="py-12 text-center text-xs text-stone-400">
                ✓ No maintenance tickets recorded. All units mechanically sound.
              </div>
            ) : (
              maintenanceTickets.map((ticket) => (
                <div key={ticket.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-stone-900 px-2 py-0.5 font-mono text-[10px] font-bold text-white dark:bg-stone-100 dark:text-stone-900">
                        {ticket.room_number ? `#${ticket.room_number}` : 'General'}
                      </span>
                      <span className="font-bold text-stone-900 dark:text-white text-xs">{ticket.title}</span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                          ticket.severity === 'block_unit'
                            ? 'bg-rose-100 text-rose-800'
                            : ticket.severity === 'urgent'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {ticket.severity}
                      </span>
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-bold text-blue-700 uppercase">
                        {ticket.category}
                      </span>
                    </div>

                    {ticket.description && (
                      <p className="mt-1 text-xs text-stone-600 dark:text-stone-400">{ticket.description}</p>
                    )}

                    <p className="mt-1 text-[10px] text-stone-400">
                      Reported by {ticket.reported_by_name || 'Floor Attendant'} at{' '}
                      {new Date(ticket.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {ticket.status === 'resolved' ? (
                      <span className="rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700">
                        ✓ Resolved
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => handleResolveMaintenance(ticket)}
                        className="rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-500"
                      >
                        ✓ Mark Fixed &amp; Release to Clean
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 3. SUPERVISOR REJECTION MODAL (INSPECTION FAILED)                   */}
      {/* =================================================================== */}
      {rejectModalTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-rose-200 bg-white p-6 shadow-2xl dark:border-rose-900/40 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3 dark:border-neutral-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600">
                  Supervisor Inspection Quality Control
                </span>
                <h3 className="text-base font-bold text-rose-900 dark:text-rose-200">
                  Reject &amp; Return Unit #{rejectModalTask.room_number} to Cleaning
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setRejectModalTask(null)}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleExecuteSupervisorReject} className="mt-4 space-y-3.5 text-xs">
              <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">
                <p className="font-bold">Attendant Accountability Notice:</p>
                <p className="mt-0.5 text-[11px]">
                  Returning this unit sets its priority to <strong>URGENT</strong> and alerts attendant{' '}
                  <strong>{rejectModalTask.assigned_staff_name || 'Attendant'}</strong> with your specific reason below.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300">
                  Select Inspection Defect Reason *
                </label>
                <select
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {STANDARD_REJECTION_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300">
                  Specific Floor Instructions / Notes
                </label>
                <textarea
                  rows={3}
                  placeholder="e.g. Please change pillow covers on master bed and wipe bathroom glass partition."
                  value={rejectionCustomNotes}
                  onChange={(e) => setRejectionCustomNotes(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setRejectModalTask(null)}
                  className="rounded-xl border border-stone-300 px-4 py-2 font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-rose-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-rose-500 disabled:opacity-50"
                >
                  {isPending ? 'Returning...' : '✕ Confirm Rejection & Return'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 4. REPORT FLOOR MAINTENANCE MODAL                                  */}
      {/* =================================================================== */}
      {isMaintenanceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3 dark:border-neutral-800">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600">
                  Floor Maintenance
                </span>
                <h3 className="text-base font-bold text-stone-900 dark:text-white">
                  Report Room Defect / Issue
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsMaintenanceModalOpen(false)}
                className="text-stone-400 hover:text-stone-600"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleReportMaintenance} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300">
                  Target Room Unit *
                </label>
                <select
                  value={maintRoomId}
                  onChange={(e) => setMaintRoomId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  {tasks.map((t) => (
                    <option key={t.room_id} value={t.room_id}>
                      Unit #{t.room_number} ({t.category_name})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300">
                    Defect Category *
                  </label>
                  <select
                    value={maintCategory}
                    onChange={(e) => setMaintCategory(e.target.value as MaintenanceCategory)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="plumbing">Plumbing &amp; Water</option>
                    <option value="electrical">Electrical &amp; Lighting</option>
                    <option value="hvac">HVAC &amp; Air Conditioning</option>
                    <option value="carpentry">Carpentry &amp; Furniture</option>
                    <option value="appliances">Appliances &amp; TV</option>
                    <option value="housekeeping">Deep Stain / Housekeeping</option>
                    <option value="general">General Fixture</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-stone-700 dark:text-stone-300">
                    Operational Severity *
                  </label>
                  <select
                    value={maintSeverity}
                    onChange={(e) => setMaintSeverity(e.target.value as MaintenanceSeverity)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="normal">Normal (Routine Fix)</option>
                    <option value="urgent">Urgent</option>
                    <option value="block_unit">⛔ Block Unit from Inventory</option>
                    <option value="minor">Minor Observation</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300">
                  Issue Title *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Geyser leaking water, TV remote missing"
                  value={maintTitle}
                  onChange={(e) => setMaintTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-semibold text-stone-700 dark:text-stone-300">
                  Detailed Notes / Floor Observation
                </label>
                <textarea
                  rows={2}
                  placeholder="Provide floor context for engineering staff..."
                  value={maintDescription}
                  onChange={(e) => setMaintDescription(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              {maintSeverity === 'block_unit' && (
                <div className="rounded-xl border border-rose-300 bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/30 dark:text-rose-300">
                  ⚠️ <strong>Inventory Protection:</strong> Selecting &quot;Block Unit&quot; will immediately take this room offline from the Room Rack and prevent guest check-ins until repaired.
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsMaintenanceModalOpen(false)}
                  className="rounded-xl border border-stone-300 px-4 py-2 font-semibold text-stone-600 hover:bg-stone-50 dark:border-neutral-700 dark:text-stone-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending || !maintTitle.trim()}
                  className="rounded-xl bg-amber-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-amber-500 disabled:opacity-50"
                >
                  {isPending ? 'Logging...' : '🔧 Log Floor Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
