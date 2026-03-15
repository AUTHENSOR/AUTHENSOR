/**
 * Compliance Route Tests
 *
 * Tests for GET /v1/compliance/eu-ai-act, /owasp-agentic, /export, /summary
 * All endpoints require admin role.
 */

import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import { newDb } from 'pg-mem';
import crypto from 'crypto';

// Mock pg with an in-memory adapter before importing app/db
const mem = newDb();
const pg = mem.adapters.createPg();
vi.mock('pg', () => pg);

const { initDb, db } = await import('../db.js');
const { createApp } = await import('../app.js');

const app = createApp();

// Shared admin token
const adminToken = 'authensor_compliance_admin_token';
const adminKeyHash = crypto.createHash('sha256').update(adminToken).digest('hex');
const adminHeaders = { Authorization: `Bearer ${adminToken}` };

// Shared non-admin token
const ingestToken = 'authensor_compliance_ingest_token';
const ingestKeyHash = crypto.createHash('sha256').update(ingestToken).digest('hex');
const ingestHeaders = { Authorization: `Bearer ${ingestToken}` };

describe('Compliance Routes', () => {
  beforeAll(async () => {
    process.env.AUTHENSOR_ALLOW_FALLBACK_POLICY = 'true';
    await initDb();
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Compliance Admin', 'admin', adminKeyHash]
    );
    await db.query(
      `INSERT INTO api_keys (id, name, role, key_hash) VALUES ($1, $2, $3, $4)`,
      [crypto.randomUUID(), 'Compliance Ingest', 'ingest', ingestKeyHash]
    );
  });

  beforeEach(async () => {
    // Clean mutable data between tests (keep api_keys)
    await db.query('DELETE FROM receipts');
    await db.query('DELETE FROM active_policies');
  });

  // ---------------------------------------------------------------------------
  // Auth enforcement
  // ---------------------------------------------------------------------------

  describe('Role enforcement — all compliance endpoints require admin', () => {
    const protectedPaths = [
      '/v1/compliance/eu-ai-act',
      '/v1/compliance/owasp-agentic',
      '/v1/compliance/summary',
      '/v1/compliance/export',
    ];

    for (const path of protectedPaths) {
      it(`returns 403 for ingest role on ${path}`, async () => {
        const res = await app.request(path, { headers: ingestHeaders });
        expect(res.status).toBe(403);
        const body = await res.json();
        expect(body.error.code).toBe('FORBIDDEN');
      });

      it(`returns 401 with no auth on ${path}`, async () => {
        // temporarily clear keys to trigger bootstrap block
        // Instead just send a bad token to get 401
        const res = await app.request(path, {
          headers: { Authorization: 'Bearer bad_token_xyz' },
        });
        expect(res.status).toBe(401);
      });
    }
  });

  // ---------------------------------------------------------------------------
  // GET /v1/compliance/eu-ai-act
  // ---------------------------------------------------------------------------

  describe('GET /v1/compliance/eu-ai-act', () => {
    it('returns 200 with correct structure', async () => {
      const res = await app.request('/v1/compliance/eu-ai-act', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.framework).toBe('EU AI Act');
      expect(typeof body.assessmentDate).toBe('string');
      expect(['COMPLIANT', 'PARTIAL']).toContain(body.overallStatus);
      expect(Array.isArray(body.articles)).toBe(true);
      expect(body.articles).toHaveLength(4);
    });

    it('includes required article IDs', async () => {
      const res = await app.request('/v1/compliance/eu-ai-act', {
        headers: adminHeaders,
      });
      const body = await res.json();
      const articleNames = body.articles.map((a: { article: string }) => a.article);
      expect(articleNames.some((n: string) => n.includes('Article 9'))).toBe(true);
      expect(articleNames.some((n: string) => n.includes('Article 12'))).toBe(true);
      expect(articleNames.some((n: string) => n.includes('Article 13'))).toBe(true);
      expect(articleNames.some((n: string) => n.includes('Article 14'))).toBe(true);
    });

    it('each article has status, authensorFeatures, and evidence fields', async () => {
      const res = await app.request('/v1/compliance/eu-ai-act', {
        headers: adminHeaders,
      });
      const body = await res.json();
      for (const article of body.articles) {
        expect(['COMPLIANT', 'PARTIAL']).toContain(article.status);
        expect(Array.isArray(article.authensorFeatures)).toBe(true);
        expect(article.authensorFeatures.length).toBeGreaterThan(0);
        expect(typeof article.evidence).toBe('object');
      }
    });

    it('reports PARTIAL for Article 9 when no active policies exist', async () => {
      // No policies seeded in beforeEach
      const res = await app.request('/v1/compliance/eu-ai-act', {
        headers: adminHeaders,
      });
      const body = await res.json();
      const article9 = body.articles.find((a: { article: string }) =>
        a.article.includes('Article 9')
      );
      expect(article9).toBeDefined();
      expect(article9.status).toBe('PARTIAL');
    });

    it('reports COMPLIANT for Article 9 when an active policy exists', async () => {
      await db.query(
        `INSERT INTO policies (org_id, environment, policy_id, version, policy, is_active)
         VALUES ('default', 'dev', 'test-policy', '1.0.0', '{}', true)`
      );
      await db.query(
        `INSERT INTO active_policies (org_id, environment, policy_id, version)
         VALUES ('default', 'dev', 'test-policy', '1.0.0')`
      );

      const res = await app.request('/v1/compliance/eu-ai-act', {
        headers: adminHeaders,
      });
      const body = await res.json();
      const article9 = body.articles.find((a: { article: string }) =>
        a.article.includes('Article 9')
      );
      expect(article9.status).toBe('COMPLIANT');
    });

    it('Article 12 evidence reflects receipt count', async () => {
      // Insert a receipt directly
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision)
         VALUES ($1, $2, 'pending', 'allow', '{}', '{"outcome":"allow"}')`,
        [receiptId, envelopeId]
      );

      const res = await app.request('/v1/compliance/eu-ai-act', {
        headers: adminHeaders,
      });
      const body = await res.json();
      const article12 = body.articles.find((a: { article: string }) =>
        a.article.includes('Article 12')
      );
      expect(article12.evidence.totalReceipts).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/compliance/owasp-agentic
  // ---------------------------------------------------------------------------

  describe('GET /v1/compliance/owasp-agentic', () => {
    it('returns 200 with correct structure', async () => {
      const res = await app.request('/v1/compliance/owasp-agentic', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(body.framework).toBe('OWASP Agentic AI Top 10');
      expect(typeof body.assessmentDate).toBe('string');
      expect(body.categoriesAssessed).toBe(10);
      expect(typeof body.categoriesCovered).toBe('number');
      expect(Array.isArray(body.categories)).toBe(true);
      expect(body.categories).toHaveLength(10);
    });

    it('includes all ASI01-ASI10 categories', async () => {
      const res = await app.request('/v1/compliance/owasp-agentic', {
        headers: adminHeaders,
      });
      const body = await res.json();
      const ids = body.categories.map((c: { id: string }) => c.id);
      for (let i = 1; i <= 10; i++) {
        const expected = `ASI${String(i).padStart(2, '0')}`;
        expect(ids).toContain(expected);
      }
    });

    it('each category has id, name, status, authensorFeature, and evidence', async () => {
      const res = await app.request('/v1/compliance/owasp-agentic', {
        headers: adminHeaders,
      });
      const body = await res.json();
      for (const cat of body.categories) {
        expect(typeof cat.id).toBe('string');
        expect(typeof cat.name).toBe('string');
        expect(['COVERED', 'PARTIAL']).toContain(cat.status);
        expect(typeof cat.authensorFeature).toBe('string');
        expect(typeof cat.evidence).toBe('object');
      }
    });

    it('categoriesCovered + categoriesPartial equals categoriesAssessed', async () => {
      const res = await app.request('/v1/compliance/owasp-agentic', {
        headers: adminHeaders,
      });
      const body = await res.json();
      expect(body.categoriesCovered + body.categoriesPartial).toBe(body.categoriesAssessed);
    });

    it('ASI04 evidence reflects deny count from receipts table', async () => {
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision)
         VALUES ($1, $2, 'skipped', 'deny', '{}', '{"outcome":"deny"}')`,
        [receiptId, envelopeId]
      );

      const res = await app.request('/v1/compliance/owasp-agentic', {
        headers: adminHeaders,
      });
      const body = await res.json();
      const asi04 = body.categories.find((c: { id: string }) => c.id === 'ASI04');
      expect(asi04.evidence.totalDenied).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/compliance/export
  // ---------------------------------------------------------------------------

  describe('GET /v1/compliance/export', () => {
    it('returns 200 CSV with header row when no receipts', async () => {
      const res = await app.request('/v1/compliance/export?format=csv', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('text/csv');

      const text = await res.text();
      const lines = text.trim().split('\n');
      expect(lines[0]).toBe(
        'timestamp,action_type,resource,principal,decision,reasoning,receipt_id,prev_receipt_hash'
      );
      // Only header row when no receipts
      expect(lines).toHaveLength(1);
    });

    it('returns CSV rows for seeded receipts', async () => {
      const receiptId = crypto.randomUUID();
      const envelopeId = crypto.randomUUID();
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, tool_name, actor_id, envelope, decision)
         VALUES ($1, $2, 'pending', 'allow', 'http.request', 'agent-1',
                 '{"action":{"type":"http.request","resource":"https://example.com"}}',
                 '{"outcome":"allow","reason":"rule matched"}')`,
        [receiptId, envelopeId]
      );

      const res = await app.request('/v1/compliance/export?format=csv', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(200);
      const text = await res.text();
      const lines = text.trim().split('\n');
      expect(lines).toHaveLength(2); // header + 1 data row
      expect(lines[1]).toContain('allow');
      expect(lines[1]).toContain('agent-1');
      expect(lines[1]).toContain(receiptId);
    });

    it('filters by from/to date range', async () => {
      // Insert a receipt with a known timestamp
      const oldId = crypto.randomUUID();
      const newId = crypto.randomUUID();

      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision, created_at, updated_at)
         VALUES ($1, $2, 'skipped', 'deny', '{}', '{"outcome":"deny"}', '2020-01-01T00:00:00Z', '2020-01-01T00:00:00Z')`,
        [oldId, crypto.randomUUID()]
      );
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision, created_at, updated_at)
         VALUES ($1, $2, 'pending', 'allow', '{}', '{"outcome":"allow"}', '2025-06-01T00:00:00Z', '2025-06-01T00:00:00Z')`,
        [newId, crypto.randomUUID()]
      );

      const res = await app.request(
        '/v1/compliance/export?format=csv&from=2025-01-01&to=2025-12-31',
        { headers: adminHeaders }
      );
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain(newId);
      expect(text).not.toContain(oldId);
    });

    it('returns 400 for unsupported format', async () => {
      const res = await app.request('/v1/compliance/export?format=json', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('csv');
    });

    it('returns 400 for invalid from date', async () => {
      const res = await app.request('/v1/compliance/export?format=csv&from=not-a-date', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(400);
    });

    it('returns 400 for invalid to date', async () => {
      const res = await app.request('/v1/compliance/export?format=csv&to=not-a-date', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(400);
    });

    it('sets Content-Disposition attachment header', async () => {
      const res = await app.request('/v1/compliance/export?format=csv', {
        headers: adminHeaders,
      });
      const disposition = res.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('authensor-audit-');
      expect(disposition).toContain('.csv');
    });
  });

  // ---------------------------------------------------------------------------
  // GET /v1/compliance/summary
  // ---------------------------------------------------------------------------

  describe('GET /v1/compliance/summary', () => {
    it('returns 200 with correct top-level shape', async () => {
      const res = await app.request('/v1/compliance/summary', {
        headers: adminHeaders,
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      expect(typeof body.assessmentDate).toBe('string');

      // EU AI Act block
      expect(typeof body.euAiAct).toBe('object');
      expect(['COMPLIANT', 'PARTIAL']).toContain(body.euAiAct.status);
      expect(body.euAiAct.articlesAssessed).toBe(4);
      expect(typeof body.euAiAct.articlesCovered).toBe('number');

      // OWASP block
      expect(typeof body.owaspAgentic).toBe('object');
      expect(body.owaspAgentic.categoriesAssessed).toBe(10);
      expect(typeof body.owaspAgentic.categoriesCovered).toBe('number');

      // Receipts block
      expect(typeof body.receipts).toBe('object');
      expect(typeof body.receipts.total).toBe('number');
      expect(['VALID', 'BROKEN']).toContain(body.receipts.chainIntegrity);

      // Approvals block
      expect(typeof body.approvals).toBe('object');
      expect(typeof body.approvals.processed).toBe('number');
      expect(typeof body.approvals.pending).toBe('number');

      // Threats block
      expect(typeof body.threats).toBe('object');
      expect(typeof body.threats.blocked).toBe('number');
    });

    it('receipts.total reflects actual receipt count', async () => {
      const id1 = crypto.randomUUID();
      const id2 = crypto.randomUUID();
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, envelope, decision)
         VALUES ($1, $2, 'pending', 'allow', '{}', '{"outcome":"allow"}'),
                ($3, $4, 'skipped', 'deny', '{}', '{"outcome":"deny"}')`,
        [id1, crypto.randomUUID(), id2, crypto.randomUUID()]
      );

      const res = await app.request('/v1/compliance/summary', {
        headers: adminHeaders,
      });
      const body = await res.json();
      expect(body.receipts.total).toBe(2);
    });

    it('approvals.pending count is accurate', async () => {
      const r1 = crypto.randomUUID();
      const r2 = crypto.randomUUID();
      // Two approval-required receipts, one pending one approved
      await db.query(
        `INSERT INTO receipts (id, envelope_id, status, decision_outcome, approval_status, envelope, decision)
         VALUES ($1, $2, 'pending', 'require_approval', 'pending', '{}', '{"outcome":"require_approval"}'),
                ($3, $4, 'executed', 'require_approval', 'approved', '{}', '{"outcome":"require_approval"}')`,
        [r1, crypto.randomUUID(), r2, crypto.randomUUID()]
      );

      const res = await app.request('/v1/compliance/summary', {
        headers: adminHeaders,
      });
      const body = await res.json();
      expect(body.approvals.processed).toBe(2);
      expect(body.approvals.pending).toBe(1);
    });

    it('chainIntegrity is VALID when no receipts exist', async () => {
      const res = await app.request('/v1/compliance/summary', {
        headers: adminHeaders,
      });
      const body = await res.json();
      expect(body.receipts.chainIntegrity).toBe('VALID');
    });
  });
});
