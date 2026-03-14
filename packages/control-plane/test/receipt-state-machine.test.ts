import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';
import type { ActionReceipt, Decision } from '@authensor/engine';

// Mock pg with an in-memory adapter before importing app/db
const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { db, initDb } = await import('../src/db.js');
const { updateReceipt, claimReceipt } = await import('../src/services/receipt-service.js');

// Lightweight helper to seed a receipt row directly
async function seedReceipt(receipt: Partial<ActionReceipt> & { id: string; decision: Decision }) {
  await db.query(
    `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, now(), now())`,
    [
      receipt.id,
      receipt.envelopeId ?? '00000000-0000-0000-0000-000000000000',
      receipt.status ?? 'pending',
      receipt.decision.outcome,
      receipt.envelope ?? {},
      receipt.decision,
    ]
  );
}

describe('receipt state machine', () => {
  beforeAll(async () => {
    await initDb();
    await db.query('DELETE FROM receipts');
  });

  const denyDecision: Decision = { outcome: 'deny', evaluatedAt: new Date().toISOString() };
  const approvalDecision: Decision = {
    outcome: 'require_approval',
    evaluatedAt: new Date().toISOString(),
  };
  const allowDecision: Decision = { outcome: 'allow', evaluatedAt: new Date().toISOString() };

  it('blocks executing denied receipts', async () => {
    const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    await seedReceipt({ id, decision: denyDecision });
    await expect(updateReceipt(id, { status: 'executed' })).rejects.toThrow();
  });

  it('requires approval before execution', async () => {
    const id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    await seedReceipt({ id, decision: approvalDecision });
    await expect(
      updateReceipt(id, { status: 'executed', execution: { completedAt: new Date().toISOString() } })
    ).rejects.toThrow();
  });

  it('allows execution after approval', async () => {
    const id = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    await seedReceipt({ id, decision: approvalDecision });
    await updateReceipt(id, {
      approval: { status: 'approved', respondedAt: new Date().toISOString() },
    });
    const claim = await claimReceipt(id);
    const claimId = claim.status === 'claimed' ? claim.claimId : undefined;
    const updated = await updateReceipt(id, {
      status: 'executed',
      execution: { completedAt: new Date().toISOString(), result: { ok: true } },
      claimId,
    });
    expect(updated?.status).toBe('executed');
  });

  it('reject cancels and is final', async () => {
    const id = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
    await seedReceipt({ id, decision: approvalDecision });
    await updateReceipt(id, {
      status: 'cancelled',
      approval: { status: 'rejected', respondedAt: new Date().toISOString() },
    });
    await expect(updateReceipt(id, { status: 'executed' })).rejects.toThrow();
  });

  it('completed receipts are final', async () => {
    const id = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
    await seedReceipt({ id, decision: allowDecision, status: 'executed' });
    await expect(updateReceipt(id, { status: 'failed' })).rejects.toThrow();
  });
});
