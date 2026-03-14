/**
 * Revenue Bot Integration Example
 *
 * Shows how to wire Authensor guard() into an autonomous bot system.
 * Drop this file into your bot project and import the wrappers.
 *
 * Integration points:
 *   1. guardedFetch() — wraps all external API calls
 *   2. guardPhase() — wraps bot execution phases
 *   3. guardShellExec() — wraps shell command execution
 */

import { guard, guardExecute, GuardDeniedError } from '@authensor/sdk';

// ── 1. Guarded Fetch for API Calls ──────────────────────────────────

/**
 * Wrap fetch with Authensor policy checks.
 * GET requests are allowed. POST/PUT/DELETE require approval.
 */
export async function guardedFetch(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method || 'GET').toUpperCase();

  return guardExecute(
    'http.request',
    url,
    async () => fetch(url, init),
    { parameters: { method } },
  );
}

// ── 2. Guarded Bot Phase Execution ──────────────────────────────────

interface BotPhase {
  name: string;
  fn: () => Promise<void>;
}

/**
 * Run a bot phase with Authensor policy enforcement.
 * Phase names are mapped to action types for policy evaluation.
 */
export async function guardPhase(phase: BotPhase): Promise<void> {
  // Map phase names to action types
  const actionMap: Record<string, string> = {
    'bounty-scan': 'data.read',          // scanning = read
    'proposal-drafter': 'data.read',     // LLM generation = read
    'bounty-executor': 'shell.execute',  // git ops = execute
    'win-tracker': 'data.read',          // tracking = read
    'follow-up': 'network.send',         // email = network
    'invoicing': 'payments.invoice',     // payments = sensitive
    'client-crm': 'data.write',          // CRM updates = write
    'revenue-intel': 'data.read',        // analysis = read
  };

  const actionType = actionMap[phase.name] || 'code.run';

  try {
    await guardExecute(
      actionType,
      `bot://phase/${phase.name}`,
      phase.fn,
    );
  } catch (error) {
    if (error instanceof GuardDeniedError) {
      console.log(`[authensor] Phase "${phase.name}" blocked: ${error.result.outcome}`);
      return; // Skip blocked phases gracefully
    }
    throw error; // Re-throw actual execution errors
  }
}

// ── 3. Guarded Shell Execution ──────────────────────────────────────

/**
 * Check if a shell command is allowed before executing it.
 * Returns the guard result — caller decides whether to proceed.
 */
export function checkShellCommand(command: string): {
  allowed: boolean;
  outcome: string;
  reason?: string;
} {
  const result = guard('shell.execute', '/bin/bash', {
    parameters: { command },
  });

  return {
    allowed: result.allowed,
    outcome: result.outcome,
    reason: result.reason,
  };
}

// ── 4. Guarded Payment Operations ───────────────────────────────────

/**
 * Guard a payment operation (Stripe, x402, etc.)
 */
export async function guardPayment<T>(
  provider: string,
  amount: number,
  currency: string,
  executor: () => Promise<T>,
): Promise<T> {
  return guardExecute(
    'payments.charge',
    `${provider}://charge`,
    executor,
    {
      parameters: {
        amount: String(amount),
        currency,
        provider,
      },
    },
  );
}

// ── Usage Example ───────────────────────────────────────────────────

async function exampleUsage() {
  // API call — GET is allowed, POST requires approval
  const data = await guardedFetch('https://api.github.com/repos/authensor/authensor');
  console.log('GitHub API:', data.status);

  // Bot phase execution
  await guardPhase({
    name: 'bounty-scan',
    fn: async () => {
      console.log('Scanning for bounties...');
    },
  });

  // Shell command check
  const gitClone = checkShellCommand('git clone https://github.com/example/repo');
  console.log('git clone allowed:', gitClone.allowed);

  const rmRf = checkShellCommand('rm -rf /');
  console.log('rm -rf allowed:', rmRf.allowed); // false — hard deny
}
