'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Tenant, Room, RoomCategory } from '@/types';

interface ResortShowcaseClientProps {
  tenant: Tenant;
  rooms: Room[];
  categories: RoomCategory[];
  tenantParam: string;
}

export default function ResortShowcaseClient({
  tenant,
  rooms,
  categories,
  tenantParam,
}: ResortShowcaseClientProps) {
  // Extract website settings with safe fallbacks
  const settings = (tenant.settings as Record<string, any>) || {};
  const primaryColor = settings.primary_color_hex || '#c0395b';
  const tagline =
    settings.tagline ||
    'Luxury Boutique Villa, Private Jacuzzi & Swimming Pool Experience';
  const aboutText =
    settings.about_description ||
    'Escape the city into an exclusive private sanctuary surrounded by nature. Indulge in private infinity pools, open-air hydrotherapy, curated dining, and world-class hospitality tailored for unforgettable memories.';
  const heroImage =
    settings.hero_image_url ||
    'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1920&q=80';

  const defaultGallery = [
    {
      id: '1',
      url: 'https://images.unsplash.com/photo-1571896349842-33c89424de2d?auto=format&fit=crop&w=1200&q=80',
      caption: 'Private Infinity Swimming Pool',
      category: 'Pool',
    },
    {
      id: '2',
      url: 'https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&w=1200&q=80',
      caption: 'Hydrotherapy Jacuzzi & Sun Deck',
      category: 'Wellness',
    },
    {
      id: '3',
      url: 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=1200&q=80',
      caption: 'Cozy House Master Suite',
      category: 'Rooms',
    },
    {
      id: '4',
      url: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=1200&q=80',
      caption: 'Evening Villa Atmosphere & Lawns',
      category: 'Outdoors',
    },
    {
      id: '5',
      url: 'https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=80',
      caption: 'Poolside Dining & Barbecue Experience',
      category: 'Dining',
    },
  ];

  const galleryImages: Array<{ id: string; url: string; caption: string; category?: string }> =
    Array.isArray(settings.gallery_images) && settings.gallery_images.length > 0
      ? settings.gallery_images
      : defaultGallery;

  const amenitiesList: string[] =
    Array.isArray(settings.amenities) && settings.amenities.length > 0
      ? settings.amenities
      : [
          'Private Swimming Pool',
          'Outdoor Hydrotherapy Jacuzzi',
          'Party Lawn & Gazebo',
          'High-Speed Wi-Fi',
          '100% Generator Power Backup',
          'On-site Caretaker & Chef',
          'Outdoor Barbecue & Bonfire Pit',
          'Pet Friendly Estate',
        ];

  const address =
    settings.address || 'Survey No. 42, Tropical Greens, Raigad District, Maharashtra 402107';
  const whatsappNumber = settings.whatsapp_number || '+919820160376';
  const cleanWhatsApp = whatsappNumber.replace(/\D/g, '');
  const contactPhone = settings.contact_phone || tenant.contact_phone || '+91 98201 60376';
  const contactEmail = settings.contact_email || tenant.contact_email || 'stay@raigadtropical.com';

  // Quick Search Bar state
  const getToday = () => new Date().toISOString().split('T')[0];
  const getTomorrow = () => {
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    return tmr.toISOString().split('T')[0];
  };

  const [checkIn, setCheckIn] = useState(getToday());
  const [checkOut, setCheckOut] = useState(getTomorrow());
  const [guests, setGuests] = useState('2');

  // Gallery category filter
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const categoriesSet = ['All', ...new Set(galleryImages.map((img) => img.category || 'Resort'))];

  const filteredGallery =
    activeCategory === 'All'
      ? galleryImages
      : galleryImages.filter((img) => img.category === activeCategory);

  const bookingUrl = `/${tenantParam}/book?checkIn=${checkIn}&checkOut=${checkOut}&adults=${guests}`;

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-900 antialiased dark:bg-neutral-950 dark:text-neutral-100">
      {/* =================================================================== */}
      {/* 1. TOP ANNOUNCEMENT & BRAND NAVIGATION HEADER */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-white/90 backdrop-blur-md dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo & Resort Identity */}
          <Link href={`/${tenantParam}`} className="flex items-center gap-3">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="h-10 w-10 rounded-xl object-contain shadow-xs"
              />
            ) : (
              <span
                style={{ backgroundColor: primaryColor }}
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl font-black text-white shadow-sm"
              >
                {tenant.name.slice(0, 1).toUpperCase()}
              </span>
            )}
            <div>
              <span className="text-xl font-extrabold tracking-tight text-stone-900 dark:text-white">
                {tenant.name}
              </span>
              <span className="block text-[10px] font-medium tracking-widest text-stone-500 uppercase">
                Boutique Luxury Stay
              </span>
            </div>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-8 text-xs font-semibold tracking-wider text-stone-600 uppercase md:flex dark:text-stone-300">
            <a href="#overview" className="transition hover:text-stone-950 dark:hover:text-white">
              Overview
            </a>
            <a href="#villas" className="transition hover:text-stone-950 dark:hover:text-white">
              Villas &amp; Rooms
            </a>
            <a href="#amenities" className="transition hover:text-stone-950 dark:hover:text-white">
              Experience
            </a>
            <a href="#gallery" className="transition hover:text-stone-950 dark:hover:text-white">
              Gallery
            </a>
            <a href="#contact" className="transition hover:text-stone-950 dark:hover:text-white">
              Contact
            </a>
          </nav>

          {/* Action CTA */}
          <div className="flex items-center gap-3">
            <Link
              href={bookingUrl}
              style={{ backgroundColor: primaryColor }}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:brightness-110 active:scale-95"
            >
              <span>Book Your Stay</span>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </Link>
          </div>
        </div>
      </header>

      {/* =================================================================== */}
      {/* 2. HERO COVER & QUICK SEARCH AVAILABILITY BAR */}
      {/* =================================================================== */}
      <section
        id="overview"
        className="relative flex min-h-[82vh] items-center justify-center bg-cover bg-center px-4 py-20 text-center"
        style={{ backgroundImage: `url('${heroImage}')` }}
      >
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950/90 via-stone-950/60 to-stone-950/40" />

        <div className="relative z-10 mx-auto max-w-4xl space-y-6">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-semibold tracking-widest text-white backdrop-blur-md uppercase">
            ✦ Direct Reservation Portal · Best Rates Guaranteed
          </span>

          <h1 className="text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-tight">
            {tagline}
          </h1>

          <p className="mx-auto max-w-2xl text-sm leading-relaxed text-stone-200 sm:text-base">
            {aboutText}
          </p>

          {/* Floating Embedded Quick-Search Bar */}
          <div className="mx-auto mt-8 max-w-3xl rounded-2xl border border-white/20 bg-white/95 p-3 shadow-2xl backdrop-blur-lg sm:p-4 dark:border-neutral-700/60 dark:bg-neutral-900/95">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-4">
              <div className="text-left">
                <label className="block text-[10px] font-bold text-stone-500 uppercase">
                  Check-in Date
                </label>
                <input
                  type="date"
                  value={checkIn}
                  onChange={(e) => setCheckIn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="text-left">
                <label className="block text-[10px] font-bold text-stone-500 uppercase">
                  Check-out Date
                </label>
                <input
                  type="date"
                  value={checkOut}
                  onChange={(e) => setCheckOut(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="text-left">
                <label className="block text-[10px] font-bold text-stone-500 uppercase">
                  Guests / Pax
                </label>
                <select
                  value={guests}
                  onChange={(e) => setGuests(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-semibold text-stone-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="1">1 Adult</option>
                  <option value="2">2 Adults</option>
                  <option value="4">4 Adults (Family)</option>
                  <option value="6">6 Adults</option>
                  <option value="10">10+ Adults (Full Estate)</option>
                </select>
              </div>

              <div className="flex items-end">
                <Link
                  href={bookingUrl}
                  style={{ backgroundColor: primaryColor }}
                  className="flex h-10 w-full items-center justify-center rounded-xl text-xs font-bold text-white shadow-sm transition-all hover:brightness-110 active:scale-95"
                >
                  Check Rates ➔
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 3. VILLAS & ROOMS SHOWCASE */}
      {/* =================================================================== */}
      <section id="villas" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="text-center">
          <span
            style={{ color: primaryColor }}
            className="text-xs font-bold tracking-widest uppercase"
          >
            Accommodations
          </span>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
            Curated Villas &amp; Private Suites
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-xs text-stone-500 sm:text-sm">
            Handcrafted spaces designed with private access, panoramic views, and signature luxury comforts.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
          {rooms.map((room) => {
            const roomImage =
              room.images && room.images.length > 0
                ? room.images[0]
                : 'https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?auto=format&fit=crop&w=1200&q=80';

            return (
              <div
                key={room.id}
                className="group flex flex-col overflow-hidden rounded-3xl border border-stone-200/90 bg-white shadow-sm transition hover:shadow-xl dark:border-neutral-800 dark:bg-neutral-900"
              >
                {/* Photo preview */}
                <div className="relative h-64 overflow-hidden bg-stone-100 dark:bg-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={roomImage}
                    alt={room.name}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-4 right-4 rounded-full bg-stone-950/70 px-3 py-1 text-[11px] font-bold text-white backdrop-blur-md">
                    ₹{room.base_price_inr.toLocaleString('en-IN')}{' '}
                    <span className="font-normal text-stone-300">/ night</span>
                  </div>
                  <div className="absolute bottom-4 left-4 rounded-xl bg-white/90 px-2.5 py-1 text-[10px] font-bold text-stone-900 backdrop-blur-md">
                    {room.room_type || 'Luxury Villa'}
                  </div>
                </div>

                {/* Details */}
                <div className="flex flex-1 flex-col p-6">
                  <h3 className="text-xl font-bold text-stone-900 dark:text-white">
                    {room.name}
                  </h3>

                  <div className="mt-3 flex items-center gap-4 text-xs text-stone-500">
                    <span className="flex items-center gap-1">
                      👥 Up to {room.capacity_adults} Adults
                    </span>
                    {room.capacity_children > 0 && (
                      <span className="flex items-center gap-1">
                        👶 {room.capacity_children} Kids
                      </span>
                    )}
                  </div>

                  {/* Amenities Tags */}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {(room.amenities && room.amenities.length > 0
                      ? room.amenities
                      : ['Jacuzzi Access', 'Private Pool', 'Forest View', 'Air Conditioning']
                    ).map((amenity, i) => (
                      <span
                        key={i}
                        className="rounded-lg bg-stone-100 px-2.5 py-1 text-[10px] font-semibold text-stone-700 dark:bg-neutral-800 dark:text-neutral-300"
                      >
                        ✓ {amenity}
                      </span>
                    ))}
                  </div>

                  <div className="mt-6 flex items-center justify-between border-t border-stone-100 pt-5 dark:border-neutral-800">
                    <div>
                      <span className="text-[10px] text-stone-400 uppercase">Starting at</span>
                      <p className="text-lg font-black text-stone-900 dark:text-white">
                        ₹{room.base_price_inr.toLocaleString('en-IN')}
                      </p>
                    </div>

                    <Link
                      href={`/${tenantParam}/book?roomId=${room.id}&checkIn=${checkIn}&checkOut=${checkOut}&adults=${guests}`}
                      style={{ backgroundColor: primaryColor }}
                      className="rounded-xl px-4 py-2.5 text-xs font-bold text-white shadow-xs transition hover:brightness-110 active:scale-95"
                    >
                      Reserve Villa ➔
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* =================================================================== */}
      {/* 4. RESORT EXPERIENCE & AMENITIES */}
      {/* =================================================================== */}
      <section
        id="amenities"
        className="border-y border-stone-200/80 bg-stone-100/70 py-20 dark:border-neutral-800 dark:bg-neutral-900/50"
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span
              style={{ color: primaryColor }}
              className="text-xs font-bold tracking-widest uppercase"
            >
              Estate Features
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
              The {tenant.name} Experience
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-xs text-stone-500 sm:text-sm">
              Everything you need for a restorative and peaceful retreat.
            </p>
          </div>

          <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {amenitiesList.map((item, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3.5 rounded-2xl border border-stone-200/70 bg-white p-4.5 shadow-xs transition hover:border-stone-300 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <span
                  style={{ backgroundColor: `${primaryColor}20`, color: primaryColor }}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
                >
                  ✦
                </span>
                <span className="text-xs font-bold text-stone-800 dark:text-stone-200">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 5. INTERACTIVE PHOTO GALLERY */}
      {/* =================================================================== */}
      <section id="gallery" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <span
              style={{ color: primaryColor }}
              className="text-xs font-bold tracking-widest uppercase"
            >
              Visual Journey
            </span>
            <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
              Resort Photo Gallery
            </h2>
          </div>

          {/* Category Tabs */}
          <div className="flex flex-wrap gap-2">
            {categoriesSet.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={
                  activeCategory === cat
                    ? { backgroundColor: primaryColor, color: '#ffffff' }
                    : {}
                }
                className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition ${
                  activeCategory === cat
                    ? 'shadow-xs'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200 dark:bg-neutral-800 dark:text-stone-300'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Gallery Grid */}
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGallery.map((img) => (
            <div
              key={img.id}
              onClick={() => setLightboxImage(img.url)}
              className="group relative h-72 cursor-pointer overflow-hidden rounded-3xl bg-stone-100 shadow-xs dark:bg-neutral-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.url}
                alt={img.caption}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute inset-0 flex items-end bg-gradient-to-t from-stone-950/80 via-transparent to-transparent p-5 opacity-90 transition-opacity group-hover:opacity-100">
                <div>
                  <span className="rounded-md bg-white/20 px-2 py-0.5 text-[9px] font-bold text-white uppercase backdrop-blur-xs">
                    {img.category || 'Estate'}
                  </span>
                  <p className="mt-1 text-xs font-bold text-white">{img.caption}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Lightbox Modal */}
      {lightboxImage && (
        <div
          onClick={() => setLightboxImage(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm"
        >
          <div className="relative max-h-[90vh] max-w-5xl overflow-hidden rounded-2xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightboxImage}
              alt="Enlarged gallery preview"
              className="max-h-[85vh] w-auto rounded-2xl object-contain shadow-2xl"
            />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute top-4 right-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/80 text-black hover:bg-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* 6. LOCATION, MAP & DIRECT WHATSAPP CONTACT */}
      {/* =================================================================== */}
      <section id="contact" className="border-t border-stone-200/80 bg-white py-20 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
            {/* Contact details */}
            <div className="space-y-6">
              <span
                style={{ color: primaryColor }}
                className="text-xs font-bold tracking-widest uppercase"
              >
                Plan Your Arrival
              </span>
              <h2 className="text-3xl font-extrabold tracking-tight text-stone-900 sm:text-4xl dark:text-white">
                Visit {tenant.name}
              </h2>
              <p className="text-xs leading-relaxed text-stone-600 sm:text-sm dark:text-stone-300">
                Located amidst the serene landscapes of Raigad, easily accessible from Mumbai and Pune for weekend getaways and bespoke gatherings.
              </p>

              <div className="space-y-3 pt-2 text-xs">
                <div className="flex items-start gap-3">
                  <span className="text-base">📍</span>
                  <div>
                    <strong className="block font-bold text-stone-900 dark:text-white">Address:</strong>
                    <span className="text-stone-600 dark:text-stone-400">{address}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-base">📞</span>
                  <div>
                    <strong className="block font-bold text-stone-900 dark:text-white">Phone:</strong>
                    <a href={`tel:${contactPhone}`} className="text-stone-600 hover:underline dark:text-stone-400">
                      {contactPhone}
                    </a>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-base">✉️</span>
                  <div>
                    <strong className="block font-bold text-stone-900 dark:text-white">Email:</strong>
                    <a href={`mailto:${contactEmail}`} className="text-stone-600 hover:underline dark:text-stone-400">
                      {contactEmail}
                    </a>
                  </div>
                </div>
              </div>

              {/* Direct WhatsApp Action Button */}
              <div className="pt-4">
                <a
                  href={`https://wa.me/${cleanWhatsApp}?text=${encodeURIComponent(
                    `Hi ${tenant.name}, I would like to inquire about booking a stay.`
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2.5 rounded-2xl bg-emerald-600 px-6 py-3.5 text-xs font-bold text-white shadow-md transition hover:bg-emerald-500"
                >
                  <span className="text-base">💬</span>
                  <span>Chat on WhatsApp Directly</span>
                </a>
              </div>
            </div>

            {/* Google Maps Card */}
            <div className="overflow-hidden rounded-3xl border border-stone-200 bg-stone-50 shadow-md dark:border-neutral-800 dark:bg-neutral-850">
              <div className="h-80 w-full bg-stone-200 dark:bg-neutral-800">
                <iframe
                  title="Resort Location"
                  width="100%"
                  height="100%"
                  style={{ border: 0 }}
                  loading="lazy"
                  allowFullScreen
                  src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d120892.29656885387!2d73.0768916!3d18.5204303!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3be800e000000001%3A0x1000000000000000!2sRaigad%2C%20Maharashtra!5e0!3m2!1sen!2sin!4v1600000000000"
                />
              </div>
              <div className="p-4 text-center">
                <a
                  href={settings.google_maps_url || 'https://maps.google.com/?q=Raigad,Maharashtra'}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-bold text-stone-700 hover:underline dark:text-stone-300"
                >
                  Open in Google Maps App ↗
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =================================================================== */}
      {/* 7. RESORT FOOTER */}
      {/* =================================================================== */}
      <footer className="border-t border-stone-200/80 bg-stone-100 py-8 text-center text-xs text-stone-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <p>© {new Date().getFullYear()} {tenant.name}. All rights reserved.</p>
          <p className="mt-2 text-[11px]">
            Check-in: {settings.check_in_time || '14:00'} · Check-out: {settings.check_out_time || '11:00'}
          </p>
          <div className="mt-4 border-t border-stone-200/60 pt-4 dark:border-neutral-900">
            <Link
              href="/"
              className="text-[10px] text-stone-400 hover:text-stone-700 dark:hover:text-stone-300"
            >
              Powered by PropSyncHub Platform
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
