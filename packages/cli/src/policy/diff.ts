/**
 * Policy Diff — Compare two policy versions
 *
 * Shows which rules were added, removed, or modified.
 * Highlights behavioral changes (effect changes, condition changes).
 */

import { readFileSync } from 'fs';

// ── Types ────────────────────────────────────────────────────────────

export type ChangeKind = 'added' | 'removed' | 'modified';
export type ChangeSeverity = 'breaking' | 'notable' | 'cosmetic';

export interface RuleDiff {
  kind: ChangeKind;
  ruleId: string;
  ruleName?: string;
  severity: ChangeSeverity;
  details: string[];
}

export interface PolicyFieldDiff {
  field: string;
  oldValue: unknown;
  newValue: unknown;
  severity: ChangeSeverity;
}

export interface DiffResult {
  hasChanges: boolean;
  policyFieldDiffs: PolicyFieldDiff[];
  ruleDiffs: RuleDiff[];
  summary: {
    added: number;
    removed: number;
    modified: number;
    breaking: number;
  };
}

// ── Core Diff Logic ──────────────────────────────────────────────────

/**
 * Compare two policy objects and return a structured diff.
 * This is the pure logic function — no I/O.
 */
export function diffPolicies(
  oldPolicy: Record<string, unknown>,
  newPolicy: Record<string, unknown>,
): DiffResult {
  const policyFieldDiffs: PolicyFieldDiff[] = [];
  const ruleDiffs: RuleDiff[] = [];

  // Compare top-level policy fields
  comparePolicyFields(oldPolicy, newPolicy, policyFieldDiffs);

  // Compare rules
  const oldRules = (oldPolicy.rules ?? []) as Array<Record<string, unknown>>;
  const newRules = (newPolicy.rules ?? []) as Array<Record<string, unknown>>;
  compareRules(oldRules, newRules, ruleDiffs);

  const summary = {
    added: ruleDiffs.filter((d) => d.kind === 'added').length,
    removed: ruleDiffs.filter((d) => d.kind === 'removed').length,
    modified: ruleDiffs.filter((d) => d.kind === 'modified').length,
    breaking: [...policyFieldDiffs, ...ruleDiffs].filter((d) => d.severity === 'breaking').length,
  };

  return {
    hasChanges: policyFieldDiffs.length > 0 || ruleDiffs.length > 0,
    policyFieldDiffs,
    ruleDiffs,
    summary,
  };
}

function comparePolicyFields(
  oldPolicy: Record<string, unknown>,
  newPolicy: Record<string, unknown>,
  diffs: PolicyFieldDiff[],
): void {
  const fieldsToCompare = ['name', 'version', 'description', 'enabled', 'priority', 'defaultEffect'] as const;

  for (const field of fieldsToCompare) {
    const oldVal = oldPolicy[field];
    const newVal = newPolicy[field];

    if (!deepEqual(oldVal, newVal)) {
      let severity: ChangeSeverity = 'cosmetic';

      if (field === 'defaultEffect') {
        severity = 'breaking';
      } else if (field === 'enabled') {
        severity = 'breaking';
      } else if (field === 'priority') {
        severity = 'notable';
      }

      diffs.push({ field, oldValue: oldVal, newValue: newVal, severity });
    }
  }

  // Compare scope
  if (!deepEqual(oldPolicy.scope, newPolicy.scope)) {
    diffs.push({
      field: 'scope',
      oldValue: oldPolicy.scope,
      newValue: newPolicy.scope,
      severity: 'notable',
    });
  }
}

