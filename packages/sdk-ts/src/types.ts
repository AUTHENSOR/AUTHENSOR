/**
 * SDK Types (generated-first from JSON Schemas)
 */
import type { ActionEnvelope } from './generated/action-envelope.js';
import type { ActionReceipt } from './generated/action-receipt.js';
import type { Policy } from './generated/policy.js';

export type { ActionEnvelope, ActionReceipt, Policy };

export type Decision = ActionReceipt['decision'];
export type DecisionOutcome = Decision['outcome'];

export interface ExecuteOptions {
  operation?: ActionEnvelope['action']['operation'];
  parameters?: Record<string, unknown>;
  constraints?: ActionEnvelope['constraints'];
  context?: Partial<ActionEnvelope['context']>;
}

export interface ExecuteResult<T> {
  result: T;
  receiptId: string;
  decision: Decision;
}

export interface EvaluateResponse {
  receiptId: string;
  receiptUrl?: string;
  receiptApiUrl?: string;
  receiptLink?: string;
  receiptApiLink?: string;
  decision: Decision;
  evaluationTimeMs: number;
}
