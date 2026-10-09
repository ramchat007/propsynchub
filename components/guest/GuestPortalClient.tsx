'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Tenant,
  Booking,
  Room,
  RoomCategory,
  RestaurantCategory,
  RestaurantItem,
  RestaurantOrder,
  ServiceRequest,
  ServiceRequestCategory,
  ResortActivity,
  ActivityBooking,
  ResortReview,
} from '@/types';
import { AuthoritativeFolioSummary, settleFolioPayment } from '@/app/actions/folio';
import { createRestaurantOrder } from '@/app/actions/restaurant';
import { createServiceRequest } from '@/app/actions/service-requests';
import { bookResortActivity } from '@/app/actions/activities';
import { submitGuestReview } from '@/app/actions/reviews';
import { amountInWords } from '@/lib/tax-engine';

interface GuestPortalClientProps {
  tenant: Tenant;
  tenantParam: string;
  booking: Booking;
  room: Room | null;
  category: RoomCategory | null;
  initialFolio: AuthoritativeFolioSummary;
  menu: {
    categories: RestaurantCategory[];
    items: RestaurantItem[];
  };
  initialOrders: RestaurantOrder[];
  initialRequests: ServiceRequest[];
  activities: ResortActivity[];
  initialActivityBookings: ActivityBooking[];
  initialReviews: ResortReview[];
}

type TabType = 'overview' | 'folio' | 'dining' | 'services' | 'activities' | 'review';
type DocumentType = 'voucher' | 'receipt' | 'invoice' | 'bill' | null;