function compareRules(
  oldRules: Array<Record<string, unknown>>,
  newRules: Array<Record<string, unknown>>,
  diffs: RuleDiff[],
): void {
  const oldById = new Map<string, Record<string, unknown>>();
  for (const rule of oldRules) {
    if (typeof rule.id === 'string') {
      oldById.set(rule.id, rule);
    }
  }

  const newById = new Map<string, Record<string, unknown>>();
  for (const rule of newRules) {
    if (typeof rule.id === 'string') {
      newById.set(rule.id, rule);
    }
  }

  // Find removed rules
  for (const [id, rule] of oldById) {
    if (!newById.has(id)) {
      diffs.push({
        kind: 'removed',
        ruleId: id,
        ruleName: typeof rule.name === 'string' ? rule.name : undefined,
        severity: 'breaking',
        details: [`Rule "${id}" was removed`],
      });
    }
  }

  // Find added rules
  for (const [id, rule] of newById) {
    if (!oldById.has(id)) {
      const effect = typeof rule.effect === 'string' ? rule.effect : 'unknown';
      diffs.push({
        kind: 'added',
        ruleId: id,
        ruleName: typeof rule.name === 'string' ? rule.name : undefined,
        severity: effect === 'deny' ? 'breaking' : 'notable',
        details: [`Rule "${id}" was added with effect "${effect}"`],
      });
    }
  }

  // Find modified rules
  for (const [id, newRule] of newById) {
    const oldRule = oldById.get(id);
    if (!oldRule) continue;

    const details: string[] = [];
    let severity: ChangeSeverity = 'cosmetic';

    // Effect change is always breaking
    if (oldRule.effect !== newRule.effect) {
      details.push(`Effect changed: "${oldRule.effect}" -> "${newRule.effect}"`);
      severity = 'breaking';
    }

    // Condition change is notable
    if (!deepEqual(oldRule.condition, newRule.condition)) {
      details.push('Condition changed');
      if (severity !== 'breaking') severity = 'notable';
    }

    // Rate limit change
    if (!deepEqual(oldRule.rateLimit, newRule.rateLimit)) {
      details.push('Rate limit changed');
      if (severity !== 'breaking') severity = 'notable';
    }

    // Constraints change
    if (!deepEqual(oldRule.constraints, newRule.constraints)) {
      details.push('Constraints changed');
      if (severity !== 'breaking') severity = 'notable';
    }

    // Approval config change
    if (!deepEqual(oldRule.approvalConfig, newRule.approvalConfig)) {
      details.push('Approval config changed');
      if (severity !== 'breaking') severity = 'notable';
    }

    // Name/description changes
    if (oldRule.name !== newRule.name) {
      details.push(`Name changed: "${oldRule.name ?? ''}" -> "${newRule.name ?? ''}"`);
    }
    if (oldRule.description !== newRule.description) {
      details.push('Description changed');
    }

    if (details.length > 0) {
      diffs.push({
        kind: 'modified',
        ruleId: id,
        ruleName: typeof newRule.name === 'string' ? newRule.name : undefined,
        severity,
        details,
      });
    }
  }

  // Check for reordering
  const oldOrder = oldRules.map((r) => r.id as string).filter(Boolean);
  const newOrder = newRules.map((r) => r.id as string).filter(Boolean);
  const commonIds = oldOrder.filter((id) => newById.has(id));
  const newCommonOrder = newOrder.filter((id) => oldById.has(id));

  if (commonIds.length > 0 && !arraysEqual(commonIds, newCommonOrder)) {
    // Find which rules moved — this is a notable change since evaluation order matters
    const existingModified = diffs.find(
      (d) => d.kind === 'modified' && d.details.some((detail) => detail.includes('reordered'))
    );
    if (!existingModified) {
      // Add a synthetic diff for the reordering
      diffs.push({
        kind: 'modified',
        ruleId: '*',
        severity: 'notable',
        details: [
          `Rule evaluation order changed`,
          `  Old order: ${commonIds.join(', ')}`,
          `  New order: ${newCommonOrder.join(', ')}`,
        ],
      });
    }
  }
}

// ── Utilities ────────────────────────────────────────────────────────

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  if (Array.isArray(a) || Array.isArray(b)) return false;

  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);

  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((key) => deepEqual(aObj[key], bObj[key]));
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((val, i) => val === b[i]);
}

// ── File Loading ─────────────────────────────────────────────────────

