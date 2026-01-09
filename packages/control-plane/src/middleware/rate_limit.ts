/**
 * Rate Limiting Middleware
 *
 * Token-scoped, role-aware rate limiting for API requests.
 * Uses fixed-window in-memory limiter (suitable for single-tenant alpha).
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import type { Role } from '../auth/types.js';

// In-memory rate limit state
// Key format: `${keyId}:${routeGroup}:${windowStart}`
const rateLimitState = new Map<string, number>();

// Clean up old windows periodically
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute
let lastCleanup = Date.now();

function cleanupOldWindows(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  lastCleanup = now;
  const cutoff = Math.floor(now / 60_000) - 2; // Keep last 2 windows

  for (const key of rateLimitState.keys()) {
    const parts = key.split(':');
    const windowStart = parseInt(parts[parts.length - 1], 10);
    if (windowStart < cutoff) {
      rateLimitState.delete(key);
    }
  }
}

/**
 * Get rate limit for a role (requests per minute)
 */
function getRateLimit(role: Role): number {
  switch (role) {
    case 'ingest':
      return parseInt(process.env.AUTHENSOR_RL_INGEST_PER_MIN || '120', 10);
    case 'executor':
      return parseInt(process.env.AUTHENSOR_RL_EXECUTOR_PER_MIN || '60', 10);
    case 'admin':
      return parseInt(process.env.AUTHENSOR_RL_ADMIN_PER_MIN || '120', 10);
    default:
      return 60; // Default fallback
  }
}

/**
 * Determine route group for rate limiting
 */
function getRouteGroup(path: string, method: string): string {
  // Group routes by functional area
  if (path.startsWith('/evaluate')) return 'evaluate';
  if (path.includes('/claim')) return 'claim';
  if (path.startsWith('/receipts')) return method === 'PATCH' ? 'receipt-write' : 'receipt-read';
  if (path.startsWith('/approvals')) return 'approvals';
  if (path.startsWith('/policies')) return 'policies';
  if (path.startsWith('/controls')) return 'controls';
  if (path.startsWith('/keys')) return 'keys';
  if (path.startsWith('/metrics')) return 'metrics';
  return 'default';
}

/**
 * Rate limiting middleware
 * Must be applied AFTER auth middleware so auth context is available
 */
export const rateLimitMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  cleanupOldWindows();

  const auth = c.get('auth');

  // Skip rate limiting in bootstrap mode
  if (!auth || auth.keyId === 'bootstrap') {
    return next();
  }

  const role = auth.role as Role;
  const keyId = auth.keyId;
  const limit = getRateLimit(role);

  const routeGroup = getRouteGroup(c.req.path, c.req.method);
  const windowStart = Math.floor(Date.now() / 60_000); // 1-minute windows
  const key = `${keyId}:${routeGroup}:${windowStart}`;

  const current = rateLimitState.get(key) || 0;

  if (current >= limit) {
    const windowEnd = (windowStart + 1) * 60_000;
    const retryAfterSeconds = Math.ceil((windowEnd - Date.now()) / 1000);

    return c.json(
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Rate limit exceeded. Limit: ${limit} requests per minute.`,
          retryAfterSeconds: Math.max(1, retryAfterSeconds),
        },
      },
      429
    );
  }

  rateLimitState.set(key, current + 1);

  // Add rate limit headers
  c.header('X-RateLimit-Limit', String(limit));
  c.header('X-RateLimit-Remaining', String(limit - current - 1));
  c.header('X-RateLimit-Reset', String((windowStart + 1) * 60));

  return next();
};

/**
 * Export for testing purposes
 */
export function _resetRateLimitState(): void {
  rateLimitState.clear();
}

export function _getRateLimitState(): Map<string, number> {
  return rateLimitState;
}
