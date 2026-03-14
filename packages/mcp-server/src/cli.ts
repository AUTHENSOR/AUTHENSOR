#!/usr/bin/env node
/**
 * CLI Entry Point for MCP Server
 *
 * Run with: npx authensor-mcp
 * Or: pnpm dev (in packages/mcp-server)
 */

import { createServer } from './server.js';

const controlPlaneUrl = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';

console.log('Starting Authensor MCP Server...');
console.log(`Control Plane URL: ${controlPlaneUrl}`);

createServer({
  controlPlaneUrl,
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  githubToken: process.env.GITHUB_TOKEN,
});
