/**
 * Receipt Service
 *
 * Handles receipt CRUD operations backed by Postgres.
 */

import crypto from 'crypto';
import type { ActionReceipt, ActionEnvelope, Decision } from '@authensor/engine';
import { db } from '../db.js';
import { checkToolExecution } from './controls-service.js';
import { truncateResult, truncateError } from '../middleware/body_limit.js';

type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface CreateReceiptInput {
  envelopeId: string;
  decision: Decision;
  envelope: ActionEnvelope;
}

export interface GetReceiptsOptions {
  limit?: number;
  offset?: number;
  status?: string;
  principalId?: string;
  actorId?: string;
  toolName?: string;
  decisionOutcome?: string;
}

export interface UpdateReceiptInput {
  status?: ActionReceipt['status'];
  execution?: ActionReceipt['execution'];
  approval?: ActionReceipt['approval'];
  claimId?: string;
}

type ReceiptRow = {
  id: string;
  envelope_id: string;
  status: string;
  decision_outcome: string;
  tool_name: string | null;
  actor_id: string | null;
  envelope: unknown;
  decision: unknown;
  approval: unknown;
  approval_status: string | null;
  execution: unknown;
  result: unknown;
  error: unknown;
  claim_id: string | null;
  claimed_at: string | null;
  claim_expires_at: string | null;
  execution_attempts: number;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ReceiptRow): ActionReceipt {
  const execution = (row.execution as ActionReceipt['execution']) ?? undefined;
  const result = (row.result as Record<string, unknown>) ?? execution?.result;
  const error = (row.error as Record<string, unknown>) ?? execution?.error;
  const approval = (row.approval as ActionReceipt['approval']) ?? undefined;
  const approvalStatus = row.approval_status as ApprovalStatus | undefined;

  return {
    id: row.id,
    envelopeId: row.envelope_id,
    timestamp: row.created_at,
    decision: row.decision as Decision,
    status: row.status as ActionReceipt['status'],
    approval:
      approval ??
      (approvalStatus
        ? {
            status: approvalStatus,
          }
        : undefined),
    execution: execution
      ? {
          ...execution,
          result,
          error,
        }
      : undefined,
    envelope: row.envelope as ActionEnvelope,
    metadata: {
      claimId: row.claim_id ?? undefined,
      claimedAt: row.claimed_at ?? undefined,
      claimExpiresAt: row.claim_expires_at ?? undefined,
      executionAttempts: row.execution_attempts,
    },
  };
}

export async function createReceipt(input: CreateReceiptInput): Promise<ActionReceipt> {
  const id = crypto.randomUUID();
  const status: ActionReceipt['status'] =
    input.decision.outcome === 'allow' || input.decision.outcome === 'require_approval'
      ? 'pending'
      : 'skipped';
  const approvalStatus =
    input.decision.outcome === 'require_approval' ? ('pending' as const) : null;

  const approval =
    approvalStatus !== null
      ? ({
          status: approvalStatus,
          requestedAt: new Date().toISOString(),
        } satisfies ActionReceipt['approval'])
      : undefined;

  const { rows } = await db.query<ReceiptRow>(
    `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, envelope, decision, approval, approval_status, execution_attempts, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, 0, now(), now())
     RETURNING *`,
    [
      id,
      input.envelopeId,
      status,
      input.decision.outcome,
      input.envelope.action?.type ?? null,
      input.envelope.principal?.id ?? null,
      input.envelope,
      input.decision,
      approval ?? null,
      approvalStatus,
    ]
  );

  return mapRow(rows[0]);
}

export async function getReceipts(options: GetReceiptsOptions): Promise<ActionReceipt[]> {
  const limit = options.limit ?? 50;
  const offset = options.offset ?? 0;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    params.push(options.status);
    conditions.push(`status = $${params.length}`);
  }

  if (options.principalId) {
    params.push(options.principalId);
    conditions.push(`actor_id = $${params.length}`);
  }

  if (options.actorId) {
    params.push(options.actorId);
    conditions.push(`actor_id = $${params.length}`);
  }

  if (options.toolName) {
    params.push(options.toolName);
    conditions.push(`tool_name = $${params.length}`);
  }

  if (options.decisionOutcome) {
    params.push(options.decisionOutcome);
    conditions.push(`decision_outcome = $${params.length}`);
  }

  params.push(limit);
  params.push(offset);

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await db.query<ReceiptRow>(
    `SELECT *
     FROM receipts
     ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1}
     OFFSET $${params.length}`,
    params
  );

  return rows.map(mapRow);
}

