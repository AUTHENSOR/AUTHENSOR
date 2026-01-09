import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';

const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb } = await import('../src/db.js');
const { createReceipt, claimReceipt, updateReceipt } = await import(
  '../src/services/receipt-service.js'
);

const decisionAllow = { outcome: 'allow', evaluatedAt: new Date().toISOString() };

describe('receipt claim flow', () => {
  beforeAll(async () => {
    await initDb();
  });

  it('only one claim succeeds', async () => {
    const receipt = await createReceipt({
      envelopeId: '00000000-0000-0000-0000-000000000001',
      decision: decisionAllow as any,
      envelope: { id: '1', timestamp: new Date().toISOString(), action: { type: 'x', resource: 'y' }, principal: { type: 'agent', id: 'p' }, context: {} } as any,
    });

    const first = await claimReceipt(receipt.id);
    expect(first.status).toBe('claimed');

    const second = await claimReceipt(receipt.id);
    expect(second.status).toBe('already_claimed');
  });

  it('allows re-claim after expiry', async () => {
    process.env.AUTHENSOR_CLAIM_TTL_SECONDS = '0';
    const receipt = await createReceipt({
      envelopeId: '00000000-0000-0000-0000-000000000004',
      decision: decisionAllow as any,
      envelope: { id: '4', timestamp: new Date().toISOString(), action: { type: 'x', resource: 'y' }, principal: { type: 'agent', id: 'p' }, context: {} } as any,
    });
    const first = await claimReceipt(receipt.id);
    expect(first.status).toBe('claimed');
    const second = await claimReceipt(receipt.id);
    expect(second.status).toBe('claimed');
  });

  it('rejects finalize without claim', async () => {
    const receipt = await createReceipt({
      envelopeId: '00000000-0000-0000-0000-000000000002',
      decision: decisionAllow as any,
      envelope: { id: '2', timestamp: new Date().toISOString(), action: { type: 'x', resource: 'y' }, principal: { type: 'agent', id: 'p' }, context: {} } as any,
    });

    await expect(
      updateReceipt(receipt.id, {
        status: 'executed',
        execution: { completedAt: new Date().toISOString() } as any,
      })
    ).rejects.toThrow();
  });

  it('blocks claim when approval pending', async () => {
    const receipt = await createReceipt({
      envelopeId: '00000000-0000-0000-0000-000000000003',
      decision: { outcome: 'require_approval', evaluatedAt: new Date().toISOString() } as any,
      envelope: { id: '3', timestamp: new Date().toISOString(), action: { type: 'x', resource: 'y' }, principal: { type: 'agent', id: 'p' }, context: {} } as any,
    });

    const claim = await claimReceipt(receipt.id);
    expect(claim.status).toBe('not_executable');
  });
});
