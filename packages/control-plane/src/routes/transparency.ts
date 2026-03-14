/**
 * Transparency Route
 *
 * GET /receipts/:id/transparency - Get the transparency proof for a receipt
 * Requires: admin role
 */

import { Hono } from 'hono';
import { requireRole } from '../auth/middleware.js';
import {
  isTransparencyEnabled,
  getTransparencyProof,
} from '../services/transparency-service.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const transparencyRoute = new Hono();

// GET /receipts/:id/transparency
transparencyRoute.get(
  '/:id/transparency',
  requireRole(['admin']),
  async (c) => {
    const id = c.req.param('id');
    if (!UUID_REGEX.test(id)) {
      return c.json({ error: 'Invalid receipt ID format' }, 400);
    }

    if (!isTransparencyEnabled()) {
      return c.json(
        { error: 'Transparency log publishing is not enabled' },
        404
      );
    }

    const proof = await getTransparencyProof(id);
    if (!proof) {
      return c.json(
        {
          error:
            'No transparency proof found for this receipt. It may not have been published to the transparency log.',
        },
        404
      );
    }

    return c.json(proof);
  }
);
