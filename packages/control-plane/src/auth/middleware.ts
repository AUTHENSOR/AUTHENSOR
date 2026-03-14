/**
 * Auth Middleware
 *
 * API key authentication and role-based authorization middleware.
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import { db } from '../db.js';
import { hashToken, constantTimeCompare } from './hash.js';
import type { AuthContext, Role, ApiKey } from './types.js';

// Extend Hono's context variables
declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext;
  }
}

interface ApiKeyRow {
  id: string;
  name: string;
  role: string;
  key_hash: string;
  principal_id: string | null;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

/**
 * Check if auth is enabled (keys exist in the database)
 * When no keys exist, auth is disabled to allow bootstrapping
 */
async function isAuthEnabled(): Promise<boolean> {
  const { rows } = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM api_keys');
  return parseInt(rows[0].count, 10) > 0;
}

/**
 * Look up an API key by its hash
 */
async function lookupKey(keyHash: string): Promise<ApiKey | null> {
  const { rows } = await db.query<ApiKeyRow>(
    'SELECT * FROM api_keys WHERE key_hash = $1',
    [keyHash]
  );

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.id,
    name: row.name,
    role: row.role as Role,
    keyHash: row.key_hash,
    principalId: row.principal_id ?? null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
    lastUsedAt: row.last_used_at,
  };
}

/**
 * Update last_used_at timestamp (best-effort, non-blocking)
 */
function updateLastUsed(keyId: string): void {
  db.query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [keyId]).catch((err) => {
    console.warn(`[auth] Failed to update last_used_at for key ${keyId}:`, err.message);
  });
}

/**
 * Extract token from request
 * Accepts: Authorization: Bearer <token>, x-authensor-key: <token>
 * Also accepts ?token=<token> query param ONLY when AUTHENSOR_SANDBOX_MODE=stub (for browser DX in sandbox)
 */
function extractToken(c: Context): string | null {
  // Try Authorization header first
  const authHeader = c.req.header('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Fallback to x-authensor-key header
  const keyHeader = c.req.header('x-authensor-key');
  if (keyHeader) {
    return keyHeader;
  }

  // Fallback to ?token= query param ONLY in sandbox mode (tokens in URLs are a security risk)
  // This is allowed in sandbox for browser DX but disabled in production
  const sandboxMode = process.env.AUTHENSOR_SANDBOX_MODE;
  if (sandboxMode === 'stub') {
    const tokenParam = c.req.query('token');
    if (tokenParam) {
      return tokenParam;
    }
  }

  return null;
}

/**
 * Check if this is a safe bootstrap endpoint
 * Only /health and POST /keys (with bootstrap token) are allowed when no keys exist
 */
function isBootstrapSafeEndpoint(c: Context): boolean {
  const path = c.req.path;
  const method = c.req.method;

  // Health check is always allowed
  if (path === '/health' || path === '/health/') {
    return true;
  }

  // POST /keys is allowed only with bootstrap token
  if (method === 'POST' && (path === '/keys' || path === '/keys/')) {
    const bootstrapToken = process.env.AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN;
    if (bootstrapToken) {
      const providedToken = extractToken(c);
      return providedToken === bootstrapToken;
    }
  }

  return false;
}

/**
 * Authentication middleware
 * Validates API key and attaches auth context to request
 *
 * Safe-by-default bootstrap mode:
 * - When no keys exist, only /health and POST /keys (with AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN) are allowed
 * - All other endpoints return 503 BOOTSTRAP_REQUIRED
 * - Set AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN env var to enable key creation
 */
export const authMiddleware: MiddlewareHandler = async (c: Context, next: Next) => {
  // Check if auth is enabled (keys exist)
  const authEnabled = await isAuthEnabled();

  if (!authEnabled) {
    // Safe bootstrap mode - only allow specific endpoints
    if (isBootstrapSafeEndpoint(c)) {
      c.set('auth', {
        keyId: 'bootstrap',
        role: 'admin' as Role,
        name: 'Bootstrap Mode',
        principalId: null,
      });
      return next();
    }

    // All other endpoints blocked until keys are created
    return c.json(
      {
        error: {
          code: 'BOOTSTRAP_REQUIRED',
          message:
            'No API keys configured. Set AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN and POST to /keys to create the first admin key.',
        },
      },
      503
    );
  }

  const token = extractToken(c);
  if (!token) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'API key required' } },
      401
    );
  }

  const keyHash = hashToken(token);
  const apiKey = await lookupKey(keyHash);

  if (!apiKey) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'Invalid API key' } },
      401
    );
  }

  if (apiKey.revokedAt) {
    return c.json(
      { error: { code: 'UNAUTHORIZED', message: 'API key has been revoked' } },
      401
    );
  }

  // Update last_used_at (non-blocking)
  updateLastUsed(apiKey.id);

  // Attach auth context
  c.set('auth', {
    keyId: apiKey.id,
    role: apiKey.role,
    name: apiKey.name,
    principalId: apiKey.principalId,
  });

  return next();
};

/**
 * Role authorization middleware factory
 * Returns middleware that checks if the authenticated user has one of the required roles
 */
export function requireRole(allowedRoles: Role[]): MiddlewareHandler {
  return async (c: Context, next: Next) => {
    const auth = c.get('auth');

    if (!auth) {
      return c.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        401
      );
    }

    if (!allowedRoles.includes(auth.role)) {
      return c.json(
        {
          error: {
            code: 'FORBIDDEN',
            message: `Insufficient permissions. Required role: ${allowedRoles.join(' or ')}`,
          },
        },
        403
      );
    }

    return next();
  };
}