export function loadPolicyFromFile(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function loadPolicyFromControlPlane(
  controlPlaneUrl: string,
  apiKey: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(`${controlPlaneUrl}/policies/default`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch active policy: HTTP ${res.status}`);
  }

  const data = await res.json() as Record<string, unknown>;
  // The control plane may wrap the policy in a `policy` field
  if (data.policy && typeof data.policy === 'object') {
    return data.policy as Record<string, unknown>;
  }
  return data;
}

// ── Output Formatting ────────────────────────────────────────────────

export function formatDiffResult(result: DiffResult, oldLabel?: string, newLabel?: string): string {
  const lines: string[] = [];
  const leftLabel = oldLabel ?? 'old';
  const rightLabel = newLabel ?? 'new';

  if (!result.hasChanges) {
    lines.push(`  \x1b[32mNo changes between ${leftLabel} and ${rightLabel}.\x1b[0m`);
    return lines.join('\n');
  }

  lines.push(`  \x1b[1mPolicy diff: ${leftLabel} -> ${rightLabel}\x1b[0m\n`);

  // Policy field changes
  if (result.policyFieldDiffs.length > 0) {
    lines.push('  \x1b[1mPolicy fields:\x1b[0m');
    for (const d of result.policyFieldDiffs) {
      const sevIcon = severityIcon(d.severity);
      lines.push(`  ${sevIcon} ${d.field}:`);
      lines.push(`    \x1b[31m- ${formatValue(d.oldValue)}\x1b[0m`);
      lines.push(`    \x1b[32m+ ${formatValue(d.newValue)}\x1b[0m`);
    }
    lines.push('');
  }

  // Rule changes
  const added = result.ruleDiffs.filter((d) => d.kind === 'added');
  const removed = result.ruleDiffs.filter((d) => d.kind === 'removed');
  const modified = result.ruleDiffs.filter((d) => d.kind === 'modified');

  if (added.length > 0) {
    lines.push('  \x1b[1mRules added:\x1b[0m');
    for (const d of added) {
      const nameLabel = d.ruleName ? ` (${d.ruleName})` : '';
      lines.push(`  \x1b[32m+ ${d.ruleId}${nameLabel}\x1b[0m`);
      for (const detail of d.details) {
        lines.push(`    \x1b[2m${detail}\x1b[0m`);
      }
    }
    lines.push('');
  }

  if (removed.length > 0) {
    lines.push('  \x1b[1mRules removed:\x1b[0m');
    for (const d of removed) {
      const nameLabel = d.ruleName ? ` (${d.ruleName})` : '';
      lines.push(`  \x1b[31m- ${d.ruleId}${nameLabel}\x1b[0m`);
      for (const detail of d.details) {
        lines.push(`    \x1b[2m${detail}\x1b[0m`);
      }
    }
    lines.push('');
  }

  if (modified.length > 0) {
    lines.push('  \x1b[1mRules modified:\x1b[0m');
    for (const d of modified) {
      const sevIcon = severityIcon(d.severity);
      const nameLabel = d.ruleName ? ` (${d.ruleName})` : '';
      lines.push(`  ${sevIcon} ${d.ruleId}${nameLabel}`);
      for (const detail of d.details) {
        lines.push(`    \x1b[2m${detail}\x1b[0m`);
      }
    }
    lines.push('');
  }

  // Summary
  const breakingLabel = result.summary.breaking > 0
    ? `\x1b[31m${result.summary.breaking} breaking\x1b[0m, `
    : '';
  lines.push(
    `  ${breakingLabel}` +
    `\x1b[32m${result.summary.added} added\x1b[0m, ` +
    `\x1b[31m${result.summary.removed} removed\x1b[0m, ` +
    `\x1b[33m${result.summary.modified} modified\x1b[0m`,
  );

  return lines.join('\n');
}

function severityIcon(severity: ChangeSeverity): string {
  switch (severity) {
    case 'breaking':
      return '\x1b[31m!!\x1b[0m';
    case 'notable':
      return '\x1b[33m!\x1b[0m ';
    case 'cosmetic':
      return '\x1b[2m~\x1b[0m ';
  }
}

function formatValue(value: unknown): string {
  if (value === undefined) return '(not set)';
  if (typeof value === 'string') return `"${value}"`;
  return JSON.stringify(value);
}
