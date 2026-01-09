import { describe, expect, it } from 'vitest';
import { PolicyEngine } from '../src/policy-engine.js';
import type { ActionEnvelope, Policy } from '../src/types.js';

const envelope: ActionEnvelope = {
  id: '22222222-2222-2222-2222-222222222222',
  timestamp: new Date().toISOString(),
  action: {
    type: 'github.issues.create',
    resource: 'github://repos/authensor/authensor/issues',
  },
  principal: { type: 'agent', id: 'agent-42' },
  context: { environment: 'development' },
};

describe('PolicyEngine', () => {
  it('prefers higher priority policies', () => {
    const policies: Policy[] = [
      {
        id: 'low',
        name: 'Allow low',
        version: '1.0.0',
        priority: 1,
        rules: [{ id: 'allow', effect: 'allow' }],
      },
      {
        id: 'high',
        name: 'Deny high',
        version: '1.0.0',
        priority: 10,
        rules: [{ id: 'deny', effect: 'deny' }],
      },
    ];

    const engine = new PolicyEngine();
    const result = engine.evaluate(envelope, policies);
    expect(result.decision.outcome).toBe('deny');
    expect(result.matchedPolicy?.id).toBe('high');
  });

  it('honors glob matches on actionTypes', () => {
    const policies: Policy[] = [
      {
        id: 'glob-allow',
        name: 'Glob allow',
        version: '1.0.0',
        rules: [{ id: 'allow', effect: 'allow' }],
        scope: { actionTypes: ['github.**'] },
      },
    ];
    const engine = new PolicyEngine();
    const result = engine.evaluate(envelope, policies);
    expect(result.decision.outcome).toBe('allow');
  });
});
