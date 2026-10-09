'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { TaxSchedule, MealPlanCode, MealPlanDefinition } from '@/types';
import { updateResortTaxSettings, updateResortMealPlans } from '@/app/actions/tenant';
import { ToastContainer, ToastMessage } from './Toast';

interface TaxSettingsClientProps {
  tenantId: string;
  resortName: string;
  initialLegalName: string;
  initialGstin: string;
  initialStateCode: string;
  initialStateName: string;
  initialInvoicePrefix: string;
  initialPricingMode: 'inclusive' | 'exclusive';
  initialTaxSchedules: TaxSchedule[];
  initialMealPlans: Record<MealPlanCode, MealPlanDefinition>;
}

export default function TaxSettingsClient({
  tenantId,
  resortName,
  initialLegalName,
  initialGstin,
  initialStateCode,
  initialStateName,
  initialInvoicePrefix,
  initialPricingMode,
  initialTaxSchedules,
  initialMealPlans,
}: TaxSettingsClientProps) {
  const [activeTab, setActiveTab] = useState<'tax' | 'meals'>('tax');

  // Tax state
  const [legalName, setLegalName] = useState(initialLegalName || resortName);
  const [gstin, setGstin] = useState(initialGstin || '');
  const [stateCode, setStateCode] = useState(initialStateCode || '27');
  const [stateName, setStateName] = useState(initialStateName || 'Maharashtra');
  const [invoicePrefix, setInvoicePrefix] = useState(initialInvoicePrefix || 'INV');
  const [pricingMode, setPricingMode] = useState<'inclusive' | 'exclusive'>(initialPricingMode || 'inclusive');
  const [schedules, setSchedules] = useState<TaxSchedule[]>(initialTaxSchedules);

  // Meal plans state
  const [mealPlans, setMealPlans] = useState<Record<MealPlanCode, MealPlanDefinition>>(initialMealPlans);

  // Live simulation amount
  const [simAmount, setSimAmount] = useState<number>(5000);

  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  // Handle Tax Rate Change
  function updateScheduleRate(index: number, newTotalRate: number) {
    const half = Number((newTotalRate / 2).toFixed(2));
    setSchedules((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        rate_percent: newTotalRate,
        cgst_percent: half,
        sgst_percent: half,
      };
      return next;
    });
  }

  // Handle Tax Schedule SAC change
  function updateScheduleSac(index: number, newSac: string) {
    setSchedules((prev) => {
      const next = [...prev];
      next[index] = {
        ...next[index],
        sac_code: newSac,
      };
      return next;
    });
  }

  // Save Tax & GST Settings
  function handleSaveTaxSettings(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateResortTaxSettings({
        tenantId,
        legalName,
        gstin,
        stateCode,
        stateName,
        invoicePrefix,
        pricingMode,
        taxSchedules: schedules,
      });

      if (res.success) {
        addToast('success', res.message || 'Tax configuration saved.');
      } else {
        addToast('error', res.error || 'Failed to update tax configuration.');
      }
    });
  }

  // Save Meal Plans
  function handleSaveMealPlans(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateResortMealPlans({
        tenantId,
        mealPlans,
      });

      if (res.success) {
        addToast('success', res.message || 'Meal Plan pricing saved.');
      } else {
        addToast('error', res.error || 'Failed to update meal plans.');
      }
    });
  }

  // Update meal plan supplement
  function updateMealPlanField(
    code: MealPlanCode,
    field: 'adult_supplement_inr' | 'child_supplement_inr' | 'is_available',
    value: number | boolean
  ) {
    setMealPlans((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        [field]: value,
      },
    }));
  }

  // Calculate live simulator values for Room SAC (index 0 or accommodation)
  const roomSched = schedules.find((s) => s.category === 'accommodation') || schedules[0];
  const rate = roomSched?.rate_percent || 12;
  const isInclusive = pricingMode === 'inclusive';
  const baseSim = isInclusive
    ? Number((simAmount / (1 + rate / 100)).toFixed(2))
    : simAmount;
  const taxSim = isInclusive
    ? Number((simAmount - baseSim).toFixed(2))
    : Number(((simAmount * rate) / 100).toFixed(2));
  const cgstSim = Number((taxSim / 2).toFixed(2));
  const sgstSim = Number((taxSim / 2).toFixed(2));
  const grossSim = isInclusive ? simAmount : Number((baseSim + taxSim).toFixed(2));

  return (
    <div className="space-y-6 max-w-4xl">
      <ToastContainer toasts={toasts} onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))} />

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-md bg-stone-100 px-2.5 py-0.5 text-xs font-semibold text-stone-700 dark:bg-neutral-800 dark:text-stone-300">
            Accountant-Verifiable
          </span>
          <span className="text-xs text-stone-400">•</span>
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
            GST Law Compliant (SAC 9963)
          </span>
        </div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">
          Taxes, GST &amp; Meal Plans
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Configure statutory GST schedules, legal invoice identity, and standard hospitality meal plans (EP, CP, MAP, AP) for{' '}
          <strong className="text-neutral-800 dark:text-neutral-200">{resortName}</strong>.
        </p>
      </div>

      {/* Settings Navigation Tabs */}
      <div className="border-b border-stone-200 dark:border-neutral-800">
        <nav className="-mb-px flex space-x-6">
          <Link
            href="/settings/team"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
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
            <span>🏨</span> Resort Defaults &amp; Payments
          </Link>
          <Link
            href="/settings/tax"
            className="border-b-2 border-emerald-600 pb-3 text-xs sm:text-sm font-bold text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 flex items-center gap-2"
          >
            <span>📜</span> Taxes &amp; Meal Plans
          </Link>
          <Link
            href="/settings/subscription"
            className="border-b-2 border-transparent pb-3 text-xs sm:text-sm font-semibold text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200 flex items-center gap-2"
          >
            <span>💎</span> Subscription &amp; SaaS
          </Link>
        </nav>
      </div>

      {/* Sub-tabs: GST vs Meal Plans */}
      <div className="flex border-b border-stone-100 dark:border-neutral-800 gap-4">
        <button
          type="button"
          onClick={() => setActiveTab('tax')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'tax'
              ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:text-stone-400'
          }`}
        >
          🏛️ Statutory GST &amp; Invoicing
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('meals')}
          className={`pb-2.5 text-sm font-semibold border-b-2 transition ${
            activeTab === 'meals'
              ? 'border-emerald-600 text-emerald-700 dark:border-emerald-400 dark:text-emerald-300'
              : 'border-transparent text-stone-500 hover:text-stone-700 dark:text-stone-400'
          }`}
        >
          🍽️ Meal Plans Engine (EP, CP, MAP, AP)
        </button>
      </div>

      {/* TAB 1: TAX & GST CONFIGURATION */}
      {activeTab === 'tax' && (
        <form onSubmit={handleSaveTaxSettings} className="space-y-6">
          {/* Legal Entity & Invoicing Card */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
              <span>🧾</span> Legal Entity &amp; Invoice Series
            </h2>
            <p className="mt-1 text-xs text-stone-500">
              Printed on official GST tax invoices, folio statements, and payment receipts.
            </p>

            <div className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  Legal Entity Name
                </label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="e.g. Tropical Retreats Private Limited"
                  required
                  className="mt-1.5 w-full rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-medium text-stone-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                />
                <span className="text-[11px] text-stone-400">Registered company / proprietorship name.</span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  Resort GSTIN (15 Digits)
                </label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="e.g. 27AAPCR1234F1Z5"
                  maxLength={15}
                  className="mt-1.5 w-full font-mono rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm uppercase font-semibold tracking-wider text-stone-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                />
                <span className="text-[11px] text-stone-400">Leave blank if exempt under threshold limits.</span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  State Code &amp; State
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="text"
                    value={stateCode}
                    onChange={(e) => setStateCode(e.target.value)}
                    placeholder="27"
                    maxLength={2}
                    required
                    className="w-16 font-mono rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-center text-sm font-bold text-stone-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                  />
                  <input
                    type="text"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                    placeholder="Maharashtra"
                    required
                    className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm font-medium text-stone-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                  />
                </div>
                <span className="text-[11px] text-stone-400">State of supply determines CGST + SGST vs IGST.</span>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                  Invoice Number Prefix
                </label>
                <input
                  type="text"
                  value={invoicePrefix}
                  onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
                  placeholder="e.g. INV or RT"
                  maxLength={6}
                  required
                  className="mt-1.5 w-full font-mono rounded-xl border border-stone-200 bg-stone-50 px-3.5 py-2.5 text-sm uppercase font-bold text-stone-900 focus:border-emerald-500 focus:bg-white focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                />
                <span className="text-[11px] text-stone-400">
                  Generated format: <code className="text-emerald-700 font-semibold dark:text-emerald-400">{invoicePrefix}/2026-27/0001</code>
                </span>
              </div>
            </div>

            {/* Pricing Mode Toggle */}
            <div className="mt-6 border-t border-stone-100 pt-5 dark:border-neutral-800">
              <label className="block text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                Resort Room Catalog Pricing Treatment
              </label>
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    pricingMode === 'inclusive'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-600'
                      : 'border-stone-200 bg-stone-50/50 hover:bg-stone-50 dark:border-neutral-800 dark:bg-neutral-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="pricingMode"
                    value="inclusive"
                    checked={pricingMode === 'inclusive'}
                    onChange={() => setPricingMode('inclusive')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Tax-Inclusive Pricing (India Standard)
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500">
                      The listed room rate (e.g. ₹5,000) is the exact total charged to the guest. Tax engine reverse-calculates base amount and CGST/SGST on tax invoices.
                    </div>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition ${
                    pricingMode === 'exclusive'
                      ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 dark:border-emerald-600'
                      : 'border-stone-200 bg-stone-50/50 hover:bg-stone-50 dark:border-neutral-800 dark:bg-neutral-800/40'
                  }`}
                >
                  <input
                    type="radio"
                    name="pricingMode"
                    value="exclusive"
                    checked={pricingMode === 'exclusive'}
                    onChange={() => setPricingMode('exclusive')}
                    className="mt-0.5 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-semibold text-stone-900 dark:text-stone-100">
                      Tax-Exclusive Pricing (Additive)
                    </div>
                    <div className="mt-0.5 text-xs text-stone-500">
                      The listed room rate is net base. GST is added on top during checkout and settlement.
                    </div>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* SAC Slabs & Schedules Table */}
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                  <span>📊</span> Statutory Tax Slabs by Service Category (SAC)
                </h2>
                <p className="mt-1 text-xs text-stone-500">
                  Accountant-verifiable rates and Service Accounting Codes (SAC). Rates can be adjusted anytime as tax laws evolve.
                </p>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-stone-200 text-stone-500 dark:border-neutral-700">
                    <th className="pb-3 font-semibold">Category</th>
                    <th className="pb-3 font-semibold">SAC Code</th>
                    <th className="pb-3 font-semibold">Total GST %</th>
                    <th className="pb-3 font-semibold">CGST %</th>
                    <th className="pb-3 font-semibold">SGST %</th>
                    <th className="pb-3 font-semibold">Statutory Basis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100 dark:divide-neutral-800">
                  {schedules.map((sched, idx) => (
                    <tr key={sched.id || sched.category} className="hover:bg-stone-50/50 dark:hover:bg-neutral-800/50">
                      <td className="py-3.5 font-medium text-stone-900 dark:text-stone-200">
                        <span className="capitalize">{sched.category}</span>
                        <div className="text-[11px] text-stone-400 font-normal">{sched.description}</div>
                      </td>
                      <td className="py-3.5">
                        <input
                          type="text"
                          value={sched.sac_code}
                          onChange={(e) => updateScheduleSac(idx, e.target.value)}
                          maxLength={6}
                          className="w-20 font-mono rounded-lg border border-stone-200 bg-white px-2 py-1 text-center font-bold text-stone-800 focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-200"
                        />
                      </td>
                      <td className="py-3.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            max="40"
                            step="0.5"
                            value={sched.rate_percent}
                            onChange={(e) => updateScheduleRate(idx, parseFloat(e.target.value) || 0)}
                            className="w-16 rounded-lg border border-stone-200 bg-white px-2 py-1 text-right font-bold text-emerald-700 focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-emerald-400"
                          />
                          <span className="font-semibold text-stone-600 dark:text-stone-400">%</span>
                        </div>
                      </td>
                      <td className="py-3.5 font-mono text-stone-600 dark:text-stone-400">
                        {sched.cgst_percent}%
                      </td>
                      <td className="py-3.5 font-mono text-stone-600 dark:text-stone-400">
                        {sched.sgst_percent}%
                      </td>
                      <td className="py-3.5 text-stone-500">
                        {sched.category === 'accommodation' ? 'Room Stay' : sched.category === 'restaurant' ? 'F&B (Non-ITC)' : 'Add-on Service'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Live Calculation Simulation Box */}
            <div className="mt-6 rounded-xl border border-stone-200 bg-stone-50/80 p-4 dark:border-neutral-800 dark:bg-neutral-800/40">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-stone-600 dark:text-stone-400">
                    Live Tax Audit Simulator (Room SAC {roomSched.sac_code})
                  </span>
                  <p className="text-xs text-stone-500">
                    Test the calculation output on an example booking charge:
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-stone-600 dark:text-stone-400">Test Amount: ₹</span>
                  <input
                    type="number"
                    min="100"
                    step="500"
                    value={simAmount}
                    onChange={(e) => setSimAmount(Math.max(1, parseFloat(e.target.value) || 0))}
                    className="w-24 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-right font-bold text-stone-900 focus:border-emerald-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-stone-100"
                  />
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4 rounded-lg bg-white p-3 border border-stone-200 text-center dark:border-neutral-700 dark:bg-neutral-900">
                <div>
                  <div className="text-[10px] uppercase font-bold text-stone-400">Base Taxable Value</div>
                  <div className="text-sm font-bold text-stone-900 dark:text-stone-100">₹{baseSim.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-stone-400">CGST ({roomSched.cgst_percent}%)</div>
                  <div className="text-sm font-bold text-stone-700 dark:text-stone-300">₹{cgstSim.toLocaleString('en-IN')}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-stone-400">SGST ({roomSched.sgst_percent}%)</div>
                  <div className="text-sm font-bold text-stone-700 dark:text-stone-300">₹{sgstSim.toLocaleString('en-IN')}</div>
                </div>
                <div className="bg-emerald-50/80 rounded-md py-1 dark:bg-emerald-950/40">
                  <div className="text-[10px] uppercase font-bold text-emerald-800 dark:text-emerald-300">Final Bill Total</div>
                  <div className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">₹{grossSim.toLocaleString('en-IN')}</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isPending ? 'Saving...' : '💾 Save Tax & Invoicing Rules'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: MEAL PLANS ENGINE */}
      {activeTab === 'meals' && (
        <form onSubmit={handleSaveMealPlans} className="space-y-6">
          <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
            <div>
              <h2 className="text-base font-semibold text-stone-900 dark:text-stone-100 flex items-center gap-2">
                <span>🍽️</span> Standard Hospitality Meal Plans
              </h2>
              <p className="mt-1 text-xs text-stone-500">
                Configure daily per-guest meal plan supplements for your resort. Guests can choose these plans during booking, and charges are automatically tallied into the folio with F&amp;B SAC 996331.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              {(['EP', 'CP', 'MAP', 'AP'] as MealPlanCode[]).map((code) => {
                const plan = mealPlans[code] || initialMealPlans[code];
                const isEP = code === 'EP';

                return (
                  <div
                    key={code}
                    className={`rounded-2xl border p-5 transition ${
                      plan.is_available !== false
                        ? 'border-stone-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                        : 'border-stone-200 bg-stone-50/50 opacity-60 dark:border-neutral-800 dark:bg-neutral-900/40'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="inline-flex items-center rounded-lg bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {plan.code}
                        </span>
                        <h3 className="mt-1 text-sm font-bold text-stone-900 dark:text-stone-100">
                          {plan.name}
                        </h3>
                        <p className="mt-0.5 text-xs text-stone-500">{plan.description}</p>
                      </div>

                      {!isEP && (
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={plan.is_available !== false}
                            onChange={(e) => updateMealPlanField(code, 'is_available', e.target.checked)}
                            className="sr-only peer"
                          />
                          <div className="w-9 h-5 bg-stone-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 dark:bg-neutral-700"></div>
                        </label>
                      )}
                    </div>

                    <div className="mt-4 pt-4 border-t border-stone-100 dark:border-neutral-800 grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[11px] font-bold uppercase text-stone-600 dark:text-stone-400">
                          Adult / Day
                        </label>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-xs text-stone-500 font-semibold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            disabled={isEP || plan.is_available === false}
                            value={plan.adult_supplement_inr}
                            onChange={(e) =>
                              updateMealPlanField(
                                code,
                                'adult_supplement_inr',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-sm font-bold text-stone-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold uppercase text-stone-600 dark:text-stone-400">
                          Child / Day
                        </label>
                        <div className="mt-1 flex items-center gap-1">
                          <span className="text-xs text-stone-500 font-semibold">₹</span>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            disabled={isEP || plan.is_available === false}
                            value={plan.child_supplement_inr}
                            onChange={(e) =>
                              updateMealPlanField(
                                code,
                                'child_supplement_inr',
                                Math.max(0, parseFloat(e.target.value) || 0)
                              )
                            }
                            className="w-full rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-sm font-bold text-stone-900 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-stone-100"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isPending ? 'Saving...' : '💾 Save Meal Plan Pricing'}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
