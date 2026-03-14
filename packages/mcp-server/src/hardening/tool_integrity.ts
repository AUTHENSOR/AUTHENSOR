/**
 * Tool Integrity Guard
 *
 * Defends against MCP tool description "rug pull" attacks where an upstream
 * server changes a tool's description or schema after initial approval.
 *
 * On first tool listing, each tool's name + description + inputSchema is
 * hashed (SHA-256) and stored as a baseline. On subsequent listings, the
 * current hash is compared to the stored baseline. If a mismatch is
 * detected, the tool is flagged and optionally blocked.
 *
 * Compatible with @authensor/aegis ToolIntegrityRecord format.
 *
 * Zero external dependencies — uses only Node.js `crypto`.
 */

import { createHash } from 'crypto';

// ── Types ───────────────────────────────────────────────────────────────

/** A tool as reported by the upstream MCP server. */
export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

/**
 * Stored integrity record for a single tool.
 * Wire-compatible with @authensor/aegis ToolIntegrityRecord.
 */
export interface ToolIntegrityRecord {
  name: string;
  hash: string;
  recordedAt: number;
}

/** Result of verifying a single tool against its baseline. */
export interface ToolVerifyResult {
  name: string;
  status: 'ok' | 'changed' | 'new';
  baselineHash?: string;
  currentHash: string;
  recordedAt?: number;
}

/** Aggregated verification report for all tools. */
export interface ToolVerifyReport {
  verified: number;
  changed: ToolVerifyResult[];
  newTools: ToolVerifyResult[];
  ok: ToolVerifyResult[];
  allIntact: boolean;
}

/** Configuration for tool integrity checking. */
export interface ToolIntegrityConfig {
  /** Whether tool integrity checking is enabled. Default: true */
  enabled: boolean;
  /** Action to take when a tool description changes: 'warn' logs only, 'block' prevents the tool from being listed. Default: 'warn' */
  onChanged: 'warn' | 'block';
  /** Whether to allow new tools that were not in the initial listing. Default: true */
  allowNewTools: boolean;
}

// ── Hash function ───────────────────────────────────────────────────────

/**
 * Hash a tool's description and schema into a deterministic digest.
 * Uses the same algorithm as @authensor/aegis CanaryTokenManager.hashToolDescription().
 */
export function hashToolDescription(tool: McpTool): string {
  const payload =
    tool.name +
    '\0' +
    (tool.description ?? '') +
    '\0' +
    (tool.inputSchema ? JSON.stringify(tool.inputSchema) : '');
  return createHash('sha256').update(payload).digest('hex');
}

// ── ToolIntegrityGuard ──────────────────────────────────────────────────

const DEFAULT_CONFIG: ToolIntegrityConfig = {
  enabled: true,
  onChanged: 'warn',
  allowNewTools: true,
};

export class ToolIntegrityGuard {
  private baselines: Map<string, ToolIntegrityRecord> = new Map();
  private config: ToolIntegrityConfig;
  private initialized = false;

