/**
 * Health Check Route
 */

import { Hono } from 'hono';
import { db } from '../db.js';

export const healthRoute = new Hono();

healthRoute.get('/', (c) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

healthRoute.get('/ready', async (c) => {
  try {
    await db.query('SELECT 1');
    return c.json({
      status: 'ready',
      checks: {
        database: 'ok',
      },
    });
  } catch (error) {
    return c.json(
      {
        status: 'error',
        checks: {
          database: 'error',
          error: (error as Error).message,
        },
      },
      503
    );
  }
});
