import { describe, it, expect } from 'vitest';
import { diffPolicies, deepEqual } from '../policy/diff.js';

// ── deepEqual ────────────────────────────────────────────────────────

describe('deepEqual', () => {
  it('compares primitives', () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
  });

  it('handles null and undefined', () => {
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
    expect(deepEqual(null, 'a')).toBe(false);
  });

  it('compares arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 3, 2])).toBe(false);
  });

  it('compares objects', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('compares nested objects', () => {
    expect(deepEqual(
      { a: { b: [1, 2], c: 'x' } },
      { a: { b: [1, 2], c: 'x' } },
    )).toBe(true);
    expect(deepEqual(
      { a: { b: [1, 2] } },
      { a: { b: [1, 3] } },
    )).toBe(false);
  });
});

// ── diffPolicies ─────────────────────────────────────────────────────

describe('diffPolicies', () => {
  const basePolicy = {
    id: 'test-policy',
    name: 'Test Policy',
    version: '1.0.0',
    defaultEffect: 'deny',
    rules: [
      {
        id: 'rule-1',
        name: 'Allow reads',
        effect: 'allow',
        condition: { field: 'action.operation', operator: 'eq', value: 'read' },
      },
      {
        id: 'rule-2',
        name: 'Deny writes',
        effect: 'deny',
        condition: { field: 'action.operation', operator: 'eq', value: 'create' },
      },
    ],
  };

  // ── No changes ────────────────────────────────────────────────────

  it('reports no changes for identical policies', () => {
    const result = diffPolicies(basePolicy, { ...basePolicy });
    expect(result.hasChanges).toBe(false);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(0);
    expect(result.summary.breaking).toBe(0);
  });

  // ── Policy field changes ──────────────────────────────────────────

  it('detects version change as cosmetic', () => {
    const newPolicy = { ...basePolicy, version: '1.1.0' };
    const result = diffPolicies(basePolicy, newPolicy);

    expect(result.hasChanges).toBe(true);
    expect(result.policyFieldDiffs).toContainEqual(
      expect.objectContaining({
        field: 'version',
        oldValue: '1.0.0',
        newValue: '1.1.0',
        severity: 'cosmetic',
      })
    );
  });

  it('detects defaultEffect change as breaking', () => {
    const newPolicy = { ...basePolicy, defaultEffect: 'allow' };
    const result = diffPolicies(basePolicy, newPolicy);

    expect(result.hasChanges).toBe(true);
    expect(result.policyFieldDiffs).toContainEqual(
      expect.objectContaining({
        field: 'defaultEffect',
        severity: 'breaking',
      })
    );
    expect(result.summary.breaking).toBeGreaterThanOrEqual(1);
  });

  it('detects enabled change as breaking', () => {
    const newPolicy = { ...basePolicy, enabled: false };
    const result = diffPolicies(basePolicy, newPolicy);

    expect(result.hasChanges).toBe(true);
    expect(result.policyFieldDiffs).toContainEqual(
      expect.objectContaining({
        field: 'enabled',
        severity: 'breaking',
      })
    );
  });

  it('detects priority change as notable', () => {
    const oldPolicy = { ...basePolicy, priority: 10 };
    const newPolicy = { ...basePolicy, priority: 20 };
    const result = diffPolicies(oldPolicy, newPolicy);

    expect(result.hasChanges).toBe(true);
    expect(result.policyFieldDiffs).toContainEqual(
      expect.objectContaining({
        field: 'priority',
        severity: 'notable',
      })
    );
  });

  // ── Rule additions ────────────────────────────────────────────────

  it('detects added rules', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        ...basePolicy.rules,
        { id: 'rule-3', name: 'New rule', effect: 'allow' },
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    expect(result.summary.added).toBe(1);
    expect(result.ruleDiffs).toContainEqual(
      expect.objectContaining({
        kind: 'added',
        ruleId: 'rule-3',
      })
    );
  });

  it('marks added deny rules as breaking', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        ...basePolicy.rules,
        { id: 'rule-3', effect: 'deny' },
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    const addedRule = result.ruleDiffs.find((d) => d.ruleId === 'rule-3');
    expect(addedRule?.severity).toBe('breaking');
  });

  it('marks added allow rules as notable', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        ...basePolicy.rules,
        { id: 'rule-3', effect: 'allow' },
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    const addedRule = result.ruleDiffs.find((d) => d.ruleId === 'rule-3');
    expect(addedRule?.severity).toBe('notable');
  });

  // ── Rule removals ─────────────────────────────────────────────────

  it('detects removed rules as breaking', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [basePolicy.rules[0]],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    expect(result.summary.removed).toBe(1);
    expect(result.ruleDiffs).toContainEqual(
      expect.objectContaining({
        kind: 'removed',
        ruleId: 'rule-2',
        severity: 'breaking',
      })
    );
  });

  // ── Rule modifications ────────────────────────────────────────────

  it('detects effect change as breaking', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        { ...basePolicy.rules[0], effect: 'deny' },
        basePolicy.rules[1],
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    expect(result.summary.modified).toBe(1);

    const modified = result.ruleDiffs.find((d) => d.ruleId === 'rule-1' && d.kind === 'modified');
    expect(modified).toBeDefined();
    expect(modified?.severity).toBe('breaking');
    expect(modified?.details).toContainEqual(
      expect.stringContaining('Effect changed')
    );
  });

  it('detects condition change as notable', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        {
          ...basePolicy.rules[0],
          condition: { field: 'action.type', operator: 'eq', value: 'http.get' },
        },
        basePolicy.rules[1],
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    const modified = result.ruleDiffs.find((d) => d.ruleId === 'rule-1' && d.kind === 'modified');
    expect(modified).toBeDefined();
    expect(modified?.details).toContainEqual('Condition changed');
  });

  it('detects name change', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        { ...basePolicy.rules[0], name: 'Allow all reads' },
        basePolicy.rules[1],
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    const modified = result.ruleDiffs.find((d) => d.ruleId === 'rule-1' && d.kind === 'modified');
    expect(modified).toBeDefined();
    expect(modified?.details).toContainEqual(
      expect.stringContaining('Name changed')
    );
  });

  it('detects rate limit change as notable', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [
        {
          ...basePolicy.rules[0],
          rateLimit: { requests: 10, window: '1h' },
        },
        basePolicy.rules[1],
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    const modified = result.ruleDiffs.find((d) => d.ruleId === 'rule-1' && d.kind === 'modified');
    expect(modified).toBeDefined();
    expect(modified?.details).toContainEqual('Rate limit changed');
  });

  // ── Rule reordering ───────────────────────────────────────────────

  it('detects rule reordering', () => {
    const newPolicy = {
      ...basePolicy,
      rules: [basePolicy.rules[1], basePolicy.rules[0]],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    const reorderDiff = result.ruleDiffs.find(
      (d) => d.ruleId === '*' && d.details.some((detail) => detail.includes('order changed'))
    );
    expect(reorderDiff).toBeDefined();
    expect(reorderDiff?.severity).toBe('notable');
  });

  // ── Multiple changes ──────────────────────────────────────────────

  it('handles multiple simultaneous changes', () => {
    const newPolicy = {
      ...basePolicy,
      version: '2.0.0',
      defaultEffect: 'allow',
      rules: [
        // rule-1 modified
        { ...basePolicy.rules[0], effect: 'require_approval' },
        // rule-2 removed (not present)
        // rule-3 added
        { id: 'rule-3', name: 'New', effect: 'deny' },
      ],
    };

    const result = diffPolicies(basePolicy, newPolicy);
    expect(result.hasChanges).toBe(true);
    expect(result.summary.added).toBe(1);
    expect(result.summary.removed).toBe(1);
    expect(result.summary.modified).toBe(1);
    expect(result.summary.breaking).toBeGreaterThanOrEqual(2); // defaultEffect + effect change + removal
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('handles policies with no rules', () => {
    const result = diffPolicies(
      { ...basePolicy, rules: [] },
      { ...basePolicy, rules: [] },
    );
    expect(result.hasChanges).toBe(false);
  });

  it('handles adding rules from empty', () => {
    const result = diffPolicies(
      { ...basePolicy, rules: [] },
      basePolicy,
    );
    expect(result.summary.added).toBe(2);
  });

  it('handles removing all rules', () => {
    const result = diffPolicies(
      basePolicy,
      { ...basePolicy, rules: [] },
    );
    expect(result.summary.removed).toBe(2);
  });
});
