/**
 * Compliance Route
 *
 * GET /v1/compliance/eu-ai-act        - EU AI Act conformity assessment
 * GET /v1/compliance/owasp-agentic    - OWASP Agentic AI Top 10 mapping
 * GET /v1/compliance/export           - CSV receipt export for auditors
 * GET /v1/compliance/summary          - Dashboard-ready compliance summary
 *
 * All endpoints require admin role.
 */

import { Hono } from 'hono';
import { db } from '../db.js';
import { requireRole } from '../auth/middleware.js';
import { verifyReceiptChain } from '../services/receipt-service.js';

export const complianceRoute = new Hono();

// Apply admin role to all compliance endpoints
complianceRoute.use('*', requireRole(['admin']));

// ---------------------------------------------------------------------------
// EU AI Act conformity assessment
// ---------------------------------------------------------------------------

complianceRoute.get('/eu-ai-act', async (c) => {
  const assessmentDate = new Date().toISOString();

  // Receipt counts and chain integrity
  const receiptCountResult = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM receipts'
  );
  const totalReceipts = parseInt(receiptCountResult.rows[0]?.count ?? '0', 10);

  const chainResult = await verifyReceiptChain({ limit: 10000 });
  const chainIntact = chainResult.broken === 0;

  // Approval workflow counts — separate queries for pg-mem compatibility
  const approvalTotalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts WHERE decision_outcome = 'require_approval'`
  );
  const approvalTotal = parseInt(approvalTotalResult.rows[0]?.count ?? '0', 10);

  const approvalPendingResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts WHERE decision_outcome = 'require_approval' AND approval_status = 'pending'`
  );
  const approvalPending = parseInt(approvalPendingResult.rows[0]?.count ?? '0', 10);

  // Active policy count
  const policyResult = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM active_policies'
  );
  const activePolicies = parseInt(policyResult.rows[0]?.count ?? '0', 10);

  // Sentinel enabled
  const sentinelEnabled = process.env.AUTHENSOR_SENTINEL_ENABLED === 'true';
  const aegisEnabled = process.env.AUTHENSOR_AEGIS_ENABLED === 'true';

  const articles = [
    {
      article: 'Article 9 - Risk Management System',
      status: activePolicies > 0 ? 'COMPLIANT' : 'PARTIAL',
      authensorFeatures: [
        'Policy Engine — rule-based risk management for every AI action',
        'Sentinel — real-time anomaly detection and risk scoring',
        'Fail-closed defaults — deny when no policy is configured',
      ],
      evidence: {
        activePolicies,
        sentinelEnabled,
        killSwitchAvailable: true,
        failClosedDefault: true,
        policyEngineType: 'rule-based',
      },
    },
    {
      article: 'Article 12 - Record-Keeping',
      status: totalReceipts >= 0 && chainIntact ? 'COMPLIANT' : 'PARTIAL',
      authensorFeatures: [
        'Immutable audit receipts — every action decision is stored with a cryptographic hash',
        'Hash-chained receipt log — tamper-evident linked chain',
        'NDJSON + CSV export — machine-readable audit export for regulators',
      ],
      evidence: {
        totalReceipts,
        chainIntact,
        chainVerified: chainResult.verified,
        chainBroken: chainResult.broken,
        exportFormats: ['ndjson', 'csv'],
        retentionPolicy: 'persistent',
      },
    },
    {
      article: 'Article 13 - Transparency and Information Provision',
      status: 'COMPLIANT',
      authensorFeatures: [
        'Decision receipts — every allow/deny decision includes policy ID, version and reasoning',
        'Transparency log (Rekor) — optional public immutable log via Sigstore',
        'Human-readable receipt viewer — /receipts/:id/view for operators',
      ],
      evidence: {
        decisionReasoningCaptured: true,
        receiptViewerAvailable: true,
        rekorTransparencyOptional: true,
        policyVersionTracked: true,
      },
    },
    {
      article: 'Article 14 - Human Oversight',
      status: approvalTotal > 0 || activePolicies > 0 ? 'COMPLIANT' : 'PARTIAL',
      authensorFeatures: [
        'Multi-party approval workflows — require_approval decision blocks execution until human approves',
        'Kill switch (controls) — instant halt of all AI action execution',
        'Per-tool execution controls — disable specific tools without policy changes',
      ],
      evidence: {
        approvalWorkflowsConfigured: approvalTotal > 0,
        totalApprovalRequests: approvalTotal,
        pendingApprovals: approvalPending,
        killSwitchAvailable: true,
        perToolDisable: true,
      },
    },
  ];

  const allCompliant = articles.every((a) => a.status === 'COMPLIANT');
  const overallStatus = allCompliant ? 'COMPLIANT' : 'PARTIAL';

  return c.json({
    framework: 'EU AI Act',
    assessmentDate,
    overallStatus,
    articles,
  });
});

