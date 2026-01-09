/**
 * Hash Utilities
 *
 * Secure hashing for API keys with constant-time comparison.
 */

import crypto from 'crypto';

/**
 * Hash an API key token using SHA-256
 * Tokens are hashed before storage - never store raw tokens
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Constant-time comparison of two strings
 * Prevents timing attacks on hash comparisons
 */
export function constantTimeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    // Still do a comparison to maintain constant time
    const dummy = Buffer.alloc(a.length);
    crypto.timingSafeEqual(dummy, dummy);
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Generate a secure random token
 * Format: authensor_<32+ random urlsafe chars>
 */
export function generateToken(): string {
  const randomBytes = crypto.randomBytes(32);
  const base64 = randomBytes.toString('base64url');
  return `authensor_${base64}`;
}
