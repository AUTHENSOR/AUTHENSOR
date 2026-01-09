import { beforeAll, describe, expect, it, vi } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb, db } = await import('../src/db.js');
const { createApp } = await import('../src/app.js');

const app = createApp();

// Test admin token and auth header
const adminToken = 'test_admin_token';
const adminKeyHash = crypto.createHash('sha256').update(adminToken).digest('hex');
const authHeaders = { Authorization: `Bearer ${adminToken}` };

const uuidWithSuffix = (prefix: string, i: number) =>
  `${prefix}-${(1_000_000_000_000 + i).toString().slice(1)}`;

describe('metrics summary', () => {
  beforeAll(async () => {
    await initDb();
    // Create admin key for auth
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Test Admin', 'admin', adminKeyHash]
    );
    // Seed receipts: 25 deny, 5 allow, 5 require_approval, 6 config_blocked failures
    for (let i = 0; i < 25; i++) {
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, envelope, decision, created_at, updated_at)
         VALUES ($1,$2,'failed','deny','http.request','a-deny','{}',$3, now(), now())`,
        [
          uuidWithSuffix('00000000-0000-0000-0000', 10 + i),
          uuidWithSuffix('10000000-0000-0000-0000', 10 + i),
          JSON.stringify({ outcome: 'deny' }),
        ]
      );
    }
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, envelope, decision, created_at, updated_at)
         VALUES ($1,$2,'executed','allow','http.request','a-allow','{}',$3, now(), now())`,
        [
          uuidWithSuffix('20000000-0000-0000-0000', i),
          uuidWithSuffix('21000000-0000-0000-0000', i),
          JSON.stringify({ outcome: 'allow' }),
        ]
      );
    }
    for (let i = 0; i < 5; i++) {
      const approved = i < 3;
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, approval_status, envelope, decision, created_at, updated_at)
         VALUES ($1,$2,$3,'require_approval','stripe.charge','a-approval',$4,'{}',$5, now(), now())`,
        [
          uuidWithSuffix('30000000-0000-0000-0000', i),
          uuidWithSuffix('31000000-0000-0000-0000', i),
          approved ? 'pending' : 'pending',
          approved ? 'approved' : 'pending',
          JSON.stringify({ outcome: 'require_approval' }),
        ]
      );
    }
    for (let i = 0; i < 6; i++) {
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, envelope, decision, error, created_at, updated_at)
         VALUES ($1,$2,'failed','allow','stripe.charge','a-config','{}',$3,$4, now(), now())`,
        [
          uuidWithSuffix('40000000-0000-0000-0000', i),
          uuidWithSuffix('41000000-0000-0000-0000', i),
          JSON.stringify({ outcome: 'allow' }),
          JSON.stringify({ code: 'CONFIG_BLOCKED' }),
        ]
      );
    }
    // Seed claim events: attempts=10, conflicts=5, expired_reclaimed=4
    for (let i = 0; i < 10; i++) {
      await db.query(
        `INSERT INTO claim_events (id, receipt_id, event, created_at)
         VALUES ($1,$2,'attempt', now())`,
        [uuidWithSuffix('50000000-0000-0000-0000', i), uuidWithSuffix('00000000-0000-0000-0000', (i % 5) + 10)]
      );
    }
    for (let i = 0; i < 5; i++) {
      await db.query(
        `INSERT INTO claim_events (id, receipt_id, event, created_at)
         VALUES ($1,$2,'conflict', now())`,
        [uuidWithSuffix('60000000-0000-0000-0000', i), uuidWithSuffix('00000000-0000-0000-0000', (i % 5) + 10)]
      );
    }
    for (let i = 0; i < 4; i++) {
      await db.query(
        `INSERT INTO claim_events (id, receipt_id, event, created_at)
         VALUES ($1,$2,'expired_reclaimed', now())`,
        [uuidWithSuffix('70000000-0000-0000-0000', i), uuidWithSuffix('00000000-0000-0000-0000', (i % 5) + 10)]
      );
    }
  });

  it('returns grouped counts', async () => {
    const resp = await app.request('/metrics/summary?window=24h', { headers: authHeaders });
    expect(resp.status).toBe(200);
    const body = await resp.json();
    expect(body.window).toBe('24h');
    expect(body.scope.mode).toBe('global');
    expect(body.receipts.by_status.executed).toBe(5);
    expect(body.receipts.by_decision_outcome.deny).toBe(25);
    expect(body.receipts.by_decision_outcome.require_approval).toBe(5);
    expect(body.claims.conflicts).toBe(5);
    expect(body.claims.attempts).toBe(10);
    expect(body.claims.expired_reclaimed).toBe(4);
    expect(body.ratios.deny_rate).toBeGreaterThan(0.5);
    expect(body.ratios.approval_grant_rate).toBeGreaterThan(0.0);
    expect(Array.isArray(body.insights)).toBe(true);
    const insightIds = body.insights.map((i: any) => i.id);
    expect(insightIds).toContain('deny_spike');
    expect(insightIds).toContain('config_blocked_spike');
    expect(insightIds).toContain('claim_conflicts_spike');
    expect(insightIds).toContain('expired_reclaimed_spike');
    expect(body.generated_at).toBeTruthy();
  });
});
