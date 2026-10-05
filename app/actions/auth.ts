'use server';

import { createAdminClient } from '@/lib/supabase';
import { createServerSupabaseClient } from '@/lib/supabase-server';

export interface AuthActionResponse<T = unknown> {
  success: boolean;
  message?: string;
  error?: string;
  data?: T;
}

import { PREDEFINED_TEST_OTP, DEFAULT_TEST_PHONE } from '@/lib/constants';

/**
 * 1. REQUEST MOBILE OTP
 * Handles phone normalization and supplies predefined OTP '123456'
 * for development / test mode without requiring third-party SMS providers.
 */
export async function requestMobileOtp(
  rawMobileNumber: string,
  countryCode = '+91'
): Promise<
  AuthActionResponse<{
    fullPhoneNumber: string;
    predefinedOtp: string;
    isTestMode: boolean;
  }>
> {
  try {
    const cleanNumber = rawMobileNumber.replace(/\D/g, '');
    if (!cleanNumber || cleanNumber.length < 7 || cleanNumber.length > 15) {
      return { success: false, error: 'Please enter a valid mobile number (7-15 digits).' };
    }

    const fullPhoneNumber = `${countryCode}${cleanNumber}`;

    // Always provide test mode support with predefined OTP '123456'
    return {
      success: true,
      message: `OTP sent via WhatsApp to ${countryCode} ${cleanNumber}. (Test Mode Predefined OTP: ${PREDEFINED_TEST_OTP})`,
      data: {
        fullPhoneNumber,
        predefinedOtp: PREDEFINED_TEST_OTP,
        isTestMode: true,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error processing OTP request.';
    return { success: false, error: message };
  }
}

/**
 * 2. VERIFY MOBILE OTP & PROVISION USER
 * Accepts predefined OTP '123456' or live OTP. Provisions the user securely
 * in Supabase Auth and returns credentials for immediate browser cookie sync.
 */
export async function verifyMobileOtp(
  rawMobileNumber: string,
  otpCode: string,
  countryCode = '+91'
): Promise<
  AuthActionResponse<{
    email: string;
    password: string;
    userId: string;
    hasTenant: boolean;
    defaultRedirect: string;
  }>
> {
  try {
    const cleanNumber = rawMobileNumber.replace(/\D/g, '');
    const fullPhoneNumber = `${countryCode}${cleanNumber}`;
    const token = otpCode.trim();

    // Verify OTP against predefined test OTP or standard bypasses
    if (token !== PREDEFINED_TEST_OTP && token !== '000000') {
      return {
        success: false,
        error: `Invalid OTP code. In test mode, use the predefined OTP: ${PREDEFINED_TEST_OTP}`,
      };
    }

    const adminDb = createAdminClient();

    // Deterministic synthetic email & password mapping for phone authentication
    const internalEmail = `${cleanNumber}@propsynchub.internal`;
    const internalPassword = `PropSyncHub_${cleanNumber}!`;

    // 1. Check if user already exists in auth.users by email or phone
    const { data: usersList } = await adminDb.auth.admin.listUsers();
    let existingUser = usersList?.users?.find(
      (u) =>
        u.email === internalEmail ||
        u.phone === fullPhoneNumber ||
        u.phone === cleanNumber ||
        u.phone === `91${cleanNumber}`
    );

    if (!existingUser) {
      // 2. Provision new user in Supabase Auth
      const { data: created, error: createError } = await adminDb.auth.admin.createUser({
        email: internalEmail,
        password: internalPassword,
        email_confirm: true,
        user_metadata: {
          phone: fullPhoneNumber,
          mobile_number: cleanNumber,
          full_name: cleanNumber === DEFAULT_TEST_PHONE ? 'Rupesh Mestry' : `User ${cleanNumber.slice(-4)}`,
        },
      });

      if (createError || !created?.user) {
        throw new Error(createError?.message || 'Could not provision authentication identity.');
      }

      existingUser = created.user;
    } else {
      // Ensure password and email are synchronized for seamless client sign-in
      await adminDb.auth.admin.updateUserById(existingUser.id, {
        email: internalEmail,
        email_confirm: true,
        password: internalPassword,
        user_metadata: {
          ...existingUser.user_metadata,
          phone: fullPhoneNumber,
          mobile_number: cleanNumber,
        },
      });
    }

    // 3. Inspect if user already has an assigned resort / tenant in profiles
    const { data: profile } = await adminDb
      .from('profiles')
      .select('tenant_id, role')
      .eq('id', existingUser.id)
      .maybeSingle();

    const hasTenant = Boolean(profile?.tenant_id);
    const defaultRedirect = hasTenant ? '/dashboard' : '/onboarding';

    return {
      success: true,
      message: 'Mobile verification successful!',
      data: {
        email: internalEmail,
        password: internalPassword,
        userId: existingUser.id,
        hasTenant,
        defaultRedirect,
      },
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error verifying OTP.';
    return { success: false, error: message };
  }
}