  constructor(config?: Partial<ToolIntegrityConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Whether the guard has been initialized with a baseline tool set. */
  get isInitialized(): boolean {
    return this.initialized;
  }

  /** Get the current configuration. */
  getConfig(): Readonly<ToolIntegrityConfig> {
    return { ...this.config };
  }

  /** Update configuration at runtime. */
  updateConfig(patch: Partial<ToolIntegrityConfig>): void {
    this.config = { ...this.config, ...patch };
  }

  /**
   * Record the initial baseline for a set of tools.
   * Called once when the gateway first connects to the upstream server.
   */
  recordBaseline(tools: McpTool[]): ToolIntegrityRecord[] {
    const records: ToolIntegrityRecord[] = [];
    const now = Date.now();

    for (const tool of tools) {
      const hash = hashToolDescription(tool);
      const record: ToolIntegrityRecord = {
        name: tool.name,
        hash,
        recordedAt: now,
      };
      this.baselines.set(tool.name, record);
      records.push(record);
    }

    this.initialized = true;
    return records;
  }

  /**
   * Get the stored baseline record for a tool.
   */
  getBaseline(toolName: string): ToolIntegrityRecord | undefined {
    return this.baselines.get(toolName);
  }

  /**
   * Get all stored baseline records.
   */
  getAllBaselines(): ToolIntegrityRecord[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Check a set of tools against stored baselines.
   * Returns a filtered tool list (blocking changed tools if configured)
   * and logs warnings for any integrity violations.
   *
   * Generic over the tool type so the returned array preserves the
   * caller's concrete type (e.g. the MCP SDK's Tool type).
   *
   * @returns The (possibly filtered) tool list and the verification report.
   */
  checkTools<T extends McpTool>(tools: T[]): { tools: T[]; report: ToolVerifyReport } {
    if (!this.config.enabled) {
      return {
        tools,
        report: {
          verified: tools.length,
          changed: [],
          newTools: [],
          ok: tools.map((t) => ({
            name: t.name,
            status: 'ok' as const,
            currentHash: hashToolDescription(t),
          })),
          allIntact: true,
        },
      };
    }

    if (!this.initialized) {
      // First time — record baseline and pass through
      this.recordBaseline(tools);
      return {
        tools,
        report: {
          verified: tools.length,
          changed: [],
          newTools: tools.map((t) => ({
            name: t.name,
            status: 'new' as const,
            currentHash: hashToolDescription(t),
          })),
          ok: [],
          allIntact: true,
        },
      };
    }

    const ok: ToolVerifyResult[] = [];
    const changed: ToolVerifyResult[] = [];
    const newTools: ToolVerifyResult[] = [];
    const filteredTools: T[] = [];

    for (const tool of tools) {
      const currentHash = hashToolDescription(tool);
      const baseline = this.baselines.get(tool.name);

      if (!baseline) {
        // New tool not in original baseline
        const result: ToolVerifyResult = {
          name: tool.name,
          status: 'new',
          currentHash,
        };
        newTools.push(result);

        if (this.config.allowNewTools) {
          // Store the new tool's baseline for future checks
          this.baselines.set(tool.name, {
            name: tool.name,
            hash: currentHash,
            recordedAt: Date.now(),
          });
          filteredTools.push(tool);
        } else {
          console.error(
            `[tool-integrity] BLOCKED new tool: ${tool.name} (not in original baseline)`
          );
        }
        continue;
      }

      if (currentHash === baseline.hash) {
        ok.push({
          name: tool.name,
          status: 'ok',
          baselineHash: baseline.hash,
          currentHash,
          recordedAt: baseline.recordedAt,
        });
        filteredTools.push(tool);
      } else {
        const result: ToolVerifyResult = {
          name: tool.name,
          status: 'changed',
          baselineHash: baseline.hash,
          currentHash,
          recordedAt: baseline.recordedAt,
        };
        changed.push(result);

        console.error(
          `[tool-integrity] ALERT: Tool "${tool.name}" description/schema changed! ` +
            `baseline=${baseline.hash.slice(0, 12)}... current=${currentHash.slice(0, 12)}...`
        );

        if (this.config.onChanged === 'block') {
          console.error(
            `[tool-integrity] BLOCKED tool: ${tool.name} (description changed — possible rug pull)`
          );
        } else {
          // Warn only — still allow the tool through
          filteredTools.push(tool);
        }
      }
    }

    const allIntact = changed.length === 0;

    return {
      tools: filteredTools,
      report: {
        verified: tools.length,
        changed,
        newTools,
        ok,
        allIntact,
      },
    };
  }

  /**
   * Verify all currently known tools against their baselines.
   * This is the implementation behind the `tools/verify` command.
   *
   * @param currentTools The current tool list from the upstream server.
   */
  verify<T extends McpTool>(currentTools: T[]): ToolVerifyReport {
    const { report } = this.checkTools(currentTools);
    return report;
  }

  /**
   * Reset the guard — clears all baselines.
   * Useful for re-initializing after a known legitimate update.
   */
  reset(): void {
    this.baselines.clear();
    this.initialized = false;
  }

  /**
   * Export baselines as a JSON-serializable array.
   */
  exportBaselines(): ToolIntegrityRecord[] {
    return Array.from(this.baselines.values());
  }

  /**
   * Import baselines from a previously exported set.
   * This allows persisting baselines across gateway restarts.
   */
  importBaselines(records: ToolIntegrityRecord[]): void {
    for (const record of records) {
      this.baselines.set(record.name, record);
    }
    if (records.length > 0) {
      this.initialized = true;
    }
  }
}
