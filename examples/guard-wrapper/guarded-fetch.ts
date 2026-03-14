/**
 * Guarded Fetch — Drop-in replacement for fetch() with Authensor policy enforcement
 *
 * Usage:
 *   import { guardedFetch } from './guarded-fetch.js';
 *
 *   // This will be evaluated against the built-in policy before executing
 *   const response = await guardedFetch('https://api.example.com/data', {
 *     method: 'POST',
 *     body: JSON.stringify({ key: 'value' }),
 *   });
 *
 * Policy behavior:
 *   - GET requests → allowed
 *   - POST/PUT/DELETE → require_approval (throws GuardDeniedError)
 *   - Destructive patterns → hard deny
 */

import { guard, guardExecute, type GuardResult } from '@authensor/sdk';

export interface GuardedFetchOptions extends RequestInit {
  /** Override the action type (default: inferred from method) */
  actionType?: string;
  /** Skip guard for this request */
  skipGuard?: boolean;
  /** Callback when a request is blocked */
  onBlocked?: (result: GuardResult, url: string) => void;
}

/**
 * Drop-in replacement for fetch() with Authensor policy enforcement.
 */
export async function guardedFetch(
  url: string | URL,
  options: GuardedFetchOptions = {},
): Promise<Response> {
  const { actionType, skipGuard, onBlocked, ...fetchOptions } = options;

  if (skipGuard) {
    return fetch(url, fetchOptions);
  }

  const method = (fetchOptions.method || 'GET').toUpperCase();
  const resolvedActionType = actionType || `http.request`;
  const resource = url.toString();

  return guardExecute(
    resolvedActionType,
    resource,
    async () => fetch(url, fetchOptions),
    {
      parameters: { method },
    },
  );
}

/**
 * Guard a shell command before execution.
 */
export function guardShellCommand(command: string, args: string[] = []): GuardResult {
  return guard('shell.execute', command, {
    parameters: { command, args: args.join(' ') },
  });
}

/**
 * Guard a file write operation.
 */
export function guardFileWrite(path: string): GuardResult {
  return guard('file.write', path);
}

/**
 * Guard a database operation.
 */
export function guardDbOperation(operation: string, table: string): GuardResult {
  const actionType = `db.${operation}`;
  return guard(actionType, `postgres://${table}`);
}
