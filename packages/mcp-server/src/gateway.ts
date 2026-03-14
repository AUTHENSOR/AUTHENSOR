/**
 * MCP Gateway
 *
 * A transparent proxy that sits between an MCP client (LLM) and any upstream
 * MCP server. Every tool call is evaluated against Authensor policies before
 * being forwarded to the upstream server.
 *
 * Usage:
 *   CONTROL_PLANE_URL=http://localhost:3000 \
 *   UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \
 *   npx authensor-mcp-gateway
 *
 * The gateway:
 * 1. Spawns the upstream MCP server as a child process
 * 2. Lists its tools and exposes them as its own
 * 3. Intercepts every tools/call, evaluates it against Authensor policies
 * 4. Forwards allowed calls to the upstream server
 * 5. Records receipts for all proxied calls (allowed and denied)
 */

import { spawn, type ChildProcess } from 'child_process';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { AuthensorClient } from './authensor-client.js';

export interface GatewayOptions {
  /** Authensor control plane URL */
  controlPlaneUrl: string;
  /** Command to spawn the upstream MCP server */
  upstreamCommand: string;
  /** Arguments for the upstream command */
  upstreamArgs?: string[];
  /** Environment variables for the upstream process */
  upstreamEnv?: Record<string, string>;
  /** Principal ID for policy evaluation */
  principalId?: string;
}

export async function createGateway(options: GatewayOptions) {
  const authensor = new AuthensorClient(options.controlPlaneUrl, {
    principalId: options.principalId || 'mcp-gateway',
    principalType: 'agent',
  });

  // --- Upstream MCP client ---
  const [cmd, ...defaultArgs] = options.upstreamCommand.split(/\s+/);
  const args = options.upstreamArgs ?? defaultArgs;

  const upstreamTransport = new StdioClientTransport({
    command: cmd,
    args,
    env: { ...process.env, ...options.upstreamEnv } as Record<string, string>,
  });

  const upstream = new Client(
    { name: 'authensor-gateway-client', version: '0.0.1' },
    { capabilities: {} }
  );

  await upstream.connect(upstreamTransport);

  // Fetch upstream tools
  const upstreamTools = await upstream.listTools();
  const toolList = upstreamTools.tools;

  console.error(`[gateway] Connected to upstream. ${toolList.length} tools available.`);
  for (const tool of toolList) {
    console.error(`[gateway]   - ${tool.name}`);
  }

  // --- Gateway MCP server ---
  const server = new Server(
    { name: 'authensor-mcp-gateway', version: '0.0.1' },
    { capabilities: { tools: {} } }
  );

  // Proxy tool list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolList };
  });

  // Intercept and proxy tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;

    const tool = toolList.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // Evaluate against Authensor policies
    try {
      const result = await authensor.evaluateAndExecute(
        `mcp.${name}`,
        `mcp://${name}`,
        async () => {
          // Forward to upstream
          const upstreamResult = await upstream.callTool({ name, arguments: toolArgs });
          return upstreamResult;
        },
        {
          operation: 'execute',
          parameters: toolArgs as Record<string, unknown>,
          toolName: name,
        }
      );

      // Return the upstream result directly
      const upstreamResponse = result.result as { content?: unknown[]; isError?: boolean };
      return {
        content: upstreamResponse.content ?? [
          { type: 'text' as const, text: JSON.stringify(result.result) },
        ],
        isError: upstreamResponse.isError,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text' as const, text: `[Authensor Gateway] ${message}` }],
        isError: true,
      };
    }
  });

  // Connect gateway server via stdio
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('[gateway] Authensor MCP Gateway ready.');

  return { server, upstream };
}
