/**
 * Policy Lint — Validate a policy file against the JSON schema
 * and check for common mistakes.
 *
 * Validates:
 * - Required fields (id, name, version, rules)
 * - Schema structure (correct types, valid enums)
 * - Duplicate rule IDs
 * - Unreachable rules (deny-all / allow-all before other rules)
 * - Missing rule conditions on non-terminal rules
 * - Version format
 * - Empty rules array
 */

import { readFileSync } from 'fs';

// ── Types ────────────────────────────────────────────────────────────

export type Severity = 'error' | 'warning' | 'info';

export interface LintDiagnostic {
  severity: Severity;
  message: string;
  path?: string;
  line?: number;
}

export interface LintResult {
  valid: boolean;
  diagnostics: LintDiagnostic[];
  errorCount: number;
  warningCount: number;
}

// ── Schema Constants ─────────────────────────────────────────────────

const VALID_EFFECTS = ['allow', 'deny', 'require_approval'] as const;
const VALID_DEFAULT_EFFECTS = ['allow', 'deny'] as const;
const VALID_PRINCIPAL_TYPES = ['user', 'agent', 'service', 'system'] as const;
const VALID_ENVIRONMENTS = ['development', 'staging', 'production'] as const;
const VALID_OPERATORS = [
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'in', 'notIn', 'contains', 'startsWith', 'endsWith', 'matches', 'exists',
] as const;
const VALID_RATE_LIMIT_SCOPES = ['principal', 'action', 'global'] as const;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const WINDOW_PATTERN = /^\d+[smhd]$/;

// ── Core Lint Logic ──────────────────────────────────────────────────

/**
 * Lint a policy object. Returns diagnostics for errors and warnings.
 * This is the pure logic function — no I/O.
 */
export function lintPolicy(policy: unknown): LintResult {
  const diagnostics: LintDiagnostic[] = [];

  if (policy === null || policy === undefined) {
    diagnostics.push({ severity: 'error', message: 'Policy is null or undefined' });
    return buildResult(diagnostics);
  }

  if (typeof policy !== 'object' || Array.isArray(policy)) {
    diagnostics.push({ severity: 'error', message: 'Policy must be a JSON object' });
    return buildResult(diagnostics);
  }

  const p = policy as Record<string, unknown>;

  // Required fields
  validateRequired(p, 'id', 'string', diagnostics);
  validateRequired(p, 'name', 'string', diagnostics);
  validateRequired(p, 'version', 'string', diagnostics);
  validateRequired(p, 'rules', 'array', diagnostics);

  // Version format
  if (typeof p.version === 'string' && !VERSION_PATTERN.test(p.version)) {
    diagnostics.push({
      severity: 'error',
      message: `Invalid version format "${p.version}". Expected semver (e.g., "1.0.0")`,
      path: 'version',
    });
  }

  // Optional fields type check
  if (p.description !== undefined && typeof p.description !== 'string') {
    diagnostics.push({ severity: 'error', message: '"description" must be a string', path: 'description' });
  }
  if (p.enabled !== undefined && typeof p.enabled !== 'boolean') {
    diagnostics.push({ severity: 'error', message: '"enabled" must be a boolean', path: 'enabled' });
  }
  if (p.priority !== undefined && (typeof p.priority !== 'number' || !Number.isInteger(p.priority))) {
    diagnostics.push({ severity: 'error', message: '"priority" must be an integer', path: 'priority' });
  }

  // Default effect
  if (p.defaultEffect !== undefined) {
    if (!VALID_DEFAULT_EFFECTS.includes(p.defaultEffect as typeof VALID_DEFAULT_EFFECTS[number])) {
      diagnostics.push({
        severity: 'error',
        message: `Invalid defaultEffect "${p.defaultEffect}". Must be one of: ${VALID_DEFAULT_EFFECTS.join(', ')}`,
        path: 'defaultEffect',
      });
    }
  }

  // Scope validation
  if (p.scope !== undefined) {
    validateScope(p.scope, diagnostics);
  }

  // Rules validation
  if (Array.isArray(p.rules)) {
    validateRules(p.rules, diagnostics);
  }

  // Additional properties check
  const knownTopLevel = new Set([
    'id', 'name', 'description', 'version', 'enabled', 'priority',
    'scope', 'rules', 'defaultEffect', 'metadata', 'sessionRules',
  ]);
  for (const key of Object.keys(p)) {
    if (!knownTopLevel.has(key)) {
      diagnostics.push({
        severity: 'warning',
        message: `Unknown top-level field "${key}". The schema uses additionalProperties: false`,
        path: key,
      });
    }
  }

  return buildResult(diagnostics);
}

