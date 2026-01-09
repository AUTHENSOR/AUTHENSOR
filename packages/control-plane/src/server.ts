/**
 * Server Entry Point
 *
 * Starts the HTTP server using @hono/node-server.
 */

import { serve } from '@hono/node-server';
import { createApp } from './app.js';
import { initDb, db } from './db.js';
import { bootstrapAdminKey } from './routes/keys.js';

const port = parseInt(process.env.PORT || '3000', 10);

/**
 * Check if bootstrap is required and warn loudly
 */
async function checkBootstrapRequired(): Promise<void> {
  const { rows } = await db.query<{ count: string }>('SELECT COUNT(*) as count FROM api_keys');
  const keyCount = parseInt(rows[0].count, 10);

  if (keyCount === 0) {
    const hasBootstrapToken = !!process.env.AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN;
    if (!hasBootstrapToken) {
      console.warn('');
      console.warn('=========================================================');
      console.warn('  BOOTSTRAP REQUIRED');
      console.warn('=========================================================');
      console.warn('  No API keys exist and AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN is not set.');
      console.warn('  All endpoints except /health will return 503.');
      console.warn('');
      console.warn('  To initialize:');
      console.warn('    1. Set AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN env var');
      console.warn('    2. POST /keys with Authorization: Bearer <token>');
      console.warn('=========================================================');
      console.warn('');
    }
  }
}

export async function startServer() {
  await initDb();

  // Bootstrap admin key if configured and no keys exist
  await bootstrapAdminKey();

  // Warn if no keys exist and no bootstrap token
  await checkBootstrapRequired();

  const app = createApp();

  console.log(`🚀 Authensor Control Plane starting on port ${port}`);

  serve({
    fetch: app.fetch,
    port,
  });

  console.log(`✅ Server running at http://localhost:${port}`);
}

// Auto-start if run directly
startServer().catch((error) => {
  console.error('Failed to start server', error);
  process.exit(1);
});
