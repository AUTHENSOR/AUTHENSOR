/**
 * MCP Gateway with SEP Authorization Protocol Support
 *
 * A transparent proxy that sits between an MCP client (LLM) and any upstream
 * MCP server. Every tool call is evaluated against Authensor policies before
 * being forwarded to the upstream server.
 *
 * Implements the MCP SEP (Pre-execution Authorization Hooks) proposal:
 * - authorization/propose — client proposes an action envelope
 * - authorization/decide — gateway returns policy decision with receiptId
 * - authorization/receipt — gateway emits receipt after execution
 *
 * Backward compatible: if the client does not negotiate the authorization
 * capability, the gateway falls back to inline evaluation on tools/call.
 *
 * Usage:
 *   CONTROL_PLANE_URL=http://localhost:3000 \
 *   UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \
 *   npx authensor-mcp-gateway
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
import { AuthensorClient, type EvaluationResult } from './authensor-client.js';

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
  /** Require authorization/propose before tools/call (fail-closed) */
  requireAuthorization?: boolean;
}

/**
 * Pending authorization — tracks decisions awaiting execution.
 * Entries expire after 5 minutes to prevent stale authorizations.
 */
interface PendingAuthorization {
  receiptId: string;
  toolName: string;
  decision: EvaluationResult;
  createdAt: number;
}

