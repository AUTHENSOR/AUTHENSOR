/**
 * agent.ts — Production-ready LangChain agent skeleton with Authensor safety
 *
 * Run: pnpm start
 *
 * This file is a template you can copy into your own project.
 * It demonstrates how to wrap LangChain tools with Authensor's
 * local policy engine so every tool call is evaluated, logged,
 * and optionally blocked before execution.
 *
 * No API keys required. No control plane needed. Pure local evaluation.
 */

import { tool } from '@langchain/core/tools';
import type { StructuredToolInterface } from '@langchain/core/tools';
import { z } from 'zod';
import { PolicyEngine } from '@authensor/engine';
import type { ActionEnvelope, Policy, EvaluationResult } from '@authensor/engine';
import { AegisScanner } from '@authensor/aegis';
import * as crypto from 'node:crypto';

// ── ANSI helpers ────────────────────────────────────────────────────────

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const RESET = '\x1b[0m';

// ── Configuration ───────────────────────────────────────────────────────

/**
 * Your policy. In production, load this from a YAML file, a database,
 * or the Authensor control plane API.
 */
const POLICY: Policy = {
  id: 'my-agent-policy',
  name: 'My Agent Policy',
  version: '1.0.0',
  priority: 100,
  enabled: true,
  scope: {
    actionTypes: ['langchain.*'],
    principalTypes: ['agent'],
  },
  rules: [
    // Allow reads
    {
      id: 'allow-reads',
      name: 'Allow read operations',
      description: 'Read-only operations are permitted',
      effect: 'allow',
      condition: {
        field: 'action.operation',
        operator: 'eq',
        value: 'read',
      },
    },
    // Require approval for writes
    {
      id: 'approve-writes',
      name: 'Require approval for write operations',
      description: 'Write operations require human approval before execution',
      effect: 'require_approval',
      condition: {
        field: 'action.operation',
        operator: 'in',
        value: ['create', 'update'],
      },
    },
    // Deny deletes and executions
    {
      id: 'deny-destructive',
      name: 'Block destructive operations',
      description: 'Delete and execute operations are not permitted',
      effect: 'deny',
      condition: {
        field: 'action.operation',
        operator: 'in',
        value: ['delete', 'execute'],
      },
    },
  ],
  defaultEffect: 'deny',
};

// ── AuthensorGuard (local, offline version) ─────────────────────────────

/**
 * Local Authensor guard that evaluates tool calls against a policy
 * using the engine directly. No network calls, no control plane.
 *
 * For production with a control plane, use:
 *   import { AuthensorGuard } from '@authensor/langchain';
 *   const guard = new AuthensorGuard({ controlPlaneUrl: '...' });
 */
class LocalAuthensorGuard {
  private engine: PolicyEngine;
  private aegis: AegisScanner;
  private policies: Policy[];
  private principalId: string;

  constructor(options: {
    policies: Policy[];
    principalId?: string;
    enableAegis?: boolean;
  }) {
    this.engine = new PolicyEngine();
    this.aegis = new AegisScanner();
    this.policies = options.policies;
    this.principalId = options.principalId ?? 'langchain-agent';
  }

  /**
   * Wrap a LangChain tool with Authensor policy evaluation.
   * Returns a new tool that checks the policy before invoking the original.
   */
  wrap<T extends StructuredToolInterface>(
    originalTool: T,
    options?: { operation?: ActionEnvelope['action']['operation'] },
  ): T {
    const guard = this;
    const operation = options?.operation ?? 'execute';
    const originalInvoke = originalTool.invoke.bind(originalTool);

    // Override invoke to add policy check
    originalTool.invoke = async function (
      input: any,
      ...rest: any[]
    ): Promise<any> {
      const args = typeof input === 'object' && input !== null ? input : { input };

      // Build envelope
      const envelope: ActionEnvelope = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        action: {
          type: `langchain.${originalTool.name}`,
          resource: `langchain://${originalTool.name}`,
          operation,
          parameters: args,
        },
        principal: {
          type: 'agent',
          id: guard.principalId,
        },
        context: {
          environment: 'development',
        },
      };

      // Aegis content scan
      const paramText = Object.values(args)
        .filter((v): v is string => typeof v === 'string')
        .join(' ');

      if (paramText.length > 0) {
        const scan = guard.aegis.scan(paramText);
        if (!scan.safe) {
          const msg = `Aegis blocked: ${scan.detections[0]?.pattern} (threat: ${scan.threatLevel})`;
          console.log(`  ${RED}[BLOCKED]${RESET} ${originalTool.name}: ${msg}`);
          throw new Error(msg);
        }
      }

      // Policy evaluation
      const result: EvaluationResult = guard.engine.evaluate(envelope, guard.policies);

      switch (result.decision.outcome) {
        case 'allow':
          console.log(`  ${GREEN}[ALLOW]${RESET}   ${originalTool.name}: ${result.decision.reason ?? 'Allowed by policy'}`);
          return originalInvoke(input, ...rest);

        case 'deny':
          console.log(`  ${RED}[DENY]${RESET}    ${originalTool.name}: ${result.decision.reason ?? 'Denied by policy'}`);
          throw new Error(`Action denied: ${result.decision.reason}`);

        case 'require_approval':
          console.log(`  ${YELLOW}[REVIEW]${RESET}  ${originalTool.name}: ${result.decision.reason ?? 'Requires approval'}`);
          // In production, you would submit an approval request here
          // and wait for a human to approve/reject it.
          throw new Error(`Action requires approval: ${result.decision.reason}`);

        default:
          console.log(`  ${RED}[DENY]${RESET}    ${originalTool.name}: Unknown outcome "${result.decision.outcome}"`);
          throw new Error(`Unknown decision outcome: ${result.decision.outcome}`);
      }
    } as any;

