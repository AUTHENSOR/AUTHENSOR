/**
 * Shadow Evaluation Service
 *
 * Records shadow/canary policy evaluations and computes divergence reports.
 * Shadow evaluations run a candidate policy alongside the active policy
 * without affecting the enforced decision.
 */

import crypto from 'crypto';
import { db } from '../db.js';

export interface ShadowEvaluationInput {
  receiptId: string;
  activePolicyId: string;
  activePolicyVersion: string;
  activeDecision: string;
  activeMatchedRule?: string;
  activeReason?: string;
  shadowPolicyId: string;
  shadowPolicyVersion: string;
  shadowDecision: string;
  shadowMatchedRule?: string;
  shadowReason?: string;
}

export interface ShadowEvaluation {
  id: string;
  receiptId: string;
  activePolicyId: string;
  activePolicyVersion: string;
  activeDecision: string;
  activeMatchedRule?: string;
  activeReason?: string;
  shadowPolicyId: string;
  shadowPolicyVersion: string;
  shadowDecision: string;
  shadowMatchedRule?: string;
  shadowReason?: string;
  decisionsAgree: boolean;
  createdAt: string;
}

export interface ShadowReport {
  totalEvaluations: number;
  agreements: number;
  disagreements: number;
  agreementRate: number;
  shadowPolicyId: string;
  shadowPolicyVersion: string;
  divergences: Array<{
    receiptId: string;
    activeDecision: string;
    activeMatchedRule?: string;
    shadowDecision: string;
    shadowMatchedRule?: string;
    createdAt: string;
  }>;
  ruleBreakdown: Array<{
    shadowMatchedRule: string;
    count: number;
    agreements: number;
    disagreements: number;
  }>;
}

export async function recordShadowEvaluation(
  input: ShadowEvaluationInput
): Promise<ShadowEvaluation> {
  const id = crypto.randomUUID();
  const decisionsAgree = input.activeDecision === input.shadowDecision;

  const { rows } = await db.query<{
    id: string;
    receipt_id: string;
    active_policy_id: string;
    active_policy_version: string;
    active_decision: string;
    active_matched_rule: string | null;
    active_reason: string | null;
    shadow_policy_id: string;
    shadow_policy_version: string;
    shadow_decision: string;
    shadow_matched_rule: string | null;
    shadow_reason: string | null;
    decisions_agree: boolean;
    created_at: string;
  }>(
    `INSERT INTO shadow_evaluations
     (id, receipt_id, active_policy_id, active_policy_version, active_decision, active_matched_rule, active_reason,
      shadow_policy_id, shadow_policy_version, shadow_decision, shadow_matched_rule, shadow_reason, decisions_agree)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
     RETURNING *`,
    [
      id,
      input.receiptId,
      input.activePolicyId,
      input.activePolicyVersion,
      input.activeDecision,
      input.activeMatchedRule ?? null,
      input.activeReason ?? null,
      input.shadowPolicyId,
      input.shadowPolicyVersion,
      input.shadowDecision,
      input.shadowMatchedRule ?? null,
      input.shadowReason ?? null,
      decisionsAgree,
    ]
  );

  const row = rows[0];
  return {
    id: row.id,
    receiptId: row.receipt_id,
    activePolicyId: row.active_policy_id,
    activePolicyVersion: row.active_policy_version,
    activeDecision: row.active_decision,
    activeMatchedRule: row.active_matched_rule ?? undefined,
    activeReason: row.active_reason ?? undefined,
    shadowPolicyId: row.shadow_policy_id,
    shadowPolicyVersion: row.shadow_policy_version,
    shadowDecision: row.shadow_decision,
    shadowMatchedRule: row.shadow_matched_rule ?? undefined,
    shadowReason: row.shadow_reason ?? undefined,
    decisionsAgree: row.decisions_agree,
    createdAt: row.created_at,
  };
}

