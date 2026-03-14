import { describe, it, expect } from 'vitest';
import { guard, guardExecute, GuardDeniedError, getDefaultPolicy } from '../src/guard.js';

describe('guard() zero-config', () => {
  describe('read operations (allowed)', () => {
    it('allows *.read actions', () => {
      const result = guard('data.read', '/api/users');
      expect(result.allowed).toBe(true);
      expect(result.outcome).toBe('allow');
    });

    it('allows *.list actions', () => {
      const result = guard('files.list', '/home');
      expect(result.allowed).toBe(true);
    });

    it('allows *.get actions', () => {
      const result = guard('config.get', '/settings');
      expect(result.allowed).toBe(true);
    });

    it('allows HTTP GET requests', () => {
      const result = guard('http.request', 'https://api.example.com', {
        parameters: { method: 'GET' },
      });
      expect(result.allowed).toBe(true);
    });
  });

  describe('write operations (require approval)', () => {
    it('requires approval for *.write actions', () => {
      const result = guard('file.write', '/etc/hosts');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });

    it('requires approval for filesystem actions', () => {
      const result = guard('filesystem.rename', '/tmp/file');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });
  });

  describe('delete operations (require approval)', () => {
    it('requires approval for *.delete actions', () => {
      const result = guard('records.delete', '/users/123');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });
  });

  describe('execute operations (require approval)', () => {
    it('requires approval for shell.execute', () => {
      const result = guard('shell.execute', '/bin/bash');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });

    it('requires approval for code.* actions', () => {
      const result = guard('code.run', '/script.py');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });
  });

  describe('network operations (require approval)', () => {
    it('requires approval for HTTP POST', () => {
      const result = guard('http.request', 'https://api.example.com', {
        parameters: { method: 'POST' },
      });
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });

    it('requires approval for network.* actions', () => {
      const result = guard('network.connect', 'tcp://10.0.0.1:5432');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });
  });

  describe('sensitive operations (require approval)', () => {
    it('requires approval for secrets.access actions', () => {
      const result = guard('secrets.access', 'vault://api-key');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });

    it('requires approval for payments.* actions', () => {
      const result = guard('payments.charge', 'stripe://customers/cus_123');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });

    it('requires approval for mcp.* actions', () => {
      const result = guard('mcp.tool_call', 'github://issues/create');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('require_approval');
    });
  });

  describe('destructive operations (hard deny)', () => {
    it('denies *.drop actions', () => {
      const result = guard('db.drop', 'postgres://users');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('deny');
    });

    it('denies *.truncate actions', () => {
      const result = guard('table.truncate', 'postgres://logs');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('deny');
    });

    it('denies rm -rf commands', () => {
      const result = guard('shell.execute', '/bin/bash', {
        parameters: { command: 'rm -rf /' },
      });
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('deny');
    });

    it('denies fork bombs', () => {
      const result = guard('shell.execute', '/bin/bash', {
        parameters: { command: ':(){ :|:& };:' },
      });
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('deny');
    });
  });

  describe('unrecognized actions (fail-closed)', () => {
    it('denies unknown action types', () => {
      const result = guard('some.random.action', '/resource');
      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('deny');
    });
  });

  describe('result metadata', () => {
    it('includes evaluation time', () => {
      const result = guard('data.read', '/api');
      expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('includes policy and rule IDs', () => {
      const result = guard('data.read', '/api');
      expect(result.policyId).toBe('default-safe');
      expect(result.ruleId).toBe('allow-read-ops');
    });
  });

  describe('custom policy', () => {
    it('accepts a custom policy', () => {
      const allowAll = {
        id: 'allow-all',
        name: 'Allow Everything',
        version: '1.0.0',
        rules: [{ id: 'allow', effect: 'allow' }],
        defaultEffect: 'allow',
      };
      const result = guard('dangerous.action', '/resource', {
        policy: allowAll as any,
      });
      expect(result.allowed).toBe(true);
    });
  });
});

describe('guardExecute()', () => {
  it('executes when allowed', async () => {
    const result = await guardExecute('data.read', '/api', async () => 42);
    expect(result).toBe(42);
  });

  it('throws GuardDeniedError when denied', async () => {
    await expect(
      guardExecute('db.drop', 'postgres://users', async () => 'nope')
    ).rejects.toThrow(GuardDeniedError);
  });

  it('throws with correct result metadata', async () => {
    try {
      await guardExecute('file.write', '/etc/passwd', async () => 'nope');
      expect.fail('Should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(GuardDeniedError);
      expect((e as GuardDeniedError).result.outcome).toBe('require_approval');
    }
  });
});

describe('getDefaultPolicy()', () => {
  it('returns the built-in policy', () => {
    const policy = getDefaultPolicy();
    expect(policy.id).toBe('default-safe');
    expect(policy.rules.length).toBeGreaterThan(0);
    expect(policy.defaultEffect).toBe('deny');
  });
});
