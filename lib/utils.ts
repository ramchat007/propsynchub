/**
 * Utility functions for PropSyncHub
 */

/**
 * Combines conditional class names into a single string.
 */
export function cn(...inputs: (string | undefined | null | false)[]): string {
  return inputs.filter(Boolean).join(' ');
}
