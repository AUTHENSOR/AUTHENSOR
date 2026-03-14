/**
 * Policy subcommands — lint, test, diff
 */

export { lintPolicy, loadPolicyFile, formatDiagnostics } from './lint.js';
export type { LintResult, LintDiagnostic, Severity } from './lint.js';

export { runTestCase, runTestSuite, loadTestFile, resolvePolicy, formatTestResults } from './test.js';
export type { TestCase, TestFile, TestResult, TestRunResult } from './test.js';

export { diffPolicies, loadPolicyFromFile, loadPolicyFromControlPlane, formatDiffResult, deepEqual } from './diff.js';
export type { RuleDiff, PolicyFieldDiff, DiffResult, ChangeKind, ChangeSeverity } from './diff.js';
