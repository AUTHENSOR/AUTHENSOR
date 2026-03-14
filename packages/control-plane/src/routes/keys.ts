/**
 * Key Management Routes
 *
 * Admin-only endpoints for managing API keys.
 */

import { Hono } from 'hono';
import crypto from 'crypto';
import { db } from '../db.js';
import { hashToken, generateToken } from '../auth/hash.js';
import { requireRole } from '../auth/middleware.js';
import type { Role } from '../auth/types.js';

export const keysRoute = new Hono();

interface ApiKeyRow {
  id: string;
  name: string;
  role: string;
  key_prefix: string | null;
  principal_id: string | null;
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
}

/**
 * Generate a display prefix from a token
 * Format: "authensor_XXXX...YYYY" (first 14 chars + last 4)
 * This allows identifying keys without exposing the full token.
 */
function getTokenPrefix(token: string): string {
  const prefix = token.slice(0, 14); // "authensor_XXXX"
  const suffix = token.slice(-4);    // last 4 chars
  return `${prefix}...${suffix}`;
}

/**
 * POST /keys - Create a new API key (admin only)
 *
 * Request body: { name: string, role: 'ingest' | 'executor' | 'admin' }
 * Response: { keyId, token, createdAt }
 *
 * IMPORTANT: The token is only returned once and never stored.
 */
keysRoute.post('/', requireRole(['admin']), async (c) => {
  const body = await c.req.json<{ name?: string; role?: string }>();

  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'name is required' } },
      400
    );
  }

  const validRoles: Role[] = ['ingest', 'executor', 'admin'];
  if (!body.role || !validRoles.includes(body.role as Role)) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'role must be one of: ingest, executor, admin' } },
      400
    );
  }

  const token = generateToken();
  const keyHash = hashToken(token);
  const keyPrefix = getTokenPrefix(token);
  const id = crypto.randomUUID();

  const { rows } = await db.query<ApiKeyRow>(
    `INSERT INTO api_keys (id, name, role, key_hash, key_prefix, created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id, name, role, key_prefix, created_at`,
    [id, body.name.trim(), body.role, keyHash, keyPrefix]
  );

  if (rows.length === 0) {
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' } },
      500
    );
  }

  return c.json({
    keyId: rows[0].id,
    keyPrefix: rows[0].key_prefix,
    token, // Only returned once!
    createdAt: rows[0].created_at,
  }, 201);
});

/**
 * GET /keys - List all API keys (admin only)
 *
 * Response: Array of { id, name, role, keyPrefix, createdAt, revokedAt, lastUsedAt }
 * Note: key_hash is never returned, only the display prefix
 */
keysRoute.get('/', requireRole(['admin']), async (c) => {
  const { rows } = await db.query<ApiKeyRow>(
    `SELECT id, name, role, key_prefix, principal_id, created_at, revoked_at, last_used_at
     FROM api_keys
     ORDER BY created_at DESC`
  );

  return c.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      keyPrefix: row.key_prefix,
      principalId: row.principal_id ?? null,
      createdAt: row.created_at,
      revokedAt: row.revoked_at,
      lastUsedAt: row.last_used_at,
    }))
  );
});

/**
 * POST /keys/:id/revoke - Revoke an API key (admin only)
 *
 * Sets revoked_at to now(), making the key invalid.
 */
keysRoute.post('/:id/revoke', requireRole(['admin']), async (c) => {
  const keyId = c.req.param('id');

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyId)) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid key ID format' } },
      400
    );
  }

  const { rowCount } = await db.query(
    `UPDATE api_keys SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`,
    [keyId]
  );

  if (rowCount === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Key not found or already revoked' } },
      404
    );
  }

  return c.json({ success: true, revokedAt: new Date().toISOString() });
});

/**
 * POST /keys/:id/rotate - Rotate an API key (admin only)
 *
 * Revokes the old key and creates a new one with the same name and role.
 * Returns the new token (shown once) and the new key ID.
 */
