/**
 * HTTP Tools
 *
 * Generic HTTP request tool with Authensor policy enforcement.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AuthensorClient } from '../authensor-client.js';
import { validateHttpTarget, HttpGuardError } from '../hardening/http_guard.js';

export const httpTools: Tool[] = [
  {
    name: 'http_request',
    description: 'Make an HTTP request to any URL. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The URL to request',
        },
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
          description: 'HTTP method (default: GET)',
        },
        headers: {
          type: 'object',
          description: 'Request headers',
          additionalProperties: { type: 'string' },
        },
        body: {
          type: 'string',
          description: 'Request body (for POST, PUT, PATCH)',
        },
        timeout: {
          type: 'number',
          description: 'Request timeout in milliseconds (default: 30000)',
        },
      },
      required: ['url'],
    },
  },
];

interface HttpRequestArgs {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export async function executeHttpTool(
  toolName: string,
  args: unknown,
  authensor: AuthensorClient
) {
  if (toolName !== 'http_request') {
    return {
      content: [{ type: 'text' as const, text: `Unknown HTTP tool: ${toolName}` }],
      isError: true,
    };
  }

  const { url, method = 'GET', headers = {}, body, timeout = 30000 } = args as HttpRequestArgs;

  if (!['GET', 'POST'].includes(method.toUpperCase())) {
    return {
      content: [{ type: 'text' as const, text: `Method not allowed: ${method}` }],
      isError: true,
    };
  }

  try {
    var target = await validateHttpTarget(url, { allowHttp: process.env.AUTHENSOR_ALLOW_HTTP === 'true' });
  } catch (error) {
    const guardErr = error as HttpGuardError;
    return {
      content: [{ type: 'text' as const, text: `${guardErr.code}: ${guardErr.message}` }],
      isError: true,
    };
  }

  try {
    const { result, receiptId } = await authensor.evaluateAndExecute(
      'http.request',
      url,
      async (_receiptId: string) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
          const response = await fetch(url, {
            method,
            headers,
            body: body ? body : undefined,
            signal: controller.signal,
            redirect: 'manual',
          });

          if (response.status >= 300 && response.status < 400) {
            return Promise.reject(new HttpGuardError('REDIRECT_BLOCKED', 'Redirects not allowed'));
          }

          const responseHeaders: Record<string, string> = {};
          response.headers.forEach((value, key) => {
            responseHeaders[key] = value;
          });

          const contentType = response.headers.get('content-type') || '';
          let responseBody: string;

          if (contentType.includes('application/json')) {
            responseBody = JSON.stringify(await response.json(), null, 2);
          } else {
            responseBody = await response.text();
          }

          return {
            status: response.status,
            statusText: response.statusText,
            finalUrl: response.url,
            resolvedIps: target.resolvedIps,
            headers: responseHeaders,
            body: responseBody,
          };
        } finally {
          clearTimeout(timeoutId);
        }
      },
      {
        operation: method === 'GET' ? 'read' : 'execute',
        parameters: { method, url, domain: target.url.hostname },
        constraints: {
          timeout,
          allowedDomains: [target.url.hostname],
        },
        toolName: 'http_request',
      }
    );

    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(
            {
              ...result,
              _authensor: { receiptId },
            },
            null,
            2
          ),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text' as const, text: `HTTP request failed: ${message}` }],
      isError: true,
    };
  }
}
