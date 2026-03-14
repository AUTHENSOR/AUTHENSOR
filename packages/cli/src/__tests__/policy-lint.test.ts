import { describe, it, expect } from 'vitest';
import { lintPolicy } from '../policy/lint.js';

describe('policy lint', () => {
  // ── Valid policies ────────────────────────────────────────────────

  it('accepts a minimal valid policy', () => {
    const result = lintPolicy({
      id: 'test-policy',
      name: 'Test Policy',
      version: '1.0.0',
      rules: [
        { id: 'rule-1', effect: 'deny' },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('accepts a fully-featured valid policy', () => {
    const result = lintPolicy({
      id: 'full-policy',
      name: 'Full Policy',
      description: 'A comprehensive policy',
      version: '2.1.0',
      enabled: true,
      priority: 10,
      defaultEffect: 'deny',
      scope: {
        actionTypes: ['http.*'],
        principalTypes: ['agent', 'service'],
        environments: ['production'],
      },
      rules: [
        {
          id: 'rule-1',
          name: 'Allow safe requests',
          description: 'Allow GET requests',
          effect: 'allow',
          condition: {
            field: 'action.operation',
            operator: 'eq',
            value: 'read',
          },
        },
        {
          id: 'rule-2',
          name: 'Rate limit writes',
          effect: 'allow',
          condition: {
            field: 'action.operation',
            operator: 'eq',
            value: 'create',
          },
          rateLimit: {
            requests: 100,
            window: '1h',
            scope: 'principal',
          },
        },
        {
          id: 'rule-3',
          effect: 'deny',
        },
      ],
    });

    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  // ── Missing required fields ───────────────────────────────────────

  it('reports missing id', () => {
    const result = lintPolicy({
      name: 'Test',
      version: '1.0.0',
      rules: [],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'id' })
    );
  });

  it('reports missing name', () => {
    const result = lintPolicy({
      id: 'test',
      version: '1.0.0',
      rules: [],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'name' })
    );
  });

  it('reports missing version', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      rules: [],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'version' })
    );
  });

  it('reports missing rules', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({ severity: 'error', path: 'rules' })
    );
  });

  // ── Version format ────────────────────────────────────────────────

  it('rejects invalid version format', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: 'v1.0',
      rules: [],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        path: 'version',
        message: expect.stringContaining('Invalid version format'),
      })
    );
  });

  it('accepts valid semver versions', () => {
    for (const v of ['0.0.1', '1.0.0', '10.20.30']) {
      const result = lintPolicy({
        id: 'test', name: 'Test', version: v,
        rules: [{ id: 'r1', effect: 'deny' }],
      });
      expect(result.errorCount).toBe(0);
    }
  });

  // ── Duplicate rule IDs ────────────────────────────────────────────

  it('reports duplicate rule IDs', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        { id: 'rule-1', effect: 'allow', condition: { field: 'action.type', operator: 'eq', value: 'read' } },
        { id: 'rule-1', effect: 'deny' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Duplicate rule ID "rule-1"'),
      })
    );
  });

  // ── Unreachable rules ─────────────────────────────────────────────

  it('warns about unreachable rules after a catch-all', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        { id: 'catch-all', effect: 'deny' }, // No condition = matches everything
        { id: 'unreachable', effect: 'allow', condition: { field: 'action.type', operator: 'eq', value: 'safe' } },
      ],
    });

    expect(result.warningCount).toBeGreaterThanOrEqual(1);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('unreachable'),
      })
    );
  });

  it('does not warn when catch-all is the last rule', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        { id: 'specific', effect: 'allow', condition: { field: 'action.type', operator: 'eq', value: 'safe' } },
        { id: 'catch-all', effect: 'deny' },
      ],
    });

    const unreachableWarnings = result.diagnostics.filter(
      (d) => d.severity === 'warning' && d.message.includes('unreachable')
    );
    expect(unreachableWarnings.length).toBe(0);
  });

  // ── Invalid effects ───────────────────────────────────────────────

  it('rejects invalid rule effect', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        { id: 'rule-1', effect: 'block' },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('invalid'),
      })
    );
  });

  it('rejects invalid defaultEffect', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      defaultEffect: 'require_approval',
      rules: [{ id: 'r1', effect: 'deny' }],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        path: 'defaultEffect',
      })
    );
  });

  // ── Invalid conditions ────────────────────────────────────────────

  it('rejects invalid operator in condition', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        {
          id: 'rule-1',
          effect: 'allow',
          condition: { field: 'action.type', operator: 'like', value: '%test%' },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('operator'),
      })
    );
  });

  it('warns about field without operator', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        {
          id: 'rule-1',
          effect: 'allow',
          condition: { field: 'action.type' },
        },
      ],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('no "operator"'),
      })
    );
  });

  // ── Scope validation ──────────────────────────────────────────────

  it('rejects invalid principal type in scope', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      scope: { principalTypes: ['robot'] },
      rules: [{ id: 'r1', effect: 'deny' }],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Invalid principal type'),
      })
    );
  });

  it('rejects invalid environment in scope', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      scope: { environments: ['test'] },
      rules: [{ id: 'r1', effect: 'deny' }],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('Invalid environment'),
      })
    );
  });

  // ── Rate limit validation ─────────────────────────────────────────

  it('rejects invalid rate limit window', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        {
          id: 'rule-1',
          effect: 'allow',
          rateLimit: { requests: 10, window: '1 hour' },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('window'),
      })
    );
  });

  it('rejects missing rate limit requests', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        {
          id: 'rule-1',
          effect: 'allow',
          rateLimit: { window: '1h' },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('requests'),
      })
    );
  });

  // ── Edge cases ────────────────────────────────────────────────────

  it('handles null policy', () => {
    const result = lintPolicy(null);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(1);
  });

  it('handles non-object policy', () => {
    const result = lintPolicy('not an object');
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(1);
  });

  it('handles empty rules array with warning', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [],
    });

    // valid (no errors) but should have a warning about empty rules
    expect(result.valid).toBe(true);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('no rules'),
      })
    );
  });

  it('warns about unknown top-level fields', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [{ id: 'r1', effect: 'deny' }],
      customField: 'should warn',
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        message: expect.stringContaining('Unknown top-level field'),
      })
    );
  });

  it('provides info when require_approval has no approvalConfig', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        { id: 'rule-1', effect: 'require_approval' },
      ],
    });

    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'info',
        message: expect.stringContaining('approvalConfig'),
      })
    );
  });

  // ── Nested condition validation ───────────────────────────────────

  it('validates nested all/any conditions', () => {
    const result = lintPolicy({
      id: 'test',
      name: 'Test',
      version: '1.0.0',
      rules: [
        {
          id: 'rule-1',
          effect: 'allow',
          condition: {
            all: [
              { field: 'action.type', operator: 'eq', value: 'http.request' },
              {
                any: [
                  { field: 'action.operation', operator: 'eq', value: 'read' },
                  { field: 'action.operation', operator: 'invalid_op', value: 'write' },
                ],
              },
            ],
          },
        },
      ],
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toContainEqual(
      expect.objectContaining({
        severity: 'error',
        message: expect.stringContaining('operator'),
      })
    );
  });
});
