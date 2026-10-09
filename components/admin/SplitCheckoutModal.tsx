'use client';

import React, { useState, useEffect, useTransition } from 'react';
import { PaymentMethodType, TaxInvoiceDocument } from '@/types';
import { getAuthoritativeFolio, AuthoritativeFolioSummary } from '@/app/actions/folio';
import { executeCheckOutAndSettlement } from '@/app/actions/front-desk';

interface SplitCheckoutModalProps {
  bookingId: string;
  tenantId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string, invoice?: TaxInvoiceDocument) => void;
  onError: (error: string) => void;
}

interface SplitRow {
  id: string;
  amount_inr: string;
  payment_method: PaymentMethodType;
  reference_number: string;
  notes: string;
}

export default function SplitCheckoutModal({
  bookingId,
  tenantId,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: SplitCheckoutModalProps) {
  const [isPending, startTransition] = useTransition();

  const [isLoadingFolio, setIsLoadingFolio] = useState(true);
  const [folio, setFolio] = useState<AuthoritativeFolioSummary | null>(null);

  // Key return confirmation
  const [keysReturned, setKeysReturned] = useState(true);

  // Corporate ledger credit
  const [allowLedgerCredit, setAllowLedgerCredit] = useState(false);
  const [settlementNotes, setSettlementNotes] = useState('');

  // Split payments rows
  const [splitRows, setSplitRows] = useState<SplitRow[]>([
    {
      id: 'row-1',
      amount_inr: '',
      payment_method: 'upi',
      reference_number: '',
      notes: '',
    },
  ]);

  // Load authoritative folio on open
  useEffect(() => {
    if (!isOpen || !bookingId || !tenantId) return;

    let isMounted = true;
    setIsLoadingFolio(true);

    getAuthoritativeFolio(tenantId, bookingId)
      .then((res) => {
        if (isMounted) {
          if (res.success && res.data) {
            setFolio(res.data);
            const balance = res.data.outstandingBalanceInr;
            // Pre-fill first row with full balance if balance > 0
            if (balance > 0) {
              setSplitRows([
                {
                  id: 'row-1',
                  amount_inr: balance.toString(),
                  payment_method: 'upi',
                  reference_number: '',
                  notes: 'Checkout final settlement',
                },
              ]);
            } else {
              setSplitRows([]);
            }
          } else {
            onError(res.error || 'Failed to load folio details.');
          }
          setIsLoadingFolio(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          onError(err instanceof Error ? err.message : 'Error retrieving folio.');
          setIsLoadingFolio(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, bookingId, tenantId, onError]);

  if (!isOpen) return null;

  const outstandingBalance = folio?.outstandingBalanceInr || 0;

  // Calculate total currently entered in split rows
  const totalAllocated = splitRows.reduce((sum, row) => {
    const val = parseFloat(row.amount_inr);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);

  const remainingBalance = Math.max(0, outstandingBalance - totalAllocated);

  function handleAddSplitRow() {
    setSplitRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        amount_inr: remainingBalance > 0 ? remainingBalance.toString() : '',
        payment_method: 'cash',
        reference_number: '',
        notes: '',
      },
    ]);
  }

  function handleRemoveSplitRow(id: string) {
    setSplitRows((prev) => prev.filter((r) => r.id !== id));
  }

  function handleUpdateSplitRow(id: string, field: keyof SplitRow, value: string) {
    setSplitRows((prev) =>
      prev.map((r) => (r.id === id ? { ...r, [field]: value } : r))
    );
  }

  function handleExecuteCheckout(e: React.FormEvent) {
    e.preventDefault();

    if (!keysReturned) {
      onError('Please confirm that room physical keys have been returned.');
      return;
    }

    if (outstandingBalance > 0 && totalAllocated < outstandingBalance && !allowLedgerCredit) {
      onError(
        `Split payments total ₹${totalAllocated.toLocaleString()}, but ₹${outstandingBalance.toLocaleString()} is due. Please settle the remaining ₹${remainingBalance.toLocaleString()} or authorize ledger credit.`
      );
      return;
    }

    startTransition(async () => {
      const formattedPayments = splitRows
        .filter((r) => parseFloat(r.amount_inr) > 0)
        .map((r) => ({
          amount_inr: parseFloat(r.amount_inr),
          payment_method: r.payment_method,
          reference_number: r.reference_number.trim() || undefined,
          notes: r.notes.trim() || undefined,
        }));

      const res = await executeCheckOutAndSettlement({
        tenantId,
        bookingId,
        splitPayments: formattedPayments,
        keysReturned,
        settlementNotes: settlementNotes.trim() || undefined,
        allowLedgerCredit,
      });

      if (res.success && res.data) {
        onSuccess(res.message || 'Checkout completed successfully.', res.data);
        onClose();
      } else {
        onError(res.error || 'Failed to complete checkout.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative my-8 w-full max-w-2xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
              Front Desk Checkout &amp; Folio Settlement
            </span>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Checkout #{bookingId.slice(0, 8).toUpperCase()} — {folio?.guestName || 'Guest'}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800"
          >
            ✕
          </button>
        </div>

        {isLoadingFolio ? (
          <div className="py-12 text-center text-xs text-neutral-500">
            Calculating authoritative folio ledger and GST breakdown...
          </div>
        ) : !folio ? (
          <div className="py-12 text-center text-xs text-rose-500">
            Unable to load folio details.
          </div>
        ) : (
          <form onSubmit={handleExecuteCheckout} className="mt-4 space-y-4 text-xs">
            {/* Folio Ledger Breakdown Card */}
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-850/50">
              <div className="flex items-center justify-between border-b border-neutral-200/60 pb-2.5 dark:border-neutral-800">
                <span className="font-semibold text-neutral-700 dark:text-neutral-300">
                  Stay: {folio.roomName || 'Room'} ({folio.nights} Nights · {folio.mealPlanName})
                </span>
                <span className="font-bold text-neutral-900 dark:text-neutral-100">
                  ₹{folio.roomChargeInr.toLocaleString()}
                </span>
              </div>

              {folio.incidentals.length > 0 && (
                <div className="py-2 space-y-1 border-b border-neutral-200/60 dark:border-neutral-800">
                  <div className="flex justify-between font-medium text-neutral-600 dark:text-neutral-400">
                    <span>Incidentals &amp; Room Charges ({folio.incidentals.length} items):</span>
                    <span>₹{folio.incidentalsTotalInr.toLocaleString()}</span>
                  </div>
                  {folio.incidentals.slice(0, 3).map((item) => (
                    <div key={item.id} className="flex justify-between text-[11px] text-neutral-500">
                      <span>• {item.item_name} (x{item.quantity})</span>
                      <span>₹{(Number(item.amount_inr) * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                  {folio.incidentals.length > 3 && (
                    <p className="text-[10px] text-neutral-400 italic">
                      + {folio.incidentals.length - 3} more items in folio ledger
                    </p>
                  )}
                </div>
              )}

              {/* Tax Details */}
              <div className="flex justify-between py-2 border-b border-neutral-200/60 dark:border-neutral-800 text-neutral-600 dark:text-neutral-400">
                <span>GST Tax Breakdown ({folio.taxCalculation.is_inclusive ? 'Inclusive' : 'Exclusive'}):</span>
                <span>
                  CGST: ₹{folio.taxCalculation.total_cgst_inr.toLocaleString()} · SGST: ₹{folio.taxCalculation.total_sgst_inr.toLocaleString()} (Total ₹{folio.taxInr.toLocaleString()})
                </span>
              </div>

              {/* Totals & Net Balance */}
              <div className="pt-2.5 space-y-1.5">
                <div className="flex justify-between text-neutral-600 dark:text-neutral-400">
                  <span>Grand Total Folio Amount:</span>
                  <span className="font-semibold text-neutral-800 dark:text-neutral-200">
                    ₹{folio.grandTotalInr.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400">
                  <span>Advance / Already Paid:</span>
                  <span className="font-semibold">- ₹{folio.paidAmountInr.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-neutral-200 dark:border-neutral-700">
                  <span className={outstandingBalance > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
                    Outstanding Balance Due:
                  </span>
                  <span className={outstandingBalance > 0 ? 'text-rose-600 dark:text-rose-400 text-base font-black' : 'text-emerald-600 dark:text-emerald-400 font-bold'}>
                    ₹{outstandingBalance.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Split Settlement Section */}
            {outstandingBalance > 0 && (
              <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                    <span>💳</span>
                    <span>Split Payment Settlement</span>
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddSplitRow}
                    className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300"
                  >
                    <span>+ Add Split Mode</span>
                  </button>
                </div>

                <div className="space-y-2.5">
                  {splitRows.map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-1 gap-2 rounded-xl border border-neutral-200/80 bg-neutral-50/50 p-2.5 sm:grid-cols-12 dark:border-neutral-800 dark:bg-neutral-850/30"
                    >
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-semibold text-neutral-500 uppercase">
                          Amount (₹)
                        </label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={row.amount_inr}
                          onChange={(e) => handleUpdateSplitRow(row.id, 'amount_inr', e.target.value)}
                          placeholder="Amount"
                          className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-semibold text-neutral-500 uppercase">
                          Mode
                        </label>
                        <select
                          value={row.payment_method}
                          onChange={(e) =>
                            handleUpdateSplitRow(row.id, 'payment_method', e.target.value as PaymentMethodType)
                          }
                          className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        >
                          <option value="upi">UPI (GPay/PhonePe)</option>
                          <option value="cash">Cash</option>
                          <option value="credit_card">Card (POS)</option>
                          <option value="debit_card">Debit Card</option>
                          <option value="bank_transfer">Bank IMPS/NEFT</option>
                          <option value="cheque">Cheque</option>
                        </select>
                      </div>

                      <div className="sm:col-span-5">
                        <label className="block text-[10px] font-semibold text-neutral-500 uppercase">
                          Reference / UTR / Auth #
                        </label>
                        <input
                          type="text"
                          value={row.reference_number}
                          onChange={(e) => handleUpdateSplitRow(row.id, 'reference_number', e.target.value)}
                          placeholder="e.g. UTR / Receipt note"
                          className="mt-0.5 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                        />
                      </div>

                      <div className="sm:col-span-1 flex items-end justify-center pb-0.5">
                        {splitRows.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveSplitRow(row.id)}
                            className="text-neutral-400 hover:text-rose-500 text-sm font-bold"
                            title="Remove split"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Allocation balance monitor */}
                <div className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2 text-xs font-medium dark:bg-neutral-800">
                  <span>Total Split Allocated: ₹{totalAllocated.toLocaleString()}</span>
                  <span
                    className={
                      remainingBalance > 0
                        ? 'font-bold text-amber-600 dark:text-amber-400'
                        : 'font-bold text-emerald-600 dark:text-emerald-400'
                    }
                  >
                    {remainingBalance > 0
                      ? `Remaining: ₹${remainingBalance.toLocaleString()}`
                      : '✓ 100% Fully Settled'}
                  </span>
                </div>

                {/* Corporate Ledger Credit Option */}
                <label className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-600 dark:text-neutral-400">
                  <input
                    type="checkbox"
                    checked={allowLedgerCredit}
                    onChange={(e) => setAllowLedgerCredit(e.target.checked)}
                    className="rounded text-amber-600 focus:ring-amber-500"
                  />
                  <span>Permit remaining balance as Corporate / Ledger Credit (BTC Account)</span>
                </label>
              </div>
            )}

            {/* Optional Settlement Notes */}
            <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
              <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                Front Desk Settlement Notes (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Settled in full upon keys handover"
                value={settlementNotes}
                onChange={(e) => setSettlementNotes(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-1.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            {/* Keys returned & Operational Handover */}
            <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-neutral-800 dark:text-neutral-200">
                <input
                  type="checkbox"
                  required
                  checked={keysReturned}
                  onChange={(e) => setKeysReturned(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500 h-4 w-4"
                />
                <span>Physical Room Key(s) / RFID cards returned to front desk *</span>
              </label>
              <p className="text-[11px] text-neutral-500">
                🧹 Checkout automatically marks room <strong>{folio.roomName || 'Unit'}</strong> as{' '}
                <span className="font-semibold text-amber-600 dark:text-amber-400">DIRTY</span> and sends it to the housekeeping queue.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2.5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
              <button
                type="button"
                onClick={onClose}
                disabled={isPending}
                className="rounded-xl border border-neutral-300 px-4 py-2 font-semibold text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isPending ||
                  !keysReturned ||
                  (outstandingBalance > 0 && totalAllocated < outstandingBalance && !allowLedgerCredit)
                }
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-rose-500 disabled:opacity-50"
              >
                <span>🧾</span>
                <span>{isPending ? 'Settling & Checking Out...' : 'Complete Checkout & Generate Invoice'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
