/**
 * Regression: an executor-role key must not be able to approve its own
 * require_approval receipt through PATCH /receipts/:id. Approval state is
 * owned solely by the admin-only /approvals routes (role + quorum + TOCTOU).
 * See routes/receipts.ts updateReceiptSchema.
 */
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb, db } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

const app = createApp();

const executorToken = 'test_executor_token';
const executorHash = crypto.createHash('sha256').update(executorToken).digest('hex');
const execHeaders = { Authorization: `Bearer ${executorToken}` };

async function seedApprovalReceipt(id: string) {
  await db.query(
    `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision, approval_status, created_at, updated_at)
     VALUES ($1, $2, 'pending', 'require_approval', $3::jsonb, $4::jsonb, 'pending', now(), now())`,
    [
      id,
      crypto.randomUUID(),
      { id: crypto.randomUUID(), action: { type: 'payment.send', resource: 'stripe://charge' } },
      { outcome: 'require_approval', evaluatedAt: new Date().toISOString() },
    ]
  );
}

describe('Executor cannot self-approve a require_approval receipt', () => {
  beforeAll(async () => {
    await initDb();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM receipts');
    await db.query('DELETE FROM api_keys');
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Executor', 'executor', executorHash]
    );
  });

  it('PATCH /receipts/:id with approval.status is ignored (receipt stays pending)', async () => {
    const id = crypto.randomUUID();
    await seedApprovalReceipt(id);

    const res = await app.request(`/receipts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...execHeaders },
      body: JSON.stringify({ approval: { status: 'approved' } }),
    });

    // The unknown approval field is stripped by the schema; the request may
    // succeed as a no-op, but the receipt must NOT become approved.
    expect([200, 400]).toContain(res.status);

    const { rows } = await db.query('SELECT approval_status FROM receipts WHERE id = $1', [id]);
    expect(rows[0].approval_status).toBe('pending');
  });

  it('executor still cannot reach the admin-only /approvals approve route', async () => {
    const id = crypto.randomUUID();
    await seedApprovalReceipt(id);

    const res = await app.request(`/approvals/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...execHeaders },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(403);
  });
});
