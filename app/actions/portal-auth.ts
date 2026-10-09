'use server';

import { cookies } from 'next/headers';
import { createAdminClient } from '@/lib/supabase';
import { generateGuestPortalToken } from '@/lib/portal-token';
import { Booking } from '@/types';

export interface PortalAuthResponse {
  success: boolean;
  message?: string;
  error?: string;
  token?: string;
}

/**
 * Normalizes phone numbers for verification comparison
 */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length >= 10) {
    return digits.slice(-10); // Match last 10 digits (ignoring country code prefixes)
  }
  return digits;
}

/**
 * 1. VERIFY GUEST IDENTITY VIA REGISTERED MOBILE NUMBER & ISSUE SIGNED TOKEN
 * Prevents anyone with a guessed booking ID from accessing private stay folios.
 */
export async function verifyGuestMobileAndIssueToken(
  tenantId: string,
  bookingId: string,
  mobileInput: string
): Promise<PortalAuthResponse> {
  try {
    const cleanedInput = normalizePhone(mobileInput);
    if (!cleanedInput || cleanedInput.length < 4) {
      return { success: false, error: 'Please enter a valid 10-digit mobile number or last 4 digits.' };
    }

    const adminDb = createAdminClient();

    // 1. Fetch booking record
    const { data: rawBooking, error } = await adminDb
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error || !rawBooking) {
      return { success: false, error: 'Reservation not found or invalid resort identifier.' };
    }

    const booking = rawBooking as unknown as Booking;
    const registeredPhone = normalizePhone(booking.guest_mobile_number || '');

    // 2. Strict phone match check:
    // Either exact 10-digit match, or last 4 digits match if input was 4 digits
    let isMatch = false;
    if (cleanedInput.length === 10 && registeredPhone.length === 10) {
      isMatch = cleanedInput === registeredPhone;
    } else if (cleanedInput.length === 4) {
      isMatch = registeredPhone.endsWith(cleanedInput);
    } else {
      isMatch = registeredPhone.includes(cleanedInput);
    }

    if (!isMatch) {
      return {
        success: false,
        error: 'Mobile number does not match this reservation. Please check your confirmation SMS/email.',
      };
    }

    // 3. Compute token expiry based on check-out date + 48 hours (or min 7 days)
    const checkOutMs = new Date(booking.check_out_date).getTime();
    const nowMs = Date.now();
    const daysUntilExpiry = Math.max(7, Math.ceil((checkOutMs + 48 * 3600 * 1000 - nowMs) / (24 * 3600 * 1000)));

    // 4. Generate cryptographically signed token
    const token = generateGuestPortalToken(tenantId, bookingId, {
      expiresInDays: daysUntilExpiry,
      roomNumber: booking.room_id || undefined,
    });

    // 5. Set HttpOnly session cookie
    const cookieStore = await cookies();
    cookieStore.set(`guest_portal_token_${bookingId}`, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: daysUntilExpiry * 24 * 60 * 60,
    });

    return {
      success: true,
      message: 'Identity verified. Access granted to stay portal.',
      token,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Identity verification failed.';
    return { success: false, error: message };
  }
}

/**
 * 2. REVOKE GUEST PORTAL ACCESS TOKEN (Admin / Front Desk Action)
 */
export async function revokeGuestPortalAccess(
  tenantId: string,
  bookingId: string
): Promise<PortalAuthResponse> {
  try {
    const adminDb = createAdminClient();
    const now = new Date().toISOString();

    // Store revocation in tenant settings or booking metadata
    const { data: tenant } = await adminDb
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .single();

    const settings = (tenant?.settings as Record<string, unknown>) || {};
    const revokedTokens = (settings.revoked_portal_tokens as Record<string, string>) || {};
    revokedTokens[bookingId] = now;

    await adminDb
      .from('tenants')
      .update({
        settings: {
          ...settings,
          revoked_portal_tokens: revokedTokens,
        },
      })
      .eq('id', tenantId);

    // Clear cookie if present
    const cookieStore = await cookies();
    cookieStore.delete(`guest_portal_token_${bookingId}`);

    return {
      success: true,
      message: 'Guest portal token revoked. External links will require identity re-verification.',
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to revoke token.';
    return { success: false, error: message };
  }
}
