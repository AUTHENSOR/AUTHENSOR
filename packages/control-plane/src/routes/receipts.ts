/**
 * Receipts Route
 *
 * GET /receipts - List receipts (admin only)
 * GET /receipts/view - HTML list view (admin only)
 * GET /receipts/:id - Get a specific receipt (admin | executor)
 * GET /receipts/:id/view - HTML detail view (admin | executor)
 * PATCH /receipts/:id - Update receipt (executor | admin)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import {
  getReceipts,
  getReceiptById,
  updateReceipt,
} from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';

const SENSITIVE_KEYS = [
  // Auth headers
  'authorization',
  'token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'cookie',
  'set-cookie',
  // OAuth/JWT tokens
  'access_token',
  'refresh_token',
  'id_token',
  'jwt',
  'bearer',
  // Keys and credentials
  'private_key',
  'public_key',
  'key',
  'credentials',
  'credential',
  // Session identifiers
  'session',
  'session_id',
  'sessionid',
  'csrf',
  'csrf_token',
  // Common sensitive headers/params
  'x-api-key',
  'x-auth-token',
  'x-access-token',
];

function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => redactSecrets(v));
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([k, v]) => {
      const lower = k.toLowerCase();
      if (SENSITIVE_KEYS.includes(lower)) return [k, '[REDACTED]'];
      return [k, redactSecrets(v)];
    });
    return Object.fromEntries(entries);
  }
  return value;
}

function escapeHtml(str: string | undefined | null): string {
  const value = String(str ?? '');
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getBaseUrl(c: any): string {
  const trustProxy = process.env.TRUST_PROXY === 'true';
  try {
    const url = new URL(c.req.url, 'http://placeholder');
    if (url.protocol && url.host && url.host !== 'placeholder') {
      return `${url.protocol}//${url.host}`;
    }
  } catch {
    // ignore parse errors
  }
  const host = c.req.header('host');
  if (!host) return '';
  const forwardedHost = trustProxy ? c.req.header('x-forwarded-host') : undefined;
  const proto =
    (trustProxy ? c.req.header('x-forwarded-proto') : undefined) ||
    (c.req.header('x-forwarded-proto') && trustProxy ? c.req.header('x-forwarded-proto') : undefined) ||
    'http';
  const targetHost = forwardedHost || host;
  return `${proto}://${targetHost}`;
}

function withLinks(c: any, receipt: any) {
  const base = getBaseUrl(c);
  const apiPath = `/receipts/${receipt.id}`;
  const viewPath = `/receipts/${receipt.id}/view`;
  return {
    ...receipt,
    receiptApiUrl: apiPath,
    receiptUrl: viewPath,
    receiptLink: base ? `${base}${viewPath}` : viewPath,
    receiptApiLink: base ? `${base}${apiPath}` : apiPath,
  };
}

export const receiptsRoute = new Hono();

// List receipts with optional filters (admin only - audit data)
receiptsRoute.get('/', requireRole(['admin']), async (c) => {
  const limit = parseInt(c.req.query('limit') || '50', 10);
  const offset = parseInt(c.req.query('offset') || '0', 10);
  const status = c.req.query('status');
  const principalId = c.req.query('principalId');
  const toolName = c.req.query('toolName');
  const actorId = c.req.query('actorId');
  const decisionOutcome = c.req.query('decisionOutcome');

  const receipts = await getReceipts({
    limit: Math.min(limit, 200),
    offset,
    status,
    principalId,
    actorId,
    toolName,
    decisionOutcome,
  });

  return c.json({
    receipts: receipts.map((r) => withLinks(c, r)),
    pagination: {
      limit,
      offset,
      total: receipts.length, // TODO: Get actual count
    },
  });
});

// Export receipts as NDJSON (admin only - for data export)
// GET /receipts/export?from=ISO&to=ISO&limit=1000
receiptsRoute.get('/export', requireRole(['admin']), async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '1000', 10), 10000);
  const status = c.req.query('status');
  const toolName = c.req.query('toolName');
  const actorId = c.req.query('actorId');
  const decisionOutcome = c.req.query('decisionOutcome');

  const receipts = await getReceipts({
    limit,
    status: status || undefined,
    toolName: toolName || undefined,
    actorId: actorId || undefined,
    decisionOutcome: decisionOutcome || undefined,
  });

  // Redact secrets before export
  const redactedReceipts = receipts.map((r) => redactSecrets(r));

  // Return as NDJSON for easy streaming/parsing
  const ndjson = redactedReceipts.map((r) => JSON.stringify(r)).join('\n');

  c.header('Content-Type', 'application/x-ndjson');
  c.header('Content-Disposition', `attachment; filename="receipts-export-${new Date().toISOString().slice(0, 10)}.ndjson"`);

  return c.body(ndjson);
});

// HTML list view (admin only - audit data)
// Security headers prevent token leakage when using ?token= in sandbox mode
receiptsRoute.get('/view', requireRole(['admin']), async (c) => {
  // Security headers to prevent token leakage from URL
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Robots-Tag', 'noindex');
  // CSP and hardening headers
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  const limit = parseInt(c.req.query('limit') || '50', 10);
  const status = c.req.query('status');
  const toolName = c.req.query('tool_name') || c.req.query('toolName');
  const actorId = c.req.query('actor_id') || c.req.query('actorId');
  const decisionOutcome = c.req.query('decision_outcome') || c.req.query('decisionOutcome');

  const receipts = await getReceipts({
    limit: Math.min(limit, 200),
    status: status || undefined,
    toolName: toolName || undefined,
    actorId: actorId || undefined,
    decisionOutcome: decisionOutcome || undefined,
  });

  const rows = receipts
    .map((r) => {
      const link = `/receipts/${r.id}/view`;
      return `<tr>
        <td>${escapeHtml(new Date(r.timestamp).toISOString())}</td>
        <td>${escapeHtml(r.status)}</td>
        <td>${escapeHtml(r.decision.outcome)}</td>
        <td>${escapeHtml(r.envelope?.action?.type || '')}</td>
        <td>${escapeHtml(r.envelope?.principal?.id || '')}</td>
        <td><a href="${link}">view</a></td>
      </tr>`;
    })
    .join('');

  return c.html(`<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Authensor Receipts</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 14px; }
        th { background: #f5f5f5; }
      </style>
    </head>
    <body>
      <h1>Authensor Receipts</h1>
      <p>Showing latest ${receipts.length} receipts (limit ${Math.min(limit, 200)}).</p>
      <table>
        <thead>
          <tr>
            <th>Created</th>
            <th>Status</th>
            <th>Decision</th>
            <th>Tool</th>
            <th>Actor</th>
            <th>Link</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="6">No receipts</td></tr>'}</tbody>
      </table>
    </body>
  </html>`);
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Get single receipt (admin | executor - executor needs to read receipts it executes)
receiptsRoute.get('/:id', requireRole(['admin', 'executor']), async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.json({ error: 'Invalid receipt ID format' }, 400);
  }
  const receipt = await getReceiptById(id);

  if (!receipt) {
    return c.json({ error: 'Receipt not found' }, 404);
  }

  return c.json(withLinks(c, receipt));
});

// HTML view for a single receipt (admin | executor)
// Security headers prevent token leakage when using ?token= in sandbox mode
receiptsRoute.get('/:id/view', requireRole(['admin', 'executor']), async (c) => {
  const id = c.req.param('id');
  if (!UUID_REGEX.test(id)) {
    return c.html('<h1>Invalid receipt ID format</h1>', 400);
  }
  const receipt = await getReceiptById(id);
  if (!receipt) return c.html('<h1>Receipt not found</h1>', 404);

  // Security headers to prevent token leakage from URL
  c.header('Cache-Control', 'no-store');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('X-Robots-Tag', 'noindex');
  // CSP and hardening headers
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');

  const safe = redactSecrets(receipt);
  const policyId = (receipt.decision as any)?.policyId || 'unknown';
  const policyVersion = (receipt.decision as any)?.policyVersion || 'unknown';
  const policySource = (receipt.decision as any)?.policySource || 'unknown';
  const approvalStatus = receipt.approval?.status || 'n/a';
  const claimState = receipt.metadata?.claimId
    ? `claimed (expires ${escapeHtml(receipt.metadata.claimExpiresAt as string | undefined)})`
    : 'unclaimed/expired';
  const jsonBlock = (title: string, obj: unknown) =>
    `<section><h3>${title}</h3><pre>${escapeHtml(JSON.stringify(obj ?? {}, null, 2))}</pre></section>`;

  return c.html(`<!DOCTYPE html>
  <html>
    <head>
      <meta charset="utf-8" />
      <title>Authensor Receipt ${escapeHtml(receipt.id)}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 24px; }
        h1 { margin-bottom: 4px; }
        .meta { margin-bottom: 16px; }
        .meta div { margin: 2px 0; }
        pre { background: #f6f8fa; padding: 12px; border-radius: 6px; overflow-x: auto; }
        button { padding: 6px 10px; margin-bottom: 12px; }
      </style>
    </head>
    <body>
      <h1>Authensor Receipt ${escapeHtml(receipt.id)}</h1>
      <div class="meta">
        <div>Status: <strong>${escapeHtml(receipt.status)}</strong></div>
        <div>Decision: <strong>${escapeHtml(receipt.decision.outcome)}</strong></div>
        <div>Policy: ${escapeHtml(policyId)}@${escapeHtml(policyVersion)} (${escapeHtml(policySource)})</div>
        <div>Approval Status: ${escapeHtml(approvalStatus)}</div>
        <div>Claim: ${escapeHtml(claimState)}</div>
        <div>Tool: ${escapeHtml(receipt.envelope?.action?.type || '')}</div>
        <div>Actor: ${escapeHtml(receipt.envelope?.principal?.id || '')}</div>
        <div>Created: ${escapeHtml(new Date(receipt.timestamp as string).toISOString())}</div>
        <div>Updated: ${escapeHtml((receipt.metadata?.claimedAt || receipt.timestamp) as string)}</div>
      </div>
      <button onclick="navigator.clipboard.writeText(document.getElementById('json').innerText)">Copy JSON</button>
      <div id="json">${jsonBlock('Envelope', (safe as any).envelope)}
      ${jsonBlock('Decision', (safe as any).decision)}
      ${jsonBlock('Approval', (safe as any).approval)}
      ${jsonBlock('Execution', (safe as any).execution)}
      ${jsonBlock('Result', (safe as any).execution?.result || (safe as any).result)}
      ${jsonBlock('Error', (safe as any).execution?.error || (safe as any).error)}</div>
    </body>
  </html>`);
});

// Update receipt schema
const updateReceiptSchema = z.object({
  status: z.enum(['pending', 'executed', 'failed', 'skipped', 'cancelled']).optional(),
  claimId: z.string().uuid().optional(),
  execution: z.object({
    startedAt: z.string().datetime().optional(),
    completedAt: z.string().datetime().optional(),
    durationMs: z.number().optional(),
    result: z.record(z.unknown()).optional(),
    error: z.object({
      code: z.string().optional(),
      message: z.string().optional(),
      details: z.record(z.unknown()).optional(),
    }).optional(),
  }).optional(),
  approval: z
    .object({
      status: z.enum(['pending', 'approved', 'rejected', 'expired']).optional(),
      respondedAt: z.string().datetime().optional(),
      respondedBy: z
        .object({
          type: z.string().optional(),
          id: z.string().optional(),
          name: z.string().optional(),
        })
        .optional(),
      comment: z.string().optional(),
    })
    .optional(),
});

// Update receipt (e.g., mark as executed) - executor | admin
receiptsRoute.patch(
  '/:id',
  requireRole(['executor', 'admin']),
  zValidator('json', updateReceiptSchema),
  async (c) => {
    const id = c.req.param('id');
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid receipt ID format' }, 400);
    }
    const updates = c.req.valid('json');

    try {
      const receipt = await updateReceipt(id, updates);

      if (!receipt) {
        return c.json({ error: 'Receipt not found' }, 404);
      }

      return c.json(receipt);
    } catch (error) {
      return c.json({ error: (error as Error).message }, 400);
    }
  }
);
