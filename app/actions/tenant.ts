'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { Tenant } from '@/types';

export interface SubdomainCheckResponse {
  success: boolean;
  available: boolean;
  subdomain: string;
  error?: string;
  message?: string;
}

export interface OnboardingActionResponse {
  success: boolean;
  error?: string;
  message?: string;
  tenant?: Tenant;
  redirectTo?: string;
}

// Subdomains reserved by the platform
const RESERVED_SUBDOMAINS = new Set([
  'admin',
  'api',
  'app',
  'auth',
  'billing',
  'book',
  'booking',
  'bookings',
  'dashboard',
  'docs',
  'help',
  'login',
  'logout',
  'mail',
  'onboarding',
  'pricing',
  'root',
  'settings',
  'support',
  'sys',
  'system',
  'test',
  'webhook',
  'www',
]);

/**
 * 1. REAL-TIME SUBDOMAIN VALIDATION SERVER ACTION
 * Checks whether the requested subdomain is valid and available.
 */
export async function checkSubdomainAvailability(
  rawSubdomain: string
): Promise<SubdomainCheckResponse> {
  try {
    if (!rawSubdomain || typeof rawSubdomain !== 'string') {
      return {
        success: false,
        available: false,
        subdomain: '',
        error: 'Please enter a subdomain.',
      };
    }

    // Clean and normalize subdomain
    const cleaned = rawSubdomain
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    // Check length (minimum 3, maximum 63 characters)
    if (cleaned.length < 3) {
      return {
        success: false,
        available: false,
        subdomain: cleaned,
        error: 'Subdomain must be at least 3 characters long.',
      };
    }

    if (cleaned.length > 63) {
      return {
        success: false,
        available: false,
        subdomain: cleaned,
        error: 'Subdomain cannot exceed 63 characters.',
      };
    }

    // Validate slug structure (cannot start or end with a hyphen)
    if (cleaned.startsWith('-') || cleaned.endsWith('-')) {
      return {
        success: false,
        available: false,
        subdomain: cleaned,
        error: 'Subdomain cannot start or end with a hyphen.',
      };
    }

    // Check against platform reserved subdomains
    if (RESERVED_SUBDOMAINS.has(cleaned)) {
      return {
        success: false,
        available: false,
        subdomain: cleaned,
        error: `"${cleaned}" is a reserved system domain and cannot be claimed.`,
      };
    }

    // Query database for conflicting tenant subdomain
    const adminDb = createAdminClient();
    const { data: existing, error: queryError } = await adminDb
      .from('tenants')
      .select('id, name')
      .eq('subdomain', cleaned)
      .maybeSingle();

    if (queryError) {
      console.warn('[Subdomain Query Warning]:', queryError.message);
    }

    if (existing) {
      return {
        success: true,
        available: false,
        subdomain: cleaned,
        error: `Subdomain "${cleaned}.propsynchub.com" is already claimed by another resort.`,
      };
    }

    return {
      success: true,
      available: true,
      subdomain: cleaned,
      message: `"${cleaned}.propsynchub.com" is available!`,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error validating subdomain.';
    return {
      success: false,
      available: false,
      subdomain: rawSubdomain,
      error: message,
    };
  }
}

/**
 * 2. BRAND LOGO UPLOAD SERVER ACTION
 * Uploads logo file to the 'brand_assets' Supabase Storage bucket.
 */
export async function uploadBrandLogo(
  formData: FormData
): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    const file = formData.get('logo') as File | null;
    if (!file || !(file instanceof File) || file.size === 0) {
      return { success: false, error: 'No logo file provided.' };
    }

    // Validate size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return { success: false, error: 'File size exceeds 5MB limit.' };
    }

    // Validate mime type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return {
        success: false,
        error: 'Unsupported image format. Allowed formats: PNG, JPG, WEBP, SVG.',
      };
    }

    const adminDb = createAdminClient();
    const buffer = Buffer.from(await file.arrayBuffer());

    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const filename = `logo_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;

    const { error: uploadError } = await adminDb.storage
      .from('brand_assets')
      .upload(filename, buffer, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadError) {
      throw uploadError;
    }

    const { data: urlData } = adminDb.storage
      .from('brand_assets')
      .getPublicUrl(filename);

    return {
      success: true,
      url: urlData.publicUrl,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to upload brand logo.';
    return { success: false, error: message };
  }
}

/**
 * 3. COMPLETE ONBOARDING & ASSIGN OWNER ROLE
 * Inserts new resort into 'tenants' table and assigns the owner 'tenant_admin' role.
 */
export async function completeOwnerOnboarding(
  formData: FormData
): Promise<OnboardingActionResponse> {
  try {
    const resortName = formData.get('resortName')?.toString()?.trim();
    const rawSubdomain = formData.get('subdomain')?.toString()?.trim();
    const primaryColorHex = formData.get('primaryColorHex')?.toString()?.trim() || '#059669';
    const logoUrl = formData.get('logoUrl')?.toString()?.trim() || null;

    if (!resortName) {
      return { success: false, error: 'Resort name is required.' };
    }

    if (!rawSubdomain) {
      return { success: false, error: 'Subdomain is required.' };
    }

    // 1. Re-validate subdomain availability
    const subCheck = await checkSubdomainAvailability(rawSubdomain);
    if (!subCheck.available) {
      return {
        success: false,
        error: subCheck.error || 'Requested subdomain is unavailable.',
      };
    }

    const cleanSubdomain = subCheck.subdomain;

    // 2. Authenticate current user session
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        success: false,
        error: 'Unauthorized: You must be logged in to create a resort.',
      };
    }

    const adminDb = createAdminClient();

    // 3. Insert new tenant record
    const { data: newTenant, error: insertTenantError } = await adminDb
      .from('tenants')
      .insert({
        name: resortName,
        subdomain: cleanSubdomain,
        logo_url: logoUrl,
        is_active: true,
        settings: {
          primary_color_hex: primaryColorHex,
          onboarded_at: new Date().toISOString(),
          onboarded_by: user.id,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertTenantError || !newTenant) {
      throw new Error(insertTenantError?.message || 'Failed to create tenant organization.');
    }

    const createdTenant = newTenant as unknown as Tenant;

    // 4. Update current user's profile to assign tenant_id and upgrade role to 'tenant_admin'
    const { data: existingProfile } = await adminDb
      .from('profiles')
      .select('id')
      .eq('id', user.id)
      .maybeSingle();

    if (existingProfile) {
      const { error: profileUpdateError } = await adminDb
        .from('profiles')
        .update({
          tenant_id: createdTenant.id,
          role: 'tenant_admin',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);

      if (profileUpdateError) {
        console.warn('[Profile Upgrade Warning]:', profileUpdateError.message);
      }
    } else {
      // Upsert profile if trigger did not auto-create it
      const { error: profileInsertError } = await adminDb
        .from('profiles')
        .insert({
          id: user.id,
          tenant_id: createdTenant.id,
          mobile_number: user.phone || '+919999999999',
          full_name: resortName + ' Admin',
          role: 'tenant_admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (profileInsertError) {
        console.warn('[Profile Insert Warning]:', profileInsertError.message);
      }
    }

    // 5. Revalidate cache
    revalidatePath('/dashboard');
    revalidatePath('/settings');
    revalidatePath('/bookings');
    revalidatePath('/audit-logs');

    return {
      success: true,
      message: `Resort "${resortName}" launched successfully!`,
      tenant: createdTenant,
      redirectTo: '/dashboard',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to finalize owner onboarding.';
    return { success: false, error: message };
  }
}

/**
 * 4. UPDATE RESORT WEBSITE CMS SETTINGS
 * Allows resort owners to update their hero banner, story, gallery photos,
 * amenities checklist, and WhatsApp concierge settings.
 */
export async function updateResortWebsiteSettings(
  formData: FormData
): Promise<{ success: boolean; error?: string; message?: string }> {
  try {
    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Session required.' };
    }

    const tenantId = formData.get('tenantId')?.toString();
    if (!tenantId) {
      return { success: false, error: 'Missing tenant ID.' };
    }

    const adminDb = createAdminClient();

    // Fetch existing settings
    const { data: existingTenant, error: fetchError } = await adminDb
      .from('tenants')
      .select('settings, name, subdomain, contact_phone, contact_email')
      .eq('id', tenantId)
      .single();

    if (fetchError || !existingTenant) {
      return { success: false, error: 'Tenant record not found.' };
    }

    const existingSettings = (existingTenant.settings as Record<string, any>) || {};

    // Parse incoming values
    const tagline = formData.get('tagline')?.toString() || existingSettings.tagline;
    const aboutDescription = formData.get('aboutDescription')?.toString() || existingSettings.about_description;
    const heroImageUrl = formData.get('heroImageUrl')?.toString() || existingSettings.hero_image_url;
    const address = formData.get('address')?.toString() || existingSettings.address;
    const googleMapsUrl = formData.get('googleMapsUrl')?.toString() || existingSettings.google_maps_url;
    const whatsappNumber = formData.get('whatsappNumber')?.toString() || existingSettings.whatsapp_number;
    const contactPhone = formData.get('contactPhone')?.toString() || existingTenant.contact_phone;
    const contactEmail = formData.get('contactEmail')?.toString() || existingTenant.contact_email;
    const checkInTime = formData.get('checkInTime')?.toString() || existingSettings.check_in_time || '14:00';
    const checkOutTime = formData.get('checkOutTime')?.toString() || existingSettings.check_out_time || '11:00';

    let amenities: string[] = existingSettings.amenities || [];
    const rawAmenities = formData.get('amenities')?.toString();
    if (rawAmenities) {
      try {
        amenities = JSON.parse(rawAmenities);
      } catch {
        // Ignored
      }
    }

    let galleryImages = existingSettings.gallery_images || [];
    const rawGallery = formData.get('galleryImages')?.toString();
    if (rawGallery) {
      try {
        galleryImages = JSON.parse(rawGallery);
      } catch {
        // Ignored
      }
    }

    const updatedSettings = {
      ...existingSettings,
      tagline,
      about_description: aboutDescription,
      hero_image_url: heroImageUrl,
      address,
      google_maps_url: googleMapsUrl,
      whatsapp_number: whatsappNumber,
      contact_phone: contactPhone,
      contact_email: contactEmail,
      check_in_time: checkInTime,
      check_out_time: checkOutTime,
      amenities,
      gallery_images: galleryImages,
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await adminDb
      .from('tenants')
      .update({
        settings: updatedSettings,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateError) {
      throw new Error(updateError.message);
    }

    revalidatePath('/settings/website');
    revalidatePath('/dashboard');
    if (existingTenant.subdomain) {
      revalidatePath(`/${existingTenant.subdomain}`);
    }

    return {
      success: true,
      message: 'Resort website & media settings updated successfully!',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating website settings.';
    return { success: false, error: message };
  }
}
