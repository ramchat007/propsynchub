/**
 * Utility functions for PropSyncHub
 */

/**
 * Combines conditional class names into a single string.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}

/**
 * Universal safe address formatter.
 * Handles string addresses, structured object addresses ({street, city, state, postal_code, country}),
 * null, undefined, or unexpected types without throwing React rendering exceptions.
 */
export function formatAddress(
  raw: unknown,
  defaultFallback = 'Survey No. 42, Tropical Greens, Raigad District, Maharashtra 402107'
): string {
  if (!raw) return defaultFallback;
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : defaultFallback;
  }
  if (typeof raw === 'object' && raw !== null) {
    const a = raw as Record<string, unknown>;
    const parts = [a.street, a.city, a.state, a.postal_code, a.country]
      .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
      .map((v) => v.trim());
    return parts.length > 0 ? parts.join(', ') : defaultFallback;
  }
  return String(raw);
}

/**
 * Parses any raw address (object, string, or undefined) into a structured object for form inputs.
 */
export function parseAddressObj(raw: unknown): {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
} {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const a = raw as Record<string, unknown>;
    return {
      street: typeof a.street === 'string' ? a.street : '',
      city: typeof a.city === 'string' ? a.city : '',
      state: typeof a.state === 'string' ? a.state : '',
      postal_code: typeof a.postal_code === 'string' ? a.postal_code : '',
      country: typeof a.country === 'string' && a.country ? a.country : 'India',
    };
  }
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return {
      street: raw.trim(),
      city: '',
      state: '',
      postal_code: '',
      country: 'India',
    };
  }
  return { street: '', city: '', state: '', postal_code: '', country: 'India' };
}
