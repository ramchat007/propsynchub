'use server';

import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase';
import { Tenant } from '@/types';
import { notifications } from '@/lib/notifications';
import { AUTHORIZED_ADMIN_EMAILS } from '@/lib/auth/admin-guard';

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

    const clientAdminEmail = formData.get('clientAdminEmail')?.toString()?.trim()?.toLowerCase() || null;
    const contactEmail = clientAdminEmail || user.email?.toLowerCase() || null;
    const legalName = formData.get('legalName')?.toString()?.trim() || resortName;
    const rawGstin = formData.get('gstin')?.toString()?.trim()?.toUpperCase() || null;
    const rawPan = formData.get('pan')?.toString()?.trim()?.toUpperCase() || null;

    if (rawGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(rawGstin)) {
      return {
        success: false,
        error: 'Invalid GSTIN format. Must be 15 alphanumeric characters (e.g. 27AAPCR1234F1Z5).',
      };
    }

    if (rawPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(rawPan)) {
      return {
        success: false,
        error: 'Invalid PAN format. Must be 10 alphanumeric characters (e.g. AAPCR1234F).',
      };
    }

    // 3. Insert new tenant record
    const { data: newTenant, error: insertTenantError } = await adminDb
      .from('tenants')
      .insert({
        name: resortName,
        subdomain: cleanSubdomain,
        logo_url: logoUrl,
        contact_email: contactEmail,
        is_active: true,
        settings: {
          legal_name: legalName,
          gstin: rawGstin || undefined,
          pan: rawPan || (rawGstin ? rawGstin.slice(2, 12) : undefined),
          primary_color_hex: primaryColorHex,
          onboarded_at: new Date().toISOString(),
          onboarded_by: user.id,
          admin_emails: contactEmail ? [contactEmail] : [],
          module_entitlements: {
            restaurant: true,
            activities: true,
            housekeeping: true,
            guest_services: true,
            reviews: true,
            accounting_exports: true,
            digital_guest_portal: true,
          },
          subscription: {
            status: 'trial',
            plan: 'pro',
            trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
            payment_mode: 'free_trial',
            amount_inr: 0,
            submitted_at: new Date().toISOString(),
          },
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

    // 4. If creating for a separate client admin, provision their account as tenant_admin
    if (clientAdminEmail && clientAdminEmail !== user.email?.toLowerCase()) {
      try {
        const { data: existingUsers } = await adminDb.auth.admin.listUsers();
        const targetUser = existingUsers?.users?.find(
          (u) => u.email?.toLowerCase() === clientAdminEmail
        );

        let targetUserId: string;

        if (!targetUser) {
          const syntheticPassword = `PSH_${Buffer.from(clientAdminEmail).toString('hex').slice(0, 8)}!2026`;
          const { data: createdUser } = await adminDb.auth.admin.createUser({
            email: clientAdminEmail,
            password: syntheticPassword,
            email_confirm: true,
            user_metadata: {
              full_name: resortName + ' Admin',
              tenant_id: createdTenant.id,
            },
          });
          targetUserId = createdUser?.user?.id || '';
        } else {
          targetUserId = targetUser.id;
        }

        if (targetUserId) {
          await adminDb.from('profiles').upsert(
            {
              id: targetUserId,
              tenant_id: createdTenant.id,
              role: 'tenant_admin',
              full_name: resortName + ' Admin',
              mobile_number: '+919999999999',
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://propsynchub.netlify.app';
          await notifications.sendTeamInviteEmail({
            to: clientAdminEmail,
            inviteeName: resortName + ' Admin',
            resortName,
            role: 'tenant_admin',
            inviterName: user.email || 'PropSyncHub Platform',
            loginUrl: `${appUrl}/login`,
          });
        }
      } catch (clientErr) {
        console.warn('[Onboarding] Error provisioning client admin account:', clientErr);
      }
    } else {
      // 4b. Update current user's profile to assign tenant_id and upgrade role to 'tenant_admin'
      const { data: existingProfile } = await adminDb
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle();

      if (existingProfile) {
        await adminDb
          .from('profiles')
          .update({
            tenant_id: createdTenant.id,
            role: 'tenant_admin',
            updated_at: new Date().toISOString(),
          })
          .eq('id', user.id);
      } else {
        await adminDb.from('profiles').insert({
          id: user.id,
          tenant_id: createdTenant.id,
          mobile_number: user.phone || '+919999999999',
          full_name: resortName + ' Admin',
          role: 'tenant_admin',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
    }

    // 5. Set active tenant cookie so the creator immediately views this newly launched resort
    const cookieStore = await cookies();
    cookieStore.set('active_tenant_id', createdTenant.id, {
      path: '/',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    // 6. Revalidate cache
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

    const existingSettings = (existingTenant.settings as Record<string, unknown>) || {};

    // Parse incoming values
    const tagline = formData.get('tagline')?.toString() || (existingSettings.tagline as string | undefined);
    const aboutDescription = formData.get('aboutDescription')?.toString() || (existingSettings.about_description as string | undefined);
    const heroImageUrl = formData.get('heroImageUrl')?.toString() || (existingSettings.hero_image_url as string | undefined);
    const address = formData.get('address')?.toString() || (existingSettings.address as string | undefined);
    const googleMapsUrl = formData.get('googleMapsUrl')?.toString() || (existingSettings.google_maps_url as string | undefined);
    const whatsappNumber = formData.get('whatsappNumber')?.toString() || (existingSettings.whatsapp_number as string | undefined);
    const contactPhone = formData.get('contactPhone')?.toString() || existingTenant.contact_phone;
    const contactEmail = formData.get('contactEmail')?.toString() || existingTenant.contact_email;
    const checkInTime = formData.get('checkInTime')?.toString() || (existingSettings.check_in_time as string | undefined) || '14:00';
    const checkOutTime = formData.get('checkOutTime')?.toString() || (existingSettings.check_out_time as string | undefined) || '11:00';

    let amenities: string[] = (existingSettings.amenities as string[]) || [];
    const rawAmenities = formData.get('amenities')?.toString();
    if (rawAmenities) {
      try {
        amenities = JSON.parse(rawAmenities);
      } catch {
        // Ignored
      }
    }

    let galleryImages = (existingSettings.gallery_images as unknown[]) || [];
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

/**
 * 5. SWITCH ACTIVE RESORT (Multi-Resort Selector)
 */
export async function switchActiveResort(targetTenantId: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (!targetTenantId) {
      return { success: false, error: 'Target resort ID is required.' };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized.' };
    }

    const adminDb = createAdminClient();
    const email = (user.email || '').toLowerCase().trim();

    // Verify tenant exists and is active
    const { data: targetTenant } = await adminDb
      .from('tenants')
      .select('id, name, contact_email, settings')
      .eq('id', targetTenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (!targetTenant) {
      return { success: false, error: 'Requested resort is inactive or does not exist.' };
    }

    // Verify authorization: either platform superadmin or authorized member
    const isPlatformAdmin = AUTHORIZED_ADMIN_EMAILS.includes(email);

    if (!isPlatformAdmin) {
      const { data: profile } = await adminDb
        .from('profiles')
        .select('tenant_id, role')
        .eq('id', user.id)
        .maybeSingle();

      const settings = (targetTenant.settings as Record<string, unknown>) || {};
      const adminEmails = Array.isArray(settings.admin_emails) ? (settings.admin_emails as string[]) : [];
      const isEmailAuthorized =
        (targetTenant.contact_email && targetTenant.contact_email.toLowerCase() === email) ||
        adminEmails.map((e) => e.toLowerCase()).includes(email);

      const isProfileAuthorized = profile?.tenant_id === targetTenantId && profile?.role !== 'guest';

      if (!isEmailAuthorized && !isProfileAuthorized) {
        return { success: false, error: 'You are not authorized to manage this resort property.' };
      }
    }

    // Set active_tenant_id cookie
    const cookieStore = await cookies();
    cookieStore.set('active_tenant_id', targetTenantId, {
      path: '/',
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });

    revalidatePath('/dashboard');
    revalidatePath('/bookings');
    revalidatePath('/calendar');
    revalidatePath('/inventory');
    revalidatePath('/settings');

    return { success: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error switching active resort.';
    return { success: false, error: message };
  }
}

/**
 * 6. GET RESORT TAX AND MEAL PLAN SETTINGS
 * Accountant-verifiable configuration reader
 */
export async function getResortTaxAndMealSettings(tenantId: string) {
  try {
    if (!tenantId) {
      return { success: false, error: 'Tenant ID required.' };
    }

    const adminDb = createAdminClient();
    const { data: tenant, error } = await adminDb
      .from('tenants')
      .select('id, name, subdomain, settings')
      .eq('id', tenantId)
      .maybeSingle();

    if (error || !tenant) {
      return { success: false, error: 'Resort not found.' };
    }

    const settings = (tenant.settings as Record<string, unknown>) || {};
    
    // Dynamic import to prevent circular dependency
    const { DEFAULT_TAX_SCHEDULES } = await import('@/lib/tax-engine');
    const { STANDARD_MEAL_PLANS } = await import('@/lib/meal-plans');

    const taxSchedules =
      Array.isArray(settings.tax_schedules) && settings.tax_schedules.length > 0
        ? settings.tax_schedules
        : DEFAULT_TAX_SCHEDULES;

    const mealPlans =
      typeof settings.meal_plans === 'object' && settings.meal_plans !== null
        ? settings.meal_plans
        : STANDARD_MEAL_PLANS;

    return {
      success: true,
      data: {
        tenantId: tenant.id,
        resortName: tenant.name,
        legalName: (settings.legal_name as string) || tenant.name,
        gstin: (settings.gstin as string) || '',
        stateCode: (settings.state_code as string) || '27',
        stateName: (settings.state_name as string) || 'Maharashtra',
        invoicePrefix: (settings.invoice_prefix as string) || 'INV',
        pricingMode: ((settings.tax_pricing_mode as string) || 'inclusive') as 'inclusive' | 'exclusive',
        taxSchedules,
        mealPlans,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch tax settings.';
    return { success: false, error: message };
  }
}

/**
 * 7. UPDATE RESORT TAX & GST SETTINGS
 * Saves accountant-verifiable tax schedules, GSTIN, state code, and pricing inclusivity mode.
 */
export async function updateResortTaxSettings(payload: {
  tenantId: string;
  legalName?: string;
  gstin?: string;
  stateCode?: string;
  stateName?: string;
  invoicePrefix?: string;
  pricingMode?: 'inclusive' | 'exclusive';
  taxSchedules?: import('@/types').TaxSchedule[];
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { tenantId, legalName, gstin, stateCode, stateName, invoicePrefix, pricingMode, taxSchedules } = payload;
    if (!tenantId) {
      return { success: false, error: 'Resort tenant ID is required.' };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Session required.' };
    }

    const adminDb = createAdminClient();
    const email = (user.email || '').toLowerCase().trim();

    // Verify tenant exists
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('id, name, settings, contact_email')
      .eq('id', tenantId)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resort tenant not found.' };
    }

    // Role check: superadmin, tenant_admin, resort_manager, accountant
    const isSuperAdmin = AUTHORIZED_ADMIN_EMAILS.includes(email);
    if (!isSuperAdmin) {
      const { data: profile } = await adminDb
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      const userRole = profile?.role;
      const allowedRoles = ['tenant_admin', 'resort_manager', 'accountant'];
      if (profile?.tenant_id !== tenantId || !allowedRoles.includes(userRole || '')) {
        return { success: false, error: 'Forbidden: Only resort administrators and accountants can configure taxes.' };
      }
    }

    // GSTIN format check if supplied
    const cleanedGstin = (gstin || '').trim().toUpperCase();
    if (cleanedGstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(cleanedGstin)) {
      return {
        success: false,
        error: 'Invalid GSTIN format. Must be 15 alphanumeric characters (e.g. 27AAPCR1234F1Z5).',
      };
    }

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...existingSettings,
      legal_name: legalName ? legalName.trim() : existingSettings.legal_name,
      gstin: cleanedGstin,
      state_code: stateCode ? stateCode.trim() : (existingSettings.state_code || '27'),
      state_name: stateName ? stateName.trim() : (existingSettings.state_name || 'Maharashtra'),
      invoice_prefix: invoicePrefix ? invoicePrefix.trim().toUpperCase() : (existingSettings.invoice_prefix || 'INV'),
      tax_pricing_mode: pricingMode || existingSettings.tax_pricing_mode || 'inclusive',
      tax_schedules: taxSchedules && taxSchedules.length > 0 ? taxSchedules : existingSettings.tax_schedules,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await adminDb
      .from('tenants')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user.id,
        table_name: 'tenants',
        record_id: tenantId,
        action: 'UPDATE',
        metadata: {
          event: 'RESORT_TAX_SETTINGS_UPDATED',
          gstin: cleanedGstin,
          pricingMode: pricingMode || 'inclusive',
          updated_by: email,
        },
      });
    } catch {
      // ignore
    }

    revalidatePath('/settings/tax');
    revalidatePath('/settings');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'GST Tax configuration & invoice rules updated successfully.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating tax settings.';
    return { success: false, error: message };
  }
}

/**
 * 8. UPDATE RESORT MEAL PLAN SUPPLEMENTS
 * Configures EP, CP, MAP, AP pricing rules and availability.
 */
export async function updateResortMealPlans(payload: {
  tenantId: string;
  mealPlans: Record<string, {
    name?: string;
    adult_supplement_inr: number;
    child_supplement_inr: number;
    is_available?: boolean;
    description?: string;
  }>;
}): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { tenantId, mealPlans } = payload;
    if (!tenantId) {
      return { success: false, error: 'Resort tenant ID is required.' };
    }

    const supabase = await createServerSupabaseClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { success: false, error: 'Unauthorized: Session required.' };
    }

    const adminDb = createAdminClient();
    const email = (user.email || '').toLowerCase().trim();

    // Verify tenant exists
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('id, name, settings')
      .eq('id', tenantId)
      .maybeSingle();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Resort tenant not found.' };
    }

    // Role check
    const isSuperAdmin = AUTHORIZED_ADMIN_EMAILS.includes(email);
    if (!isSuperAdmin) {
      const { data: profile } = await adminDb
        .from('profiles')
        .select('role, tenant_id')
        .eq('id', user.id)
        .maybeSingle();

      const userRole = profile?.role;
      const allowedRoles = ['tenant_admin', 'resort_manager', 'restaurant_staff', 'accountant'];
      if (profile?.tenant_id !== tenantId || !allowedRoles.includes(userRole || '')) {
        return { success: false, error: 'Forbidden: Insufficient permissions to modify meal plans.' };
      }
    }

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const updatedSettings = {
      ...existingSettings,
      meal_plans: mealPlans,
      updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await adminDb
      .from('tenants')
      .update({
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Audit log
    try {
      await adminDb.from('audit_logs').insert({
        tenant_id: tenantId,
        user_id: user.id,
        table_name: 'tenants',
        record_id: tenantId,
        action: 'UPDATE',
        metadata: {
          event: 'RESORT_MEAL_PLANS_UPDATED',
          updated_by: email,
        },
      });
    } catch {
      // ignore
    }

    revalidatePath('/settings/tax');
    revalidatePath('/inventory');
    revalidatePath('/dashboard');

    return {
      success: true,
      message: 'Meal Plan pricing and supplements updated successfully.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating meal plans.';
    return { success: false, error: message };
  }
}

/**
 * 9. UPDATE RESORT PROFILE & DEFAULT CONFIGURATION SETTINGS
 * Updates core resort details configured at onboarding:
 * Resort Name, Legal Business Name, Contact Email & Phone, GSTIN, PAN,
 * Physical Address, Standard Check-in/out times, Payment Policy,
 * Advance % requirement, Brand Color, and Module Entitlements.
 */
export interface UpdateResortGeneralSettingsPayload {
  tenantId: string;
  name: string;
  legal_name?: string;
  contact_email?: string;
  contact_phone?: string;
  logo_url?: string;
  primary_color_hex?: string;
  gstin?: string;
  pan?: string;
  address?: {
    street?: string;
    city?: string;
    state?: string;
    postal_code?: string;
    country?: string;
  };
  check_in_time?: string;
  check_out_time?: string;
  payment_policy?: 'FULL_PAYMENT' | 'ADVANCE' | 'PAY_AT_PROPERTY';
  advance_percentage?: number;
  module_entitlements?: {
    restaurant?: boolean;
    activities?: boolean;
    housekeeping?: boolean;
    guest_services?: boolean;
    reviews?: boolean;
    accounting_exports?: boolean;
    digital_guest_portal?: boolean;
  };
}

export async function updateResortGeneralSettings(
  payload: UpdateResortGeneralSettingsPayload
): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const { tenantId, name } = payload;
    if (!tenantId) {
      return { success: false, error: 'Tenant identifier is required.' };
    }
    if (!name || !name.trim()) {
      return { success: false, error: 'Resort display name is required.' };
    }

    // Validate GSTIN if provided
    const gstin = payload.gstin ? payload.gstin.trim().toUpperCase() : undefined;
    if (gstin && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin)) {
      return {
        success: false,
        error: 'Invalid GSTIN format. Must be 15 alphanumeric characters (e.g. 27AAPCR1234F1Z5).',
      };
    }

    // Validate PAN if provided
    const pan = payload.pan ? payload.pan.trim().toUpperCase() : (gstin ? gstin.slice(2, 12) : undefined);
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(pan)) {
      return {
        success: false,
        error: 'Invalid PAN format. Must be 10 alphanumeric characters (e.g. AAPCR1234F).',
      };
    }

    const adminDb = createAdminClient();

    // Fetch existing tenant record
    const { data: tenant, error: fetchErr } = await adminDb
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .single();

    if (fetchErr || !tenant) {
      return { success: false, error: 'Tenant record not found.' };
    }

    const existingSettings = (tenant.settings as Record<string, unknown>) || {};
    const existingEntitlements = (existingSettings.module_entitlements as Record<string, boolean>) || {};

    const updatedSettings: Record<string, unknown> = {
      ...existingSettings,
      legal_name: payload.legal_name?.trim() || name.trim(),
      gstin: gstin || existingSettings.gstin,
      pan: pan || existingSettings.pan,
      primary_color_hex: payload.primary_color_hex?.trim() || (existingSettings.primary_color_hex as string) || '#059669',
      address: payload.address || existingSettings.address,
      check_in_time: payload.check_in_time?.trim() || (existingSettings.check_in_time as string) || '14:00',
      check_out_time: payload.check_out_time?.trim() || (existingSettings.check_out_time as string) || '11:00',
      payment_policy: payload.payment_policy || (existingSettings.payment_policy as string) || 'ADVANCE',
      advance_percentage: payload.advance_percentage !== undefined ? payload.advance_percentage : (existingSettings.advance_percentage ?? 50),
      module_entitlements: {
        ...existingEntitlements,
        ...(payload.module_entitlements || {}),
      },
      updated_at: new Date().toISOString(),
    };

    // Update in database
    const { error: updateErr } = await adminDb
      .from('tenants')
      .update({
        name: name.trim(),
        contact_email: payload.contact_email?.trim() || tenant.contact_email,
        contact_phone: payload.contact_phone?.trim() || tenant.contact_phone,
        logo_url: payload.logo_url?.trim() || tenant.logo_url,
        settings: updatedSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenantId);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath('/settings');
    revalidatePath('/settings/tax');
    revalidatePath('/dashboard');
    revalidatePath('/bookings');
    revalidatePath('/restaurant');

    return {
      success: true,
      message: 'Resort profile & property default settings successfully updated!',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error updating resort default settings.';
    return { success: false, error: message };
  }
}