keysRoute.post('/:id/rotate', requireRole(['admin']), async (c) => {
  const keyId = c.req.param('id');

  // Validate UUID format
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyId)) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid key ID format' } },
      400
    );
  }

  // Get the existing key details
  const { rows: existingRows } = await db.query<ApiKeyRow>(
    `SELECT id, name, role FROM api_keys WHERE id = $1 AND revoked_at IS NULL`,
    [keyId]
  );

  if (existingRows.length === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Key not found or already revoked' } },
      404
    );
  }

  const existing = existingRows[0];

  // Generate new token
  const newToken = generateToken();
  const newKeyHash = hashToken(newToken);
  const newKeyPrefix = getTokenPrefix(newToken);
  const newId = crypto.randomUUID();

  // Revoke old key and create new one in a transaction
  await db.query('BEGIN');
  try {
    // Revoke the old key
    await db.query(
      `UPDATE api_keys SET revoked_at = now() WHERE id = $1`,
      [keyId]
    );

    // Create the new key with same name and role
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash, key_prefix, created_at)
       VALUES ($1, $2, $3, $4, $5, now())`,
      [newId, existing.name, existing.role, newKeyHash, newKeyPrefix]
    );

    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }

  return c.json({
    previousKeyId: keyId,
    keyId: newId,
    keyPrefix: newKeyPrefix,
    token: newToken, // Only returned once!
    role: existing.role,
    name: existing.name,
    rotatedAt: new Date().toISOString(),
  }, 201);
});

/**
 * POST /keys/:id/principal - Bind a principal to an API key (admin only)
 *
 * When a key has a principal_id, envelopes submitted with that key must
 * have a matching principal.id. This prevents agent impersonation.
 */
keysRoute.post('/:id/principal', requireRole(['admin']), async (c) => {
  const keyId = c.req.param('id');

  const body = await c.req.json<{ principalId?: string }>();

  if (!body.principalId || typeof body.principalId !== 'string' || body.principalId.trim().length === 0) {
    return c.json(
      { error: { code: 'INVALID_INPUT', message: 'principalId is required' } },
      400
    );
  }

  const { rowCount } = await db.query(
    `UPDATE api_keys SET principal_id = $1 WHERE id = $2`,
    [body.principalId.trim(), keyId]
  );

  if (rowCount === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Key not found' } },
      404
    );
  }

  return c.json({ success: true, principalId: body.principalId.trim() });
});

/**
 * DELETE /keys/:id/principal - Unbind a principal from an API key (admin only)
 *
 * Removes the principal binding, allowing the key to submit envelopes
 * with any principal.id (unless strict mode is enabled).
 */
keysRoute.delete('/:id/principal', requireRole(['admin']), async (c) => {
  const keyId = c.req.param('id');

  const { rowCount } = await db.query(
    `UPDATE api_keys SET principal_id = NULL WHERE id = $1`,
    [keyId]
  );

  if (rowCount === 0) {
    return c.json(
      { error: { code: 'NOT_FOUND', message: 'Key not found' } },
      404
    );
  }

  return c.json({ success: true, principalId: null });
});

/**
 * Bootstrap an admin key if AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN is set
 * and no keys exist yet. This is idempotent.
 */
export async function bootstrapAdminKey(): Promise<void> {
  const bootstrapToken = process.env.AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN;
  if (!bootstrapToken) {
    return;
  }

  // Check if any keys exist
  const { rows: countRows } = await db.query<{ count: string }>(
    'SELECT COUNT(*) as count FROM api_keys'
  );
  const keyCount = parseInt(countRows[0].count, 10);

  if (keyCount > 0) {
    // Keys already exist, don't bootstrap
    return;
  }

  // Create the bootstrap admin key
  const keyHash = hashToken(bootstrapToken);
  const keyPrefix = getTokenPrefix(bootstrapToken);
  const id = crypto.randomUUID();

  await db.query(
    `INSERT INTO api_keys (id, name, role, key_hash, key_prefix, created_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT DO NOTHING`,
    [id, 'Bootstrap Admin', 'admin', keyHash, keyPrefix]
  );

  console.log('[auth] Bootstrap admin key created from AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN');
}
