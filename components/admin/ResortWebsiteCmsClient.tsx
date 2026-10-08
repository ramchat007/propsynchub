'use client';

import React, { useState, useTransition } from 'react';
import Link from 'next/link';
import { Tenant } from '@/types';
import { updateResortWebsiteSettings, uploadBrandLogo } from '@/app/actions/tenant';
import { ToastContainer, ToastMessage } from './Toast';

interface ResortWebsiteCmsClientProps {
  tenant: Tenant;
}

const PRESET_AMENITIES = [
  'Private Swimming Pool',
  'Outdoor Hydrotherapy Jacuzzi',
  'Party Lawn & Gazebo',
  'High-Speed Wi-Fi',
  '100% Generator Power Backup',
  'On-site Private Chef & Caretaker',
  'Outdoor Barbecue & Bonfire Pit',
  'Pet Friendly Estate',
  'Air Conditioned Bedrooms',
  'Bluetooth Sound System',
  'Smart TV with OTT Subscriptions',
  'Secured On-site Parking',
];

interface ResortWebsiteSettings {
  tagline?: string;
  about_description?: string;
  hero_image_url?: string;
  address?: string;
  google_maps_url?: string;
  whatsapp_number?: string;
  check_in_time?: string;
  check_out_time?: string;
  amenities?: string[];
  gallery_images?: Array<{ id: string; url: string; caption: string; category?: string }>;
}

