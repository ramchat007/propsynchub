import { createAdminClient } from '@/lib/supabase';
import { Tenant } from '@/types';
import { PRIMARY_DEMO_TENANT_ID } from '@/lib/constants';

/**
 * Standard Demo Fallback for local development preview
 */
export const DEFAULT_DEMO_TENANT: Tenant = {
  id: PRIMARY_DEMO_TENANT_ID,
  name: 'Raigad Tropical',
  subdomain: 'raigad-tropical',
  custom_domain: 'raigadtropical.in',
  contact_email: 'stay@raigadtropical.com',
  contact_phone: '+91 98201 60376',
  is_active: true,
  created_at: '2026-10-05T13:51:12.386Z',
  updated_at: new Date().toISOString(),
  settings: {
    address: 'Survey No. 42, Tropical Greens, Raigad District, Maharashtra 402107',
    tagline: 'Private Luxury Villa with Jacuzzi & Swimming Pool in Raigad',
    about_description: 'Escape the city rush into pure serenity. Raigad Tropical is an exclusive private sanctuary nestled amidst lush tropical greenery.',
    hero_image_url: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=1920&q=80',
    primary_color_hex: '#c0395b',
    check_in_time: '14:00',
    check_out_time: '11:00',
  },
};

/**
 * Resolves a resort tenant by UUID, subdomain slug, or custom domain name.
 * 
 * Strict Multi-Tenant Isolation Guarantee:
 * - Never blindly falls back to another resort's data for unknown or unverified domains.
 * - Only returns an active, valid tenant record.
 * - Local dev fallback is permitted ONLY for the designated 'raigad-tropical' demo slug.
 */
export async function resolveTenantFromParam(
  param: string
): Promise<Tenant | null> {
  if (!param || typeof param !== 'string') {
    return null;
  }

  const cleanParam = decodeURIComponent(param).trim().toLowerCase();
  const adminDb = createAdminClient();

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanParam);

  try {
    let query = adminDb
      .from('tenants')
      .select('*')
      .eq('is_active', true);

    if (isUuid) {
      query = query.eq('id', cleanParam);
    } else {
      // Clean possible www prefix if passed as a custom domain param
      const cleanCustom = cleanParam.startsWith('www.') ? cleanParam.slice(4) : cleanParam;
      query = query.or(
        `subdomain.ilike.${cleanParam},custom_domain.ilike.${cleanCustom},custom_domain.ilike.${cleanParam}`
      );
    }

    const { data: tenant, error } = await query.maybeSingle();

    if (tenant && !error) {
      return tenant as unknown as Tenant;
    }

    // Explicit fallback for designated local development demo slug
    if (
      cleanParam === 'raigad-tropical' ||
      cleanParam === 'raigadtropical.in' ||
      cleanParam === PRIMARY_DEMO_TENANT_ID
    ) {
      return DEFAULT_DEMO_TENANT;
    }

    return null;
  } catch (err) {
    console.warn('[TenantResolver] Error resolving tenant param:', cleanParam, err);
    if (
      cleanParam === 'raigad-tropical' ||
      cleanParam === 'raigadtropical.in' ||
      cleanParam === PRIMARY_DEMO_TENANT_ID
    ) {
      return DEFAULT_DEMO_TENANT;
    }
    return null;
  }
}