export async function getReceiptById(id: string): Promise<ActionReceipt | undefined> {
  const { rows } = await db.query<ReceiptRow>('SELECT * FROM receipts WHERE id = $1', [id]);
  return rows[0] ? mapRow(rows[0]) : undefined;
}

export async function claimReceipt(
  id: string
): Promise<
  | { status: 'claimed'; claimId: string; receipt: ActionReceipt }
  | { status: 'already_executed'; receipt: ActionReceipt }
  | { status: 'not_executable'; reason: string; code?: string; claimExpiresAt?: string }
  | { status: 'already_claimed'; retryAfterSeconds?: number; claimExpiresAt?: string }
> {
  await db.query('INSERT INTO claim_events (id, receipt_id, event) VALUES ($1, $2, $3)', [
    crypto.randomUUID(),
    id,
    'attempt',
  ]);

  const { rows } = await db.query<ReceiptRow>('SELECT * FROM receipts WHERE id = $1', [id]);
  if (rows.length === 0) {
    return { status: 'not_executable', reason: 'Receipt not found' };
  }
  const row = rows[0];
  const receipt = mapRow(row);

  // Check controls (kill switch + per-tool disables)
  const controlsCheck = await checkToolExecution(row.tool_name);
  if (!controlsCheck.allowed) {
    return {
      status: 'not_executable',
      reason: controlsCheck.message,
      code: controlsCheck.code,
    };
  }

  if (receipt.status === 'executed' || receipt.status === 'failed') {
    return { status: 'already_executed', receipt };
  }

  if (
    receipt.decision.outcome === 'deny' ||
    receipt.decision.outcome === 'rate_limited' ||
    receipt.status === 'skipped' ||
    receipt.status === 'cancelled'
  ) {
    return { status: 'not_executable', reason: 'Receipt is not executable' };
  }

  if (
    receipt.decision.outcome === 'require_approval' &&
    receipt.approval?.status !== 'approved'
  ) {
    return { status: 'not_executable', reason: 'Approval required' };
  }

  const ttlSeconds = parseInt(process.env.AUTHENSOR_CLAIM_TTL_SECONDS || '30', 10);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

  // If there is a non-expired claim, block
  if (receipt.metadata?.claimId && receipt.metadata.claimExpiresAt) {
    const expires = new Date(receipt.metadata.claimExpiresAt as string);
    if (expires > now) {
      const retryAfter = Math.max(1, Math.ceil((expires.getTime() - now.getTime()) / 1000));
      await db.query('INSERT INTO claim_events (id, receipt_id, event) VALUES ($1, $2, $3)', [
        crypto.randomUUID(),
        id,
        'conflict',
      ]);
      return {
        status: 'already_claimed',
        retryAfterSeconds: retryAfter,
        claimExpiresAt: expires.toISOString(),
      };
    }
  }

  const claimId = crypto.randomUUID();
  const { rows: updated } = await db.query<ReceiptRow>(
    `UPDATE receipts
     SET claim_id = $2,
         claimed_at = now(),
         claim_expires_at = $3,
         updated_at = now()
     WHERE id = $1
       AND status = 'pending'
     RETURNING *`,
    [id, claimId, expiresAt.toISOString()]
  );

  if (updated.length === 0) {
    // If existing claim expired, consider this a reclaimed expired claim
    if (receipt.metadata?.claimExpiresAt && new Date(receipt.metadata.claimExpiresAt as string) <= now) {
      await db.query('INSERT INTO claim_events (id, receipt_id, event) VALUES ($1, $2, $3)', [
        crypto.randomUUID(),
        id,
        'expired_reclaimed',
      ]);
    }
    return { status: 'already_claimed', retryAfterSeconds: 5 };
  }

  return { status: 'claimed', claimId, receipt: mapRow(updated[0]) };
}

