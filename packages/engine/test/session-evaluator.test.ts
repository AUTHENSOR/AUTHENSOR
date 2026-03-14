import { describe, expect, it } from 'vitest';
import { evaluateSessionRules } from '../src/session-evaluator.js';
import { PolicyEngine } from '../src/policy-engine.js';
import type {
  ActionEnvelope,
  Policy,
  SessionContext,
  SessionAction,
} from '../src/types.js';

// ---------- helpers ----------

function makeEnvelope(
  actionType: string,
  overrides: Partial<ActionEnvelope> = {}
): ActionEnvelope {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    timestamp: new Date().toISOString(),
    action: {
      type: actionType,
      resource: 'test://resource',
    },
    principal: { type: 'agent', id: 'agent-1' },
    context: { sessionId: 'session-1' },
    ...overrides,
  };
}

function makeSessionAction(
  actionType: string,
  outcome: 'allow' | 'deny' | 'require_approval' | 'rate_limited' = 'allow'
): SessionAction {
  return {
    actionType,
    timestamp: new Date().toISOString(),
    outcome,
  };
}

function makeSessionContext(
  actions: SessionAction[],
  sessionId = 'session-1'
): SessionContext {
  return { sessionId, actions };
}

// ---------- evaluateSessionRules (unit tests) ----------

