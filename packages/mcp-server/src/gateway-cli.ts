#!/usr/bin/env node
/**
 * CLI Entry Point for MCP Gateway
 *
 * Transparent proxy for any MCP server through Authensor policy evaluation.
 *
 * Usage:
 *   CONTROL_PLANE_URL=http://localhost:3000 \
 *   UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \
 *   npx authensor-mcp-gateway
 */

import { createGateway } from './gateway.js';

const controlPlaneUrl = process.env.CONTROL_PLANE_URL || 'http://localhost:3000';
const upstreamCommand = process.env.UPSTREAM_COMMAND;

if (!upstreamCommand) {
  console.error('Error: UPSTREAM_COMMAND environment variable is required.');
  console.error('');
  console.error('Usage:');
  console.error('  UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \\');
  console.error('  CONTROL_PLANE_URL=http://localhost:3000 \\');
  console.error('  npx authensor-mcp-gateway');
  process.exit(1);
}

console.error('Starting Authensor MCP Gateway...');
console.error(`Control Plane: ${controlPlaneUrl}`);
console.error(`Upstream: ${upstreamCommand}`);

createGateway({
  controlPlaneUrl,
  upstreamCommand,
  principalId: process.env.AUTHENSOR_PRINCIPAL_ID,
}).catch((error) => {
  console.error('Gateway failed to start:', error);
  process.exit(1);
});
