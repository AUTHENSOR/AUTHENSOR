/**
 * MCP Server
 *
 * Creates and configures the Model Context Protocol server
 * with Authensor tool implementations.
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { httpTools, executeHttpTool } from './tools/http.js';
import { stripeTools, executeStripeTool } from './tools/stripe.js';
import { githubTools, executeGithubTool } from './tools/github.js';
import { AuthensorClient } from './authensor-client.js';

export interface ServerOptions {
  controlPlaneUrl: string;
  stripeSecretKey?: string;
  githubToken?: string;
}

export function createServer(options: ServerOptions) {
  const authensor = new AuthensorClient(options.controlPlaneUrl);

  const server = new Server(
    {
      name: 'authensor-mcp-server',
      version: '0.0.1',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List all available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        ...httpTools,
        ...stripeTools,
        ...githubTools,
      ],
    };
  });

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      // Route to appropriate tool handler
      if (name.startsWith('http_')) {
        return await executeHttpTool(name, args, authensor);
      }

      if (name.startsWith('stripe_')) {
        return await executeStripeTool(name, args, authensor);
      }

      if (name.startsWith('github_')) {
        return await executeGithubTool(name, args, authensor, options.githubToken);
      }

      return {
        content: [{ type: 'text', text: `Unknown tool: ${name}` }],
        isError: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
        isError: true,
      };
    }
  });

  // Connect via stdio
  const transport = new StdioServerTransport();
  server.connect(transport);

  console.log('MCP Server connected via stdio');

  return server;
}
