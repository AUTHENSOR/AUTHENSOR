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

export interface ApprovalConfig {
  requiredApprovals?: number;
  approvers?: Array<{ type?: string; id?: string }>;
  expiresIn?: string;
}

export interface CreateReceiptInput {
  envelopeId: string;
  decision: Decision;
  envelope: ActionEnvelope;
  approvalConfig?: ApprovalConfig;
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
  receipt_hash: string | null;
  prev_receipt_hash: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Compute a SHA-256 hash of a receipt's core immutable fields.
 * This hash is stored with the receipt and used to verify chain integrity.
 */
function computeReceiptHash(fields: {
  id: string;
  envelopeId: string;
  timestamp: string;
  decisionOutcome: string;
  prevReceiptHash: string | null;
}): string {
  const payload = JSON.stringify({
    id: fields.id,
    envelopeId: fields.envelopeId,
    timestamp: fields.timestamp,
    decisionOutcome: fields.decisionOutcome,
    prevReceiptHash: fields.prevReceiptHash ?? '',
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Get the hash of the most recent receipt to chain from.
 */
async function getLatestReceiptHash(): Promise<string | null> {
  const { rows } = await db.query<{ receipt_hash: string | null }>(
    'SELECT receipt_hash FROM receipts WHERE receipt_hash IS NOT NULL ORDER BY created_at DESC LIMIT 1'
  );
  return rows[0]?.receipt_hash ?? null;
}

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
    receiptHash: row.receipt_hash ?? undefined,
    prevReceiptHash: row.prev_receipt_hash ?? undefined,
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

  const requiredApprovals = input.approvalConfig?.requiredApprovals ?? 1;
  const approval =
    approvalStatus !== null
      ? ({
          status: approvalStatus,
          requestedAt: new Date().toISOString(),
          requiredApprovals,
        } as ActionReceipt['approval'])
      : undefined;

  // Hash chain: link this receipt to the previous one
  const prevHash = await getLatestReceiptHash();
  const now = new Date().toISOString();
  const receiptHash = computeReceiptHash({
    id,
    envelopeId: input.envelopeId,
    timestamp: now,
    decisionOutcome: input.decision.outcome,
    prevReceiptHash: prevHash,
  });

  const { rows } = await db.query<ReceiptRow>(
    `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, envelope, decision, approval, approval_status, execution_attempts, receipt_hash, prev_receipt_hash, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10, 0, $11, $12, now(), now())
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
      receiptHash,
      prevHash,
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
  // Atomic claim: only succeeds if no unexpired claim exists
  // This prevents race conditions when multiple executors try to claim simultaneously
  const { rows: updated } = await db.query<ReceiptRow>(
    `UPDATE receipts
     SET claim_id = $2,
         claimed_at = now(),
         claim_expires_at = $3,
         updated_at = now()
     WHERE id = $1
       AND status = 'pending'
       AND (claim_id IS NULL OR claim_expires_at < now())
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
         claim_expires_at = CASE WHEN $2 IN ('executed','failed') THEN NULL ELSE claim_expires_at END,
         execution_attempts = CASE WHEN $2 IN ('executed','failed') THEN execution_attempts + 1 ELSE execution_attempts END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [id, nextStatus, approval ?? null, nextApprovalStatus ?? null, execution ?? null, result ?? null, error ?? null]
  );

  return rows[0] ? mapRow(rows[0]) : undefined;
}

/**
 * Verify the integrity of the receipt hash chain.
 * Returns a summary of the verification results.
 */
export async function verifyReceiptChain(options?: {
  limit?: number;
}): Promise<{
  verified: number;
  broken: number;
  unchained: number;
  firstBrokenId?: string;
}> {
  const limit = options?.limit ?? 1000;
  const { rows } = await db.query<ReceiptRow>(
    'SELECT * FROM receipts ORDER BY created_at ASC LIMIT $1',
    [limit]
  );

  let verified = 0;
  let broken = 0;
  let unchained = 0;
  let firstBrokenId: string | undefined;

  const hashMap = new Map<string, ReceiptRow>();
  for (const row of rows) {
    if (row.receipt_hash) hashMap.set(row.receipt_hash, row);
  }

  for (const row of rows) {
    if (!row.receipt_hash) {
      unchained++;
      continue;
    }

    // Verify this receipt's hash is correct
    const expectedHash = computeReceiptHash({
      id: row.id,
      envelopeId: row.envelope_id,
      timestamp: row.created_at,
      decisionOutcome: row.decision_outcome,
      prevReceiptHash: row.prev_receipt_hash,
    });

    if (expectedHash !== row.receipt_hash) {
      broken++;
      if (!firstBrokenId) firstBrokenId = row.id;
      continue;
    }

    // Verify the prev hash points to a real receipt (unless it's the first)
    if (row.prev_receipt_hash && !hashMap.has(row.prev_receipt_hash)) {
      broken++;
      if (!firstBrokenId) firstBrokenId = row.id;
      continue;
    }

    verified++;
  }

  return { verified, broken, unchained, firstBrokenId };
}

// --- Multi-party approval ---

type ApprovalResponseRow = {
  id: string;
  receipt_id: string;
  responder_type: string | null;
  responder_id: string;
  responder_name: string | null;
  decision: 'approve' | 'reject';
  comment: string | null;
  created_at: string;
};

export interface ApprovalResponseInput {
  responderType?: string;
  responderId: string;
  responderName?: string;
  decision: 'approve' | 'reject';
  comment?: string;
}

export async function getApprovalResponses(receiptId: string) {
  const { rows } = await db.query<ApprovalResponseRow>(
    'SELECT * FROM approval_responses WHERE receipt_id = $1 ORDER BY created_at ASC',
    [receiptId]
  );
  return rows.map((r) => ({
    id: r.id,
    responderType: r.responder_type,
    responderId: r.responder_id,
    responderName: r.responder_name,
    decision: r.decision,
    comment: r.comment,
    respondedAt: r.created_at,
  }));
}

/**
 * Add an individual approval response and check quorum.
 * Returns the updated receipt and whether quorum has been reached.
 */
export async function addApprovalResponse(
  receiptId: string,
  input: ApprovalResponseInput
): Promise<{
  receipt: ActionReceipt;
  response: ReturnType<typeof mapApprovalResponse>;
  quorumReached: boolean;
  approveCount: number;
  rejectCount: number;
  requiredApprovals: number;
}> {
  const receipt = await getReceiptById(receiptId);
  if (!receipt) throw new Error('Receipt not found');
  if (receipt.decision.outcome !== 'require_approval') {
    throw new Error('Receipt does not require approval');
  }
  if (receipt.approval?.status === 'approved' || receipt.approval?.status === 'rejected' || receipt.approval?.status === 'expired') {
    throw new Error(`Approval already finalized as ${receipt.approval.status}`);
  }

  const responseId = crypto.randomUUID();

  // Insert (unique constraint on receipt_id + responder_id prevents duplicates)
  await db.query(
    `INSERT INTO approval_responses (id, receipt_id, responder_type, responder_id, responder_name, decision, comment)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [responseId, receiptId, input.responderType ?? null, input.responderId, input.responderName ?? null, input.decision, input.comment ?? null]
  );

  // Fetch all responses to check quorum
  const responses = await getApprovalResponses(receiptId);
  const approveCount = responses.filter((r) => r.decision === 'approve').length;
  const rejectCount = responses.filter((r) => r.decision === 'reject').length;
  const requiredApprovals = (receipt.approval as any)?.requiredApprovals ?? 1;

  let quorumReached = false;
  let updatedReceipt = receipt;

  if (rejectCount > 0) {
    // Any rejection immediately rejects the approval
    updatedReceipt = (await updateReceipt(receiptId, {
      status: 'cancelled',
      approval: {
        status: 'rejected',
        respondedAt: new Date().toISOString(),
        respondedBy: { type: input.responderType, id: input.responderId, name: input.responderName },
        comment: input.comment,
      },
    }))!;
  } else if (approveCount >= requiredApprovals) {
    // Quorum reached — mark as approved
    quorumReached = true;
    updatedReceipt = (await updateReceipt(receiptId, {
      approval: {
        status: 'approved',
        respondedAt: new Date().toISOString(),
        respondedBy: { type: input.responderType, id: input.responderId, name: input.responderName },
      },
    }))!;
  }

  const newResponse = responses.find((r) => r.id === responseId)!;

  return {
    receipt: updatedReceipt,
    response: newResponse,
    quorumReached,
    approveCount,
    rejectCount,
    requiredApprovals,
  };
}

function mapApprovalResponse(row: ApprovalResponseRow) {
  return {
    id: row.id,
    responderType: row.responder_type,
    responderId: row.responder_id,
    responderName: row.responder_name,
    decision: row.decision,
    comment: row.comment,
    respondedAt: row.created_at,
  };
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
