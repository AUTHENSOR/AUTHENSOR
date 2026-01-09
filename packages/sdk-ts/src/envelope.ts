/**
 * Envelope Factory
 *
 * Helper for creating action envelopes.
 */

import type { ActionEnvelope } from './types.js';

export interface CreateEnvelopeOptions {
  actionType: string;
  resource: string;
  operation?: ActionEnvelope['action']['operation'];
  parameters?: Record<string, unknown>;
  constraints?: ActionEnvelope['constraints'];
  principal: {
    type: ActionEnvelope['principal']['type'];
    id: string;
    name?: string;
    attributes?: Record<string, unknown>;
  };
  context?: Partial<ActionEnvelope['context']>;
}

/**
 * Create an action envelope with sensible defaults
 */
export function createEnvelope(options: CreateEnvelopeOptions): ActionEnvelope {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: {
      type: options.actionType,
      resource: options.resource,
      operation: options.operation,
      parameters: options.parameters,
    },
    principal: options.principal,
    context: {
      environment: 'development',
      ...options.context,
    },
    constraints: options.constraints,
  };
}