export default function ResortWebsiteCmsClient({ tenant }: ResortWebsiteCmsClientProps) {
  const settings = (tenant.settings as unknown as ResortWebsiteSettings) || {};

  // Form states
  const [tagline, setTagline] = useState(
    settings.tagline || 'Luxury Boutique Villa, Private Jacuzzi & Swimming Pool'
  );
  const [aboutDescription, setAboutDescription] = useState(
    settings.about_description ||
      'Escape the city into an exclusive private sanctuary surrounded by nature.'
  );
  const [heroImageUrl, setHeroImageUrl] = useState(
    settings.hero_image_url ||
      'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1920&q=80'
  );
  const [address, setAddress] = useState(
    settings.address || 'Survey No. 42, Tropical Greens, Raigad District, Maharashtra 402107'
  );
  const [googleMapsUrl, setGoogleMapsUrl] = useState(
    settings.google_maps_url || 'https://maps.google.com/?q=Raigad,Maharashtra'
  );
  const [whatsappNumber, setWhatsappNumber] = useState(
    settings.whatsapp_number || tenant.contact_phone || '+91 99999 99999'
  );
  const [contactPhone, setContactPhone] = useState(
    tenant.contact_phone || '+91 99999 99999'
  );
  const [contactEmail, setContactEmail] = useState(
    tenant.contact_email || 'stay@resort.com'
  );
  const [checkInTime, setCheckInTime] = useState(settings.check_in_time || '14:00');
  const [checkOutTime, setCheckOutTime] = useState(settings.check_out_time || '11:00');

  // Amenities checklist
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>(
    Array.isArray(settings.amenities) && settings.amenities.length > 0
      ? settings.amenities
      : [
          'Private Swimming Pool',
          'Outdoor Hydrotherapy Jacuzzi',
          'Party Lawn & Gazebo',
          'High-Speed Wi-Fi',
          '100% Generator Power Backup',
          'On-site Private Chef & Caretaker',
          'Outdoor Barbecue & Bonfire Pit',
          'Pet Friendly Estate',
        ]
  );

  // Gallery items state
  const [galleryImages, setGalleryImages] = useState<
    Array<{ id: string; url: string; caption: string; category?: string }>
  >(
    Array.isArray(settings.gallery_images) && settings.gallery_images.length > 0
      ? settings.gallery_images
      : [
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
        ]
  );

  // New photo input state
  const [newPhotoUrl, setNewPhotoUrl] = useState('');
  const [newPhotoCaption, setNewPhotoCaption] = useState('');
  const [newPhotoCategory, setNewPhotoCategory] = useState('Pool');
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Form submission state
  const [isPending, startTransition] = useTransition();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  function addToast(type: 'success' | 'error' | 'info', message: string) {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }

  function toggleAmenity(item: string) {
    if (selectedAmenities.includes(item)) {
      setSelectedAmenities(selectedAmenities.filter((a) => a !== item));
    } else {
      setSelectedAmenities([...selectedAmenities, item]);
    }
  }

  function handleAddGalleryPhoto() {
    if (!newPhotoUrl.trim()) {
      addToast('error', 'Please enter an image URL or upload a photo.');
      return;
    }

    const newItem = {
      id: Date.now().toString(),
      url: newPhotoUrl.trim(),
      caption: newPhotoCaption.trim() || 'Resort Photo',
      category: newPhotoCategory,
    };

    setGalleryImages([newItem, ...galleryImages]);
    setNewPhotoUrl('');
    setNewPhotoCaption('');
    addToast('success', 'Photo added to gallery.');
  }

  function handleRemovePhoto(id: string) {
    setGalleryImages(galleryImages.filter((img) => img.id !== id));
  }

  // Handle direct file upload to brand_assets
  async function handleFileUpload(file: File) {
    setIsUploadingPhoto(true);
    try {
      const uploadFormData = new FormData();
      uploadFormData.set('file', file);
      uploadFormData.set('subdomain', tenant.subdomain || 'resort');

      const res = await uploadBrandLogo(uploadFormData);
      if (res.success && res.url) {
        setNewPhotoUrl(res.url);
        addToast('success', 'Image uploaded successfully!');
      } else {
        throw new Error(res.error || 'Upload failed');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      addToast('error', msg);
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const formData = new FormData();
      formData.set('tenantId', tenant.id);
      formData.set('tagline', tagline);
      formData.set('aboutDescription', aboutDescription);
      formData.set('heroImageUrl', heroImageUrl);
      formData.set('address', address);
      formData.set('googleMapsUrl', googleMapsUrl);
      formData.set('whatsappNumber', whatsappNumber);
      formData.set('contactPhone', contactPhone);
      formData.set('contactEmail', contactEmail);
      formData.set('checkInTime', checkInTime);
      formData.set('checkOutTime', checkOutTime);
      formData.set('amenities', JSON.stringify(selectedAmenities));
      formData.set('galleryImages', JSON.stringify(galleryImages));

      const res = await updateResortWebsiteSettings(formData);
      if (res.success) {
        addToast('success', res.message || 'Website settings saved!');
      } else {
        addToast('error', res.error || 'Failed to save settings.');
      }
    });
  }

  const liveResortUrl = `/${tenant.subdomain || tenant.id}`;

  return (
    <div className="space-y-8 max-w-5xl">
      <ToastContainer
        toasts={toasts}
        onDismiss={(id) => setToasts((t) => t.filter((x) => x.id !== id))}
      />

      {/* HEADER */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs text-neutral-500">
            <Link href="/dashboard" className="hover:underline">Dashboard</Link>
            <span>/</span>
            <span className="font-semibold text-neutral-800 dark:text-neutral-200">Website CMS</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 sm:text-3xl">
            Resort Website &amp; Media CMS
          </h1>
          <p className="text-xs text-neutral-500">
            Customize the public guest-facing website for <strong className="text-neutral-800 dark:text-neutral-200">{tenant.name}</strong>. Zero code required.
          </p>
        </div>

        <Link
          href={liveResortUrl}
          target="_blank"
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-500 transition"
        >
          <span>View Live Resort Website</span>
          <span className="text-sm">↗</span>
        </Link>
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
            className="border-b-2 border-emerald-600 pb-3 text-xs sm:text-sm font-bold text-emerald-600 dark:border-emerald-500 dark:text-emerald-400 flex items-center gap-2"
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

      <form onSubmit={handleSaveSettings} className="space-y-8">
        {/* ================================================================= */}
        {/* SECTION 1: HERO & BRAND STORY */}
        {/* ================================================================= */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            1. Hero Banner &amp; Brand Story
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            The first impression guests see when landing on your resort portal.
          </p>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Resort Headline / Tagline
              </label>
              <input
                type="text"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                placeholder="e.g. Private Luxury Villa with Jacuzzi & Swimming Pool"
                required
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Resort Overview &amp; Story
              </label>
              <textarea
                rows={3}
                value={aboutDescription}
                onChange={(e) => setAboutDescription(e.target.value)}
                placeholder="Describe the peaceful atmosphere, private amenities, and nature surrounding your property..."
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Hero Cover Photo URL
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  type="url"
                  value={heroImageUrl}
                  onChange={(e) => setHeroImageUrl(e.target.value)}
                  placeholder="https://..."
                  required
                  className="w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
                />
              </div>

              {heroImageUrl && (
                <div className="mt-3 relative h-40 overflow-hidden rounded-2xl border border-neutral-200 dark:border-neutral-800">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={heroImageUrl}
                    alt="Hero banner preview"
                    className="h-full w-full object-cover"
                  />
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] text-white">
                    Cover Preview
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================= */}
        {/* SECTION 2: PHOTO GALLERY MANAGER */}
        {/* ================================================================= */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-neutral-900 dark:text-white">
                2. Resort Photo Gallery
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                Upload and manage high-resolution photos of your pool, jacuzzi, bedrooms, and gardens.
              </p>
            </div>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-bold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
              {galleryImages.length} Photos
            </span>
          </div>

          {/* Add Photo Sub-Form */}
          <div className="mt-6 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-850">
            <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-700 dark:text-neutral-300">
              + Add Photo to Showcase
            </h3>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <input
                  type="url"
                  placeholder="Paste Image URL (https://...) or choose file below"
                  value={newPhotoUrl}
                  onChange={(e) => setNewPhotoUrl(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <select
                  value={newPhotoCategory}
                  onChange={(e) => setNewPhotoCategory(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                >
                  <option value="Pool">Pool &amp; Water</option>
                  <option value="Wellness">Jacuzzi &amp; Wellness</option>
                  <option value="Rooms">Villas &amp; Rooms</option>
                  <option value="Outdoors">Gardens &amp; Lawn</option>
                  <option value="Dining">Dining &amp; Barbecue</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <input
                  type="text"
                  placeholder="Caption (e.g. Hydrotherapy Jacuzzi & Sun Deck)"
                  value={newPhotoCaption}
                  onChange={(e) => setNewPhotoCaption(e.target.value)}
                  className="w-full rounded-xl border border-neutral-300 bg-white px-3 py-2 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex gap-2">
                <label className="flex-1 cursor-pointer flex items-center justify-center rounded-xl border border-dashed border-neutral-400 bg-white px-3 py-2 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                  <span>{isUploadingPhoto ? 'Uploading...' : '📁 Upload File'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    disabled={isUploadingPhoto}
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleFileUpload(e.target.files[0]);
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleAddGalleryPhoto}
                  className="rounded-xl bg-neutral-900 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {/* Current Gallery Grid */}
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {galleryImages.map((img) => (
              <div
                key={img.id}
                className="group relative overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-800"
              >
                <div className="h-36 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.url}
                    alt={img.caption}
                    className="h-full w-full object-cover transition group-hover:scale-105"
                  />
                </div>
                <div className="p-2.5">
                  <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[9px] font-bold text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200">
                    {img.category || 'Resort'}
                  </span>
                  <p className="mt-1 truncate text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                    {img.caption}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemovePhoto(img.id)}
                  className="absolute top-2 right-2 flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white shadow-md hover:bg-rose-500"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* ================================================================= */}
        {/* SECTION 3: AMENITIES MATRIX */}
        {/* ================================================================= */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            3. Amenities &amp; Resort Experience Checklist
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Check the amenities available at your property to display as badges on your website.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {PRESET_AMENITIES.map((item) => {
              const isSelected = selectedAmenities.includes(item);
              return (
                <button
                  type="button"
                  key={item}
                  onClick={() => toggleAmenity(item)}
                  className={`flex items-center gap-2 rounded-xl border p-3 text-left text-xs font-semibold transition ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/80 text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200'
                      : 'border-neutral-200 bg-neutral-50 text-neutral-600 hover:border-neutral-300 dark:border-neutral-800 dark:bg-neutral-850 dark:text-neutral-400'
                  }`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-md border text-[10px] ${
                    isSelected
                      ? 'border-emerald-600 bg-emerald-600 text-white'
                      : 'border-neutral-400 dark:border-neutral-600'
                  }`}>
                    {isSelected && '✓'}
                  </span>
                  <span>{item}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================================================================= */}
        {/* SECTION 4: CONTACT & LOCATION */}
        {/* ================================================================= */}
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 sm:p-8">
          <h2 className="text-base font-bold text-neutral-900 dark:text-white">
            4. Guest Concierge &amp; Location
          </h2>
          <p className="mt-1 text-xs text-neutral-500">
            Enable guests to chat directly on WhatsApp and find driving directions.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                WhatsApp Business Number
              </label>
              <input
                type="text"
                value={whatsappNumber}
                onChange={(e) => setWhatsappNumber(e.target.value)}
                placeholder="+919999999999"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
              <p className="mt-1 text-[11px] text-neutral-500">
                Direct WhatsApp chat button will route to this number.
              </p>
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Support Phone Call
              </label>
              <input
                type="text"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+91 98000 00000"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Concierge Email
              </label>
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="stay@raigadtropical.com"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Google Maps Navigation Link
              </label>
              <input
                type="url"
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/?q=..."
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Full Physical Address
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Survey No. 42, Tropical Greens, Raigad, Maharashtra"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Check-in Time
              </label>
              <input
                type="text"
                value={checkInTime}
                onChange={(e) => setCheckInTime(e.target.value)}
                placeholder="14:00 (2:00 PM)"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase dark:text-neutral-300">
                Check-out Time
              </label>
              <input
                type="text"
                value={checkOutTime}
                onChange={(e) => setCheckOutTime(e.target.value)}
                placeholder="11:00 (11:00 AM)"
                className="mt-1.5 w-full rounded-xl border border-neutral-300 bg-transparent px-3.5 py-2.5 text-xs text-neutral-900 focus:border-emerald-500 focus:outline-none dark:border-neutral-700 dark:text-neutral-100"
              />
            </div>
          </div>
        </div>

        {/* SUBMIT BUTTON BAR */}
        <div className="flex items-center justify-end gap-4 border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <Link
            href={liveResortUrl}
            target="_blank"
            className="rounded-xl border border-neutral-300 px-5 py-3 text-xs font-bold text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Preview Changes ↗
          </Link>

          <button
            type="submit"
            disabled={isPending}
            className="rounded-xl bg-emerald-600 px-6 py-3 text-xs font-bold text-white shadow-md hover:bg-emerald-500 disabled:opacity-50 transition"
          >
            {isPending ? 'Saving Settings...' : 'Save & Publish Website Changes'}
          </button>
        </div>
      </form>
    </div>
  );
}