export async function updateReceipt(
  id: string,
  updates: UpdateReceiptInput
): Promise<ActionReceipt | undefined> {
  const existing = await getReceiptById(id);
  if (!existing) return undefined;

  const nextStatus = updates.status ?? existing.status;
  const nextApprovalStatus = (
    (updates.approval?.status as ApprovalStatus | undefined) ??
    (existing.approval?.status as ApprovalStatus | undefined) ??
    (existing.decision.outcome === 'require_approval' ? 'pending' : undefined)
  ) as ApprovalStatus | undefined;

  const transitionError = validateTransition(existing, nextStatus, nextApprovalStatus);
  if (transitionError) {
    throw new Error(transitionError);
  }

  if (
    (nextStatus === 'executed' || nextStatus === 'failed') &&
    (!updates.claimId || updates.claimId !== existing.metadata?.claimId)
  ) {
    throw new Error('Valid claimId is required to finalize execution');
  }

  const execution = updates.execution
    ? { ...existing.execution, ...updates.execution }
    : existing.execution;

  const approval = updates.approval
    ? { ...existing.approval, ...updates.approval }
    : existing.approval;

  // Apply hard caps to result/error to prevent storage overflow
  const result = truncateResult(execution?.result as Record<string, unknown> | null | undefined);
  const error = truncateError(execution?.error as Record<string, unknown> | null | undefined);

  const { rows } = await db.query<ReceiptRow>(
    `UPDATE receipts
     SET status = $2,
         approval = $3::jsonb,
         approval_status = $4,
         execution = $5::jsonb,
         result = $6::jsonb,
         error = $7::jsonb,
         claim_id = CASE WHEN $2 IN ('executed','failed') THEN NULL ELSE claim_id END,
         claimed_at = CASE WHEN $2 IN ('executed','failed') THEN NULL ELSE claimed_at END,
         execution_attempts = CASE WHEN $2 IN ('executed','failed') THEN execution_attempts + 1 ELSE execution_attempts END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, nextStatus, approval ?? null, nextApprovalStatus ?? null, execution ?? null, result ?? null, error ?? null]
  );

  return rows[0] ? mapRow(rows[0]) : undefined;
}

function validateTransition(
  existing: ActionReceipt,
  nextStatus: ActionReceipt['status'],
  nextApprovalStatus?: ApprovalStatus
): string | null {
  const outcome = existing.decision.outcome;
  const currentStatus = existing.status;

  if (outcome === 'deny' || outcome === 'rate_limited') {
    if (nextStatus !== currentStatus) {
      return 'Receipt is immutable because the decision was not allowed.';
    }
    return null;
  }

  if (currentStatus === 'skipped') {
    if (nextStatus !== currentStatus) return 'Skipped receipts cannot transition.';
    return null;
  }

  const finalizedStatuses: ActionReceipt['status'][] = ['executed', 'failed', 'cancelled'];
  if (finalizedStatuses.includes(currentStatus)) {
    if (nextStatus !== currentStatus) return 'Completed receipts cannot transition.';
    return null;
  }

  if (outcome === 'require_approval') {
    if (
      nextApprovalStatus &&
      !['pending', 'approved', 'rejected', 'expired'].includes(nextApprovalStatus)
    ) {
      return 'Invalid approval status';
    }

    if (
      nextStatus === 'executed' ||
      nextStatus === 'failed'
    ) {
      if (nextApprovalStatus !== 'approved') {
        return 'Approval is required before executing this action.';
      }
    }

    if (currentStatus === 'pending') {
      const allowedNext: ActionReceipt['status'][] = ['pending', 'cancelled', 'executed', 'failed'];
      if (!allowedNext.includes(nextStatus)) {
        return `Invalid status transition from ${currentStatus} to ${nextStatus}`;
      }
    }

    if (nextApprovalStatus === 'rejected' || nextApprovalStatus === 'expired') {
      if (nextStatus !== 'cancelled') {
        return 'Rejected/expired approvals must cancel the receipt.';
      }
    }
    return null;
  }

  // outcome === 'allow'
  if (currentStatus === 'pending') {
    const allowedNext: ActionReceipt['status'][] = ['pending', 'executed', 'failed', 'cancelled'];
    if (!allowedNext.includes(nextStatus)) {
      return `Invalid status transition from ${currentStatus} to ${nextStatus}`;
    }
  }

  return null;
}
