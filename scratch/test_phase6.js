/**
 * Phase 6 Verification Suite: Guest Portal & QR Services
 * Tests Cryptographic Token Signing, Expiration, Revocation,
 * Mobile Identity Challenge, and Verified Completed-Stay Reviews.
 */

const assert = require('assert');
const crypto = require('crypto');

// 1. Simulating portal-token logic
const TOKEN_SECRET = 'propsynchub-test-secret-salt-2026';

function base64UrlEncode(str) {
  return Buffer.from(str, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

function generateToken(tenantId, bookingId, options) {
  const now = Date.now();
  const days = options?.expiresInDays ?? 7;
  const expiresAt = now + days * 24 * 60 * 60 * 1000;

  const payload = {
    bookingId,
    tenantId,
    expiresAt,
    version: options?.version ?? 1,
    roomNumber: options?.roomNumber,
    createdAt: now,
  };

  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET);
  hmac.update(encodedPayload);
  const signature = base64UrlEncode(hmac.digest('base64'));

  return `${encodedPayload}.${signature}`;
}

function verifyToken(token, tenantId, bookingId, revocationEpoch) {
  if (!token || typeof token !== 'string') {
    return { isValid: false, error: 'Missing access token.' };
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return { isValid: false, error: 'Malformed token structure.' };
  }

  const [encodedPayload, signature] = parts;
  const hmac = crypto.createHmac('sha256', TOKEN_SECRET);
  hmac.update(encodedPayload);
  const expectedSig = base64UrlEncode(hmac.digest('base64'));

  try {
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { isValid: false, error: 'Invalid token signature. Unauthorized access.' };
    }
  } catch {
    return { isValid: false, error: 'Signature verification failure.' };
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (payload.tenantId !== tenantId) {
    return { isValid: false, error: 'Token is not valid for this resort property.' };
  }
  if (payload.bookingId !== bookingId) {
    return { isValid: false, error: 'Token does not match this reservation.' };
  }
  if (Date.now() > payload.expiresAt) {
    return { isValid: false, error: 'Access token has expired.' };
  }
  if (revocationEpoch && payload.createdAt < revocationEpoch) {
    return { isValid: false, error: 'Access token has been revoked by resort front desk.' };
  }

  return { isValid: true, payload };
}

console.log('=== TEST SUITE 1: CRYPTOGRAPHIC SIGNED TOKEN SECURITY ===');
{
  const tenantId = '00000000-0000-0000-0000-000000000001';
  const bookingId = 'book_rajesh_123';

  // 1. Valid token generation and verification
  const token = generateToken(tenantId, bookingId, { expiresInDays: 5, roomNumber: 'Villa 101' });
  const checkValid = verifyToken(token, tenantId, bookingId);
  assert.strictEqual(checkValid.isValid, true);
  assert.strictEqual(checkValid.payload.bookingId, bookingId);
  assert.strictEqual(checkValid.payload.roomNumber, 'Villa 101');
  console.log('✓ Signed token successfully verified:', token.slice(0, 30) + '...');

  // 2. Tampered signature attempt
  const tamperedToken = token.slice(0, -5) + 'XXXXX';
  const checkTampered = verifyToken(tamperedToken, tenantId, bookingId);
  assert.strictEqual(checkTampered.isValid, false);
  console.log('✓ Tampered signature correctly blocked:', checkTampered.error);

  // 3. Guessable booking ID traversal attempt
  // An attacker possesses a token for booking A, but tries to access booking B:
  const checkCrossBooking = verifyToken(token, tenantId, 'book_other_guest_999');
  assert.strictEqual(checkCrossBooking.isValid, false);
  assert.ok(checkCrossBooking.error.includes('Token does not match'));
  console.log('✓ Cross-booking traversal attack strictly blocked:', checkCrossBooking.error);

  // 4. Expired token check
  const expiredToken = generateToken(tenantId, bookingId, { expiresInDays: -1 }); // already expired
  const checkExpired = verifyToken(expiredToken, tenantId, bookingId);
  assert.strictEqual(checkExpired.isValid, false);
  assert.ok(checkExpired.error.includes('expired'));
  console.log('✓ Expired token rejected:', checkExpired.error);

  // 5. Revocation epoch check (Staff revokes active tokens)
  const issuedToken = generateToken(tenantId, bookingId, { expiresInDays: 3 });
  const revocationEpoch = Date.now() + 1000; // Revoked after issuance
  const checkRevoked = verifyToken(issuedToken, tenantId, bookingId, revocationEpoch);
  assert.strictEqual(checkRevoked.isValid, false);
  assert.ok(checkRevoked.error.includes('revoked'));
  console.log('✓ Revocation check passed: Revoked token blocked:', checkRevoked.error);
}

console.log('\n=== TEST SUITE 2: MOBILE IDENTITY CHALLENGE (FALLBACK AUTH) ===');
{
  function normalizePhone(raw) {
    const digits = raw.replace(/\D/g, '');
    return digits.length >= 10 ? digits.slice(-10) : digits;
  }

  const registeredPhone = '+91 99200 12345';
  const cleanReg = normalizePhone(registeredPhone);

  function verifyMobile(input, registered) {
    const cleanIn = normalizePhone(input);
    if (!cleanIn || cleanIn.length < 4) return false;
    if (cleanIn.length === 10) return cleanIn === registered;
    if (cleanIn.length === 4) return registered.endsWith(cleanIn);
    return registered.includes(cleanIn);
  }

  assert.strictEqual(verifyMobile('9920012345', cleanReg), true);
  assert.strictEqual(verifyMobile('12345', cleanReg), true);
  assert.strictEqual(verifyMobile('2345', cleanReg), true);
  assert.strictEqual(verifyMobile('9876543210', cleanReg), false);
  assert.strictEqual(verifyMobile('9999', cleanReg), false);
  console.log('✓ 10-digit mobile verification matches correctly');
  console.log('✓ 4-digit last digits challenge matches correctly');
  console.log('✓ Unmatched mobile numbers strictly rejected');
}

console.log('\n=== TEST SUITE 3: VERIFIED GUEST REVIEWS TIED TO COMPLETED STAYS ===');
{
  const testBookings = [
    { id: 'b_active', guest_name: 'Amit Patel', booking_status: 'checked_in', check_in_date: '2026-10-09', check_out_date: '2026-10-12' },
    { id: 'b_cancelled', guest_name: 'Sunil Rao', booking_status: 'cancelled', check_in_date: '2026-10-05', check_out_date: '2026-10-07' },
    { id: 'b_completed', guest_name: 'Rajesh Desai', booking_status: 'checked_out', check_in_date: '2026-10-06', check_out_date: '2026-10-09' },
  ];

  const existingReviews = [];

  function simulateSubmitReview(bookingId, rating, comment) {
    const booking = testBookings.find(b => b.id === bookingId);
    if (!booking) return { success: false, error: 'Booking not found.' };

    // Invariant: Completed stay check
    if (booking.booking_status !== 'checked_out') {
      return {
        success: false,
        error: 'Reviews can only be submitted after your stay has completed (checked out).',
      };
    }

    // Invariant: One review per completed stay
    if (existingReviews.some(r => r.booking_id === bookingId)) {
      return { success: false, error: 'A review has already been submitted for this stay.' };
    }

    const review = {
      id: `rev_${Date.now()}`,
      booking_id: bookingId,
      guest_name: booking.guest_name,
      rating,
      comment,
      verified_stay: true,
      stay_check_in: booking.check_in_date,
      stay_check_out: booking.check_out_date,
      created_at: new Date().toISOString(),
    };
    existingReviews.push(review);

    return { success: true, data: review };
  }

  // 1. In-house guest attempt: Must be rejected
  const inHouseAttempt = simulateSubmitReview('b_active', 5, 'Great resort so far!');
  assert.strictEqual(inHouseAttempt.success, false);
  assert.ok(inHouseAttempt.error.includes('checked out'));
  console.log('✓ In-house guest review attempt correctly blocked:', inHouseAttempt.error);

  // 2. Cancelled stay attempt: Must be rejected
  const cancelledAttempt = simulateSubmitReview('b_cancelled', 1, 'Flight cancelled');
  assert.strictEqual(cancelledAttempt.success, false);
  console.log('✓ Cancelled stay review attempt correctly blocked:', cancelledAttempt.error);

  // 3. Completed stay: Must succeed and record verified_stay metadata
  const completedReview = simulateSubmitReview('b_completed', 5, 'Outstanding hospitality and coastal thali!');
  assert.strictEqual(completedReview.success, true);
  assert.strictEqual(completedReview.data.verified_stay, true);
  assert.strictEqual(completedReview.data.stay_check_in, '2026-10-06');
  assert.strictEqual(completedReview.data.stay_check_out, '2026-10-09');
  console.log('✓ Completed stay review successfully recorded with verified_stay metadata');

  // 4. Duplicate review attempt for same stay: Must be blocked
  const duplicateAttempt = simulateSubmitReview('b_completed', 5, 'Submitting second review');
  assert.strictEqual(duplicateAttempt.success, false);
  assert.ok(duplicateAttempt.error.includes('already been submitted'));
  console.log('✓ Duplicate review attempt strictly blocked:', duplicateAttempt.error);
}

console.log('\n========================================');
console.log('✅ ALL PHASE 6 VERIFICATION TESTS PASSED');
console.log('========================================\n');
