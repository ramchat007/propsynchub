'use client';

import React, { useState, useTransition } from 'react';
import {
  PlatformResortItem,
  createPlatformResort,
  toggleResortStatus,
  appointResortAdmin,
  updateResortDomain,
  switchPlatformActiveResort,
} from '@/app/actions/platform';
import { ToastContainer, ToastMessage } from './Toast';

interface PlatformAdminClientProps {
  initialResorts: PlatformResortItem[];
  currentUserId?: string;
}

export default function PlatformAdminClient({
  initialResorts,
}: PlatformAdminClientProps) {
  const [resorts, setResorts] = useState<PlatformResortItem[]>(initialResorts);
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [isPending, startTransition] = useTransition();

  // Appoint Admin Modal State
  const [appointModalResort, setAppointModalResort] = useState<PlatformResortItem | null>(null);
  const [appointEmail, setAppointEmail] = useState('');
  const [appointName, setAppointName] = useState('');

  // Domain Config Modal State
  const [domainModalResort, setDomainModalResort] = useState<PlatformResortItem | null>(null);
  const [customDomainInput, setCustomDomainInput] = useState('');
  const [domainStatusInput, setDomainStatusInput] = useState<'active' | 'pending_dns' | 'unverified'>('active');

  // Create Resort Form State
  const [name, setName] = useState('');
  const [subdomain, setSubdomain] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [address, setAddress] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [primaryColorHex, setPrimaryColorHex] = useState('#059669');
  const [paymentPolicy, setPaymentPolicy] = useState('FULL_PAYMENT');
  const [advancePercentage, setAdvancePercentage] = useState(50);
  const [formError, setFormError] = useState<string | null>(null);

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

  const filteredResorts = resorts.filter((r) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      r.name.toLowerCase().includes(q) ||
      r.subdomain.toLowerCase().includes(q) ||
      (r.custom_domain && r.custom_domain.toLowerCase().includes(q)) ||
      (r.contact_email && r.contact_email.toLowerCase().includes(q)) ||
      (r.primaryAdminEmail && r.primaryAdminEmail.toLowerCase().includes(q))
    );
  });

  const totalResorts = resorts.length;
  const activeResorts = resorts.filter((r) => r.is_active).length;
  const totalBookings = resorts.reduce((acc, r) => acc + (r.bookingCount || 0), 0);
  const totalRooms = resorts.reduce((acc, r) => acc + (r.roomCount || 0), 0);

  // Handle Toggle Active/Inactive
  const handleToggleStatus = (resort: PlatformResortItem) => {
    const newStatus = !resort.is_active;
    startTransition(async () => {
      const res = await toggleResortStatus(resort.id, newStatus);
      if (res.success) {
        addToast('success', res.message || 'Status updated successfully.');
        setResorts((prev) =>
          prev.map((r) => (r.id === resort.id ? { ...r, is_active: newStatus } : r))
        );
      } else {
        addToast('error', res.error || 'Failed to update status.');
      }
    });
  };

  // Handle Switch Active Context
  const handleSwitchResortContext = (resort: PlatformResortItem) => {
    startTransition(async () => {
      const res = await switchPlatformActiveResort(resort.id);
      if (res.success) {
        addToast('success', res.message || 'Switched active management context!');
        window.location.href = '/dashboard';
      } else {
        addToast('error', res.error || 'Failed to switch context.');
      }
    });
  };

  // Open Domain Modal
  const handleOpenDomainModal = (resort: PlatformResortItem) => {
    setDomainModalResort(resort);
    setCustomDomainInput(resort.custom_domain || '');
    const config = (resort.settings?.domain_config as Record<string, unknown>) || {};
    setDomainStatusInput(
      (config.domain_status as 'active' | 'pending_dns' | 'unverified') ||
        (resort.custom_domain ? 'active' : 'unverified')
    );
  };

  // Handle Domain Submit
  const handleDomainSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domainModalResort) return;

    startTransition(async () => {
      const res = await updateResortDomain(
        domainModalResort.id,
        customDomainInput,
        domainStatusInput
      );
      if (res.success) {
        addToast('success', res.message || 'Custom domain updated!');
        setResorts((prev) =>
          prev.map((r) =>
            r.id === domainModalResort.id
              ? {
                  ...r,
                  custom_domain: customDomainInput || null,
                  settings: {
                    ...r.settings,
                    domain_config: {
                      custom_domain: customDomainInput || null,
                      domain_status: domainStatusInput,
                      verified_at:
                        domainStatusInput === 'active'
                          ? new Date().toISOString()
                          : null,
                    },
                  },
                }
              : r
          )
        );
        setDomainModalResort(null);
      } else {
        addToast('error', res.error || 'Failed to update domain.');
      }
    });
  };

  // Handle Create Resort
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !subdomain.trim()) {
      setFormError('Please enter a resort name and subdomain.');
      return;
    }

    startTransition(async () => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('subdomain', subdomain);
      formData.append('contactEmail', contactEmail);
      formData.append('contactPhone', contactPhone);
      formData.append('address', address);
      formData.append('ownerEmail', ownerEmail || contactEmail);
      formData.append('primaryColorHex', primaryColorHex);
      formData.append('paymentPolicy', paymentPolicy);
      formData.append('advancePercentage', String(advancePercentage));

      const res = await createPlatformResort(formData);

      if (res.success && res.data) {
        addToast('success', res.message || 'Resort launched successfully!');
        const created: PlatformResortItem = {
          ...res.data,
          roomCount: 0,
          categoryCount: 0,
          bookingCount: 0,
          primaryAdminEmail: ownerEmail || contactEmail,
        };
        setResorts((prev) => [created, ...prev]);
        setIsCreateModalOpen(false);
        // Reset form
        setName('');
        setSubdomain('');
        setContactEmail('');
        setContactPhone('');
        setAddress('');
        setOwnerEmail('');
      } else {
        setFormError(res.error || 'Failed to launch resort.');
        addToast('error', res.error || 'Failed to launch resort.');
      }
    });
  };

  // Handle Appoint Admin
  const handleAppointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appointModalResort || !appointEmail.trim()) return;

    startTransition(async () => {
      const res = await appointResortAdmin(appointModalResort.id, appointEmail, appointName);
      if (res.success) {
        addToast('success', res.message || 'Administrator appointed!');
        setResorts((prev) =>
          prev.map((r) =>
            r.id === appointModalResort.id ? { ...r, primaryAdminEmail: appointEmail } : r
          )
        );
        setAppointModalResort(null);
        setAppointEmail('');
        setAppointName('');
      } else {
        addToast('error', res.error || 'Could not appoint administrator.');
      }
    });
  };

  return (
    <div className="space-y-6">
      <ToastContainer toasts={toasts} onDismiss={handleDismissToast} />

      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-md bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700 dark:bg-purple-950/60 dark:text-purple-400">
              Platform Master
            </span>
            <span className="text-xs text-neutral-400">· /admin-master Superadmin Control</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-white">
            Properties, Resorts &amp; Custom Domains
          </h1>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Provision new resorts, map white-label domains, appoint administrators, and manage cross-tenant operations.
          </p>
        </div>

        <button
          onClick={() => setIsCreateModalOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-2.5 text-xs font-bold text-white shadow-md transition hover:bg-purple-700 active:scale-95"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
          </svg>
          Provision New Resort
        </button>
      </div>

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold text-neutral-400 uppercase">Total Resorts</p>
          <p className="mt-1 text-2xl font-black text-neutral-900 dark:text-white">{totalResorts}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold text-emerald-600 uppercase">Active Properties</p>
          <p className="mt-1 text-2xl font-black text-emerald-600">{activeResorts}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold text-blue-600 uppercase">Total Rooms</p>
          <p className="mt-1 text-2xl font-black text-blue-600">{totalRooms}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <p className="text-[11px] font-bold text-neutral-400 uppercase">Global Bookings</p>
          <p className="mt-1 text-2xl font-black text-neutral-900 dark:text-white">{totalBookings}</p>
        </div>
      </div>

      {/* Search and Filter */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search resort by name, subdomain, custom domain, or admin email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2 text-xs text-neutral-900 shadow-xs focus:border-purple-500 focus:outline-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white"
          />
        </div>
      </div>

      {/* Resorts Table */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-neutral-100 bg-neutral-50/50 text-[11px] font-bold text-neutral-500 uppercase dark:border-neutral-800 dark:bg-neutral-800/40">
              <tr>
                <th className="px-5 py-3">Property</th>
                <th className="px-5 py-3">Domain Mappings</th>
                <th className="px-5 py-3">Primary Admin</th>
                <th className="px-5 py-3 text-center">Rooms / Cats</th>
                <th className="px-5 py-3 text-center">Bookings</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {filteredResorts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-neutral-400">
                    No resorts match your search query.
                  </td>
                </tr>
              ) : (
                filteredResorts.map((r) => (
                  <tr key={r.id} className="hover:bg-neutral-50/50 dark:hover:bg-neutral-800/30">
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-neutral-900 dark:text-white">{r.name}</div>
                      <div className="text-[11px] text-neutral-400">{r.contact_phone || 'No phone set'}</div>
                    </td>
                    <td className="px-5 py-3.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-400 uppercase font-mono">Sub:</span>
                        <a
                          href={`/r/${r.subdomain}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-[11px] text-purple-600 hover:underline dark:text-purple-400"
                        >
                          {r.subdomain}.propsynchub.in ↗
                        </a>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-neutral-400 uppercase font-mono">Custom:</span>
                        {r.custom_domain ? (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                            <span>https://{r.custom_domain}</span>
                            <span className="rounded-xs bg-emerald-100 px-1 text-[9px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              Active
                            </span>
                          </span>
                        ) : (
                          <span className="font-mono text-[11px] text-neutral-400">Not configured</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="font-mono text-neutral-700 dark:text-neutral-300">
                        {r.primaryAdminEmail || 'Not assigned'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-bold text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                        {r.roomCount} rooms / {r.categoryCount} cats
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-center font-bold text-neutral-800 dark:text-neutral-200">
                      {r.bookingCount}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          r.is_active
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}
                      >
                        {r.is_active ? 'Active' : 'Deactivated'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1.5">
                      <button
                        onClick={() => handleSwitchResortContext(r)}
                        disabled={isPending}
                        title="Manage bookings, inventory, and operations in resort desk"
                        className="rounded-lg bg-neutral-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-neutral-800 dark:bg-white dark:text-black dark:hover:bg-neutral-200"
                      >
                        ⚡ Operations
                      </button>
                      <button
                        onClick={() => handleOpenDomainModal(r)}
                        className="rounded-lg border border-purple-300 px-2.5 py-1 text-[11px] font-bold text-purple-700 transition hover:bg-purple-50 dark:border-purple-800 dark:text-purple-300 dark:hover:bg-purple-950/50"
                      >
                        🌐 Domain
                      </button>
                      <button
                        onClick={() => {
                          setAppointModalResort(r);
                          setAppointEmail(r.primaryAdminEmail === 'Unassigned' ? '' : r.primaryAdminEmail || '');
                        }}
                        className="rounded-lg border border-neutral-300 px-2.5 py-1 text-[11px] font-bold text-neutral-700 transition hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800"
                      >
                        Admin
                      </button>
                      <button
                        onClick={() => handleToggleStatus(r)}
                        disabled={isPending}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${
                          r.is_active
                            ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 dark:bg-rose-950/40 dark:text-rose-400'
                            : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-400'
                        }`}
                      >
                        {r.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* DOMAIN CONFIGURATION & NETLIFY DNS MODAL */}
      {domainModalResort && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <div>
                <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                  White-Label Custom Domain Setup
                </h2>
                <p className="text-xs text-neutral-500">
                  Resort: <strong>{domainModalResort.name}</strong>
                </p>
              </div>
              <button
                onClick={() => setDomainModalResort(null)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDomainSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Custom Domain Hostname *
                </label>
                <div className="mt-1 flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
                  <span className="font-mono text-neutral-400 text-xs">https://</span>
                  <input
                    type="text"
                    placeholder="e.g. raigadtropical.in or luxuryresort.com"
                    value={customDomainInput}
                    onChange={(e) => setCustomDomainInput(e.target.value)}
                    className="w-full bg-transparent font-mono text-neutral-900 focus:outline-none dark:text-white"
                  />
                </div>
                <p className="mt-1 text-[11px] text-neutral-400">
                  Leave blank to remove custom domain and rely exclusively on subdomain.
                </p>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Domain Verification Status
                </label>
                <select
                  value={domainStatusInput}
                  onChange={(e) =>
                    setDomainStatusInput(
                      e.target.value as 'active' | 'pending_dns' | 'unverified'
                    )
                  }
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="active">Active (Verified &amp; Serving Traffic)</option>
                  <option value="pending_dns">Pending DNS (Awaiting DNS Propagation)</option>
                  <option value="unverified">Unverified (Registration Only)</option>
                </select>
              </div>

              {/* Netlify DNS Configuration Guide */}
              <div className="rounded-2xl border border-purple-200 bg-purple-50/60 p-4 text-xs dark:border-purple-900/40 dark:bg-purple-950/20">
                <div className="flex items-center gap-2 font-bold text-purple-900 dark:text-purple-300">
                  <span>⚡ Netlify Production DNS Instructions</span>
                </div>
                <p className="mt-1 text-[11px] text-purple-700 dark:text-purple-300">
                  To route traffic from the resort&apos;s registrar (GoDaddy, Namecheap, Cloudflare) to PropSyncHub on Netlify:
                </p>

                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-left font-mono text-[11px]">
                    <thead className="border-b border-purple-200 dark:border-purple-800 text-purple-800 dark:text-purple-300">
                      <tr>
                        <th className="pb-1">Type</th>
                        <th className="pb-1">Host / Name</th>
                        <th className="pb-1">Target / Value</th>
                        <th className="pb-1">TTL</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-purple-100 dark:divide-purple-900/40 text-neutral-800 dark:text-neutral-200">
                      <tr>
                        <td className="py-1 font-bold text-purple-600">CNAME</td>
                        <td className="py-1">www</td>
                        <td className="py-1 font-bold">propsynchub.netlify.app</td>
                        <td className="py-1">Auto</td>
                      </tr>
                      <tr>
                        <td className="py-1 font-bold text-blue-600">A</td>
                        <td className="py-1">@ (apex)</td>
                        <td className="py-1 font-bold">75.2.60.5</td>
                        <td className="py-1">Auto</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div className="mt-3 rounded-lg bg-white/70 p-2 text-[11px] text-neutral-600 dark:bg-neutral-800/80 dark:text-neutral-300">
                  <strong>URL Architecture:</strong> Once pointed, visitors to <code>{customDomainInput || 'domain.in'}</code> view the branded resort website, and <code>{customDomainInput || 'domain.in'}/app</code> opens the staff management login and operations.
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setDomainModalResort(null)}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {isPending ? 'Saving...' : 'Save Domain Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE RESORT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-xl rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h2 className="text-lg font-bold text-neutral-900 dark:text-white">
                Provision New Resort Property
              </h2>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-700 dark:bg-rose-950/40 dark:text-rose-300">
                ⚠️ {formError}
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="mt-4 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Resort Property Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Whispering Palms Luxury Resort"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!subdomain) {
                      setSubdomain(
                        e.target.value
                          .toLowerCase()
                          .replace(/[\s_]+/g, '-')
                          .replace(/[^a-z0-9-]/g, '')
                      );
                    }
                  }}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Unique Subdomain Slug *
                </label>
                <div className="mt-1 flex items-center gap-1 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
                  <input
                    type="text"
                    required
                    placeholder="whispering-palms"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value)}
                    className="w-full bg-transparent font-mono text-neutral-900 focus:outline-none dark:text-white"
                  />
                  <span className="text-neutral-400 font-mono text-[11px]">.propsynchub.in</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                    Contact Email
                  </label>
                  <input
                    type="email"
                    placeholder="frontdesk@resort.com"
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                    Contact Phone
                  </label>
                  <input
                    type="tel"
                    placeholder="+91 98200 12345"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Primary Owner / Administrator Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="owner@resort.com"
                  value={ownerEmail}
                  onChange={(e) => setOwnerEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <p className="mt-1 text-[11px] text-neutral-400">
                  An onboarding invitation with secure admin access will be sent to this email address.
                </p>
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Property Address / Location
                </label>
                <input
                  type="text"
                  placeholder="e.g. Alibaug Beach Road, Raigad, Maharashtra 402201"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                    Payment Policy
                  </label>
                  <select
                    value={paymentPolicy}
                    onChange={(e) => setPaymentPolicy(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  >
                    <option value="FULL_PAYMENT">100% Full Online Payment</option>
                    <option value="ADVANCE">Advance Required + Pay at Property</option>
                    <option value="PAY_AT_PROPERTY">100% Pay at Property Allowed</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                    Advance Percentage (%)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={advancePercentage}
                    onChange={(e) => setAdvancePercentage(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                    Theme Color
                  </label>
                  <input
                    type="color"
                    value={primaryColorHex}
                    onChange={(e) => setPrimaryColorHex(e.target.value)}
                    className="mt-1 h-10 w-full rounded-xl border border-neutral-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-800"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {isPending ? 'Provisioning...' : 'Provision Resort & Invite Owner →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPOINT ADMIN MODAL */}
      {appointModalResort && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3 dark:border-neutral-800">
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                Appoint Resort Administrator
              </h2>
              <button
                onClick={() => setAppointModalResort(null)}
                className="text-neutral-400 hover:text-neutral-600"
              >
                ✕
              </button>
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              Appoint an administrator for <strong>{appointModalResort.name}</strong>.
            </p>

            <form onSubmit={handleAppointSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Admin Full Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Ramesh Patel"
                  value={appointName}
                  onChange={(e) => setAppointName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-neutral-700 dark:text-neutral-300">
                  Admin Email Address *
                </label>
                <input
                  type="email"
                  required
                  placeholder="admin@resort.com"
                  value={appointEmail}
                  onChange={(e) => setAppointEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-200 bg-white p-2.5 text-neutral-900 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="mt-5 flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setAppointModalResort(null)}
                  className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-bold text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-xl bg-purple-600 px-5 py-2 text-xs font-bold text-white shadow-md hover:bg-purple-700 disabled:opacity-50"
                >
                  {isPending ? 'Appointing...' : 'Appoint & Grant Membership'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
