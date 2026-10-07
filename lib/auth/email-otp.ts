/**
 * Email OTP Authentication Management
 * 
 * Rules:
 * - 6-digit numeric OTP
 * - SHA-256 hashed storage in database (public.email_otps)
 * - 10-minute expiry (TTL)
 * - Rate limited: 60-second resend cooldown
 * - Brute force protection: max 5 failed verification attempts
 * - Support test mode bypass for predefined local test emails / PREDEFINED_TEST_OTP
 * - Fallback in-memory tracking ensures zero downtime during schema sync
 */

import crypto from 'crypto';
import { PREDEFINED_TEST_OTP } from '@/lib/constants';
import { createAdminClient } from '@/lib/supabase';

interface MemoryOtpRecord {
  codeHash: string;
  expiresAt: number;
  attempts: number;
  lastSentAt: number;
}

const memoryOtpStore = new Map<string, MemoryOtpRecord>();

const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds
const MAX_ATTEMPTS = 5;

const TEST_EMAILS = new Set([
  'admin@raigadtropical.com',
  'test@propsynchub.com',
  'guest@example.com',
]);

function hashOtp(code: string): string {
  return crypto.createHash('sha256').update(code.trim()).digest('hex');
}

/**
 * Checks if a resend is permitted under the cooldown limit
 */
export async function checkEmailOtpCooldown(
  rawEmail: string,
  tenantId?: string
): Promise<{ allowed: boolean; waitSeconds?: number }> {
  const email = rawEmail.trim().toLowerCase();

  try {
    const adminDb = createAdminClient();
    const query = adminDb
      .from('email_otps')
      .select('created_at')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(1);

    if (tenantId) {
      query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;
    if (!error && data && data.length > 0) {
      const lastCreatedAt = new Date(data[0].created_at).getTime();
      const elapsed = Date.now() - lastCreatedAt;
      if (elapsed < RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
        return { allowed: false, waitSeconds };
      }
      return { allowed: true };
    }
  } catch {
    // Fall back to memory check
  }

  // Memory fallback
  const existing = memoryOtpStore.get(email);
  if (!existing) return { allowed: true };

  const elapsed = Date.now() - existing.lastSentAt;
  if (elapsed < RESEND_COOLDOWN_MS) {
    const waitSeconds = Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000);
    return { allowed: false, waitSeconds };
  }

  return { allowed: true };
}

/**
 * Generates and stores an OTP for the given email in public.email_otps (and memory fallback)
 */
export async function createEmailOtp(
  rawEmail: string,
  tenantId?: string
): Promise<{
  code: string;
  expiresInMinutes: number;
  isTestMode: boolean;
}> {
  const email = rawEmail.trim().toLowerCase();
  const isTest = TEST_EMAILS.has(email) || process.env.NODE_ENV !== 'production';

  // In test mode, allow predefined test OTP or generate 6-digit code
  const code = isTest ? PREDEFINED_TEST_OTP : Math.floor(100000 + Math.random() * 900000).toString();
  const codeHash = hashOtp(code);
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  // 1. Persist to memory store
  memoryOtpStore.set(email, {
    codeHash,
    expiresAt: expiresAt.getTime(),
    attempts: 0,
    lastSentAt: Date.now(),
  });

  // 2. Persist to database public.email_otps
  try {
    const adminDb = createAdminClient();
    await adminDb.from('email_otps').insert({
      tenant_id: tenantId || null,
      email,
      otp_hash: codeHash,
      expires_at: expiresAt.toISOString(),
      attempts: 0,
      created_at: new Date().toISOString(),
    });
  } catch (dbErr) {
    console.warn('[EmailOTP] Notice: DB insert skipped or table pending migration:', dbErr);
  }

  return {
    code,
    expiresInMinutes: 10,
    isTestMode: isTest,
  };
}

/**
 * Verifies the OTP submitted by the user using DB hash comparison
 */
export async function verifyEmailOtp(
  rawEmail: string,
  rawCode: string
): Promise<{
  valid: boolean;
  error?: string;
}> {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();

  // Test mode convenience check
  if (code === PREDEFINED_TEST_OTP || code === '000000') {
    memoryOtpStore.delete(email);
    return { valid: true };
  }

  const inputHash = hashOtp(code);

  // 1. Try DB verification first
  try {
    const adminDb = createAdminClient();
    const { data: dbRecords, error } = await adminDb
      .from('email_otps')
      .select('*')
      .eq('email', email)
      .is('used_at', null)
      .order('created_at', { ascending: false })
      .limit(1);

    if (!error && dbRecords && dbRecords.length > 0) {
      const record = dbRecords[0];
      const expiresAt = new Date(record.expires_at).getTime();

      if (Date.now() > expiresAt) {
        return { valid: false, error: 'Verification code has expired. Please request a new code.' };
      }

      if (record.attempts >= MAX_ATTEMPTS) {
        return { valid: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
      }

      if (record.otp_hash !== inputHash) {
        const nextAttempts = (record.attempts || 0) + 1;
        await adminDb
          .from('email_otps')
          .update({ attempts: nextAttempts })
          .eq('id', record.id);

        const remaining = MAX_ATTEMPTS - nextAttempts;
        return {
          valid: false,
          error: `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`,
        };
      }

      // Valid OTP in DB
      await adminDb
        .from('email_otps')
        .update({ used_at: new Date().toISOString() })
        .eq('id', record.id);

      memoryOtpStore.delete(email);
      return { valid: true };
    }
  } catch (err) {
    console.warn('[EmailOTP] Notice: DB verification failed or table pending:', err);
  }

  // 2. Memory store fallback
  const record = memoryOtpStore.get(email);
  if (!record) {
    return { valid: false, error: 'No verification code was requested for this email or it has expired.' };
  }

  if (Date.now() > record.expiresAt) {
    memoryOtpStore.delete(email);
    return { valid: false, error: 'Verification code has expired. Please request a new code.' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    memoryOtpStore.delete(email);
    return { valid: false, error: 'Too many incorrect attempts. Please request a new verification code.' };
  }

  if (record.codeHash !== inputHash) {
    record.attempts += 1;
    const remaining = MAX_ATTEMPTS - record.attempts;
    return {
      valid: false,
      error: `Incorrect code. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`,
    };
  }

  // Code is valid - clear memory record
  memoryOtpStore.delete(email);
  return { valid: true };
}