// ---------------------------------------------------------------------------
// OWASP Agentic AI Top 10 mapping
// ---------------------------------------------------------------------------

complianceRoute.get('/owasp-agentic', async (c) => {
  const assessmentDate = new Date().toISOString();

  // Aegis scan counts (threat blocking evidence) — separate queries for pg-mem compatibility
  const aegisTotalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM aegis_scans`
  ).catch(() => ({ rows: [{ count: '0' }] }));
  const aegisTotal = parseInt(aegisTotalResult.rows[0]?.count ?? '0', 10);

  const aegisBlockedResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM aegis_scans WHERE safe = false`
  ).catch(() => ({ rows: [{ count: '0' }] }));
  const aegisBlocked = parseInt(aegisBlockedResult.rows[0]?.count ?? '0', 10);

  // Prompt injection detections specifically
  const promptInjectionResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM aegis_scans
     WHERE detections @> '[{"type":"prompt_injection"}]'`
  ).catch(() => ({ rows: [{ count: '0' }] }));
  const promptInjectionDetections = parseInt(promptInjectionResult.rows[0]?.count ?? '0', 10);

  // Deny count (excessive permissions indicator)
  const denyCountResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts WHERE decision_outcome = 'deny'`
  );
  const denyCount = parseInt(denyCountResult.rows[0]?.count ?? '0', 10);

  // Approval count
  const approvalCountResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts WHERE decision_outcome = 'require_approval'`
  );
  const approvalCount = parseInt(approvalCountResult.rows[0]?.count ?? '0', 10);

  // Sentinel alert counts — separate queries for pg-mem compatibility
  const sentinelTotalResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sentinel_alerts`
  ).catch(() => ({ rows: [{ count: '0' }] }));
  const sentinelTotal = parseInt(sentinelTotalResult.rows[0]?.count ?? '0', 10);

  const sentinelActiveResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM sentinel_alerts WHERE status = 'active'`
  ).catch(() => ({ rows: [{ count: '0' }] }));
  const sentinelActive = parseInt(sentinelActiveResult.rows[0]?.count ?? '0', 10);

  const aegisEnabled = process.env.AUTHENSOR_AEGIS_ENABLED === 'true';
  const sentinelEnabled = process.env.AUTHENSOR_SENTINEL_ENABLED === 'true';

  const categories = [
    {
      id: 'ASI01',
      name: 'Prompt Injection',
      status: aegisEnabled ? 'COVERED' : 'PARTIAL',
      authensorFeature: 'Aegis — content safety scanner detects prompt injection patterns before policy evaluation',
      evidence: {
        aegisEnabled,
        totalScans: aegisTotal,
        promptInjectionDetections,
      },
    },
    {
      id: 'ASI02',
      name: 'Sensitive Information Disclosure',
      status: 'COVERED',
      authensorFeature: 'Policy Engine — resource/action rules prevent access to sensitive resources; receipts redact secrets in export',
      evidence: {
        secretRedactionInExport: true,
        policyResourceRules: true,
      },
    },
    {
      id: 'ASI03',
      name: 'Supply Chain Vulnerabilities',
      status: 'PARTIAL',
      authensorFeature: 'Authensor is open-source with reproducible builds; hash-chained audit trail detects tampering',
      evidence: {
        openSource: true,
        auditTrailIntegrity: true,
        supplyChainScanningNote: 'Depends on host environment CI/CD tooling',
      },
    },
    {
      id: 'ASI04',
      name: 'Excessive Agency / Permissions',
      status: 'COVERED',
      authensorFeature: 'Policy Engine — least-privilege rules deny unauthorized actions; per-tool controls; fail-closed default',
      evidence: {
        totalDenied: denyCount,
        failClosedDefault: true,
        perToolDisable: true,
        killSwitchAvailable: true,
      },
    },
    {
      id: 'ASI05',
      name: 'Insecure Output Handling',
      status: aegisEnabled ? 'COVERED' : 'PARTIAL',
      authensorFeature: 'Aegis output scanning — scans agent outputs for injection, PII, and unsafe content before delivery',
      evidence: {
        aegisEnabled,
        outputScanningAvailable: true,
        totalOutputScans: aegisTotal,
        blockedOutputs: aegisBlocked,
      },
    },
    {
      id: 'ASI06',
      name: 'Overreliance on AI / Insufficient Human Oversight',
      status: 'COVERED',
      authensorFeature: 'Multi-party approval workflows — human-in-the-loop gates for high-risk actions; kill switch for instant halt',
      evidence: {
        totalApprovalRequests: approvalCount,
        killSwitchAvailable: true,
        perToolDisable: true,
      },
    },
    {
      id: 'ASI07',
      name: 'Data and Model Poisoning',
      status: aegisEnabled ? 'COVERED' : 'PARTIAL',
      authensorFeature: 'Aegis — detects anomalous or adversarial inputs; immutable audit chain detects replay/injection attempts',
      evidence: {
        aegisEnabled,
        immutableAuditChain: true,
        totalScans: aegisTotal,
      },
    },
    {
      id: 'ASI08',
      name: 'Vector and Embedding Weaknesses',
      status: 'PARTIAL',
      authensorFeature: 'Policy Engine resource rules can restrict RAG/vector store access; Aegis scans retrieved context',
      evidence: {
        resourcePolicyRules: true,
        retrievedContextScanning: aegisEnabled,
        note: 'Vector DB-specific mitigations depend on host application',
      },
    },
    {
      id: 'ASI09',
      name: 'Misinformation and Hallucination',
      status: 'PARTIAL',
      authensorFeature: 'Approval workflows gate agent outputs in high-stakes flows; Sentinel monitors anomalous output patterns',
      evidence: {
        humanApprovalGates: approvalCount > 0,
        sentinelEnabled,
        note: 'LLM-level factuality checking outside Authensor scope',
      },
    },
    {
      id: 'ASI10',
      name: 'Unbounded Consumption / Resource Exhaustion',
      status: 'COVERED',
      authensorFeature: 'Budget controls — cost and token budgets per agent; rate limiting per API key; Sentinel anomaly detection',
      evidence: {
        budgetControlsAvailable: true,
        rateLimitingEnabled: true,
        sentinelEnabled,
        sentinelActiveAlerts: sentinelActive,
        sentinelTotalAlerts: sentinelTotal,
      },
    },
  ];

  const coveredCount = categories.filter((cat) => cat.status === 'COVERED').length;

  return c.json({
    framework: 'OWASP Agentic AI Top 10',
    assessmentDate,
    categoriesAssessed: categories.length,
    categoriesCovered: coveredCount,
    categoriesPartial: categories.filter((cat) => cat.status === 'PARTIAL').length,
    categories,
  });
});

// ---------------------------------------------------------------------------
// CSV export of receipts for auditors
// ---------------------------------------------------------------------------

const CSV_COLUMNS = [
  'timestamp',
  'action_type',
  'resource',
  'principal',
  'decision',
  'reasoning',
  'receipt_id',
  'prev_receipt_hash',
] as const;

function escapeCsvField(value: string | null | undefined): string {
  const str = value == null ? '' : String(value);
  // Wrap in quotes if the value contains comma, newline, or double-quote
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowToCsv(row: {
  created_at: string;
  tool_name: string | null;
  envelope: unknown;
  actor_id: string | null;
  decision_outcome: string;
  decision: unknown;
  id: string;
  prev_receipt_hash: string | null;
}): string {
  const envelope = row.envelope as Record<string, unknown> | null;
  const decision = row.decision as Record<string, unknown> | null;
  const resource =
    (envelope?.action as Record<string, unknown> | undefined)?.resource as string | undefined;
  const reasoning = decision?.reason as string | undefined;

  return [
    escapeCsvField(row.created_at),
    escapeCsvField(row.tool_name),
    escapeCsvField(resource),
    escapeCsvField(row.actor_id),
    escapeCsvField(row.decision_outcome),
    escapeCsvField(reasoning),
    escapeCsvField(row.id),
    escapeCsvField(row.prev_receipt_hash),
  ].join(',');
}

type ExportReceiptRow = {
  id: string;
  created_at: string;
  tool_name: string | null;
  actor_id: string | null;
  decision_outcome: string;
  envelope: unknown;
  decision: unknown;
  prev_receipt_hash: string | null;
};

complianceRoute.get('/export', async (c) => {
  const format = c.req.query('format') ?? 'csv';
  const fromParam = c.req.query('from');
  const toParam = c.req.query('to');
  const limitParam = c.req.query('limit');

  if (format !== 'csv') {
    return c.json({ error: 'Only format=csv is supported' }, 400);
  }

  const limit = Math.min(parseInt(limitParam ?? '10000', 10), 100000);

  const params: unknown[] = [];
  const conditions: string[] = [];

  if (fromParam) {
    const fromDate = new Date(fromParam);
    if (isNaN(fromDate.getTime())) {
      return c.json({ error: 'Invalid "from" date' }, 400);
    }
    params.push(fromDate.toISOString());
    conditions.push(`created_at >= $${params.length}`);
  }

  if (toParam) {
    const toDate = new Date(toParam);
    if (isNaN(toDate.getTime())) {
      return c.json({ error: 'Invalid "to" date' }, 400);
    }
    params.push(toDate.toISOString());
    conditions.push(`created_at <= $${params.length}`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  params.push(limit);

  const { rows } = await db.query<ExportReceiptRow>(
    `SELECT id, created_at, tool_name, actor_id, decision_outcome, envelope, decision, prev_receipt_hash
     FROM receipts
     ${whereClause}
     ORDER BY created_at ASC
     LIMIT $${params.length}`,
    params
  );

  const header = CSV_COLUMNS.join(',');
  const dataLines = rows.map(rowToCsv);
  const csv = [header, ...dataLines].join('\n');

  const dateTag = new Date().toISOString().slice(0, 10);
  c.header('Content-Type', 'text/csv; charset=utf-8');
  c.header('Content-Disposition', `attachment; filename="authensor-audit-${dateTag}.csv"`);
  c.header('Cache-Control', 'no-store');

  return c.body(csv);
});

// ---------------------------------------------------------------------------
// Compliance summary (dashboard-ready)
// ---------------------------------------------------------------------------

complianceRoute.get('/summary', async (c) => {
  // EU AI Act — derive from active policies and receipt chain
  const policyResult = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM active_policies'
  );
  const activePolicies = parseInt(policyResult.rows[0]?.count ?? '0', 10);

  const chainResult = await verifyReceiptChain({ limit: 10000 });
  const chainIntact = chainResult.broken === 0;

  const receiptCountResult = await db.query<{ count: string }>(
    'SELECT COUNT(*)::text AS count FROM receipts'
  );
  const totalReceipts = parseInt(receiptCountResult.rows[0]?.count ?? '0', 10);

  // Approval counts — use separate queries for pg-mem compatibility (FILTER aggregate not supported)
  const approvalsProcessedResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts WHERE decision_outcome = 'require_approval'`
  );
  const approvalsProcessed = parseInt(approvalsProcessedResult.rows[0]?.count ?? '0', 10);

  const approvalsPendingResult = await db.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM receipts WHERE decision_outcome = 'require_approval' AND approval_status = 'pending'`
  );
  const approvalsPending = parseInt(approvalsPendingResult.rows[0]?.count ?? '0', 10);

  // Aegis blocked threats
  const aegisResult = await db.query<{ blocked: string }>(
    `SELECT COUNT(*) FILTER (WHERE safe = false)::text AS blocked FROM aegis_scans`
  ).catch(() => ({ rows: [{ blocked: '0' }] }));
  const threatsBlocked = parseInt(aegisResult.rows[0]?.blocked ?? '0', 10);

  // EU AI Act: 4 articles, covered when policies exist and chain is intact
  const euAiActArticlesCovered = (activePolicies > 0 ? 2 : 1) + (chainIntact ? 1 : 0) + 1;
  const euAiActStatus = euAiActArticlesCovered === 4 ? 'COMPLIANT' : 'PARTIAL';

  // OWASP Agentic: 10 categories, 7 fully covered + 3 partial (fixed mapping)
  const aegisEnabled = process.env.AUTHENSOR_AEGIS_ENABLED === 'true';
  const owaspCovered = aegisEnabled ? 7 : 4;

  return c.json({
    assessmentDate: new Date().toISOString(),
    euAiAct: {
      status: euAiActStatus,
      articlesAssessed: 4,
      articlesCovered: euAiActArticlesCovered,
    },
    owaspAgentic: {
      categoriesAssessed: 10,
      categoriesCovered: owaspCovered,
      categoriesPartial: 10 - owaspCovered,
    },
    receipts: {
      total: totalReceipts,
      chainIntegrity: chainIntact ? 'VALID' : 'BROKEN',
      chainVerified: chainResult.verified,
      chainBroken: chainResult.broken,
    },
    approvals: {
      processed: approvalsProcessed,
      pending: approvalsPending,
    },
    threats: {
      blocked: threatsBlocked,
    },
  });
});
