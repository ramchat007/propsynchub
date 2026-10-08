'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { TeamMember, UserRole } from '@/types';
import { inviteTeamMember, updateTeamMemberRole, removeTeamMember } from '@/app/actions/team';
import { ToastContainer, ToastMessage } from './Toast';

interface ResortTeamClientProps {
  tenantId: string;
  resortName: string;
  initialMembers: TeamMember[];
  currentUserId: string;
}

export default function ResortTeamClient({
  tenantId,
  resortName,
  initialMembers,
  currentUserId,
}: ResortTeamClientProps) {
  const [members, setMembers] = useState<TeamMember[]>(initialMembers);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isPending, startTransition] = useTransition();

  // Invite Form States
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteMobile, setInviteMobile] = useState('');
  const [inviteRole, setInviteRole] = useState<'staff' | 'tenant_admin'>('staff');
  const [formError, setFormError] = useState<string | null>(null);

  // Confirmation modal state for removal
  const [memberToRemove, setMemberToRemove] = useState<TeamMember | null>(null);

  const addToast = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  };

  const handleDismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Filtered members list
  const filteredMembers = members.filter((m) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      m.email.toLowerCase().includes(query) ||
      (m.full_name && m.full_name.toLowerCase().includes(query)) ||
      (m.mobile_number && m.mobile_number.includes(query)) ||
      m.role.toLowerCase().includes(query)
    );
  });

  const adminCount = members.filter((m) => m.role === 'tenant_admin' || m.role === 'superadmin').length;
  const staffCount = members.filter((m) => m.role === 'staff').length;

  // Handle Send Invitation
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!inviteEmail || !inviteEmail.includes('@')) {
      setFormError('Please enter a valid email address.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('tenantId', tenantId);
      formData.append('email', inviteEmail);
      formData.append('fullName', inviteName);
      formData.append('mobileNumber', inviteMobile);
      formData.append('role', inviteRole);

      const res = await inviteTeamMember(formData);

      if (res.success) {
        addToast('success', res.message || 'Invitation sent successfully!');
        // Optimistically update list
        const newMember: TeamMember = {
          id: res.data?.memberId || `temp_${Date.now()}`,
          tenant_id: tenantId,
          email: inviteEmail.toLowerCase(),
          full_name: inviteName || inviteEmail.split('@')[0],
          mobile_number: inviteMobile || null,
          role: inviteRole,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setMembers((prev) => [...prev.filter((m) => m.email.toLowerCase() !== inviteEmail.toLowerCase()), newMember]);
        setIsInviteModalOpen(false);
        setInviteEmail('');
        setInviteName('');
        setInviteMobile('');
        setInviteRole('staff');
      } else {
        setFormError(res.error || 'Failed to send invitation.');
        addToast('error', res.error || 'Failed to send invitation.');
      }
    });
  };

  // Handle Role Toggle (Admin <-> Staff)
  const handleRoleToggle = (member: TeamMember) => {
    const newRole: UserRole = member.role === 'tenant_admin' ? 'staff' : 'tenant_admin';

    startTransition(async () => {
      const formData = new FormData();
      formData.append('tenantId', tenantId);
      formData.append('memberId', member.id);
      formData.append('newRole', newRole);

      const res = await updateTeamMemberRole(formData);

      if (res.success) {
        addToast('success', res.message || 'Role updated successfully.');
        setMembers((prev) =>
          prev.map((m) => (m.id === member.id ? { ...m, role: newRole } : m))
        );
      } else {
        addToast('error', res.error || 'Could not update role.');
      }
    });
  };

  // Handle Member Removal
  const handleConfirmRemoval = () => {
    if (!memberToRemove) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.append('tenantId', tenantId);
      formData.append('memberId', memberToRemove.id);

      const res = await removeTeamMember(formData);

      if (res.success) {
        addToast('success', res.message || 'Access revoked successfully.');
        setMembers((prev) => prev.filter((m) => m.id !== memberToRemove.id));
        setMemberToRemove(null);
      } else {
        addToast('error', res.error || 'Failed to remove team member.');
        setMemberToRemove(null);
      }
    });
  };

  return (
    <div className="space-y-8">
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* 1. Header & Navigation Tabs */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              {resortName}
            </span>
            <span className="text-xs text-stone-500 font-medium dark:text-stone-400">Settings &amp; Access</span>
          </div>
          <h1 className="mt-1.5 font-serif text-2xl font-bold tracking-tight text-neutral-900 sm:text-3xl dark:text-white">
            Team &amp; Staff Access
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-stone-600 dark:text-stone-400">
            Invite, manage, and assign role-based permissions for resort administrators and front desk staff.
          </p>
        </div>

        <button
          onClick={() => {
            setFormError(null);
            setIsInviteModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition active:scale-95 sm:text-sm"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
          </svg>
          Invite Team Member
        </button>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="border-b border-stone-200 dark:border-neutral-800">
        <nav className="-mb-px flex space-x-6">
          <Link
            href="/settings/team"
            className="border-b-2 border-emerald-600 pb-3 text-xs sm:text-sm font-bold text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 flex items-center gap-2"
          >
            <span>👥</span> Team &amp; Staff
          </Link>
          <Link
            href="/settings/website"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>🌐</span> Website CMS
          </Link>
          <Link
            href="/settings"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>💳</span> Payment Gateway
          </Link>
          <Link
            href="/settings/subscription"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>💎</span> Subscription &amp; SaaS
          </Link>
        </nav>
      </div>

      {/* 2. Overview Metrics Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">Total Active Staff</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100 text-stone-700 text-sm dark:bg-neutral-800 dark:text-stone-300">
              👥
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-neutral-900 dark:text-white">{members.length}</p>
          <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400">Authorized personnel for {resortName}</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-xs dark:border-emerald-950 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-emerald-800 dark:text-emerald-300">Resort Administrators</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800 text-sm dark:bg-emerald-900/60 dark:text-emerald-300">
              🛡️
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-emerald-900 dark:text-emerald-100">{adminCount}</p>
          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">Full operational &amp; financial management</p>
        </div>

        <div className="rounded-2xl border border-sky-200 bg-sky-50/50 p-5 shadow-xs dark:border-sky-950 dark:bg-sky-950/20">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">Front Desk Staff</p>
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-100 text-sky-800 text-sm dark:bg-sky-900/60 dark:text-sky-300">
              🔑
            </span>
          </div>
          <p className="mt-3 text-2xl font-black text-sky-900 dark:text-sky-100">{staffCount}</p>
          <p className="mt-1 text-[11px] text-sky-700 dark:text-sky-400">Reservations, Check-ins &amp; Calendar desk</p>
        </div>
      </div>

      {/* 3. Team Roster Search & Controls */}
      <div className="rounded-3xl border border-stone-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-stone-100 dark:border-neutral-800">
          <div>
            <h2 className="text-base font-bold text-neutral-900 dark:text-white">Active Team Members</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-0.5">
              Individuals with verified sign-in access to this resort.
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <input
              type="text"
              placeholder="Search by name, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-stone-300 bg-stone-50/50 py-2 pl-9 pr-4 text-xs font-medium text-neutral-900 placeholder:text-stone-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:focus:bg-neutral-900"
            />
            <svg
              className="absolute left-3 top-2.5 h-4 w-4 text-stone-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
        </div>

        {/* Member Table */}
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-100 text-[11px] font-bold uppercase tracking-wider text-stone-400 dark:border-neutral-800">
                <th className="py-3.5 pr-4">Team Member</th>
                <th className="py-3.5 px-4">Role &amp; Privileges</th>
                <th className="py-3.5 px-4 hidden md:table-cell">Contact Phone</th>
                <th className="py-3.5 px-4 hidden sm:table-cell">Added</th>
                <th className="py-3.5 pl-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 text-xs dark:divide-neutral-800">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-stone-400">
                    <p className="text-2xl mb-1">🔍</p>
                    <p className="font-semibold text-neutral-900 dark:text-white">No team members found</p>
                    <p className="text-[11px] mt-0.5">Try a different search query or invite a new staff member.</p>
                  </td>
                </tr>
              ) : (
                filteredMembers.map((member) => {
                  const isCurrentUser = member.id === currentUserId;
                  const isPrimaryOwner = member.email === 'ramchat007@gmail.com';
                  const isAdmin = member.role === 'tenant_admin' || member.role === 'superadmin';

                  return (
                    <tr key={member.id} className="hover:bg-stone-50/60 dark:hover:bg-neutral-800/40 transition">
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-600 to-teal-800 font-bold text-white text-xs shadow-xs">
                            {member.full_name?.charAt(0).toUpperCase() || member.email.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-neutral-900 dark:text-white">
                                {member.full_name || 'Resort Staff'}
                              </span>
                              {isCurrentUser && (
                                <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600 dark:bg-neutral-800 dark:text-stone-300">
                                  You
                                </span>
                              )}
                              {isPrimaryOwner && (
                                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                                  Owner
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-500 dark:text-stone-400">{member.email}</p>
                          </div>
                        </div>
                      </td>

                      <td className="py-4 px-4">
                        {isAdmin ? (
                          <div className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-[11px] font-bold text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
                            <span>🛡️</span> Resort Administrator
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1 text-[11px] font-bold text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800">
                            <span>🔑</span> Front Desk Staff
                          </div>
                        )}
                      </td>

                      <td className="py-4 px-4 hidden md:table-cell text-stone-600 dark:text-stone-400 font-mono text-[11px]">
                        {member.mobile_number || '—'}
                      </td>

                      <td className="py-4 px-4 hidden sm:table-cell text-stone-500 dark:text-stone-400 text-[11px]">
                        {member.created_at ? new Date(member.created_at).toLocaleDateString() : 'Active'}
                      </td>

                      <td className="py-4 pl-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {!isCurrentUser && !isPrimaryOwner && (
                            <>
                              <button
                                onClick={() => handleRoleToggle(member)}
                                disabled={isPending}
                                title={isAdmin ? 'Demote to Front Desk Staff' : 'Promote to Resort Administrator'}
                                className="rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100 transition dark:border-neutral-700 dark:text-stone-300 dark:hover:bg-neutral-800 disabled:opacity-50"
                              >
                                {isAdmin ? 'Switch to Staff' : 'Make Admin'}
                              </button>

                              <button
                                onClick={() => setMemberToRemove(member)}
                                disabled={isPending}
                                title="Revoke access"
                                className="rounded-lg border border-rose-200 px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 transition dark:border-rose-900/40 dark:text-rose-400 dark:hover:bg-rose-950/30 disabled:opacity-50"
                              >
                                Revoke
                              </button>
                            </>
                          )}
                          {(isCurrentUser || isPrimaryOwner) && (
                            <span className="text-[11px] font-semibold text-stone-400 italic">Protected</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Role Permissions Reference Card */}
      <div className="rounded-3xl border border-stone-200 bg-stone-50/60 p-6 dark:border-neutral-800 dark:bg-neutral-900/40">
        <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 dark:text-stone-500">
          Role Access Matrix Reference
        </h3>
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-emerald-200/80 bg-white p-4.5 dark:border-emerald-900/40 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              <span className="text-lg">🛡️</span>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Resort Administrator (`tenant_admin`)</h4>
            </div>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Designed for Property Owners, General Managers, and Partners.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-stone-700 dark:text-stone-300">
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Full reservation management &amp; manual folio adjustments
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Room pricing, seasonal multiplier, &amp; inventory control
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Payment Gateway credentials (Razorpay API keys)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Resort Website CMS &amp; media gallery management
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Team access, staff invitations, and role management
              </li>
            </ul>
          </div>

          <div className="rounded-2xl border border-sky-200/80 bg-white p-4.5 dark:border-sky-900/40 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              <span className="text-lg">🔑</span>
              <h4 className="text-sm font-bold text-neutral-900 dark:text-white">Front Desk Staff (`staff`)</h4>
            </div>
            <p className="mt-1 text-xs text-stone-500 dark:text-stone-400">
              Designed for Receptionists, Front Office, and Housekeeping Leads.
            </p>
            <ul className="mt-3 space-y-1.5 text-xs text-stone-700 dark:text-stone-300">
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> View &amp; manage daily reservations and guest folios
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Execute Guest Check-In &amp; Check-Out workflows
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600">✓</span> Occupancy Calendar &amp; physical unit assignments
              </li>
              <li className="flex items-center gap-2">
                <span className="text-rose-500 font-bold">✕</span> Blocked from Payment Gateway keys (`/settings`)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-rose-500 font-bold">✕</span> Blocked from Website CMS &amp; Team Management
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 5. INVITE TEAM MEMBER MODAL */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-lg rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between pb-4 border-b border-stone-100 dark:border-neutral-800">
              <div>
                <h3 className="text-lg font-bold text-neutral-900 dark:text-white">Invite Team Member</h3>
                <p className="text-xs text-stone-500 dark:text-stone-400">
                  Grant access to <strong>{resortName}</strong>
                </p>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-neutral-800"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleInviteSubmit} className="mt-5 space-y-4">
              {formError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">
                  ⚠️ {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-neutral-900 dark:text-white">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <input
                  type="email"
                  required
                  placeholder="e.g. receptionist@resort.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-stone-400">
                  The user can sign in via Google One-Tap or Email OTP using this email.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-neutral-900 dark:text-white">
                    Full Name (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Priya Sharma"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-neutral-900 dark:text-white">
                    Mobile Number (Optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. +91 98000 00000"
                    value={inviteMobile}
                    onChange={(e) => setInviteMobile(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-xs font-medium text-neutral-900 placeholder:text-stone-400 focus:border-emerald-500 focus:outline-hidden dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              {/* Role Selection */}
              <div>
                <label className="block text-xs font-bold text-neutral-900 dark:text-white mb-2">
                  Assign Access Role <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div
                    onClick={() => setInviteRole('staff')}
                    className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                      inviteRole === 'staff'
                        ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30 dark:border-sky-500'
                        : 'border-stone-200 hover:border-stone-300 dark:border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">🔑</span>
                      <input
                        type="radio"
                        checked={inviteRole === 'staff'}
                        onChange={() => setInviteRole('staff')}
                        className="text-sky-600 focus:ring-sky-500"
                      />
                    </div>
                    <p className="mt-2 font-bold text-xs text-neutral-900 dark:text-white">Front Desk Staff</p>
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 leading-tight">
                      Day-to-day reservations, check-in/out, and room calendar.
                    </p>
                  </div>

                  <div
                    onClick={() => setInviteRole('tenant_admin')}
                    className={`cursor-pointer rounded-2xl border p-3.5 transition ${
                      inviteRole === 'tenant_admin'
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 dark:border-emerald-500'
                        : 'border-stone-200 hover:border-stone-300 dark:border-neutral-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base">🛡️</span>
                      <input
                        type="radio"
                        checked={inviteRole === 'tenant_admin'}
                        onChange={() => setInviteRole('tenant_admin')}
                        className="text-emerald-600 focus:ring-emerald-500"
                      />
                    </div>
                    <p className="mt-2 font-bold text-xs text-neutral-900 dark:text-white">Resort Admin</p>
                    <p className="mt-1 text-[11px] text-stone-500 dark:text-stone-400 leading-tight">
                      Full access to financials, payment keys, CMS, and team management.
                    </p>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-stone-100 dark:border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsInviteModalOpen(false)}
                  disabled={isPending}
                  className="rounded-xl border border-stone-300 px-4 py-2.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition dark:border-neutral-700 dark:text-stone-300 dark:hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-emerald-500 transition disabled:opacity-50"
                >
                  {isPending ? (
                    <>
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Sending Invitation...
                    </>
                  ) : (
                    'Send Team Invitation →'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. REVOKE ACCESS CONFIRMATION MODAL */}
      {memberToRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md rounded-3xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-100 text-rose-700 text-xl dark:bg-rose-950 dark:text-rose-400 mb-4">
              ⚠️
            </div>
            <h3 className="text-base font-bold text-neutral-900 dark:text-white">
              Revoke Access for {memberToRemove.full_name || memberToRemove.email}?
            </h3>
            <p className="mt-2 text-xs text-stone-500 dark:text-stone-400 leading-relaxed">
              This will immediately remove <strong>{memberToRemove.email}</strong> from {resortName}. They will no longer be able to log in to the operations desk.
            </p>

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setMemberToRemove(null)}
                disabled={isPending}
                className="rounded-xl border border-stone-300 px-4 py-2 text-xs font-semibold text-stone-700 hover:bg-stone-50 transition dark:border-neutral-700 dark:text-stone-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmRemoval}
                disabled={isPending}
                className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-rose-500 transition disabled:opacity-50"
              >
                {isPending ? 'Revoking...' : 'Yes, Revoke Access'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