export default function GuestPortalClient({
  tenant,
  tenantParam,
  booking,
  room,
  category,
  initialFolio,
  menu,
  initialOrders,
  initialRequests,
  activities,
  initialActivityBookings,
  initialReviews,
}: GuestPortalClientProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [folio, setFolio] = useState<AuthoritativeFolioSummary>(initialFolio);
  const [orders, setOrders] = useState<RestaurantOrder[]>(initialOrders);
  const [requests, setRequests] = useState<ServiceRequest[]>(initialRequests);
  const [activityBookings, setActivityBookings] = useState<ActivityBooking[]>(initialActivityBookings);
  const [reviews, setReviews] = useState<ResortReview[]>(initialReviews);

  // Folio Settlement State
  const [isSettling, setIsSettling] = useState(false);
  const [settleMode, setSettleMode] = useState<'razorpay' | 'upi' | 'credit_card'>('razorpay');
  const [settleSuccessMsg, setSettleSuccessMsg] = useState<string | null>(null);

  // Document Viewer Modal State
  const [activeDoc, setActiveDoc] = useState<DocumentType>(null);

  // Dining Cart State
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selectedMenuCategory, setSelectedMenuCategory] = useState<string>('all');
  const [vegOnly, setVegOnly] = useState(false);
  const [diningServiceType, setDiningServiceType] = useState<'room_delivery' | 'dining'>('room_delivery');
  const [diningPaymentMethod, setDiningPaymentMethod] = useState<'room_folio' | 'pay_at_restaurant'>('room_folio');
  const [orderNotes, setOrderNotes] = useState('');
  const [isPlacingOrder, setIsPlacingOrder] = useState(false);

  // Service Request State
  const [newRequestCategory, setNewRequestCategory] = useState<ServiceRequestCategory>('housekeeping');
  const [newRequestTitle, setNewRequestTitle] = useState('');
  const [newRequestDesc, setNewRequestDesc] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Activity Booking State
  const [selectedActivity, setSelectedActivity] = useState<ResortActivity | null>(null);
  const [actParticipants, setActParticipants] = useState(1);
  const [actDate, setActDate] = useState(booking.check_in_date);
  const [actChargeToFolio, setActChargeToFolio] = useState(true);
  const [isBookingAct, setIsBookingAct] = useState(false);

  // Review State
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState('');
  const [isSubmittingReview, setIsSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  // Change / Cancellation Request Modal
  const [showCancellationModal, setShowCancellationModal] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [cancellationSent, setCancellationSent] = useState(false);

  // -------------------------------------------------------------
  // HANDLERS
  // -------------------------------------------------------------

  // Settle Outstanding Balance
  const handleSettleBalance = async () => {
    if (folio.outstandingBalanceInr <= 0) return;
    setIsSettling(true);
    const res = await settleFolioPayment(tenant.id, booking.id, {
      amountInr: folio.outstandingBalanceInr,
      paymentMode: settleMode,
      transactionRef: `RZP_TEST_${Date.now().toString(36).toUpperCase()}`,
    });

    if (res.success) {
      setFolio((prev) => ({
        ...prev,
        paidAmountInr: prev.grandTotalInr,
        outstandingBalanceInr: 0,
        paymentStatus: 'paid',
        isFullySettled: true,
      }));
      setSettleSuccessMsg(res.message || 'Balance settled successfully!');
    } else {
      alert(res.error || 'Failed to settle balance');
    }
    setIsSettling(false);
  };

  // Cart Functions
  const addToCart = (itemId: string) => {
    setCart((prev) => ({ ...prev, [itemId]: (prev[itemId] || 0) + 1 }));
  };

  const removeFromCart = (itemId: string) => {
    setCart((prev) => {
      const copy = { ...prev };
      if (copy[itemId] > 1) copy[itemId] -= 1;
      else delete copy[itemId];
      return copy;
    });
  };

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => {
      const item = menu.items.find((i) => i.id === id);
      return item ? { ...item, quantity: qty } : null;
    })
    .filter(Boolean) as (RestaurantItem & { quantity: number })[];

  const cartSubtotal = cartItems.reduce((acc, item) => acc + item.price_inr * item.quantity, 0);

  const handlePlaceOrder = async () => {
    if (cartItems.length === 0) return;
    setIsPlacingOrder(true);

    const res = await createRestaurantOrder(tenant.id, {
      booking_id: booking.id,
      guest_name: booking.guest_name,
      guest_room: room?.room_number || room?.name || 'Assigned Room',
      guest_phone: booking.guest_mobile_number,
      service_type: diningServiceType,
      items: cartItems.map((ci) => ({
        item_id: ci.id,
        name: ci.name,
        price_inr: ci.price_inr,
        quantity: ci.quantity,
      })),
      payment_method: diningPaymentMethod,
      notes: orderNotes.trim() || undefined,
    });

    if (res.success && res.data) {
      setOrders((prev) => [res.data!, ...prev]);
      setCart({});
      setOrderNotes('');
      alert(res.message || 'Order placed successfully!');
      // If charged to folio, update folio charges
      if (diningPaymentMethod === 'room_folio') {
        setFolio((prev) => ({
          ...prev,
          incidentalsTotalInr: prev.incidentalsTotalInr + res.data!.total_inr,
          grandTotalInr: prev.grandTotalInr + res.data!.total_inr,
          outstandingBalanceInr: prev.outstandingBalanceInr + res.data!.total_inr,
          isFullySettled: false,
        }));
      }
    } else {
      alert(res.error || 'Failed to place order');
    }
    setIsPlacingOrder(false);
  };

  // Submit Service Request
  const handleSubmitServiceRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRequestTitle.trim()) return;
    setIsSubmittingRequest(true);

    const res = await createServiceRequest(tenant.id, {
      booking_id: booking.id,
      guest_name: booking.guest_name,
      room_number: room?.room_number || room?.name,
      category: newRequestCategory,
      title: newRequestTitle.trim(),
      description: newRequestDesc.trim() || undefined,
    });

    if (res.success && res.data) {
      setRequests((prev) => [res.data!, ...prev]);
      setNewRequestTitle('');
      setNewRequestDesc('');
      alert(res.message || 'Service request submitted!');
    } else {
      alert(res.error || 'Failed to submit request');
    }
    setIsSubmittingRequest(false);
  };

  // Book Activity
  const handleBookActivitySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedActivity) return;
    setIsBookingAct(true);

    const res = await bookResortActivity(tenant.id, {
      booking_id: booking.id,
      activity_id: selectedActivity.id,
      activity_title: selectedActivity.title,
      guest_name: booking.guest_name,
      participants: actParticipants,
      scheduled_date: actDate,
      unit_price_inr: selectedActivity.price_inr,
      charge_to_folio: actChargeToFolio,
    });

    if (res.success && res.data) {
      setActivityBookings((prev) => [res.data!, ...prev]);
      if (actChargeToFolio) {
        setFolio((prev) => ({
          ...prev,
          incidentalsTotalInr: prev.incidentalsTotalInr + res.data!.total_amount_inr,
          grandTotalInr: prev.grandTotalInr + res.data!.total_amount_inr,
          outstandingBalanceInr: prev.outstandingBalanceInr + res.data!.total_amount_inr,
          isFullySettled: false,
        }));
      }
      setSelectedActivity(null);
      alert(res.message || 'Experience booked successfully!');
    } else {
      alert(res.error || 'Failed to book activity');
    }
    setIsBookingAct(false);
  };

  // Submit Stay Review
  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reviewComment.trim()) return;
    setIsSubmittingReview(true);

    const res = await submitGuestReview(tenant.id, {
      booking_id: booking.id,
      guest_name: booking.guest_name,
      rating: reviewRating,
      comment: reviewComment.trim(),
    });

    if (res.success && res.data) {
      setReviews((prev) => [res.data!, ...prev]);
      setReviewSubmitted(true);
      alert(res.message || 'Thank you for your feedback!');
    } else {
      alert(res.error || 'Failed to submit review');
    }
    setIsSubmittingReview(false);
  };

  // Submit Cancellation Request
  const handleCancellationRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancellationReason.trim()) return;
    // Log service request to front desk
    await createServiceRequest(tenant.id, {
      booking_id: booking.id,
      guest_name: booking.guest_name,
      room_number: room?.room_number || room?.name,
      category: 'concierge',
      title: `Reservation Modification / Cancellation Request`,
      description: cancellationReason.trim(),
    });
    setCancellationSent(true);
  };

  const filteredMenuItems = menu.items.filter((item) => {
    const matchesCat =
      selectedMenuCategory === 'all' || item.category_name === selectedMenuCategory;
    const matchesVeg = !vegOnly || item.is_veg;
    return matchesCat && matchesVeg;
  });

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased dark:bg-neutral-950 dark:text-neutral-100 py-8 px-4 sm:px-6">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Top Breadcrumb */}
        <div className="flex items-center justify-between text-xs">
          <Link
            href={`/${tenantParam}`}
            className="inline-flex items-center gap-1.5 font-bold text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"
          >
            <span>← Back to {tenant.name}</span>
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-mono text-stone-400">GUEST FOLIO &amp; PORTAL</span>
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          </div>
        </div>

        {/* Hero Header Card */}
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          <div
            className={`p-6 sm:p-8 text-white ${
              booking.booking_status === 'cancelled'
                ? 'bg-gradient-to-r from-rose-800 to-red-900'
                : 'bg-gradient-to-r from-emerald-800 via-teal-800 to-stone-900'
            }`}
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="inline-block px-3 py-1 rounded-full bg-white/15 text-[10px] font-black uppercase tracking-wider backdrop-blur-md">
                  Reservation Reference: #{folio.bookingRef}
                </span>
                <h1 className="mt-2 text-2xl sm:text-3xl font-black tracking-tight">{tenant.name}</h1>
                <p className="mt-1 text-xs text-white/80">
                  Welcome, <strong className="text-white">{booking.guest_name}</strong> •{' '}
                  {category?.name || room?.room_type || 'Reserved Accommodation'}
                </p>
              </div>

              <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 text-xs">
                <span
                  className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                    booking.booking_status === 'cancelled'
                      ? 'bg-rose-500 text-white'
                      : booking.booking_status === 'confirmed'
                      ? 'bg-emerald-500 text-white'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  ● {booking.booking_status}
                </span>

                <span
                  className={`px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider ${
                    folio.isFullySettled
                      ? 'bg-white text-emerald-900'
                      : 'bg-amber-400 text-stone-900'
                  }`}
                >
                  {folio.isFullySettled ? '✓ Folio Fully Settled' : `Pending ₹${folio.outstandingBalanceInr.toLocaleString()}`}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex overflow-x-auto border-b border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-900 px-4">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'overview'
                  ? 'border-emerald-600 text-stone-950 dark:text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              🛎️ Stay &amp; Check-In
            </button>
            <button
              onClick={() => setActiveTab('folio')}
              className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'folio'
                  ? 'border-emerald-600 text-stone-950 dark:text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              💳 Folio &amp; Documents
            </button>
            <button
              onClick={() => setActiveTab('dining')}
              className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'dining'
                  ? 'border-emerald-600 text-stone-950 dark:text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              🍽️ Room Dining ({orders.length})
            </button>
            <button
              onClick={() => setActiveTab('services')}
              className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'services'
                  ? 'border-emerald-600 text-stone-950 dark:text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              🧰 Guest Services ({requests.length})
            </button>
            <button
              onClick={() => setActiveTab('activities')}
              className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'activities'
                  ? 'border-emerald-600 text-stone-950 dark:text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              🌴 Experiences ({activityBookings.length})
            </button>
            <button
              onClick={() => setActiveTab('review')}
              className={`py-3.5 px-4 text-xs font-bold whitespace-nowrap transition-all border-b-2 ${
                activeTab === 'review'
                  ? 'border-emerald-600 text-stone-950 dark:text-white'
                  : 'border-transparent text-stone-500 hover:text-stone-900 dark:hover:text-white'
              }`}
            >
              ⭐ Review
            </button>
          </div>

          {/* TAB 1: OVERVIEW & STAY */}
          {activeTab === 'overview' && (
            <div className="p-6 sm:p-8 space-y-6">
              {/* Primary Stay Card */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-stone-50/70 dark:bg-neutral-850 space-y-2 text-xs">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    Stay Schedule
                  </span>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Check-In Date:</span>
                    <span className="font-bold text-stone-900 dark:text-white">{booking.check_in_date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Check-Out Date:</span>
                    <span className="font-bold text-stone-900 dark:text-white">{booking.check_out_date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Duration:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {folio.nights} {folio.nights === 1 ? 'Night' : 'Nights'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Guests:</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">
                      {booking.num_adults} Adults{booking.num_children > 0 ? `, ${booking.num_children} Children` : ''}
                    </span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-stone-50/70 dark:bg-neutral-850 space-y-2 text-xs">
                  <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider block">
                    Accommodation Details
                  </span>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Category:</span>
                    <span className="font-bold text-stone-900 dark:text-white">
                      {category?.name || room?.room_type || 'Reserved Category'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Assigned Unit:</span>
                    <span className="font-bold text-emerald-700 dark:text-emerald-400">
                      {room ? `${room.name} (#${room.room_number || room.name})` : 'Assigned Upon Check-In'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-stone-500">Guest Mobile:</span>
                    <span className="font-semibold text-stone-800 dark:text-stone-200">
                      {booking.guest_mobile_number}
                    </span>
                  </div>
                  {booking.guest_email && (
                    <div className="flex justify-between">
                      <span className="text-stone-500">Guest Email:</span>
                      <span className="font-semibold text-stone-800 dark:text-stone-200">
                        {booking.guest_email}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Check-In Instructions */}
              <div className="rounded-2xl border border-stone-200 bg-white p-5 text-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-2">
                <p className="font-extrabold text-sm text-stone-900 dark:text-white">🛎️ Check-in Information &amp; Policies</p>
                <p className="text-stone-600 dark:text-stone-300 leading-relaxed">
                  • <strong>Check-In Time:</strong> 2:00 PM onwards. Early check-in is subject to room readiness.<br />
                  • <strong>Check-Out Time:</strong> 11:00 AM strictly to allow thorough sanitization.<br />
                  • <strong>Government Photo ID:</strong> All adult guests must present valid Aadhaar, Passport, or Driving License upon arrival.<br />
                  • <strong>Resort Contact:</strong> Front Desk is reachable 24/7 at <strong>{tenant.contact_phone || '+91 98000 00000'}</strong>.
                </p>
              </div>

              {/* Modify / Cancel Request */}
              <div className="flex justify-between items-center pt-2">
                <button
                  onClick={() => setShowCancellationModal(true)}
                  className="text-xs font-bold text-rose-700 hover:text-rose-800 dark:text-rose-400 hover:underline"
                >
                  Request Date Change or Cancellation →
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: FOLIO, BALANCE SETTLEMENT & PRINTABLE DOCUMENTS */}
          {activeTab === 'folio' && (
            <div className="p-6 sm:p-8 space-y-6">
              {settleSuccessMsg && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                  ✓ {settleSuccessMsg}
                </div>
              )}

              {/* Folio Breakdown Table */}
              <div className="rounded-2xl border border-stone-200 dark:border-neutral-800 overflow-hidden">
                <div className="bg-stone-100 dark:bg-neutral-800 px-4 py-3 text-xs font-black uppercase tracking-wider text-stone-700 dark:text-stone-300">
                  Itemized Guest Folio &amp; Charges
                </div>
                <div className="p-4 divide-y divide-stone-100 dark:divide-neutral-800 text-xs">
                  {/* Room Charge */}
                  <div className="py-2.5 flex justify-between">
                    <div>
                      <span className="font-bold text-stone-900 dark:text-white">
                        Accommodation ({folio.nights} Nights - {folio.categoryName || 'Room'})
                      </span>
                      <p className="text-[11px] text-stone-400">
                        {booking.check_in_date} to {booking.check_out_date}
                      </p>
                    </div>
                    <span className="font-bold text-stone-900 dark:text-white">
                      ₹{folio.roomChargeInr.toLocaleString()}
                    </span>
                  </div>

                  {/* Meal Plan Supplement if selected */}
                  {folio.mealPlanChargeInr && folio.mealPlanChargeInr > 0 ? (
                    <div className="py-2.5 flex justify-between border-b border-stone-100 dark:border-neutral-800">
                      <div>
                        <span className="font-bold text-emerald-800 dark:text-emerald-300">
                          Meal Plan Supplement ({folio.mealPlanCode} - {folio.mealPlanName || 'Dining'})
                        </span>
                        <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                          Restaurant &amp; Dining SAC: 996331
                        </p>
                      </div>
                      <span className="font-bold text-emerald-800 dark:text-emerald-300">
                        ₹{folio.mealPlanChargeInr.toLocaleString()}
                      </span>
                    </div>
                  ) : null}

                  {/* Incidental Charges */}
                  {folio.incidentals.map((inc, idx) => (
                    <div key={idx} className="py-2.5 flex justify-between">
                      <div>
                        <span className="font-bold text-stone-800 dark:text-stone-200">{inc.item_name}</span>
                        <p className="text-[11px] text-stone-400">
                          Category: {inc.category.toUpperCase()} • Qty: {inc.quantity}
                        </p>
                      </div>
                      <span className="font-bold text-stone-800 dark:text-stone-200">
                        ₹{(inc.amount_inr * inc.quantity).toLocaleString()}
                      </span>
                    </div>
                  ))}

                  {/* Subtotal & Taxes */}
                  <div className="pt-3 pb-2 flex justify-between font-bold text-stone-500">
                    <span>Tax Inclusive Grand Total</span>
                    <span className="text-stone-900 dark:text-white font-extrabold text-sm">
                      ₹{folio.grandTotalInr.toLocaleString()}
                    </span>
                  </div>

                  <div className="py-2 flex justify-between text-emerald-600 dark:text-emerald-400 font-bold">
                    <span>Payments Applied</span>
                    <span>- ₹{folio.paidAmountInr.toLocaleString()}</span>
                  </div>

                  {/* Outstanding Balance */}
                  <div className="pt-3 flex justify-between text-base font-black border-t border-stone-200 dark:border-neutral-700">
                    <span className={folio.outstandingBalanceInr > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                      {folio.outstandingBalanceInr > 0 ? 'Outstanding Balance Due' : 'Balance Settled'}
                    </span>
                    <span className={folio.outstandingBalanceInr > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                      ₹{folio.outstandingBalanceInr.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>

              {/* Settle Balance Section */}
              {folio.outstandingBalanceInr > 0 && (
                <div className="p-5 rounded-2xl border border-amber-200 bg-amber-50/70 dark:border-amber-900/50 dark:bg-amber-950/20 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-sm font-black text-amber-950 dark:text-amber-100">
                        Settle Pending Folio Balance
                      </h4>
                      <p className="text-xs text-amber-800/90 dark:text-amber-300/90 mt-0.5">
                        Amount to settle: <strong>₹{folio.outstandingBalanceInr.toLocaleString()}</strong>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <select
                        value={settleMode}
                        onChange={(e) => setSettleMode(e.target.value as 'razorpay' | 'upi' | 'credit_card')}
                        className="px-2.5 py-1.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-white dark:bg-neutral-900 text-xs font-bold"
                      >
                        <option value="razorpay">Razorpay Test Gateway</option>
                        <option value="upi">UPI Instant</option>
                        <option value="credit_card">Card Payment</option>
                      </select>

                      <button
                        disabled={isSettling}
                        onClick={handleSettleBalance}
                        className="px-4 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                      >
                        {isSettling ? 'Processing...' : 'Pay Balance Now →'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Official Printable Documents Hub */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-extrabold text-stone-400 uppercase tracking-wider">
                  Download / Print Official Documents
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <button
                    onClick={() => setActiveDoc('voucher')}
                    className="p-3 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500 text-left transition"
                  >
                    <span className="text-xl block">📄</span>
                    <span className="text-xs font-bold text-stone-900 dark:text-white block mt-1">
                      Confirmation Voucher
                    </span>
                    <span className="text-[10px] text-stone-400">Official check-in pass</span>
                  </button>

                  <button
                    onClick={() => setActiveDoc('receipt')}
                    className="p-3 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500 text-left transition"
                  >
                    <span className="text-xl block">🧾</span>
                    <span className="text-xs font-bold text-stone-900 dark:text-white block mt-1">
                      Payment Receipt
                    </span>
                    <span className="text-[10px] text-stone-400">Proof of payment</span>
                  </button>

                  <button
                    onClick={() => setActiveDoc('invoice')}
                    className="p-3 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500 text-left transition"
                  >
                    <span className="text-xl block">🏢</span>
                    <span className="text-xs font-bold text-stone-900 dark:text-white block mt-1">
                      GST Tax Invoice
                    </span>
                    <span className="text-[10px] text-stone-400">Itemized tax bill</span>
                  </button>

                  <button
                    onClick={() => setActiveDoc('bill')}
                    className="p-3 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500 text-left transition"
                  >
                    <span className="text-xl block">📋</span>
                    <span className="text-xs font-bold text-stone-900 dark:text-white block mt-1">
                      Final Checkout Bill
                    </span>
                    <span className="text-[10px] text-stone-400">Settlement summary</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: IN-ROOM DINING & RESTAURANT */}
          {activeTab === 'dining' && (
            <div className="p-6 sm:p-8 space-y-6">
              {/* Category Filter & Veg Toggle */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setSelectedMenuCategory('all')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      selectedMenuCategory === 'all'
                        ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                        : 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-stone-300'
                    }`}
                  >
                    All Items
                  </button>
                  {menu.categories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setSelectedMenuCategory(c.name)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                        selectedMenuCategory === c.name
                          ? 'bg-stone-900 text-white dark:bg-white dark:text-stone-900'
                          : 'bg-stone-100 text-stone-600 dark:bg-neutral-800 dark:text-stone-300'
                      }`}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>

                <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={vegOnly}
                    onChange={(e) => setVegOnly(e.target.checked)}
                    className="rounded text-emerald-600"
                  />
                  <span>Pure Veg Only</span>
                </label>
              </div>

              {/* Menu & Cart Split View */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Menu Items List */}
                <div className="lg:col-span-2 space-y-3">
                  {filteredMenuItems.map((item) => {
                    const inCartQty = cart[item.id] || 0;
                    return (
                      <div
                        key={item.id}
                        className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center gap-4"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`w-2 h-2 rounded-full inline-block ${
                                item.is_veg ? 'bg-emerald-500' : 'bg-rose-500'
                              }`}
                            />
                            <span className="text-[10px] font-bold uppercase text-stone-400">
                              {item.category_name}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-stone-900 dark:text-white">{item.name}</h4>
                          {item.description && (
                            <p className="text-xs text-stone-500 leading-relaxed">{item.description}</p>
                          )}
                          <p className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                            ₹{item.price_inr}
                          </p>
                        </div>

                        {/* Cart Controller */}
                        <div className="flex items-center gap-2">
                          {inCartQty > 0 ? (
                            <div className="flex items-center gap-2 bg-emerald-50 dark:bg-emerald-950/40 p-1 rounded-xl border border-emerald-200 dark:border-emerald-800">
                              <button
                                onClick={() => removeFromCart(item.id)}
                                className="w-7 h-7 rounded-lg bg-white dark:bg-neutral-800 font-bold text-stone-700 dark:text-stone-200 flex items-center justify-center shadow-2xs"
                              >
                                -
                              </button>
                              <span className="w-5 text-center text-xs font-black text-emerald-800 dark:text-emerald-300">
                                {inCartQty}
                              </span>
                              <button
                                onClick={() => addToCart(item.id)}
                                className="w-7 h-7 rounded-lg bg-emerald-600 font-bold text-white flex items-center justify-center shadow-2xs"
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(item.id)}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition shadow-2xs"
                            >
                              + Add
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Cart & Checkout Panel */}
                <div className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-stone-50/70 dark:bg-neutral-900 space-y-4 h-fit">
                  <h3 className="text-sm font-black text-stone-900 dark:text-white">Your Dining Tray</h3>

                  {cartItems.length === 0 ? (
                    <p className="text-xs text-stone-400 py-6 text-center">Your tray is empty.</p>
                  ) : (
                    <>
                      <div className="divide-y divide-stone-200 dark:divide-neutral-800 text-xs">
                        {cartItems.map((ci) => (
                          <div key={ci.id} className="py-2 flex justify-between">
                            <span>
                              {ci.name} x{ci.quantity}
                            </span>
                            <span className="font-bold">₹{ci.price_inr * ci.quantity}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-stone-200 dark:border-neutral-800 flex justify-between font-black text-sm">
                        <span>Total (Incl. Tax)</span>
                        <span className="text-emerald-600">
                          ₹{(cartSubtotal + Math.round(cartSubtotal * 0.05)).toLocaleString()}
                        </span>
                      </div>

                      <div className="space-y-2 text-xs">
                        <div>
                          <label className="block text-stone-500 font-semibold mb-1">Service Type</label>
                          <select
                            value={diningServiceType}
                            onChange={(e) => setDiningServiceType(e.target.value as 'room_delivery' | 'dining')}
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 font-semibold"
                          >
                            <option value="room_delivery">Room Delivery (Unit: {room?.room_number || 'Room'})</option>
                            <option value="dining">Dine-in at Restaurant</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-stone-500 font-semibold mb-1">Payment Method</label>
                          <select
                            value={diningPaymentMethod}
                            onChange={(e) => setDiningPaymentMethod(e.target.value as 'room_folio' | 'pay_at_restaurant')}
                            className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 font-semibold"
                          >
                            <option value="room_folio">Charge to Room Folio (Pay at Checkout)</option>
                            <option value="pay_at_restaurant">Pay Directly to Attendant</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-stone-500 font-semibold mb-1">Special Instructions</label>
                          <input
                            type="text"
                            placeholder="e.g. Less spicy, extra lemon..."
                            value={orderNotes}
                            onChange={(e) => setOrderNotes(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-xs"
                          />
                        </div>

                        <button
                          disabled={isPlacingOrder}
                          onClick={handlePlaceOrder}
                          className="w-full py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50 mt-2"
                        >
                          {isPlacingOrder ? 'Sending to Kitchen...' : 'Confirm Order →'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Active Orders Tracker */}
              {orders.length > 0 && (
                <div className="pt-6 border-t border-stone-200 dark:border-neutral-800 space-y-3">
                  <h3 className="text-sm font-black text-stone-900 dark:text-white">Active Order Tracking</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {orders.map((ord) => (
                      <div
                        key={ord.id}
                        className="p-4 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 space-y-2 text-xs"
                      >
                        <div className="flex justify-between items-center">
                          <span className="font-mono font-bold text-stone-400">#{ord.order_number}</span>
                          <span className="px-2 py-0.5 rounded-full font-black text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                            ● {ord.status}
                          </span>
                        </div>
                        <p className="font-semibold text-stone-700 dark:text-stone-300">
                          {ord.items.map((i) => `${i.name} x${i.quantity}`).join(', ')}
                        </p>
                        <div className="flex justify-between pt-1 border-t border-stone-100 dark:border-neutral-800 text-stone-500">
                          <span>Billing: {ord.payment_method === 'room_folio' ? 'Room Folio' : 'Cash'}</span>
                          <span className="font-bold text-stone-900 dark:text-white">₹{ord.total_inr}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 4: GUEST SERVICES & HOUSEKEEPING */}
          {activeTab === 'services' && (
            <div className="p-6 sm:p-8 space-y-6">
              {/* Quick Actions Bar */}
              <div>
                <h3 className="text-xs font-extrabold text-stone-400 uppercase tracking-wider mb-3">
                  Quick Service Requests
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {[
                    { cat: 'housekeeping' as const, label: 'Room Cleaning', icon: '🧹' },
                    { cat: 'extra_towels' as const, label: 'Fresh Towels', icon: '🧖' },
                    { cat: 'extra_bed' as const, label: 'Extra Bed / Pillow', icon: '🛏️' },
                    { cat: 'maintenance' as const, label: 'AC / Tech Support', icon: '🔧' },
                  ].map((btn) => (
                    <button
                      key={btn.cat}
                      onClick={() => {
                        setNewRequestCategory(btn.cat);
                        setNewRequestTitle(`Request for ${btn.label}`);
                      }}
                      className="p-3 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 hover:border-emerald-500 text-left transition flex items-center gap-2.5"
                    >
                      <span className="text-xl">{btn.icon}</span>
                      <span className="text-xs font-bold text-stone-900 dark:text-white">{btn.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Service Request Form */}
              <form
                onSubmit={handleSubmitServiceRequest}
                className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-stone-50/70 dark:bg-neutral-900 space-y-3 text-xs"
              >
                <h4 className="text-sm font-black text-stone-900 dark:text-white">Submit Custom Service Request</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-stone-500 font-semibold mb-1">Category</label>
                    <select
                      value={newRequestCategory}
                      onChange={(e) => setNewRequestCategory(e.target.value as ServiceRequestCategory)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800"
                    >
                      <option value="housekeeping">Housekeeping / Cleaning</option>
                      <option value="extra_towels">Extra Towels &amp; Toiletries</option>
                      <option value="extra_bed">Extra Bed / Linens</option>
                      <option value="maintenance">Maintenance (AC / Plumbing / WiFi)</option>
                      <option value="concierge">Luggage &amp; Concierge Assistance</option>
                      <option value="other">Other Inquiries</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-stone-500 font-semibold mb-1">Request Title</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Please bring two pool towels"
                      value={newRequestTitle}
                      onChange={(e) => setNewRequestTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-stone-500 font-semibold mb-1">Additional Notes</label>
                  <textarea
                    rows={2}
                    placeholder="Specific timing, preferred delivery instructions..."
                    value={newRequestDesc}
                    onChange={(e) => setNewRequestDesc(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingRequest}
                  className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                >
                  {isSubmittingRequest ? 'Submitting...' : 'Dispatch Request to Front Desk →'}
                </button>
              </form>

              {/* Service Requests Tracker */}
              {requests.length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-xs font-extrabold text-stone-400 uppercase tracking-wider">
                    Your Active Requests
                  </h4>
                  <div className="space-y-2">
                    {requests.map((r) => (
                      <div
                        key={r.id}
                        className="p-3.5 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-stone-900 dark:text-white">{r.title}</span>
                          {r.description && <p className="text-[11px] text-stone-400 mt-0.5">{r.description}</p>}
                        </div>
                        <span className="px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                          ● {r.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 5: RESORT ACTIVITIES & EXPERIENCES */}
          {activeTab === 'activities' && (
            <div className="p-6 sm:p-8 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {activities.map((act) => (
                  <div
                    key={act.id}
                    className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 shadow-sm flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <h4 className="text-base font-black text-stone-900 dark:text-white">{act.title}</h4>
                        <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                          ₹{act.price_inr}
                        </span>
                      </div>
                      <p className="mt-2 text-xs text-stone-500 leading-relaxed">{act.description}</p>
                      <div className="mt-3 flex gap-3 text-[11px] text-stone-400">
                        <span>⏱️ {act.duration_minutes} Mins</span>
                        {act.timing && <span>📅 {act.timing}</span>}
                      </div>
                    </div>

                    <div className="mt-5 pt-3 border-t border-stone-100 dark:border-neutral-800">
                      <button
                        onClick={() => setSelectedActivity(act)}
                        className="w-full py-2 rounded-xl text-xs font-black bg-stone-900 dark:bg-white text-white dark:text-stone-900 hover:bg-stone-800 dark:hover:bg-stone-100 transition"
                      >
                        Book Experience →
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Booked Activities List */}
              {activityBookings.length > 0 && (
                <div className="pt-6 border-t border-stone-200 dark:border-neutral-800 space-y-3">
                  <h4 className="text-xs font-extrabold text-stone-400 uppercase tracking-wider">
                    Your Scheduled Experiences
                  </h4>
                  <div className="space-y-2">
                    {activityBookings.map((b) => (
                      <div
                        key={b.id}
                        className="p-3.5 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 flex justify-between items-center text-xs"
                      >
                        <div>
                          <span className="font-bold text-stone-900 dark:text-white">{b.activity_title}</span>
                          <p className="text-[11px] text-stone-400">
                            {b.participants} Pax • Date: {b.scheduled_date} •{' '}
                            {b.charged_to_folio ? 'Room Folio' : 'Direct'}
                          </p>
                        </div>
                        <span className="font-black text-emerald-600">₹{b.total_amount_inr}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Activity Booking Modal */}
              {selectedActivity && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
                  <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4">
                    <h3 className="text-base font-black text-stone-900 dark:text-white">
                      Book {selectedActivity.title}
                    </h3>
                    <form onSubmit={handleBookActivitySubmit} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-stone-500 font-semibold mb-1">Scheduled Date</label>
                        <input
                          type="date"
                          required
                          value={actDate}
                          onChange={(e) => setActDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800"
                        />
                      </div>

                      <div>
                        <label className="block text-stone-500 font-semibold mb-1">Participants</label>
                        <input
                          type="number"
                          min="1"
                          max={selectedActivity.max_participants || 10}
                          value={actParticipants}
                          onChange={(e) => setActParticipants(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800"
                        />
                      </div>

                      <div className="pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={actChargeToFolio}
                            onChange={(e) => setActChargeToFolio(e.target.checked)}
                            className="rounded text-emerald-600"
                          />
                          <span className="font-semibold text-stone-700 dark:text-stone-300">
                            Charge directly to my Room Folio (Pay upon checkout)
                          </span>
                        </label>
                      </div>

                      <div className="pt-2 flex justify-between items-center border-t border-stone-100 dark:border-neutral-800">
                        <div>
                          <span className="text-[10px] text-stone-400 block uppercase">Total</span>
                          <span className="text-base font-black text-emerald-600">
                            ₹{(selectedActivity.price_inr * actParticipants).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedActivity(null)}
                            className="px-3.5 py-2 rounded-xl font-bold bg-stone-100 hover:bg-stone-200 dark:bg-neutral-800 text-stone-700 dark:text-stone-300"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={isBookingAct}
                            className="px-4 py-2 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                          >
                            {isBookingAct ? 'Booking...' : 'Confirm Reservation'}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: STAY REVIEW & FEEDBACK */}
          {activeTab === 'review' && (
            <div className="p-6 sm:p-8 space-y-6">
              {reviewSubmitted ? (
                <div className="p-8 text-center rounded-2xl border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300 space-y-2">
                  <span className="text-3xl">⭐</span>
                  <h3 className="text-base font-black">Thank You for Your Feedback!</h3>
                  <p className="text-xs">
                    Your verified completed stay review has been recorded. It helps us continually elevate our resort hospitality.
                  </p>
                </div>
              ) : booking.booking_status !== 'checked_out' ? (
                <div className="p-6 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-900/60 text-center space-y-3">
                  <span className="text-3xl block">🛎️</span>
                  <h3 className="text-base font-black text-stone-900 dark:text-white">
                    Verified Stay Review Unlocks at Checkout
                  </h3>
                  <p className="text-xs text-stone-500 max-w-md mx-auto leading-relaxed">
                    To maintain 100% authentic guest ratings, reviews can only be submitted after your stay has completed. If you need anything during your visit, our team is ready to help via <strong>Guest Services</strong> or <strong>In-Room Dining</strong>!
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={handleSubmitReview}
                  className="p-5 rounded-2xl border border-stone-200 dark:border-neutral-800 bg-stone-50/70 dark:bg-neutral-900 space-y-4 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-black text-stone-900 dark:text-white">
                        Rate Your Completed Stay
                      </h3>
                      <p className="text-xs text-stone-500 mt-0.5">
                        Stay: {booking.check_in_date} to {booking.check_out_date} · {room?.name || 'Resort Stay'}
                      </p>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      ✓ Verified Guest
                    </span>
                  </div>

                  {/* Star Rating Selector */}
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setReviewRating(star)}
                        className={`text-2xl transition ${
                          star <= reviewRating ? 'text-amber-400 scale-110' : 'text-stone-300 dark:text-neutral-700'
                        }`}
                      >
                        ★
                      </button>
                    ))}
                    <span className="ml-2 font-bold text-stone-700 dark:text-stone-300 text-sm">
                      {reviewRating} of 5 Stars
                    </span>
                  </div>

                  <div>
                    <label className="block text-stone-500 font-semibold mb-1">Your Feedback &amp; Review</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Share what you enjoyed most about the resort, rooms, food, and hospitality..."
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-white dark:bg-neutral-800 text-xs"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmittingReview}
                    className="px-5 py-2.5 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-700 text-white transition disabled:opacity-50"
                  >
                    {isSubmittingReview ? 'Submitting...' : 'Submit Verified Stay Review →'}
                  </button>
                </form>
              )}

              {/* Verified Reviews Section */}
              {reviews.length > 0 && (
                <div className="pt-4 border-t border-stone-200 dark:border-neutral-800 space-y-2">
                  <h4 className="text-xs font-bold text-stone-500 uppercase tracking-wider">
                    Recent Verified Guest Reviews ({reviews.length})
                  </h4>
                  <div className="space-y-2">
                    {reviews.slice(0, 3).map((r) => (
                      <div
                        key={r.id}
                        className="p-3 rounded-xl bg-white dark:bg-neutral-900 border border-stone-100 dark:border-neutral-800 text-xs"
                      >
                        <div className="flex justify-between font-bold">
                          <span className="text-stone-900 dark:text-white">{r.guest_name}</span>
                          <span className="text-amber-500">{'★'.repeat(r.rating)}</span>
                        </div>
                        <p className="text-stone-600 dark:text-stone-400 mt-1 italic">&ldquo;{r.comment}&rdquo;</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* PRINTABLE OFFICIAL DOCUMENT MODAL */}
      {/* ========================================================= */}
      {activeDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl bg-white p-8 shadow-2xl text-stone-900 space-y-6 my-8 print:p-0 print:shadow-none print:m-0 print:border-none print:w-full">
            {/* Action Bar (Hidden when printing) */}
            <div className="flex justify-between items-center border-b pb-4 print:hidden">
              <span className="text-xs font-black uppercase tracking-wider text-emerald-800">
                Official Resort Document Preview
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-700 text-white hover:bg-emerald-800 transition"
                >
                  🖨️ Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setActiveDoc(null)}
                  className="px-3 py-2 rounded-xl text-xs font-bold bg-stone-100 text-stone-700 hover:bg-stone-200 transition"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Document Header */}
            <div className="border-b-2 border-stone-900 pb-4 flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-black tracking-tight">
                  {((tenant.settings as Record<string, unknown>)?.legal_name as string) || tenant.name}
                </h2>
                <p className="text-xs text-stone-600 mt-0.5">
                  {(tenant.settings as { address?: string })?.address || 'Luxury Beachside & Nature Resort, Maharashtra, India'}
                </p>
                <div className="text-[11px] text-stone-500 mt-1 space-y-0.5">
                  <p>
                    <strong>GSTIN:</strong>{' '}
                    <span className="font-mono font-bold text-stone-800">
                      {((tenant.settings as Record<string, unknown>)?.gstin as string) || '27AAPCR1234F1Z5'}
                    </span>{' '}
                    • <strong>State:</strong> Maharashtra (State Code: {((tenant.settings as Record<string, unknown>)?.state_code as string) || '27'})
                  </p>
                  <p>
                    Tel: {tenant.contact_phone || '+91 98000 00000'} • Email: {tenant.contact_email || 'accounts@resort.com'}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="inline-block px-3 py-1 rounded bg-stone-900 text-white font-black text-xs uppercase tracking-wider">
                  {activeDoc === 'voucher'
                    ? 'CONFIRMATION VOUCHER'
                    : activeDoc === 'receipt'
                    ? 'PAYMENT RECEIPT'
                    : activeDoc === 'invoice'
                    ? 'TAX INVOICE'
                    : 'FINAL CHECKOUT BILL'}
                </span>
                <p className="text-xs font-mono font-bold mt-2">
                  {activeDoc === 'invoice'
                    ? `INV/${new Date().getFullYear()}-${(new Date().getFullYear() + 1).toString().slice(-2)}/${folio.bookingRef}`
                    : `REF: #${folio.bookingRef}`}
                </p>
                <p className="text-[11px] text-stone-500">
                  Date: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
                {activeDoc === 'invoice' && (
                  <p className="text-[10px] text-emerald-700 font-semibold mt-0.5">
                    Sec. 31 CGST Act Compliant
                  </p>
                )}
              </div>
            </div>

            {/* Guest & Recipient Details */}
            <div className="grid grid-cols-2 gap-4 text-xs border-b pb-4">
              <div>
                <span className="font-extrabold uppercase text-[10px] text-stone-400 block">
                  {activeDoc === 'invoice' && folio.companyName ? 'Billed To (B2B)' : 'Billed To'}
                </span>
                <p className="font-bold text-sm text-stone-900">
                  {folio.companyName || booking.guest_name}
                </p>
                {folio.companyName && (
                  <p className="text-stone-600 font-medium">Attn: {booking.guest_name}</p>
                )}
                {folio.guestGstin ? (
                  <p className="font-mono text-[11px] text-emerald-800 font-bold">
                    Recipient GSTIN: {folio.guestGstin}
                  </p>
                ) : (
                  <p className="text-[11px] text-stone-400">GST: Unregistered (B2C Consumer)</p>
                )}
                <p className="text-stone-600">
                  {folio.billingAddress || (tenant.settings as { address?: string })?.address || 'Maharashtra, India'}
                </p>
                <p className="text-stone-600">Mobile: {booking.guest_mobile_number}</p>
                {booking.guest_email && <p className="text-stone-600">Email: {booking.guest_email}</p>}
              </div>

              <div>
                <span className="font-extrabold uppercase text-[10px] text-stone-400 block">Stay Information</span>
                <p>
                  <strong>Check-In:</strong> {booking.check_in_date} (14:00)
                </p>
                <p>
                  <strong>Check-Out:</strong> {booking.check_out_date} (11:00)
                </p>
                <p>
                  <strong>Duration:</strong> {folio.nights} Night{folio.nights > 1 ? 's' : ''} ({booking.num_adults} Adults{booking.num_children > 0 ? `, ${booking.num_children} Children` : ''})
                </p>
                <p>
                  <strong>Category:</strong> {folio.categoryName || 'Accommodation'}
                </p>
                {folio.mealPlanCode && (
                  <p>
                    <strong>Meal Plan:</strong> {folio.mealPlanCode} ({folio.mealPlanName || 'Plan'})
                  </p>
                )}
                <p>
                  <strong>Assigned Unit:</strong> {room ? `${room.name} (#${room.room_number || room.name})` : 'Assigned Unit'}
                </p>
              </div>
            </div>

            {/* VIEW 1: STATUTORY GST TAX INVOICE */}
            {activeDoc === 'invoice' && (
              <div className="space-y-3 text-xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b text-stone-500 uppercase text-[10px]">
                        <th className="py-2">Item Description</th>
                        <th className="py-2 text-center">SAC</th>
                        <th className="py-2 text-right">Taxable Val (₹)</th>
                        <th className="py-2 text-right">CGST</th>
                        <th className="py-2 text-right">SGST</th>
                        <th className="py-2 text-right">Total (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {folio.taxCalculation && folio.taxCalculation.items && folio.taxCalculation.items.length > 0 ? (
                        folio.taxCalculation.items.map((item, idx) => (
                          <tr key={idx}>
                            <td className="py-2.5 font-medium text-stone-900">
                              {item.description}
                            </td>
                            <td className="py-2.5 text-center font-mono font-semibold text-stone-600">
                              {item.sac_code}
                            </td>
                            <td className="py-2.5 text-right font-mono">
                              ₹{item.taxable_amount_inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 text-right font-mono text-[11px] text-stone-600">
                              ₹{item.cgst_amount_inr.toFixed(2)}
                              <span className="text-[10px] text-stone-400 block">({item.cgst_percent}%)</span>
                            </td>
                            <td className="py-2.5 text-right font-mono text-[11px] text-stone-600">
                              ₹{item.sgst_amount_inr.toFixed(2)}
                              <span className="text-[10px] text-stone-400 block">({item.sgst_percent}%)</span>
                            </td>
                            <td className="py-2.5 text-right font-mono font-bold text-stone-900">
                              ₹{item.gross_amount_inr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="py-2.5 font-medium text-stone-900">
                            Room Accommodation ({folio.nights} Nights)
                          </td>
                          <td className="py-2.5 text-center font-mono text-stone-600">996311</td>
                          <td className="py-2.5 text-right font-mono">
                            ₹{(folio.grandTotalInr / 1.12).toFixed(2)}
                          </td>
                          <td className="py-2.5 text-right font-mono text-[11px]">
                            ₹{(((folio.grandTotalInr / 1.12) * 0.06)).toFixed(2)} (6%)
                          </td>
                          <td className="py-2.5 text-right font-mono text-[11px]">
                            ₹{(((folio.grandTotalInr / 1.12) * 0.06)).toFixed(2)} (6%)
                          </td>
                          <td className="py-2.5 text-right font-mono font-bold">
                            ₹{folio.grandTotalInr.toLocaleString()}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Tax Subtotal & GST Summary */}
                <div className="border-t pt-3 space-y-1.5 text-xs text-right">
                  <div className="flex justify-between font-semibold text-stone-600">
                    <span>Total Taxable Value (Base)</span>
                    <span className="font-mono">
                      ₹{(folio.taxCalculation?.total_taxable_amount_inr || Math.round(folio.grandTotalInr / 1.12)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-600">
                    <span>Central Tax (CGST)</span>
                    <span className="font-mono">
                      ₹{(folio.taxCalculation?.total_cgst_inr || Math.round((folio.grandTotalInr - (folio.grandTotalInr / 1.12)) / 2)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between font-semibold text-stone-600">
                    <span>State Tax (SGST)</span>
                    <span className="font-mono">
                      ₹{(folio.taxCalculation?.total_sgst_inr || Math.round((folio.grandTotalInr - (folio.grandTotalInr / 1.12)) / 2)).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between font-bold text-stone-800 border-t pt-1">
                    <span>Total GST Amount</span>
                    <span className="font-mono">
                      ₹{(folio.taxCalculation?.total_tax_inr || (folio.grandTotalInr - Math.round(folio.grandTotalInr / 1.12))).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-black border-t-2 border-stone-900 pt-2 text-stone-900">
                    <span>Grand Total Invoice Value</span>
                    <span className="font-mono">₹{folio.grandTotalInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <p className="text-[11px] text-stone-500 text-left pt-1 font-medium">
                    <strong>Amount in Words:</strong> {amountInWords(folio.grandTotalInr)}
                  </p>
                  <div className="flex justify-between font-semibold text-emerald-700 pt-2 border-t">
                    <span>Total Paid to Date</span>
                    <span className="font-mono">- ₹{folio.paidAmountInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                  <div className="flex justify-between font-bold text-sm text-stone-900">
                    <span>Net Balance Payable</span>
                    <span className="font-mono">₹{folio.outstandingBalanceInr.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW 2: OFFICIAL PAYMENT RECEIPT LEDGER */}
            {activeDoc === 'receipt' && (
              <div className="space-y-4 text-xs">
                <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3">
                  <div className="flex justify-between items-center">
                    <div>
                      <span className="font-bold text-stone-700 uppercase tracking-wider text-[10px] block">
                        Total Amount Received
                      </span>
                      <span className="text-xl font-black text-emerald-700 font-mono">
                        ₹{folio.paidAmountInr.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-stone-500 uppercase block font-semibold">Payment Status</span>
                      <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                        folio.outstandingBalanceInr === 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {folio.outstandingBalanceInr === 0 ? 'FULL SETTLED' : 'PARTIALLY PAID'}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-600 mt-2 font-medium">
                    <strong>In Words:</strong> {amountInWords(folio.paidAmountInr)}
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="font-extrabold text-stone-500 uppercase text-[10px] tracking-wider">
                    Verifiable Transaction Receipts
                  </h4>
                  {folio.receipts && folio.receipts.length > 0 ? (
                    <div className="border rounded-xl divide-y overflow-hidden">
                      {folio.receipts.map((rec) => (
                        <div key={rec.id} className={`p-3 text-xs flex justify-between items-start ${
                          rec.is_voided ? 'bg-rose-50/60' : 'bg-white'
                        }`}>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-stone-900">
                                {rec.receipt_number || `REC-${rec.id.slice(0, 8).toUpperCase()}`}
                              </span>
                              <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-700">
                                {rec.payment_method}
                              </span>
                              {rec.is_voided && (
                                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-rose-800">
                                  VOIDED / REVERSED
                                </span>
                              )}
                              {rec.is_reconciled && (
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-emerald-800">
                                  RECONCILED
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-stone-500 mt-1">
                              Received: {new Date(rec.received_at).toLocaleDateString('en-IN', {
                                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })} • Payer: {rec.payer_name}
                            </p>
                            {rec.reference_number && (
                              <p className="text-[11px] font-mono text-stone-600">
                                Ref / UTR: {rec.reference_number}
                              </p>
                            )}
                            {rec.is_voided && rec.void_reason && (
                              <p className="text-[11px] text-rose-700 mt-1 font-medium">
                                Reversal Reason: {rec.void_reason} (by {rec.voided_by_name || 'Supervisor'})
                              </p>
                            )}
                          </div>
                          <div className="text-right">
                            <span className={`text-sm font-black font-mono ${
                              rec.is_voided ? 'text-rose-500 line-through' : 'text-stone-900'
                            }`}>
                              ₹{rec.amount_inr.toLocaleString('en-IN')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="border rounded-xl p-4 text-center text-xs text-stone-500 bg-stone-50">
                      <p className="font-bold text-stone-700">Advance / Booking Payment Record</p>
                      <p className="mt-1">
                        Amount Paid: <strong>₹{folio.paidAmountInr.toLocaleString('en-IN')}</strong> via Online Gateway
                      </p>
                      <p className="text-[11px] font-mono text-stone-400 mt-0.5">Booking Ref: #{folio.bookingRef}</p>
                    </div>
                  )}
                </div>

                <div className="border-t pt-3 flex justify-between font-bold text-xs">
                  <span>Balance Outstanding:</span>
                  <span className="font-mono text-amber-700">₹{folio.outstandingBalanceInr.toLocaleString('en-IN')}</span>
                </div>
              </div>
            )}

            {/* VIEW 3: CONFIRMATION VOUCHER & FINAL CHECKOUT BILL */}
            {(activeDoc === 'voucher' || activeDoc === 'bill') && (
              <div className="space-y-2 text-xs">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b text-stone-500 uppercase text-[10px]">
                      <th className="py-2">Description</th>
                      <th className="py-2 text-center">Qty</th>
                      <th className="py-2 text-right">Amount (₹)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    <tr>
                      <td className="py-2.5 font-semibold">
                        Room Accommodation ({folio.nights} Nights - {folio.categoryName})
                      </td>
                      <td className="py-2.5 text-center">{folio.nights}</td>
                      <td className="py-2.5 text-right font-bold">₹{folio.roomChargeInr.toLocaleString()}</td>
                    </tr>
                    {folio.mealPlanChargeInr && folio.mealPlanChargeInr > 0 ? (
                      <tr className="text-emerald-800">
                        <td className="py-2.5 font-semibold">
                          Meal Plan Supplement ({folio.mealPlanCode} - {folio.mealPlanName || 'Dining'})
                        </td>
                        <td className="py-2.5 text-center">{folio.nights}</td>
                        <td className="py-2.5 text-right font-bold">₹{folio.mealPlanChargeInr.toLocaleString()}</td>
                      </tr>
                    ) : null}
                    {folio.incidentals.map((inc, i) => (
                      <tr key={i}>
                        <td className="py-2 text-stone-700">
                          {inc.item_name} ({inc.category})
                        </td>
                        <td className="py-2 text-center">{inc.quantity}</td>
                        <td className="py-2 text-right font-bold">
                          ₹{(inc.amount_inr * inc.quantity).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="border-t pt-3 space-y-1.5 text-xs text-right">
                  <div className="flex justify-between font-bold text-stone-600">
                    <span>Grand Total (GST Inclusive)</span>
                    <span className="font-mono">₹{folio.grandTotalInr.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-700">
                    <span>Total Amount Paid</span>
                    <span className="font-mono">- ₹{folio.paidAmountInr.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-base font-black border-t pt-2">
                    <span>Balance Due</span>
                    <span className="font-mono">₹{folio.outstandingBalanceInr.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t pt-6 text-[10px] text-stone-400 flex justify-between items-end">
              <div>
                <p>Authorized Computer-Generated Document · Valid Without Physical Signature</p>
                <p>© {new Date().getFullYear()} {((tenant.settings as Record<string, unknown>)?.legal_name as string) || tenant.name}. All rights reserved.</p>
              </div>
              <div className="text-right">
                <div className="h-8 border-b border-stone-300 w-36 mb-1" />
                <span>Authorized Signatory</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* CANCELLATION REQUEST MODAL */}
      {/* ========================================================= */}
      {showCancellationModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-neutral-900 p-6 shadow-2xl border border-stone-200 dark:border-neutral-800 space-y-4">
            <h3 className="text-base font-black text-stone-900 dark:text-white">
              Reservation Cancellation / Change Request
            </h3>
            {cancellationSent ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-800 space-y-2">
                <p className="font-bold">✓ Request Submitted</p>
                <p>
                  Your cancellation/modification request has been submitted to the front desk team. A resort
                  manager will review your reservation per the resort cancellation policy and contact you shortly.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setShowCancellationModal(false);
                    setCancellationSent(false);
                  }}
                  className="mt-2 px-3.5 py-1.5 rounded-xl bg-emerald-700 text-white font-bold"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handleCancellationRequest} className="space-y-3 text-xs">
                <p className="text-stone-500">
                  Please let us know your preferred change (new dates or reason for cancellation):
                </p>
                <textarea
                  rows={3}
                  required
                  placeholder="e.g. Need to postpone arrival to next week due to flight delay..."
                  value={cancellationReason}
                  onChange={(e) => setCancellationReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-stone-200 dark:border-neutral-800 bg-stone-50 dark:bg-neutral-800 text-stone-900 dark:text-white"
                />
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowCancellationModal(false)}
                    className="px-3.5 py-2 rounded-xl font-bold bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-neutral-800 dark:text-stone-300"
                  >
                    Keep Reservation
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white"
                  >
                    Submit Request
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