    return originalTool;
  }
}

// ── Define your tools ───────────────────────────────────────────────────

const searchDocs = tool(
  async ({ query }: { query: string }) => {
    return `Found 3 results for "${query}": [doc1, doc2, doc3]`;
  },
  {
    name: 'search_docs',
    description: 'Search the documentation',
    schema: z.object({ query: z.string() }),
  },
);

const writeReport = tool(
  async ({ title, content }: { title: string; content: string }) => {
    return `Report "${title}" created (${content.length} chars)`;
  },
  {
    name: 'write_report',
    description: 'Create a report document',
    schema: z.object({
      title: z.string(),
      content: z.string(),
    }),
  },
);

const deleteRecord = tool(
  async ({ id }: { id: string }) => {
    return `Record ${id} deleted`;
  },
  {
    name: 'delete_record',
    description: 'Delete a database record',
    schema: z.object({ id: z.string() }),
  },
);

// ── Set up the guard and wrap tools ─────────────────────────────────────

async function main(): Promise<void> {
  console.log(`\n${CYAN}${BOLD}Authensor + LangChain Agent Template${RESET}\n`);
  console.log(`${DIM}This template demonstrates wrapping LangChain tools with Authensor.${RESET}`);
  console.log(`${DIM}Modify the policy and tools to match your use case.${RESET}\n`);

  // 1. Create the guard
  const guard = new LocalAuthensorGuard({
    policies: [POLICY],
    principalId: 'my-agent',
  });

  // 2. Wrap your tools (this is the key step!)
  const safeSearch = guard.wrap(searchDocs, { operation: 'read' });
  const safeWrite = guard.wrap(writeReport, { operation: 'create' });
  const safeDelete = guard.wrap(deleteRecord, { operation: 'delete' });

  // 3. Simulate agent calling each tool
  console.log(`${BOLD}Simulating agent tool calls:${RESET}\n`);

  // This should succeed (read operation is allowed)
  try {
    const searchResult = await safeSearch.invoke({ query: 'safety best practices' });
    console.log(`  ${DIM}Result: ${searchResult}${RESET}\n`);
  } catch (e: any) {
    console.log(`  ${DIM}Error: ${e.message}${RESET}\n`);
  }

  // This should require approval (create operation)
  try {
    const writeResult = await safeWrite.invoke({
      title: 'Q4 Summary',
      content: 'Revenue increased by 15%...',
    });
    console.log(`  ${DIM}Result: ${writeResult}${RESET}\n`);
  } catch (e: any) {
    console.log(`  ${DIM}Blocked: ${e.message}${RESET}\n`);
  }

  // This should be denied (delete operation)
  try {
    const deleteResult = await safeDelete.invoke({ id: 'user-12345' });
    console.log(`  ${DIM}Result: ${deleteResult}${RESET}\n`);
  } catch (e: any) {
    console.log(`  ${DIM}Blocked: ${e.message}${RESET}\n`);
  }

  // ── Next steps ──────────────────────────────────────────────────────

  console.log(`${CYAN}${BOLD}Next steps:${RESET}`);
  console.log(`${DIM}  1. Edit the POLICY object to match your security requirements${RESET}`);
  console.log(`${DIM}  2. Add your own tools and wrap them with guard.wrap()${RESET}`);
  console.log(`${DIM}  3. Connect to a real LLM (OpenAI, Anthropic, etc.) via LangChain${RESET}`);
  console.log(`${DIM}  4. For production, use the Authensor control plane:${RESET}`);
  console.log('');
  console.log(`${BOLD}     import { AuthensorGuard } from '@authensor/langchain';${RESET}`);
  console.log(`${BOLD}     const guard = new AuthensorGuard({ controlPlaneUrl: '...' });${RESET}`);
  console.log(`${BOLD}     const safeTool = guard.wrap(myTool);${RESET}`);
  console.log('');
}

main().catch(console.error);
