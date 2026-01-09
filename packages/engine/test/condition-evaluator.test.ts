import { describe, expect, it } from 'vitest';
import { evaluateCondition } from '../src/condition-evaluator.js';
import type { ActionEnvelope, PolicyRule } from '../src/types.js';

const baseEnvelope: ActionEnvelope = {
  id: '11111111-1111-1111-1111-111111111111',
  timestamp: new Date().toISOString(),
  action: {
    type: 'stripe.charges.create',
    resource: 'stripe://customers/cus_123/charges',
    parameters: { amount: 100 },
  },
  principal: {
    type: 'agent',
    id: 'agent-1',
  },
  context: {},
};

describe('condition evaluator', () => {
  it('supports AND/OR/NOT trees', () => {
    const condition: NonNullable<PolicyRule['condition']> = {
      all: [
        { field: 'action.type', operator: 'contains', value: 'stripe' },
        {
          any: [
            { field: 'principal.type', operator: 'eq', value: 'agent' },
            { field: 'principal.type', operator: 'eq', value: 'user' },
          ],
        },
        {
          not: { field: 'action.parameters.amount', operator: 'gt', value: 1000 },
        },
      ],
    };

    expect(evaluateCondition(condition, baseEnvelope)).toBe(true);
  });

  it('handles comparison operators', () => {
    expect(
      evaluateCondition(
        { field: 'action.parameters.amount', operator: 'gte', value: 100 },
        baseEnvelope
      )
    ).toBe(true);

    expect(
      evaluateCondition(
        { field: 'action.parameters.amount', operator: 'lt', value: 50 },
        baseEnvelope
      )
    ).toBe(false);

    expect(
      evaluateCondition(
        { field: 'action.type', operator: 'matches', value: '^stripe\\.charges\\..*$' },
        baseEnvelope
      )
    ).toBe(true);
  });
});