const AUTHORIZATION_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function createGateway(options: GatewayOptions) {
  const authensor = new AuthensorClient(options.controlPlaneUrl, {
    principalId: options.principalId || 'mcp-gateway',
    principalType: 'agent',
  });

  // Track authorized actions by receiptId
  const pendingAuthorizations = new Map<string, PendingAuthorization>();

  // Whether the client negotiated authorization capability
  let clientSupportsAuthorization = false;

  // --- Upstream MCP client ---
  const [cmd, ...defaultArgs] = options.upstreamCommand.split(/\s+/);
  const args = options.upstreamArgs ?? defaultArgs;

  const upstreamTransport = new StdioClientTransport({
    command: cmd,
    args,
    env: { ...process.env, ...options.upstreamEnv } as Record<string, string>,
  });

  const upstream = new Client(
    { name: 'authensor-gateway-client', version: '0.1.0' },
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
    { name: 'authensor-mcp-gateway', version: '0.1.0' },
    {
      capabilities: {
        tools: {},
        // SEP: advertise authorization capability
        authorization: {
          version: '2026-03-14',
          features: {
            policyEvaluation: true,
            approvalWorkflows: true,
            contentSafety: true,
            receiptChain: true,
          },
        },
      } as any, // MCP SDK doesn't have authorization types yet
    }
  );

  // --- SEP: authorization/propose handler ---
  // Clients send this to request authorization before calling a tool
  server.setRequestHandler(
    { method: 'authorization/propose' } as any,
    async (request: any) => {
      const envelope = request.params?.envelope;
      if (!envelope) {
        throw new Error('Missing envelope in authorization/propose');
      }

      clientSupportsAuthorization = true;

      // Evaluate via Authensor control plane
      const evaluation = await authensor.evaluate(envelope);

      // Store pending authorization for later tools/call validation
      if (evaluation.decision.outcome === 'allow') {
        // Extract tool name from action type (mcp.read_file -> read_file)
        const toolName = envelope.action?.type?.startsWith('mcp.')
          ? envelope.action.type.slice(4)
          : envelope.action?.type;

        pendingAuthorizations.set(evaluation.receiptId, {
          receiptId: evaluation.receiptId,
          toolName,
          decision: evaluation,
          createdAt: Date.now(),
        });

        // Clean up expired authorizations
        for (const [id, auth] of pendingAuthorizations) {
          if (Date.now() - auth.createdAt > AUTHORIZATION_TTL_MS) {
            pendingAuthorizations.delete(id);
          }
        }
      }

      // Return authorization/decide response per SEP spec
      return {
        receiptId: evaluation.receiptId,
        decision: {
          outcome: evaluation.decision.outcome,
          evaluatedAt: new Date().toISOString(),
          policyId: evaluation.decision.policyId,
          policyVersion: evaluation.decision.policyVersion,
          reason: evaluation.decision.reason,
          matchedRules: evaluation.decision.matchedRules,
        },
        evaluationTimeMs: evaluation.evaluationTimeMs,
        receiptUrl: evaluation.receiptUrl,
      };
    }
  );

  // Proxy tool list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: toolList };
  });

  // Intercept and proxy tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: toolArgs } = request.params;
    const authorizationId = (request.params as any)._meta?.authorizationId;

    const tool = toolList.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }

    // --- SEP flow: check for pre-authorized call ---
    if (authorizationId) {
      const auth = pendingAuthorizations.get(authorizationId);
      if (!auth) {
        return {
          content: [{
            type: 'text' as const,
            text: `[Authensor Gateway] Authorization ${authorizationId} not found or expired`,
          }],
          isError: true,
        };
      }

      if (auth.toolName !== name) {
        return {
          content: [{
            type: 'text' as const,
            text: `[Authensor Gateway] Authorization was for tool "${auth.toolName}", not "${name}"`,
          }],
          isError: true,
        };
      }

      // Authorization is valid — execute and emit receipt
      pendingAuthorizations.delete(authorizationId);

      const startTime = Date.now();
      try {
        const upstreamResult = await upstream.callTool({ name, arguments: toolArgs });
        const durationMs = Date.now() - startTime;

        // Update receipt with execution result
        await authensor.updateReceipt(auth.receiptId, 'executed', {
          durationMs,
          result: upstreamResult as Record<string, unknown>,
        }).catch(() => {}); // fire-and-forget

        // Emit authorization/receipt notification (SEP)
        emitReceipt(server, auth.receiptId, auth.decision, 'executed', {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
        });

        const response = upstreamResult as { content?: unknown[]; isError?: boolean };
        return {
          content: response.content ?? [
            { type: 'text' as const, text: JSON.stringify(upstreamResult) },
          ],
          isError: response.isError,
        };
      } catch (error) {
        const durationMs = Date.now() - startTime;
        const message = error instanceof Error ? error.message : 'Unknown error';

        await authensor.updateReceipt(auth.receiptId, 'failed', {
          durationMs,
          error: { message },
        }).catch(() => {});

        emitReceipt(server, auth.receiptId, auth.decision, 'failed', {
          startedAt: new Date(startTime).toISOString(),
          completedAt: new Date().toISOString(),
          durationMs,
          error: { message },
        });

        return {
          content: [{ type: 'text' as const, text: `[Authensor Gateway] ${message}` }],
          isError: true,
        };
      }
    }

    // --- Backward-compatible flow: inline evaluation ---
    if (clientSupportsAuthorization && options.requireAuthorization) {
      return {
        content: [{
          type: 'text' as const,
          text: '[Authensor Gateway] This gateway requires authorization/propose before tools/call. Send an authorization/propose request first.',
        }],
        isError: true,
      };
    }

    // Evaluate inline (legacy flow)
    try {
      const result = await authensor.evaluateAndExecute(
        `mcp.${name}`,
        `mcp://${name}`,
        async () => {
          const upstreamResult = await upstream.callTool({ name, arguments: toolArgs });
          return upstreamResult;
        },
        {
          operation: 'execute',
          parameters: toolArgs as Record<string, unknown>,
          toolName: name,
        }
      );

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

  console.error('[gateway] Authensor MCP Gateway ready (SEP authorization enabled).');

  return { server, upstream, pendingAuthorizations };
}

/**
 * Emit an authorization/receipt notification per the SEP spec.
 * Fire-and-forget — receipt emission failures don't affect tool execution.
 */
function emitReceipt(
  server: Server,
  receiptId: string,
  decision: EvaluationResult,
  status: 'executed' | 'failed',
  execution: {
    startedAt: string;
    completedAt: string;
    durationMs: number;
    result?: Record<string, unknown>;
    error?: { message: string };
  }
): void {
  try {
    (server as any).notification?.({
      method: 'authorization/receipt',
      params: {
        receipt: {
          id: receiptId,
          timestamp: new Date().toISOString(),
          decision: {
            outcome: decision.decision.outcome,
            policyId: decision.decision.policyId,
            policyVersion: decision.decision.policyVersion,
            reason: decision.decision.reason,
          },
          status,
          execution,
        },
      },
    });
  } catch {
    // Receipt notification is best-effort
  }
}