export async function getShadowReport(options?: {
  shadowPolicyId?: string;
  shadowPolicyVersion?: string;
  limit?: number;
  since?: string;
}): Promise<ShadowReport> {
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (options?.shadowPolicyId) {
    params.push(options.shadowPolicyId);
    conditions.push(`shadow_policy_id = $${params.length}`);
  }

  if (options?.shadowPolicyVersion) {
    params.push(options.shadowPolicyVersion);
    conditions.push(`shadow_policy_version = $${params.length}`);
  }

  if (options?.since) {
    params.push(options.since);
    conditions.push(`created_at >= $${params.length}::timestamptz`);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Summary stats (using SUM+CASE for pg-mem compatibility instead of FILTER)
  const summaryQuery = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN decisions_agree = true THEN 1 ELSE 0 END) AS agreements,
      SUM(CASE WHEN decisions_agree = false THEN 1 ELSE 0 END) AS disagreements,
      shadow_policy_id,
      shadow_policy_version
    FROM shadow_evaluations
    ${whereClause}
    GROUP BY shadow_policy_id, shadow_policy_version
    ORDER BY total DESC
    LIMIT 1
  `;
  const summaryResult = await db.query<{
    total: number;
    agreements: number;
    disagreements: number;
    shadow_policy_id: string;
    shadow_policy_version: string;
  }>(summaryQuery, params);

  const rawSummary = summaryResult.rows[0];
  const summary = {
    total: Number(rawSummary?.total ?? 0),
    agreements: Number(rawSummary?.agreements ?? 0),
    disagreements: Number(rawSummary?.disagreements ?? 0),
    shadow_policy_id: rawSummary?.shadow_policy_id ?? options?.shadowPolicyId ?? '',
    shadow_policy_version: rawSummary?.shadow_policy_version ?? options?.shadowPolicyVersion ?? '',
  };

  // Divergences (only disagreements), limited
  const divergenceLimit = options?.limit ?? 50;
  const divParams = [...params, divergenceLimit];
  const divergenceQuery = `
    SELECT receipt_id, active_decision, active_matched_rule, shadow_decision, shadow_matched_rule, created_at
    FROM shadow_evaluations
    ${whereClause}${whereClause ? ' AND' : ' WHERE'} decisions_agree = false
    ORDER BY created_at DESC
    LIMIT $${divParams.length}
  `;
  const divergenceResult = await db.query<{
    receipt_id: string;
    active_decision: string;
    active_matched_rule: string | null;
    shadow_decision: string;
    shadow_matched_rule: string | null;
    created_at: string;
  }>(divergenceQuery, divParams);

  // Rule breakdown (using SUM+CASE for pg-mem compatibility)
  const ruleQuery = `
    SELECT
      shadow_matched_rule,
      COUNT(*) AS count,
      SUM(CASE WHEN decisions_agree = true THEN 1 ELSE 0 END) AS agreements,
      SUM(CASE WHEN decisions_agree = false THEN 1 ELSE 0 END) AS disagreements
    FROM shadow_evaluations
    ${whereClause}
    GROUP BY shadow_matched_rule
    ORDER BY count DESC
  `;
  const ruleResult = await db.query<{
    shadow_matched_rule: string;
    count: number;
    agreements: number;
    disagreements: number;
  }>(ruleQuery, params);

  return {
    totalEvaluations: summary.total,
    agreements: summary.agreements,
    disagreements: summary.disagreements,
    agreementRate: summary.total > 0 ? summary.agreements / summary.total : 1,
    shadowPolicyId: summary.shadow_policy_id,
    shadowPolicyVersion: summary.shadow_policy_version,
    divergences: divergenceResult.rows.map((row) => ({
      receiptId: row.receipt_id,
      activeDecision: row.active_decision,
      activeMatchedRule: row.active_matched_rule ?? undefined,
      shadowDecision: row.shadow_decision,
      shadowMatchedRule: row.shadow_matched_rule ?? undefined,
      createdAt: row.created_at,
    })),
    ruleBreakdown: ruleResult.rows.map((row) => ({
      shadowMatchedRule: row.shadow_matched_rule ?? '<default>',
      count: Number(row.count),
      agreements: Number(row.agreements),
      disagreements: Number(row.disagreements),
    })),
  };
}