function validateRequired(
  obj: Record<string, unknown>,
  field: string,
  expectedType: string,
  diagnostics: LintDiagnostic[],
): void {
  if (obj[field] === undefined || obj[field] === null) {
    diagnostics.push({
      severity: 'error',
      message: `Required field "${field}" is missing`,
      path: field,
    });
    return;
  }
  if (expectedType === 'array') {
    if (!Array.isArray(obj[field])) {
      diagnostics.push({
        severity: 'error',
        message: `"${field}" must be an array`,
        path: field,
      });
    }
  } else if (typeof obj[field] !== expectedType) {
    diagnostics.push({
      severity: 'error',
      message: `"${field}" must be a ${expectedType}, got ${typeof obj[field]}`,
      path: field,
    });
  }
}

function validateScope(scope: unknown, diagnostics: LintDiagnostic[]): void {
  if (typeof scope !== 'object' || scope === null || Array.isArray(scope)) {
    diagnostics.push({ severity: 'error', message: '"scope" must be an object', path: 'scope' });
    return;
  }

  const s = scope as Record<string, unknown>;

  if (s.principalTypes !== undefined) {
    if (!Array.isArray(s.principalTypes)) {
      diagnostics.push({ severity: 'error', message: '"scope.principalTypes" must be an array', path: 'scope.principalTypes' });
    } else {
      for (const pt of s.principalTypes) {
        if (!VALID_PRINCIPAL_TYPES.includes(pt as typeof VALID_PRINCIPAL_TYPES[number])) {
          diagnostics.push({
            severity: 'error',
            message: `Invalid principal type "${pt}". Must be one of: ${VALID_PRINCIPAL_TYPES.join(', ')}`,
            path: 'scope.principalTypes',
          });
        }
      }
    }
  }

  if (s.environments !== undefined) {
    if (!Array.isArray(s.environments)) {
      diagnostics.push({ severity: 'error', message: '"scope.environments" must be an array', path: 'scope.environments' });
    } else {
      for (const env of s.environments) {
        if (!VALID_ENVIRONMENTS.includes(env as typeof VALID_ENVIRONMENTS[number])) {
          diagnostics.push({
            severity: 'error',
            message: `Invalid environment "${env}". Must be one of: ${VALID_ENVIRONMENTS.join(', ')}`,
            path: 'scope.environments',
          });
        }
      }
    }
  }

  if (s.actionTypes !== undefined) {
    if (!Array.isArray(s.actionTypes)) {
      diagnostics.push({ severity: 'error', message: '"scope.actionTypes" must be an array', path: 'scope.actionTypes' });
    } else {
      for (const at of s.actionTypes) {
        if (typeof at !== 'string') {
          diagnostics.push({ severity: 'error', message: 'Each actionType must be a string', path: 'scope.actionTypes' });
        }
      }
    }
  }
}

