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

// Per-IP fixed-window rate limit for the public /ingest write.
// This route is intentionally keyless (opt-in anonymous telemetry) and is mounted
// before the auth + global rate-limit middleware, so it needs its own limiter.
const INGEST_WINDOW_MS = 60_000;
const INGEST_MAX_PER_WINDOW = parseInt(process.env.AUTHENSOR_RL_STATS_INGEST_PER_MIN || '60', 10);
const ingestRateState = new Map<string, number>();

function ingestClientKey(c: import('hono').Context): string {
  const fwd = c.req.header('x-forwarded-for');
  const ip = (fwd ? fwd.split(',')[0].trim() : '') || c.req.header('x-real-ip') || 'unknown';
  const windowStart = Math.floor(Date.now() / INGEST_WINDOW_MS);
  return `${ip}:${windowStart}`;
}

function ingestRateLimited(c: import('hono').Context): boolean {
  // Opportunistic cleanup of stale windows to bound memory.
  const currentWindow = Math.floor(Date.now() / INGEST_WINDOW_MS);
  for (const key of ingestRateState.keys()) {
    const w = parseInt(key.slice(key.lastIndexOf(':') + 1), 10);
    if (w < currentWindow - 1) ingestRateState.delete(key);
  }

  const key = ingestClientKey(c);
  const count = ingestRateState.get(key) || 0;
  if (count >= INGEST_MAX_PER_WINDOW) return true;
  ingestRateState.set(key, count + 1);
  return false;
}

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
  if (ingestRateLimited(c)) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }
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
