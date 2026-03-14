/**
 * Policy Test Runner — Run test cases against a policy
 *
 * Accepts a test file (JSON) with test cases, loads the policy,
 * runs each test through the engine's evaluate() function,
 * and reports pass/fail with diffs for failures.
 *
 * Test file format:
 * {
 *   "policy": "./path/to/policy.json" | { inline policy },
 *   "tests": [
 *     {
 *       "name": "should deny unauthenticated requests",
 *       "envelope": { ... ActionEnvelope ... },
 *       "expected": {
 *         "outcome": "deny",
 *         "matchedRuleId": "rule-1",
 *         "policyId": "my-policy"
 *       }
 *     }
 *   ]
 * }
 */

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';

// ── Types ────────────────────────────────────────────────────────────

export interface TestCase {
  name: string;
  envelope: Record<string, unknown>;
  expected: {
    outcome: string;
    matchedRuleId?: string;
    policyId?: string;
    reason?: string;
  };
}

export interface TestFile {
  policy: string | Record<string, unknown>;
  tests: TestCase[];
}

export interface TestResult {
  name: string;
  passed: boolean;
  expected: TestCase['expected'];
  actual?: {
    outcome: string;
    matchedRuleId?: string;
    policyId?: string;
    reason?: string;
  };
  error?: string;
  diffs?: Array<{ field: string; expected: unknown; actual: unknown }>;
}

export interface TestRunResult {
  total: number;
  passed: number;
  failed: number;
  results: TestResult[];
}

// ── Core Test Logic ──────────────────────────────────────────────────

/**
 * Run a single test case against a policy using the engine.
 * Accepts the engine module as a parameter to avoid import issues in non-workspace contexts.
 */
export function runTestCase(
  testCase: TestCase,
  policy: Record<string, unknown>,
  engine: {
    evaluate: (
      envelope: Record<string, unknown>,
      policies: Record<string, unknown>[]
    ) => {
      decision: { outcome: string; policyId?: string; reason?: string; matchedRules?: Array<{ ruleId: string }> };
      matchedRule?: { id: string };
      matchedPolicy?: { id: string };
    };
  },
): TestResult {
  try {
    const result = engine.evaluate(testCase.envelope, [policy]);
    const actual = {
      outcome: result.decision.outcome,
      matchedRuleId: result.matchedRule?.id,
      policyId: result.matchedPolicy?.id ?? result.decision.policyId,
      reason: result.decision.reason,
    };

    const diffs: Array<{ field: string; expected: unknown; actual: unknown }> = [];

    // Compare outcome (required)
    if (testCase.expected.outcome !== actual.outcome) {
      diffs.push({ field: 'outcome', expected: testCase.expected.outcome, actual: actual.outcome });
    }

    // Compare optional fields only if specified in expected
    if (testCase.expected.matchedRuleId !== undefined && testCase.expected.matchedRuleId !== actual.matchedRuleId) {
      diffs.push({ field: 'matchedRuleId', expected: testCase.expected.matchedRuleId, actual: actual.matchedRuleId });
    }

    if (testCase.expected.policyId !== undefined && testCase.expected.policyId !== actual.policyId) {
      diffs.push({ field: 'policyId', expected: testCase.expected.policyId, actual: actual.policyId });
    }

    if (testCase.expected.reason !== undefined) {
      // Partial match for reason (expected is a substring of actual)
      if (!actual.reason || !actual.reason.includes(testCase.expected.reason)) {
        diffs.push({ field: 'reason', expected: testCase.expected.reason, actual: actual.reason });
      }
    }

    return {
      name: testCase.name,
      passed: diffs.length === 0,
      expected: testCase.expected,
      actual,
      diffs: diffs.length > 0 ? diffs : undefined,
    };
  } catch (err) {
    return {
      name: testCase.name,
      passed: false,
      expected: testCase.expected,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Run all test cases from a test suite against a policy.
 */
export function runTestSuite(
  tests: TestCase[],
  policy: Record<string, unknown>,
  engine: {
    evaluate: (
      envelope: Record<string, unknown>,
      policies: Record<string, unknown>[]
    ) => {
      decision: { outcome: string; policyId?: string; reason?: string; matchedRules?: Array<{ ruleId: string }> };
      matchedRule?: { id: string };
      matchedPolicy?: { id: string };
    };
  },
): TestRunResult {
  const results: TestResult[] = [];

  for (const testCase of tests) {
    results.push(runTestCase(testCase, policy, engine));
  }

  return {
    total: results.length,
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
}

// ── File Loading ─────────────────────────────────────────────────────

/**
 * Load a test file and resolve the policy reference.
 */
export function loadTestFile(testFilePath: string): TestFile {
  const content = readFileSync(testFilePath, 'utf-8');
  const parsed = JSON.parse(content);

  if (!parsed.tests || !Array.isArray(parsed.tests)) {
    throw new Error('Test file must have a "tests" array');
  }

  if (!parsed.policy) {
    throw new Error('Test file must have a "policy" field (path or inline object)');
  }

  return parsed as TestFile;
}

/**
 * Resolve the policy from a test file — either inline or from a file path.
 */
export function resolvePolicy(testFile: TestFile, testFilePath: string): Record<string, unknown> {
  if (typeof testFile.policy === 'object') {
    return testFile.policy;
  }

  // It's a file path — resolve relative to the test file
  const policyPath = resolve(dirname(testFilePath), testFile.policy);
  const content = readFileSync(policyPath, 'utf-8');
  return JSON.parse(content);
}

// ── Output Formatting ────────────────────────────────────────────────

export function formatTestResults(runResult: TestRunResult): string {
  const lines: string[] = [];

  for (const result of runResult.results) {
    if (result.passed) {
      lines.push(`  \x1b[32mPASS\x1b[0m  ${result.name}`);
    } else {
      lines.push(`  \x1b[31mFAIL\x1b[0m  ${result.name}`);

      if (result.error) {
        lines.push(`        \x1b[2mError: ${result.error}\x1b[0m`);
      }

      if (result.diffs) {
        for (const diff of result.diffs) {
          lines.push(`        \x1b[2m${diff.field}:\x1b[0m`);
          lines.push(`          \x1b[31m- expected: ${JSON.stringify(diff.expected)}\x1b[0m`);
          lines.push(`          \x1b[32m+ actual:   ${JSON.stringify(diff.actual)}\x1b[0m`);
        }
      }
    }
  }

  lines.push('');
  const summary = runResult.failed === 0
    ? `\x1b[32m${runResult.passed} passed\x1b[0m`
    : `\x1b[31m${runResult.failed} failed\x1b[0m, \x1b[32m${runResult.passed} passed\x1b[0m`;
  lines.push(`  ${summary} (${runResult.total} total)`);

  return lines.join('\n');
}