function validateRules(rules: unknown[], diagnostics: LintDiagnostic[]): void {
  if (rules.length === 0) {
    diagnostics.push({
      severity: 'warning',
      message: 'Policy has no rules. All actions will fall through to defaultEffect (or deny)',
      path: 'rules',
    });
    return;
  }

  const ruleIds = new Set<string>();
  let foundCatchAll = false;

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const prefix = `rules[${i}]`;

    if (typeof rule !== 'object' || rule === null || Array.isArray(rule)) {
      diagnostics.push({ severity: 'error', message: `${prefix} must be an object`, path: prefix });
      continue;
    }

    const r = rule as Record<string, unknown>;

    // Already found a catch-all, this rule is unreachable
    if (foundCatchAll) {
      diagnostics.push({
        severity: 'warning',
        message: `${prefix} (id: "${r.id ?? '?'}") is unreachable — a prior rule with no condition matches all envelopes`,
        path: prefix,
      });
    }

    // Required fields
    if (r.id === undefined || r.id === null) {
      diagnostics.push({ severity: 'error', message: `${prefix} is missing required field "id"`, path: `${prefix}.id` });
    } else if (typeof r.id !== 'string') {
      diagnostics.push({ severity: 'error', message: `${prefix}.id must be a string`, path: `${prefix}.id` });
    } else {
      // Duplicate check
      if (ruleIds.has(r.id)) {
        diagnostics.push({
          severity: 'error',
          message: `Duplicate rule ID "${r.id}" at ${prefix}`,
          path: `${prefix}.id`,
        });
      }
      ruleIds.add(r.id);
    }

    // Effect
    if (r.effect === undefined || r.effect === null) {
      diagnostics.push({ severity: 'error', message: `${prefix} is missing required field "effect"`, path: `${prefix}.effect` });
    } else if (!VALID_EFFECTS.includes(r.effect as typeof VALID_EFFECTS[number])) {
      diagnostics.push({
        severity: 'error',
        message: `${prefix}.effect "${r.effect}" is invalid. Must be one of: ${VALID_EFFECTS.join(', ')}`,
        path: `${prefix}.effect`,
      });
    }

    // Condition validation
    if (r.condition !== undefined) {
      validateCondition(r.condition, `${prefix}.condition`, diagnostics);
    }

    // Check for catch-all (no condition = matches everything)
    if (!r.condition && !foundCatchAll) {
      foundCatchAll = true;
      // Only warn if it's not the last rule
      if (i < rules.length - 1) {
        diagnostics.push({
          severity: 'warning',
          message: `${prefix} (id: "${r.id ?? '?'}") has no condition and matches all envelopes — all subsequent rules are unreachable`,
          path: prefix,
        });
      }
    }

    // Rate limit validation
    if (r.rateLimit !== undefined) {
      validateRateLimit(r.rateLimit, `${prefix}.rateLimit`, diagnostics);
    }

    // require_approval should have approvalConfig
    if (r.effect === 'require_approval' && !r.approvalConfig) {
      diagnostics.push({
        severity: 'info',
        message: `${prefix} has effect "require_approval" but no approvalConfig — default approval settings will be used`,
        path: `${prefix}.approvalConfig`,
      });
    }
  }
}

function validateCondition(condition: unknown, path: string, diagnostics: LintDiagnostic[]): void {
  if (typeof condition !== 'object' || condition === null || Array.isArray(condition)) {
    diagnostics.push({ severity: 'error', message: `${path} must be an object`, path });
    return;
  }

  const c = condition as Record<string, unknown>;

  // Logical operators
  if (c.all !== undefined) {
    if (!Array.isArray(c.all)) {
      diagnostics.push({ severity: 'error', message: `${path}.all must be an array`, path: `${path}.all` });
    } else {
      for (let i = 0; i < c.all.length; i++) {
        validateCondition(c.all[i], `${path}.all[${i}]`, diagnostics);
      }
    }
  }

  if (c.any !== undefined) {
    if (!Array.isArray(c.any)) {
      diagnostics.push({ severity: 'error', message: `${path}.any must be an array`, path: `${path}.any` });
    } else {
      for (let i = 0; i < c.any.length; i++) {
        validateCondition(c.any[i], `${path}.any[${i}]`, diagnostics);
      }
    }
  }

  if (c.not !== undefined) {
    validateCondition(c.not, `${path}.not`, diagnostics);
  }

  // Field comparison
  if (c.field !== undefined && typeof c.field !== 'string') {
    diagnostics.push({ severity: 'error', message: `${path}.field must be a string`, path: `${path}.field` });
  }

  if (c.operator !== undefined) {
    if (!VALID_OPERATORS.includes(c.operator as typeof VALID_OPERATORS[number])) {
      diagnostics.push({
        severity: 'error',
        message: `${path}.operator "${c.operator}" is invalid. Must be one of: ${VALID_OPERATORS.join(', ')}`,
        path: `${path}.operator`,
      });
    }
  }

  // If field is set, operator should be too (and vice versa)
  if (c.field !== undefined && c.operator === undefined) {
    diagnostics.push({
      severity: 'warning',
      message: `${path} has "field" but no "operator" — condition will match everything`,
      path,
    });
  }
  if (c.operator !== undefined && c.field === undefined) {
    diagnostics.push({
      severity: 'warning',
      message: `${path} has "operator" but no "field" — condition will match everything`,
      path,
    });
  }
}

