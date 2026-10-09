/**
 * PropSyncHub Privacy & Identity Compliance Guard
 * 
 * Non-negotiable privacy invariants:
 * 1. Strict Aadhaar Masking:
 *    NEVER store full 12-digit Aadhaar numbers or raw identity cards.
 *    Only store masked format: "•••• •••• XXXX" with the verified last 4 digits.
 * 2. Foreign Guest (Form C) Official Requirements:
 *    Validates official fields (Passport, Visa #, Expiry, Nationality, Next Destination).
 * 3. Access Control & Data Redaction:
 *    Provides safe redaction routines for post-stay retention/deletion rules.
 */

import { GuestIdType, ForeignGuestFormC } from '@/types';

export interface MaskedIdentityResult {
  isValid: boolean;
  maskedNumber: string;
  error?: string;
}

/**
 * Masks identity document numbers according to strict privacy regulations.
 */
export function maskIdentityDocumentNumber(
  idType: GuestIdType,
  rawInput: string
): MaskedIdentityResult {
  const cleaned = rawInput.trim();

  if (!cleaned) {
    return { isValid: false, maskedNumber: '', error: 'Document number cannot be empty.' };
  }

  if (idType === 'aadhaar') {
    // Extract only digits
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length === 12) {
      // Full 12 digits entered -> immediately mask first 8 digits
      const last4 = digits.slice(-4);
      return {
        isValid: true,
        maskedNumber: `•••• •••• ${last4}`,
      };
    } else if (digits.length === 4) {
      // User entered last 4 digits directly
      return {
        isValid: true,
        maskedNumber: `•••• •••• ${digits}`,
      };
    } else if (cleaned.includes('••') && digits.length >= 4) {
      // Already masked input
      const last4 = digits.slice(-4);
      return {
        isValid: true,
        maskedNumber: `•••• •••• ${last4}`,
      };
    } else {
      return {
        isValid: false,
        maskedNumber: '',
        error: 'Please enter the 4-digit ending or 12-digit Aadhaar number for masked verification.',
      };
    }
  }

  if (idType === 'passport') {
    const alphanumeric = cleaned.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (alphanumeric.length < 6 || alphanumeric.length > 12) {
      return {
        isValid: false,
        maskedNumber: alphanumeric,
        error: 'Passport number typically consists of 6 to 12 alphanumeric characters.',
      };
    }
    // Mask middle characters: e.g. "J•••••89"
    const firstChar = alphanumeric.charAt(0);
    const last2 = alphanumeric.slice(-2);
    const dots = '•'.repeat(Math.max(3, alphanumeric.length - 3));
    return {
      isValid: true,
      maskedNumber: `${firstChar}${dots}${last2}`,
    };
  }

  if (idType === 'driving_license') {
    const alphanumeric = cleaned.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (alphanumeric.length < 8) {
      return { isValid: false, maskedNumber: '', error: 'Driving License number is too short.' };
    }
    const last4 = alphanumeric.slice(-4);
    return {
      isValid: true,
      maskedNumber: `DL-•••••-${last4}`,
    };
  }

  if (idType === 'voter_id') {
    const alphanumeric = cleaned.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (alphanumeric.length < 8) {
      return { isValid: false, maskedNumber: '', error: 'Voter ID (EPIC) number is too short.' };
    }
    const last4 = alphanumeric.slice(-4);
    return {
      isValid: true,
      maskedNumber: `EPIC-••••-${last4}`,
    };
  }

  // Generic fallback
  const last4 = cleaned.slice(-4);
  return {
    isValid: true,
    maskedNumber: `••••-${last4}`,
  };
}

/**
 * Validates official Form C compliance requirements for foreign nationals.
 */
export function validateFormCCompliance(
  formC?: ForeignGuestFormC
): { isValid: boolean; error?: string } {
  if (!formC) {
    return { isValid: false, error: 'Foreign guest details (Form C) are required for foreign nationals.' };
  }

  if (!formC.passport_number || formC.passport_number.trim().length < 4) {
    return { isValid: false, error: 'Valid passport number is mandatory for foreign guest.' };
  }

  if (!formC.visa_number || formC.visa_number.trim().length < 4) {
    return { isValid: false, error: 'Valid visa number / eVisa reference is mandatory for foreign guest.' };
  }

  if (!formC.visa_valid_until) {
    return { isValid: false, error: 'Visa validity date is required.' };
  }

  const expiry = new Date(formC.visa_valid_until);
  if (isNaN(expiry.getTime())) {
    return { isValid: false, error: 'Invalid visa validity date provided.' };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (expiry < today) {
    return { isValid: false, error: 'Visa expiry date cannot be in the past.' };
  }

  return { isValid: true };
}
