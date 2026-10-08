import React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import { Tenant, Booking, Room, RoomCategory } from '@/types';

export const dynamic = 'force-dynamic';

interface GuestPortalProps {
  params: Promise<{
    tenantId: string;
    bookingId: string;
  }>;
}

export default async function GuestPortalPage({ params }: GuestPortalProps) {
  const { tenantId, bookingId } = await params;
  const decodedTenantParam = decodeURIComponent(tenantId);

  const adminDb = createAdminClient();

  // 1. Fetch Tenant
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(decodedTenantParam);
  let tenantQuery = adminDb.from('tenants').select('*');
  if (isUuid) {
    tenantQuery = tenantQuery.eq('id', decodedTenantParam);
  } else {
    tenantQuery = tenantQuery.or(`subdomain.eq.${decodedTenantParam},custom_domain.eq.${decodedTenantParam}`);
  }

  const { data: tenantData } = await tenantQuery.maybeSingle();
  let tenant: Tenant | null = (tenantData as unknown as Tenant) || null;

  if (!tenant) {
    const { data: fallbackTenants } = await adminDb
      .from('tenants')
      .select('*')
      .eq('is_active', true)
      .limit(1);
    if (fallbackTenants && fallbackTenants[0]) {
      tenant = fallbackTenants[0] as unknown as Tenant;
    }
  }

  if (!tenant) {
    if (
      decodedTenantParam.toLowerCase() === 'raigad-tropical' ||
      decodedTenantParam === '2f002373-c7f2-4127-842f-4bb20d7a1b64' ||
      !decodedTenantParam
    ) {
      tenant = {
        id: '2f002373-c7f2-4127-842f-4bb20d7a1b64',
        name: 'Raigad Tropical',
        subdomain: 'raigad-tropical',
        custom_domain: null,
        contact_email: 'contact@raigadtropical.com',
        contact_phone: '+91 98201 60376',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        settings: {
          hero_title: 'Raigad Tropical Resort & Luxury Villas',
          hero_subtitle: 'Experience coastal tranquility, coconut groves, and private pool luxury.',
          primary_color: '#047857',
          address: 'Alibaug-Murud Coastal Road, Raigad, Maharashtra 402401',
          currency: 'INR',
        },
      };
    } else {
      notFound();
    }
  }

  if (!tenant) notFound();

  // 2. Fetch Booking
  const { data: bookingData } = await adminDb
    .from('bookings')
    .select('*')
    .eq('id', bookingId)
    .maybeSingle();

  const booking: Booking | null = (bookingData as unknown as Booking) || null;
  if (!booking) notFound();

  // 3. Fetch Assigned Room & Category
  let room: Room | null = null;
  let category: RoomCategory | null = null;

  if (booking.room_id) {
    const { data: rData } = await adminDb.from('rooms').select('*').eq('id', booking.room_id).maybeSingle();
    room = (rData as unknown as Room) || null;

    if (room?.category_id) {
      const { data: cData } = await adminDb.from('room_categories').select('*').eq('id', room.category_id).maybeSingle();
      category = (cData as unknown as RoomCategory) || null;
    }
  }

  const cIn = new Date(booking.check_in_date);
  const cOut = new Date(booking.check_out_date);
  const nights = Math.max(1, Math.round((cOut.getTime() - cIn.getTime()) / (1000 * 60 * 60 * 24)));

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased dark:bg-neutral-950 dark:text-neutral-100 py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-2xl space-y-6">
        
        {/* Navigation back */}
        <div className="flex items-center justify-between text-xs">
          <Link
            href={`/${tenant.subdomain || decodedTenantParam}`}
            className="inline-flex items-center gap-1.5 font-semibold text-stone-600 hover:text-stone-950 dark:text-stone-400 dark:hover:text-white"
          >
            <span>← Back to {tenant.name}</span>
          </Link>
          <span className="font-mono text-stone-400">Guest Portal</span>
        </div>

        {/* Main Folio Card */}
        <div className="overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
          
          {/* Header Banner */}
          <div
            className={`p-8 text-white text-center ${
              booking.booking_status === 'cancelled'
                ? 'bg-gradient-to-r from-rose-700 to-red-800'
                : 'bg-gradient-to-r from-emerald-600 to-teal-700'
            }`}
          >
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 backdrop-blur-md">
              <span className="text-2xl font-black">
                {booking.booking_status === 'cancelled' ? '✕' : '✓'}
              </span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight">{tenant.name}</h1>
            <p className="mt-1 text-xs text-white/90">
              {booking.booking_status === 'cancelled'
                ? 'Reservation Cancelled'
                : 'Official Booking Confirmation & Guest Folio'}
            </p>
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 font-mono text-xs font-bold backdrop-blur-xs">
              <span>REFERENCE: #{booking.id.slice(0, 8).toUpperCase()}</span>
            </div>
          </div>

          {/* Details */}
          <div className="p-6 sm:p-8 space-y-6">
            {booking.booking_status === 'cancelled' && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-300">
                <p className="font-bold">⚠️ Reservation Has Been Cancelled</p>
                <p className="mt-1">
                  This reservation was cancelled. The room has been released. If you require assistance or have inquiries regarding a refund, please contact the resort front desk.
                </p>
                {tenant.contact_phone && (
                  <p className="mt-2 font-semibold">Front Desk: {tenant.contact_phone}</p>
                )}
              </div>
            )}
            
            {/* Status Pills */}
            <div className="flex items-center justify-between border-b border-stone-100 pb-4 dark:border-neutral-800 text-xs">
              <div>
                <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">
                  Reservation Status
                </span>
                <span
                  className={`mt-0.5 inline-block font-extrabold uppercase ${
                    booking.booking_status === 'cancelled'
                      ? 'text-rose-600'
                      : booking.booking_status === 'confirmed'
                      ? 'text-emerald-600'
                      : booking.booking_status === 'checked_in'
                      ? 'text-blue-600'
                      : 'text-amber-600'
                  }`}
                >
                  ● {booking.booking_status}
                </span>
              </div>

              <div className="text-right">
                <span className="text-stone-400 block text-[10px] uppercase font-bold tracking-wider">
                  Payment Status
                </span>
                <span
                  className={`mt-0.5 inline-block font-extrabold uppercase ${
                    booking.payment_status === 'paid' ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {booking.payment_status}
                </span>
              </div>
            </div>

            {/* Guest & Stay Details */}
            <div className="space-y-3 rounded-2xl border border-stone-200/80 bg-stone-50/60 p-4 text-xs dark:border-neutral-800 dark:bg-neutral-850">
              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                <span className="text-stone-500">Primary Guest</span>
                <span className="font-bold text-stone-900 dark:text-white">{booking.guest_name}</span>
              </div>

              {booking.guest_email && (
                <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                  <span className="text-stone-500">Email Address</span>
                  <span className="font-semibold text-stone-800 dark:text-stone-200">{booking.guest_email}</span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                <span className="text-stone-500">Mobile / WhatsApp</span>
                <span className="font-semibold text-stone-800 dark:text-stone-200">{booking.guest_mobile_number}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                <span className="text-stone-500">Reserved Category</span>
                <span className="font-bold text-emerald-700 dark:text-emerald-400">
                  {category?.name || room?.room_type || 'Reserved Accommodation'}
                </span>
              </div>

              {room?.name && (
                <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                  <span className="text-stone-500">Assigned Unit</span>
                  <span className="font-bold text-stone-900 dark:text-white">
                    {room.name} {room.room_number ? `(#${room.room_number})` : ''}
                  </span>
                </div>
              )}

              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                <span className="text-stone-500">Check-In Date</span>
                <span className="font-semibold text-stone-800 dark:text-stone-200">{booking.check_in_date}</span>
              </div>

              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                <span className="text-stone-500">Check-Out Date</span>
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  {booking.check_out_date} ({nights} {nights === 1 ? 'Night' : 'Nights'})
                </span>
              </div>

              <div className="flex justify-between py-1 border-b border-stone-100 dark:border-neutral-800">
                <span className="text-stone-500">Party Size</span>
                <span className="font-semibold text-stone-800 dark:text-stone-200">
                  {booking.num_adults} Adults{booking.num_children > 0 ? `, ${booking.num_children} Children` : ''}
                </span>
              </div>

              <div className="flex justify-between pt-2 text-sm font-black">
                <span>Total Amount</span>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ₹{Number(booking.total_amount_inr).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Check-in Instructions */}
            <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs dark:border-neutral-800 dark:bg-neutral-900 space-y-1.5">
              <p className="font-bold text-stone-900 dark:text-white">🛎️ Check-in Information</p>
              <p className="text-stone-500">
                Standard check-in is at 2:00 PM and check-out is at 11:00 AM. Please present a government-issued photo ID upon arrival.
              </p>
              {tenant.contact_phone && (
                <p className="pt-1 text-stone-600 dark:text-stone-400">
                  Front Desk Contact: <strong>{tenant.contact_phone}</strong>
                </p>
              )}
            </div>

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                href={`/${tenant.subdomain || decodedTenantParam}`}
                className="flex-1 inline-flex items-center justify-center rounded-xl bg-stone-900 p-3 text-xs font-bold text-white hover:bg-stone-800 dark:bg-white dark:text-stone-900"
              >
                Return to Resort
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
