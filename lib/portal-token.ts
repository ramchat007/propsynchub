import crypto from 'crypto';
import { GuestPortalTokenPayload } from '@/types';

/**
 * PropSyncHub Cryptographic Guest Portal Token Engine
 * 
 * Enforces strict guest privacy:
 * - HMAC-SHA256 signature prevents tampering
 * - Expiring tokens prevent indefinite public access
 * - Never lets a guessable booking ID or room number alone expose another guest's bill
 */

const TOKEN_SECRET =
  process.env.SUPABASE_JWT_SECRET ||
  process.env.NEXTAUTH_SECRET ||
  'propsynchub-secure-guest-portal-salt-2026';

function base64UrlEncode(str: string): string {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * 1. GENERATE CRYPTOGRAPHICALLY SIGNED GUEST PORTAL TOKEN
 */
export function generateGuestPortalToken(
  tenantId: string,
  bookingId: string,
  options?: {
    expiresInDays?: number;
    roomNumber?: string;
    version?: number;
  }
): string {
  const now = Date.now();
  const days = options?.expiresInDays ?? 7; // default 7 days validity
  const expiresAt = now + days * 24 * 60 * 60 * 1000;

  const payload: GuestPortalTokenPayload = {
    bookingId,
    tenantId,
    expiresAt,
    version: options?.version ?? 1,
    roomNumber: options?.roomNumber,
    createdAt: now,
  };

  const payloadStr = JSON.stringify(payload);
  const encodedPayload = base64UrlEncode(payloadStr);

  const hmac = crypto.createHmac('sha256', TOKEN_SECRET);
  hmac.update(encodedPayload);
  const signature = base64UrlEncode(hmac.digest('base64'));

  return `${encodedPayload}.${signature}`;
}

/**
 * 2. VERIFY CRYPTOGRAPHIC GUEST PORTAL TOKEN
 */
export function verifyGuestPortalToken(
  token: string | undefined | null,
  tenantId: string,
  bookingId: string,
  revocationEpoch?: number
): { isValid: boolean; payload?: GuestPortalTokenPayload; error?: string } {
  if (!token || typeof token !== 'string') {
    return { isValid: false, error: 'Missing access token.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Malformed token structure.' };
  }

  const [encodedPayload, signature] = parts;

  // 1. Verify HMAC Signature with timing-safe comparison
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET);
  hmac.update(encodedPayload);
  const expectedSig = base64UrlEncode(hmac.digest('base64'));

  try {
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);
    if (
      sigBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(sigBuffer, expectedBuffer)
    ) {
      return { isValid: false, error: 'Invalid token signature. Unauthorized access.' };
    }
  } catch {
    return { isValid: false, error: 'Signature verification failure.' };
  }

  // 2. Decode and validate payload
  try {
    const payloadStr = base64UrlDecode(encodedPayload);
    const payload = JSON.parse(payloadStr) as GuestPortalTokenPayload;

    // Check tenant and booking binding
    if (payload.tenantId !== tenantId) {
      return { isValid: false, error: 'Token is not valid for this resort property.' };
    }
    if (payload.bookingId !== bookingId) {
      return { isValid: false, error: 'Token does not match this reservation.' };
    }

    // Check expiration
    const now = Date.now();
    if (now > payload.expiresAt) {
      return { isValid: false, error: 'Access token has expired.' };
    }

    // Check revocation epoch
    if (revocationEpoch && payload.createdAt < revocationEpoch) {
      return { isValid: false, error: 'Access token has been revoked by resort front desk.' };
    }

    return { isValid: true, payload };
  } catch {
    return { isValid: false, error: 'Invalid token payload.' };
  }
}

/**
 * 3. BUILD COMPLETE PORTAL ACCESS URL
 */
export function buildGuestPortalUrl(
  baseUrl: string,
  tenantId: string,
  bookingId: string,
  options?: { roomNumber?: string; expiresInDays?: number }
): string {
  const token = generateGuestPortalToken(tenantId, bookingId, options);
  const cleanBase = baseUrl.replace(/\/+$/, '');
  return `${cleanBase}/portal/${bookingId}?token=${token}`;
}