function validateRateLimit(rateLimit: unknown, path: string, diagnostics: LintDiagnostic[]): void {
  if (typeof rateLimit !== 'object' || rateLimit === null || Array.isArray(rateLimit)) {
    diagnostics.push({ severity: 'error', message: `${path} must be an object`, path });
    return;
  }

  const rl = rateLimit as Record<string, unknown>;

  if (rl.requests === undefined) {
    diagnostics.push({ severity: 'error', message: `${path}.requests is required`, path: `${path}.requests` });
  } else if (typeof rl.requests !== 'number' || rl.requests < 1 || !Number.isInteger(rl.requests)) {
    diagnostics.push({ severity: 'error', message: `${path}.requests must be a positive integer`, path: `${path}.requests` });
  }

  if (rl.window === undefined) {
    diagnostics.push({ severity: 'error', message: `${path}.window is required`, path: `${path}.window` });
  } else if (typeof rl.window !== 'string' || !WINDOW_PATTERN.test(rl.window)) {
    diagnostics.push({
      severity: 'error',
      message: `${path}.window "${rl.window}" is invalid. Expected format like "1h", "24h", "7d"`,
      path: `${path}.window`,
    });
  }

  if (rl.scope !== undefined && !VALID_RATE_LIMIT_SCOPES.includes(rl.scope as typeof VALID_RATE_LIMIT_SCOPES[number])) {
    diagnostics.push({
      severity: 'error',
      message: `${path}.scope "${rl.scope}" is invalid. Must be one of: ${VALID_RATE_LIMIT_SCOPES.join(', ')}`,
      path: `${path}.scope`,
    });
  }
}

function buildResult(diagnostics: LintDiagnostic[]): LintResult {
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  return {
    valid: errorCount === 0,
    diagnostics,
    errorCount,
    warningCount,
  };
}

// ── File Loading ─────────────────────────────────────────────────────

/**
 * Load and parse a policy from a file path. Supports JSON.
 */
export function loadPolicyFile(filePath: string): unknown {
  const content = readFileSync(filePath, 'utf-8');

  if (filePath.endsWith('.json')) {
    return JSON.parse(content);
  }

  // Try JSON first
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(
      `Could not parse "${filePath}". Only JSON files are supported. ` +
      `Ensure the file has a .json extension and contains valid JSON.`
    );
  }
}

// ── CLI Handler ──────────────────────────────────────────────────────

export function formatDiagnostics(result: LintResult, filePath?: string): string {
  const lines: string[] = [];
  const fileLabel = filePath ? ` ${filePath}` : '';

  for (const d of result.diagnostics) {
    const sevLabel = d.severity === 'error'
      ? '\x1b[31merror\x1b[0m'
      : d.severity === 'warning'
        ? '\x1b[33mwarning\x1b[0m'
        : '\x1b[2minfo\x1b[0m';

    const pathLabel = d.path ? ` (${d.path})` : '';
    lines.push(`  ${sevLabel}${pathLabel}: ${d.message}`);
  }

  if (result.valid) {
    lines.push(`\n  \x1b[32mPolicy is valid.\x1b[0m${fileLabel}`);
  } else {
    lines.push(`\n  \x1b[31mPolicy has ${result.errorCount} error(s)\x1b[0m and ${result.warningCount} warning(s).${fileLabel}`);
  }

  return lines.join('\n');
}
