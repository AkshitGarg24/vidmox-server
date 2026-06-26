import crypto from 'crypto';

/**
 * Computes a keyed SHA-256 digest for a string.
 *
 * @param str - The input string to digest.
 * @returns The digest as a lowercase hexadecimal string.
 */
export function digest(str: string): string {
  const secret = process.env.REDIS_KEY_SECRET || '';
  return crypto.createHmac('sha256', secret).update(str).digest('hex');
}
