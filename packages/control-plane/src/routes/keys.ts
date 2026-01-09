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
  created_at: string;
  revoked_at: string | null;
  last_used_at: string | null;
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
  const id = crypto.randomUUID();

  const { rows } = await db.query<ApiKeyRow>(
    `INSERT INTO api_keys (id, name, role, key_hash, created_at)
     VALUES ($1, $2, $3, $4, now())
     RETURNING id, name, role, created_at`,
    [id, body.name.trim(), body.role, keyHash]
  );

  if (rows.length === 0) {
    return c.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create API key' } },
      500
    );
  }

  // Ensure we hash and store properly
  await db.query('UPDATE api_keys SET key_hash = $1 WHERE id = $2', [keyHash, id]);

  return c.json({
    keyId: rows[0].id,
    token, // Only returned once!
    createdAt: rows[0].created_at,
  }, 201);
});

/**
 * GET /keys - List all API keys (admin only)
 *
 * Response: Array of { id, name, role, createdAt, revokedAt, lastUsedAt }
 * Note: key_hash is never returned
 */
keysRoute.get('/', requireRole(['admin']), async (c) => {
  const { rows } = await db.query<ApiKeyRow>(
    `SELECT id, name, role, created_at, revoked_at, last_used_at
     FROM api_keys
     ORDER BY created_at DESC`
  );

  return c.json(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
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
  const id = crypto.randomUUID();

  await db.query(
    `INSERT INTO api_keys (id, name, role, key_hash, created_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT DO NOTHING`,
    [id, 'Bootstrap Admin', 'admin', keyHash]
  );

  console.log('[auth] Bootstrap admin key created from AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN');
}
