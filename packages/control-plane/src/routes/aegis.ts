/**
 * Aegis Routes — Content safety scanning endpoints.
 *
 * POST /aegis/scan  — Scan content for threats (ingest | admin)
 * GET  /aegis/scans — Recent scan results (admin)
 * GET  /aegis/stats — Scan statistics (admin)
 */

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { requireRole } from '../auth/middleware.js';
import {
  scanContent,
  scanToolResult,
  getRecentScans,
  getAegisStats,
  getScansForReceipt,
  isAegisEnabled,
} from '../services/aegis-service.js';

export const aegisRoute = new Hono();

// POST /aegis/scan — scan arbitrary content
aegisRoute.post(
  '/scan',
  requireRole(['ingest', 'admin']),
  zValidator(
    'json',
    z.object({
      content: z.string().min(1).max(200_000),
      detectors: z.array(z.string()).optional(),
      mode: z.enum(['block', 'redact', 'warn']).optional(),
    })
  ),
  async (c) => {
    if (!isAegisEnabled()) {
      return c.json(
        {
          error: 'AEGIS_DISABLED',
          message: 'Aegis content scanning is not enabled. Set AUTHENSOR_AEGIS_ENABLED=true.',
        },
        503
      );
    }

    const { content, detectors, mode } = c.req.valid('json');
    const result = await scanContent({ content, detectors, mode });

    if (!result) {
      return c.json({ error: 'SCANNER_UNAVAILABLE', message: '@authensor/aegis not installed' }, 503);
    }

    return c.json(result);
  }
);

// POST /aegis/scan-output — scan tool output for indirect prompt injection (OWASP ASI01)
aegisRoute.post(
  '/scan-output',
  requireRole(['ingest', 'admin']),
  zValidator(
    'json',
    z.object({
      content: z.string().min(1).max(200_000),
      receiptId: z.string().uuid().optional(),
      toolName: z.string().max(256).optional(),
    })
  ),
  async (c) => {
    if (!isAegisEnabled()) {
      return c.json(
        {
          error: 'AEGIS_DISABLED',
          message: 'Aegis content scanning is not enabled. Set AUTHENSOR_AEGIS_ENABLED=true.',
        },
        503
      );
    }

    const { content, receiptId, toolName } = c.req.valid('json');
    const result = await scanToolResult(
      receiptId ?? '00000000-0000-0000-0000-000000000000',
      content,
      toolName
    );

    if (!result) {
      return c.json({ error: 'SCANNER_UNAVAILABLE', message: '@authensor/aegis not installed' }, 503);
    }

    return c.json(result);
  }
);

// GET /aegis/scans — list recent scans
aegisRoute.get('/scans', requireRole(['admin']), async (c) => {
  const limit = parseInt(c.req.query('limit') || '50');
  const threatLevel = c.req.query('threatLevel');
  const safe = c.req.query('safe');

  const scans = await getRecentScans({
    limit: Math.min(limit, 200),
    threatLevel: threatLevel || undefined,
    safe: safe !== undefined ? safe === 'true' : undefined,
  });

  return c.json({ scans, count: scans.length });
});

// GET /aegis/scans/receipt/:id — scans for a specific receipt
aegisRoute.get('/scans/receipt/:id', requireRole(['admin']), async (c) => {
  const receiptId = c.req.param('id');
  const scans = await getScansForReceipt(receiptId);
  return c.json({ scans, count: scans.length });
});

// GET /aegis/stats — scanning statistics (24h)
aegisRoute.get('/stats', requireRole(['admin']), async (c) => {
  const stats = await getAegisStats();
  return c.json(stats);
});

// GET /aegis/status — scanner status
aegisRoute.get('/status', requireRole(['admin']), async (c) => {
  let scannerAvailable = false;
  let ruleCount = 0;

  try {
    const aegis = await import('@authensor/aegis');
    const scanner = new aegis.AegisScanner();
    scannerAvailable = true;
    ruleCount = scanner.getRuleCount();
  } catch {
    // scanner not available
  }

  return c.json({
    enabled: isAegisEnabled(),
    scannerAvailable,
    ruleCount,
    mode: process.env.AUTHENSOR_AEGIS_MODE || 'warn',
  });
});
