/**
 * Stats Route
 *
 * Public endpoint (no auth required) exposing anonymous aggregate counters.
 * GET /stats — returns all counters
 * POST /stats/ingest — accepts counter increments from opt-in telemetry
 */

import { Hono } from 'hono';
import { getCounters, ingestCounters, isValidMetric, type MetricName } from '../services/stats-service.js';

export const statsRoute = new Hono();

// Public: get aggregate counters
statsRoute.get('/', async (c) => {
  try {
    const counters = await getCounters();
    return c.json(
      { counters },
      200,
      { 'Cache-Control': 'public, max-age=300, stale-while-revalidate=600' }
    );
  } catch {
    return c.json({ counters: null, error: 'unavailable' }, 503);
  }
});

// Public: ingest counter increments from opt-in telemetry
statsRoute.post('/ingest', async (c) => {
  try {
    const body = await c.req.json<Record<string, unknown>>();

    // Validate: only accept known metrics with positive integer values
    const increments: Partial<Record<MetricName, number>> = {};
    for (const [key, value] of Object.entries(body)) {
      if (isValidMetric(key) && typeof value === 'number' && value > 0) {
        increments[key] = value;
      }
    }

    if (Object.keys(increments).length === 0) {
      return c.json({ error: 'No valid metrics provided' }, 400);
    }

    await ingestCounters(increments);
    return c.json({ accepted: true });
  } catch {
    return c.json({ error: 'Invalid request body' }, 400);
  }
});