describe('evaluateSessionRules', () => {
  describe('maxActionsPerSession', () => {
    const policy: Policy = {
      id: 'max-actions-policy',
      name: 'Max Actions',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        maxActionsPerSession: 5,
      },
    };

    it('allows when action count is under the limit', () => {
      const ctx = makeSessionContext([
        makeSessionAction('file.read'),
        makeSessionAction('file.read'),
      ]);
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('allows exactly at the limit', () => {
      // 4 previous actions + 1 proposed = 5, which is exactly the limit
      const ctx = makeSessionContext(
        Array.from({ length: 4 }, () => makeSessionAction('file.read'))
      );
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('denies when exceeding the limit', () => {
      // 5 previous actions + 1 proposed = 6 > 5
      const ctx = makeSessionContext(
        Array.from({ length: 5 }, () => makeSessionAction('file.read'))
      );
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('deny');
      expect(result.violation?.type).toBe('max_actions');
      expect(result.violation?.details?.actionCount).toBe(6);
      expect(result.violation?.details?.maxActions).toBe(5);
    });

    it('denies well above the limit', () => {
      const ctx = makeSessionContext(
        Array.from({ length: 100 }, () => makeSessionAction('file.read'))
      );
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(false);
    });
  });

  describe('forbiddenSequences', () => {
    const policy: Policy = {
      id: 'forbidden-seq-policy',
      name: 'Forbidden Sequences',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        forbiddenSequences: [
          {
            id: 'config-read-exec',
            name: 'Config Read then Shell Exec',
            sequence: ['file.read', 'shell.exec'],
            effect: 'deny',
            reason:
              'Reading config files followed by shell execution is a privilege escalation pattern',
          },
        ],
      },
    };

    it('allows when sequence is not present', () => {
      const ctx = makeSessionContext([makeSessionAction('http.request')]);
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('denies when forbidden sequence is completed', () => {
      const ctx = makeSessionContext([makeSessionAction('file.read')]);
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('deny');
      expect(result.violation?.type).toBe('forbidden_sequence');
      expect(result.violation?.details?.detectedSequence).toEqual([
        'file.read',
        'shell.exec',
      ]);
      expect(result.violation?.details?.sequenceRuleId).toBe(
        'config-read-exec'
      );
    });

    it('detects non-consecutive subsequences', () => {
      // file.read -> http.request -> shell.exec still matches [file.read, shell.exec]
      const ctx = makeSessionContext([
        makeSessionAction('file.read'),
        makeSessionAction('http.request'),
      ]);
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.violation?.type).toBe('forbidden_sequence');
    });

    it('does not match reversed sequences', () => {
      // shell.exec -> file.read is NOT the same as file.read -> shell.exec
      const ctx = makeSessionContext([makeSessionAction('shell.exec')]);
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('supports glob patterns in sequences', () => {
      const globPolicy: Policy = {
        id: 'glob-seq-policy',
        name: 'Glob Sequences',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          forbiddenSequences: [
            {
              id: 'read-then-write',
              sequence: ['file.*', 'db.*'],
              effect: 'deny',
            },
          ],
        },
      };

      const ctx = makeSessionContext([makeSessionAction('file.read')]);
      const result = evaluateSessionRules(
        makeEnvelope('db.write'),
        globPolicy,
        ctx
      );
      expect(result.allowed).toBe(false);
    });

    it('respects lookbackActions limit', () => {
      const lookbackPolicy: Policy = {
        id: 'lookback-policy',
        name: 'Lookback',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          forbiddenSequences: [
            {
              id: 'read-exec',
              sequence: ['file.read', 'shell.exec'],
              effect: 'deny',
              lookbackActions: 2,
            },
          ],
        },
      };

      // file.read is 3 actions ago, only looking back 2
      const ctx = makeSessionContext([
        makeSessionAction('file.read'),
        makeSessionAction('http.request'),
        makeSessionAction('http.request'),
      ]);
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        lookbackPolicy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('detects within lookback window', () => {
      const lookbackPolicy: Policy = {
        id: 'lookback-policy',
        name: 'Lookback',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          forbiddenSequences: [
            {
              id: 'read-exec',
              sequence: ['file.read', 'shell.exec'],
              effect: 'deny',
              lookbackActions: 3,
            },
          ],
        },
      };

      // file.read is 2 actions ago, within lookback of 3
      const ctx = makeSessionContext([
        makeSessionAction('file.read'),
        makeSessionAction('http.request'),
      ]);
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        lookbackPolicy,
        ctx
      );
      expect(result.allowed).toBe(false);
    });

    it('supports require_approval effect', () => {
      const approvalPolicy: Policy = {
        id: 'approval-seq-policy',
        name: 'Approval Sequences',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          forbiddenSequences: [
            {
              id: 'sensitive-seq',
              sequence: ['auth.login', 'admin.escalate'],
              effect: 'require_approval',
              reason: 'Escalation after login requires approval',
            },
          ],
        },
      };

      const ctx = makeSessionContext([makeSessionAction('auth.login')]);
      const result = evaluateSessionRules(
        makeEnvelope('admin.escalate'),
        approvalPolicy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('require_approval');
    });

    it('detects 3-step sequences', () => {
      const threeStepPolicy: Policy = {
        id: 'three-step-policy',
        name: 'Three Step',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          forbiddenSequences: [
            {
              id: 'full-escalation',
              sequence: ['config.read', 'creds.extract', 'auth.escalate'],
              effect: 'deny',
              reason: 'Full privilege escalation chain detected',
            },
          ],
        },
      };

      const ctx = makeSessionContext([
        makeSessionAction('config.read'),
        makeSessionAction('creds.extract'),
      ]);
      const result = evaluateSessionRules(
        makeEnvelope('auth.escalate'),
        threeStepPolicy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.violation?.reason).toContain(
        'Full privilege escalation chain'
      );
    });

    it('allows when only partial sequence present', () => {
      const threeStepPolicy: Policy = {
        id: 'three-step-policy',
        name: 'Three Step',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          forbiddenSequences: [
            {
              id: 'full-escalation',
              sequence: ['config.read', 'creds.extract', 'auth.escalate'],
              effect: 'deny',
            },
          ],
        },
      };

      // Only has config.read -> auth.escalate (missing creds.extract)
      const ctx = makeSessionContext([makeSessionAction('config.read')]);
      const result = evaluateSessionRules(
        makeEnvelope('auth.escalate'),
        threeStepPolicy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('sessionRiskThreshold', () => {
    const policy: Policy = {
      id: 'risk-policy',
      name: 'Risk Threshold',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        sessionRiskThreshold: {
          maxScore: 10,
          riskWeights: {
            'file.read': 1,
            'shell.exec': 5,
            'db.write': 3,
            'http.request': 2,
          },
        },
      },
    };

    it('allows when cumulative score is under threshold', () => {
      const ctx = makeSessionContext([
        makeSessionAction('file.read'), // 1
        makeSessionAction('file.read'), // 1
      ]);
      // proposed: file.read = 1, total = 3
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('allows exactly at threshold', () => {
      const ctx = makeSessionContext([
        makeSessionAction('shell.exec'), // 5
        makeSessionAction('db.write'), // 3
      ]);
      // proposed: http.request = 2, total = 10 = maxScore
      const result = evaluateSessionRules(
        makeEnvelope('http.request'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('denies when exceeding threshold', () => {
      const ctx = makeSessionContext([
        makeSessionAction('shell.exec'), // 5
        makeSessionAction('db.write'), // 3
        makeSessionAction('http.request'), // 2
      ]);
      // proposed: file.read = 1, total = 11 > 10
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('deny');
      expect(result.violation?.type).toBe('risk_threshold');
      expect(result.violation?.details?.cumulativeScore).toBe(11);
      expect(result.violation?.details?.maxScore).toBe(10);
    });

    it('scores unlisted action types as 0', () => {
      const ctx = makeSessionContext([
        makeSessionAction('unknown.action'), // 0
        makeSessionAction('unknown.other'), // 0
      ]);
      // proposed: another unknown = 0, total = 0
      const result = evaluateSessionRules(
        makeEnvelope('custom.thing'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });

    it('supports glob patterns in risk weights', () => {
      const globPolicy: Policy = {
        id: 'glob-risk-policy',
        name: 'Glob Risk',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          sessionRiskThreshold: {
            maxScore: 5,
            riskWeights: {
              'admin.**': 10,
              'file.*': 1,
            },
          },
        },
      };

      const ctx = makeSessionContext([]);
      // proposed: admin.users.delete = 10 > 5
      const result = evaluateSessionRules(
        makeEnvelope('admin.users.delete'),
        globPolicy,
        ctx
      );
      expect(result.allowed).toBe(false);
    });

    it('supports require_approval effect on risk threshold', () => {
      const approvalPolicy: Policy = {
        id: 'risk-approval-policy',
        name: 'Risk Approval',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
        sessionRules: {
          sessionRiskThreshold: {
            maxScore: 5,
            riskWeights: {
              'shell.exec': 6,
            },
            effect: 'require_approval',
          },
        },
      };

      const ctx = makeSessionContext([]);
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        approvalPolicy,
        ctx
      );
      expect(result.allowed).toBe(false);
      expect(result.effect).toBe('require_approval');
    });
  });

  describe('no sessionRules', () => {
    it('returns allowed when policy has no sessionRules', () => {
      const policy: Policy = {
        id: 'no-session-rules',
        name: 'No Session Rules',
        version: '1.0.0',
        rules: [{ id: 'allow-all', effect: 'allow' }],
      };

      const ctx = makeSessionContext(
        Array.from({ length: 100 }, () => makeSessionAction('file.read'))
      );
      const result = evaluateSessionRules(
        makeEnvelope('file.read'),
        policy,
        ctx
      );
      expect(result.allowed).toBe(true);
    });
  });

  describe('combined session rules', () => {
    const policy: Policy = {
      id: 'combined-policy',
      name: 'Combined',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        maxActionsPerSession: 10,
        forbiddenSequences: [
          {
            id: 'read-exec',
            sequence: ['file.read', 'shell.exec'],
            effect: 'deny',
          },
        ],
        sessionRiskThreshold: {
          maxScore: 20,
          riskWeights: { 'shell.exec': 15, 'file.read': 1 },
        },
      },
    };

    it('maxActions is checked first', () => {
      const ctx = makeSessionContext(
        Array.from({ length: 10 }, () => makeSessionAction('file.read'))
      );
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        policy,
        ctx
      );
      expect(result.violation?.type).toBe('max_actions');
    });

    it('forbiddenSequences is checked before risk threshold', () => {
      const ctx = makeSessionContext([makeSessionAction('file.read')]);
      // This triggers both forbidden sequence and risk threshold,
      // but forbidden sequence should be reported since it's checked first
      const result = evaluateSessionRules(
        makeEnvelope('shell.exec'),
        policy,
        ctx
      );
      expect(result.violation?.type).toBe('forbidden_sequence');
    });
  });
});

// ---------- PolicyEngine.evaluate with SessionContext (integration) ----------

describe('PolicyEngine with SessionContext', () => {
  it('denies via session rules even when per-rule would allow', () => {
    const policy: Policy = {
      id: 'session-deny-policy',
      name: 'Session Deny',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        maxActionsPerSession: 3,
      },
    };

    const engine = new PolicyEngine();
    const ctx = makeSessionContext(
      Array.from({ length: 3 }, () => makeSessionAction('file.read'))
    );

    const result = engine.evaluate(makeEnvelope('file.read'), [policy], ctx);
    expect(result.decision.outcome).toBe('deny');
    expect(result.sessionViolation?.type).toBe('max_actions');
    expect(result.matchedPolicy?.id).toBe('session-deny-policy');
  });

  it('allows when no session context is passed (backward compat)', () => {
    const policy: Policy = {
      id: 'session-policy',
      name: 'Session',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        maxActionsPerSession: 1,
      },
    };

    const engine = new PolicyEngine();
    // No session context = session rules not evaluated
    const result = engine.evaluate(makeEnvelope('file.read'), [policy]);
    expect(result.decision.outcome).toBe('allow');
  });

  it('returns require_approval via session forbidden sequence', () => {
    const policy: Policy = {
      id: 'approval-policy',
      name: 'Approval',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        forbiddenSequences: [
          {
            id: 'escalation',
            sequence: ['auth.login', 'admin.escalate'],
            effect: 'require_approval',
            reason: 'Requires human approval',
          },
        ],
      },
    };

    const engine = new PolicyEngine();
    const ctx = makeSessionContext([makeSessionAction('auth.login')]);
    const result = engine.evaluate(
      makeEnvelope('admin.escalate'),
      [policy],
      ctx
    );
    expect(result.decision.outcome).toBe('require_approval');
    expect(result.sessionViolation?.type).toBe('forbidden_sequence');
  });

  it('session rules do not fire for non-matching policy scope', () => {
    const policy: Policy = {
      id: 'scoped-policy',
      name: 'Scoped',
      version: '1.0.0',
      scope: { actionTypes: ['github.**'] },
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        maxActionsPerSession: 1,
      },
    };

    const engine = new PolicyEngine();
    const ctx = makeSessionContext(
      Array.from({ length: 10 }, () => makeSessionAction('file.read'))
    );

    // file.read does not match github.** scope, so policy (and its session rules) are skipped
    const result = engine.evaluate(makeEnvelope('file.read'), [policy], ctx);
    // Fail-closed: no matching policy
    expect(result.decision.outcome).toBe('deny');
    expect(result.sessionViolation).toBeUndefined();
  });

  it('session check happens before per-rule evaluation (privilege escalation prevention)', () => {
    const policy: Policy = {
      id: 'escalation-policy',
      name: 'Anti-Escalation',
      version: '1.0.0',
      rules: [
        {
          id: 'allow-shell',
          effect: 'allow',
          condition: {
            field: 'action.type',
            operator: 'eq',
            value: 'shell.exec',
          },
        },
      ],
      sessionRules: {
        forbiddenSequences: [
          {
            id: 'read-exec',
            sequence: ['file.read', 'shell.exec'],
            effect: 'deny',
            reason: 'Privilege escalation detected',
          },
        ],
      },
    };

    const engine = new PolicyEngine();
    const ctx = makeSessionContext([makeSessionAction('file.read')]);

    // The per-rule check would allow shell.exec, but session rules deny it first
    const result = engine.evaluate(
      makeEnvelope('shell.exec'),
      [policy],
      ctx
    );
    expect(result.decision.outcome).toBe('deny');
    expect(result.sessionViolation?.type).toBe('forbidden_sequence');
    expect(result.sessionViolation?.reason).toContain(
      'Privilege escalation detected'
    );
  });

  it('risk threshold produces session violation with score details', () => {
    const policy: Policy = {
      id: 'risk-policy',
      name: 'Risk',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        sessionRiskThreshold: {
          maxScore: 10,
          riskWeights: {
            'shell.exec': 8,
            'file.read': 2,
          },
        },
      },
    };

    const engine = new PolicyEngine();
    const ctx = makeSessionContext([
      makeSessionAction('file.read'), // 2
    ]);

    // proposed: shell.exec = 8, total = 10, which is exactly at the threshold (not over)
    let result = engine.evaluate(makeEnvelope('shell.exec'), [policy], ctx);
    expect(result.decision.outcome).toBe('allow');

    // Now add one more file.read to history
    const ctx2 = makeSessionContext([
      makeSessionAction('file.read'), // 2
      makeSessionAction('file.read'), // 2
    ]);
    // proposed: shell.exec = 8, total = 12 > 10
    result = engine.evaluate(makeEnvelope('shell.exec'), [policy], ctx2);
    expect(result.decision.outcome).toBe('deny');
    expect(result.sessionViolation?.type).toBe('risk_threshold');
    expect(result.sessionViolation?.details?.cumulativeScore).toBe(12);
  });

  it('evaluationTimeMs is still reported with session violations', () => {
    const policy: Policy = {
      id: 'timing-policy',
      name: 'Timing',
      version: '1.0.0',
      rules: [{ id: 'allow-all', effect: 'allow' }],
      sessionRules: {
        maxActionsPerSession: 1,
      },
    };

    const engine = new PolicyEngine();
    const ctx = makeSessionContext([makeSessionAction('file.read')]);
    const result = engine.evaluate(makeEnvelope('file.read'), [policy], ctx);
    expect(result.evaluationTimeMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.evaluationTimeMs).toBe('number');
  });
});
