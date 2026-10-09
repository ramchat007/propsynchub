'use client';

import React, { useState, useTransition } from 'react';
import { Booking, Room, GuestIdType, PaymentMethodType } from '@/types';
import { executeCheckIn } from '@/app/actions/front-desk';

interface CheckInModalProps {
  booking: Booking;
  rooms: Room[];
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export default function CheckInModal({
  booking,
  rooms,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: CheckInModalProps) {
  const [isPending, startTransition] = useTransition();

  // Unit selection
  const [selectedRoomId, setSelectedRoomId] = useState<string>(booking.room_id || rooms[0]?.id || '');
  const [roomKeyNumber, setRoomKeyNumber] = useState<string>('');

  // Identity verification state
  const [idType, setIdType] = useState<GuestIdType>('aadhaar');
  const [idNumberInput, setIdNumberInput] = useState<string>('');
  const [holderName, setHolderName] = useState<string>(booking.guest_name);
  const [nationality, setNationality] = useState<string>('Indian');
  const [isForeignGuest, setIsForeignGuest] = useState<boolean>(false);

  // Form C state for foreign guests
  const [passportNumber, setPassportNumber] = useState<string>('');
  const [visaNumber, setVisaNumber] = useState<string>('');
  const [visaValidUntil, setVisaValidUntil] = useState<string>('');
  const [placeOfIssue, setPlaceOfIssue] = useState<string>('');
  const [nextDestination, setNextDestination] = useState<string>('');

  // Security deposit / advance collection
  const pendingBalance = Math.max(0, Number(booking.balance_amount_inr || booking.total_amount_inr || 0));
  const [collectDeposit, setCollectDeposit] = useState<boolean>(false);
  const [depositAmount, setDepositAmount] = useState<string>(pendingBalance > 0 ? pendingBalance.toString() : '2000');
  const [depositMethod, setDepositMethod] = useState<PaymentMethodType>('upi');
  const [depositRef, setDepositRef] = useState<string>('');

  if (!isOpen) return null;

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId);
  const isRoomDirty = selectedRoom?.status === 'dirty' || selectedRoom?.status === 'cleaning';
  const isRoomBlocked = selectedRoom?.status === 'maintenance' || selectedRoom?.status === 'blocked';

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    startTransition(async () => {
      const res = await executeCheckIn({
        tenantId: booking.tenant_id,
        bookingId: booking.id,
        roomId: selectedRoomId,
        roomKeyNumber: roomKeyNumber.trim() || undefined,
        idType,
        idNumber: idNumberInput.trim(),
        holderName: holderName.trim(),
        nationality: isForeignGuest ? nationality : 'Indian',
        isForeignGuest,
        formC: isForeignGuest
          ? {
              passport_number: passportNumber.trim(),
              visa_number: visaNumber.trim(),
              visa_valid_until: visaValidUntil,
              place_of_issue: placeOfIssue.trim() || undefined,
              next_destination: nextDestination.trim() || undefined,
            }
          : undefined,
        depositAmountInr: collectDeposit ? parseFloat(depositAmount) || 0 : 0,
        depositPaymentMethod: depositMethod,
        depositRef: depositRef.trim() || undefined,
      });

      if (res.success) {
        onSuccess(res.message || 'Check-in completed successfully.');
        onClose();
      } else {
        onError(res.error || 'Failed to check in guest.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative my-8 w-full max-w-xl rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-100 pb-4 dark:border-neutral-800">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Front Desk Arrival Operations
            </span>
            <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">
              Check In Guest — #{booking.id.slice(0, 8).toUpperCase()}
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

        {/* Reservation Quick Summary Card */}
        <div className="mt-4 rounded-xl border border-neutral-200/80 bg-neutral-50 p-3.5 text-xs dark:border-neutral-800 dark:bg-neutral-850">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold text-neutral-900 dark:text-neutral-100">{booking.guest_name}</p>
              <p className="text-neutral-500">📞 {booking.guest_mobile_number}</p>
            </div>
            <div className="text-right">
              <p className="font-medium text-neutral-700 dark:text-neutral-300">
                {booking.check_in_date} → {booking.check_out_date}
              </p>
              <p className="text-neutral-500">
                👥 {booking.num_adults} Adults, {booking.num_children} Children
              </p>
            </div>
          </div>
          {pendingBalance > 0 && (
            <div className="mt-2.5 flex items-center justify-between border-t border-neutral-200/60 pt-2 font-medium dark:border-neutral-800">
              <span className="text-amber-700 dark:text-amber-400">Pending Tariff Balance:</span>
              <span className="font-bold text-neutral-900 dark:text-neutral-100">
                ₹{pendingBalance.toLocaleString()}
              </span>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          {/* 1. Unit & Key Assignment */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block font-semibold text-neutral-700 dark:text-neutral-300">
                Assigned Room Unit *
              </label>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                required
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} {r.room_number ? `(#${r.room_number})` : ''} [{r.status.toUpperCase()}]
                  </option>
                ))}
              </select>
              {isRoomDirty && (
                <p className="mt-1 text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                  ⚠️ Unit is currently marked for cleaning. Housekeeping inspection required before guest entry.
                </p>
              )}
              {isRoomBlocked && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">
                  ⛔ Unit is currently blocked or under maintenance. Please assign an available room.
                </p>
              )}
            </div>

            <div>
              <label className="block font-semibold text-neutral-700 dark:text-neutral-300">
                Physical Key / RFID Card #
              </label>
              <input
                type="text"
                placeholder="e.g. Key 101, Card #A4"
                value={roomKeyNumber}
                onChange={(e) => setRoomKeyNumber(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>
          </div>

          {/* 2. Privacy-First Identity Verification */}
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Guest Identity Verification (KYC)</span>
              </h4>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-neutral-600 dark:text-neutral-400">
                <input
                  type="checkbox"
                  checked={isForeignGuest}
                  onChange={(e) => setIsForeignGuest(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>Foreign National (Form C)</span>
              </label>
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300">
                  Document Type *
                </label>
                <select
                  value={idType}
                  onChange={(e) => setIdType(e.target.value as GuestIdType)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                >
                  <option value="aadhaar">Aadhaar (Last 4 Digits Only)</option>
                  <option value="passport">Passport</option>
                  <option value="driving_license">Driving License</option>
                  <option value="voter_id">Voter ID (EPIC)</option>
                  <option value="other">Government Photo ID</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 dark:text-neutral-300">
                  {idType === 'aadhaar' ? 'Aadhaar (Last 4 Digits) *' : 'Document Number *'}
                </label>
                <input
                  type="text"
                  required
                  placeholder={idType === 'aadhaar' ? 'e.g. 4589 or 12 digits' : 'e.g. J1234567'}
                  value={idNumberInput}
                  onChange={(e) => setIdNumberInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>
            </div>

            <div className="mt-2.5">
              <label className="block font-semibold text-neutral-700 dark:text-neutral-300">
                Name on ID Card *
              </label>
              <input
                type="text"
                required
                value={holderName}
                onChange={(e) => setHolderName(e.target.value)}
                className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            {idType === 'aadhaar' && (
              <p className="mt-2 text-[11px] text-neutral-500 leading-normal">
                🔒 <strong>Privacy Mandate:</strong> Only the verified last 4 digits are stored as{' '}
                <code className="font-mono bg-neutral-100 dark:bg-neutral-800 px-1 py-0.5 rounded">•••• •••• XXXX</code>.
                PropSyncHub strictly prevents storing full 12-digit Aadhaar numbers or raw card copies.
              </p>
            )}

            {/* Foreign Guest Form C Fields */}
            {isForeignGuest && (
              <div className="mt-4 space-y-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/20">
                <p className="font-bold text-indigo-900 dark:text-indigo-200">
                  Form C Compliance Particulars (Foreign Nationals)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Nationality *
                    </label>
                    <input
                      type="text"
                      required={isForeignGuest}
                      placeholder="e.g. British, American"
                      value={nationality}
                      onChange={(e) => setNationality(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:bg-neutral-800 dark:border-neutral-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Passport Number *
                    </label>
                    <input
                      type="text"
                      required={isForeignGuest}
                      placeholder="Passport #"
                      value={passportNumber}
                      onChange={(e) => setPassportNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:bg-neutral-800 dark:border-neutral-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Visa / eVisa Number *
                    </label>
                    <input
                      type="text"
                      required={isForeignGuest}
                      placeholder="Visa #"
                      value={visaNumber}
                      onChange={(e) => setVisaNumber(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:bg-neutral-800 dark:border-neutral-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Visa Valid Until *
                    </label>
                    <input
                      type="date"
                      required={isForeignGuest}
                      value={visaValidUntil}
                      onChange={(e) => setVisaValidUntil(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:bg-neutral-800 dark:border-neutral-700"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Place of Issue
                    </label>
                    <input
                      type="text"
                      placeholder="City / Country"
                      value={placeOfIssue}
                      onChange={(e) => setPlaceOfIssue(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:bg-neutral-800 dark:border-neutral-700"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Next Destination
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Mumbai, Goa"
                      value={nextDestination}
                      onChange={(e) => setNextDestination(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-neutral-300 bg-white px-2.5 py-1.5 text-xs dark:bg-neutral-800 dark:border-neutral-700"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 3. Optional Advance / Deposit Payment */}
          <div className="rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-neutral-800 dark:text-neutral-200">
              <input
                type="checkbox"
                checked={collectDeposit}
                onChange={(e) => setCollectDeposit(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-emerald-500"
              />
              <span>Collect Advance / Security Deposit at Check-In</span>
            </label>

            {collectDeposit && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                    Amount (₹) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required={collectDeposit}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                    Payment Mode
                  </label>
                  <select
                    value={depositMethod}
                    onChange={(e) => setDepositMethod(e.target.value as PaymentMethodType)}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  >
                    <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                    <option value="cash">Cash at Counter</option>
                    <option value="credit_card">Card (POS Terminal)</option>
                    <option value="bank_transfer">Direct IMPS/NEFT</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                    Reference / UTR #
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. UTR / Auth Code"
                    value={depositRef}
                    onChange={(e) => setDepositRef(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-2.5 border-t border-neutral-100 pt-4 dark:border-neutral-800">
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
              disabled={isPending || isRoomDirty || isRoomBlocked}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
            >
              <span>🔑</span>
              <span>{isPending ? 'Verifying & Checking In...' : 'Verify ID & Check In'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
