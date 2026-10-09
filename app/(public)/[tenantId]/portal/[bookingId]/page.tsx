import React from 'react';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { Booking, Room, RoomCategory } from '@/types';
import { resolveTenantFromParam } from '@/lib/tenant-resolver';
import GuestPortalClient from '@/components/guest/GuestPortalClient';
import GuestAccessChallenge from '@/components/guest/GuestAccessChallenge';
import { getAuthoritativeFolio } from '@/app/actions/folio';
import { getRestaurantMenu, getRestaurantOrders } from '@/app/actions/restaurant';
import { getServiceRequests } from '@/app/actions/service-requests';
import { getResortActivities, getActivityBookings } from '@/app/actions/activities';
import { getResortReviews } from '@/app/actions/reviews';
import { verifyGuestPortalToken } from '@/lib/portal-token';

export const dynamic = 'force-dynamic';

interface GuestPortalProps {
  params: Promise<{
    tenantId: string;
    bookingId: string;
  }>;
  searchParams?: Promise<{
    token?: string;
  }>;
}

export default async function GuestPortalPage({ params, searchParams }: GuestPortalProps) {
  const { tenantId, bookingId } = await params;
  const sParams = searchParams ? await searchParams : {};
  const tokenFromUrl = sParams?.token;

  const decodedTenantParam = decodeURIComponent(tenantId);
  const adminDb = createAdminClient();

  // 1. Fetch Tenant securely with strict isolation
  const tenant = await resolveTenantFromParam(decodedTenantParam);
  if (!tenant) notFound();

  // 2. Fetch Booking
  const { data: bookingData } = await adminDb
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  const booking: Booking | null = (bookingData as unknown as Booking) || null;
  if (!booking) notFound();

  // 3. SECURITY GATE: Cryptographically Signed Token Verification
  // Invariant: Never let a room number or guessable booking reference alone authorize access to another guest's bill!
  const cookieStore = await cookies();
  const tokenFromCookie = cookieStore.get(`guest_portal_token_${bookingId}`)?.value;
  const candidateToken = tokenFromUrl || tokenFromCookie;

  // Check revocation epoch from tenant settings
  const settings = (tenant.settings as Record<string, unknown>) || {};
  const revokedMap = (settings.revoked_portal_tokens as Record<string, string>) || {};
  const revokedAtIso = revokedMap[booking.id];
  const revocationEpoch = revokedAtIso ? new Date(revokedAtIso).getTime() : undefined;

  const authResult = verifyGuestPortalToken(
    candidateToken,
    tenant.id,
    booking.id,
    revocationEpoch
  );

  // If token is missing, expired, or invalid: Render Guest Identity Challenge
  // (Prevents anyone from viewing the guest's folio, bill, and personal details)
  if (!authResult.isValid) {
    const firstName = booking.guest_name ? booking.guest_name.split(' ')[0] : 'Guest';
    return (
      <GuestAccessChallenge
        tenantId={tenant.id}
        bookingId={booking.id}
        resortName={tenant.name}
        guestFirstNameHint={firstName}
      />
    );
  }

  // 4. Fetch Assigned Room & Category
  let room: Room | null = null;
  let category: RoomCategory | null = null;

  if (booking.room_id) {
    const { data: rData } = await adminDb.from('rooms').select('*').eq('id', booking.room_id).maybeSingle();
    room = (rData as unknown as Room) || null;
  }

  const catId = booking.category_id || room?.category_id;
  if (catId) {
    const { data: cData } = await adminDb.from('room_categories').select('*').eq('id', catId).maybeSingle();
    category = (cData as unknown as RoomCategory) || null;
  }

  // 5. Parallel Load Operational Datasets
  const [
    folioRes,
    menuRes,
    ordersRes,
    requestsRes,
    activitiesRes,
    actBookingsRes,
    reviewsRes,
  ] = await Promise.all([
    getAuthoritativeFolio(tenant.id, booking.id),
    getRestaurantMenu(tenant.id),
    getRestaurantOrders(tenant.id, booking.id),
    getServiceRequests(tenant.id, booking.id),
    getResortActivities(tenant.id),
    getActivityBookings(tenant.id, booking.id),
    getResortReviews(tenant.id, true),
  ]);

  const defaultFolio = {
    bookingId: booking.id,
    bookingRef: booking.id.slice(0, 8).toUpperCase(),
    tenant,
    guestName: booking.guest_name,
    guestEmail: booking.guest_email || undefined,
    guestPhone: booking.guest_mobile_number,
    roomName: room?.name,
    roomNumber: room?.room_number || undefined,
    categoryName: category?.name || room?.room_type,
    checkInDate: booking.check_in_date,
    checkOutDate: booking.check_out_date,
    nights: 1,
    numAdults: booking.num_adults,
    numChildren: booking.num_children,
    roomChargeInr: Number(booking.total_amount_inr || 0),
    incidentals: [],
    incidentalsTotalInr: 0,
    subtotalInr: Number(booking.total_amount_inr || 0),
    taxInr: Math.round(Number(booking.total_amount_inr || 0) * 0.12),
    taxCalculation: {
      is_inclusive: true,
      total_taxable_amount_inr: Math.round(Number(booking.total_amount_inr || 0) / 1.12),
      total_cgst_inr: Math.round((Number(booking.total_amount_inr || 0) - Math.round(Number(booking.total_amount_inr || 0) / 1.12)) / 2),
      total_sgst_inr: Math.round((Number(booking.total_amount_inr || 0) - Math.round(Number(booking.total_amount_inr || 0) / 1.12)) / 2),
      total_tax_inr: Math.round(Number(booking.total_amount_inr || 0) * 0.12),
      grand_total_inr: Number(booking.total_amount_inr || 0),
      items: [],
    },
    receipts: [],
    grandTotalInr: Number(booking.total_amount_inr || 0),
    paidAmountInr: Number(booking.paid_amount_inr || 0),
    outstandingBalanceInr: Math.max(0, Number(booking.total_amount_inr || 0) - Number(booking.paid_amount_inr || 0)),
    paymentStatus: booking.payment_status,
    bookingStatus: booking.booking_status,
    isFullySettled: booking.payment_status === 'paid',
    createdAt: booking.created_at,
  };

  const authoritativeFolio = folioRes.success && folioRes.data ? folioRes.data : defaultFolio;
  const menu = menuRes.success && menuRes.data ? menuRes.data : { categories: [], items: [] };
  const orders = ordersRes.success && ordersRes.data ? ordersRes.data : [];
  const requests = requestsRes.success && requestsRes.data ? requestsRes.data : [];
  const activities = activitiesRes.success && activitiesRes.data ? activitiesRes.data : [];
  const activityBookings = actBookingsRes.success && actBookingsRes.data ? actBookingsRes.data : [];
  const reviews = reviewsRes.success && reviewsRes.data ? reviewsRes.data : [];

  return (
    <GuestPortalClient
      tenant={tenant}
      tenantParam={tenant.subdomain || decodedTenantParam}
      booking={booking}
      room={room}
      category={category}
      initialFolio={authoritativeFolio}
      menu={menu}
      initialOrders={orders}
      initialRequests={requests}
      activities={activities}
      initialActivityBookings={activityBookings}
      initialReviews={reviews}
    />
  );
}
