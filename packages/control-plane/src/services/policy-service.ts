import { z } from 'zod';
import type { Policy } from '@authensor/engine';
import { db } from '../db.js';

const policyRuleSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  description: z.string().optional(),
  effect: z.enum(['allow', 'deny', 'require_approval']),
  condition: z.record(z.unknown()).optional(),
  rateLimit: z
    .object({
      requests: z.number(),
      window: z.string(),
      scope: z.enum(['principal', 'action', 'global']).optional(),
    })
    .optional(),
  approvalConfig: z
    .object({
      approvers: z
        .array(z.object({ type: z.string().optional(), id: z.string().optional() }))
        .optional(),
      expiresIn: z.string().optional(),
      requiredApprovals: z.number().int().min(1).optional(),
    })
    .optional(),
});

const policySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  version: z.string(),
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  scope: z
    .object({
      actionTypes: z.array(z.string()).optional(),
      principalTypes: z.array(z.enum(['user', 'agent', 'service', 'system'])).optional(),
      environments: z.array(z.enum(['development', 'staging', 'production'])).optional(),
    })
    .optional(),
  rules: z.array(policyRuleSchema),
  defaultEffect: z.enum(['allow', 'deny']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function createPolicy(
  orgId: string,
  environment: string,
  policy: Policy
): Promise<void> {
  const validated = policySchema.parse(policy);
  await db.query(
    `INSERT INTO policies (org_id, environment, policy_id, version, policy, is_active)
     VALUES ($1, $2, $3, $4, $5::jsonb, false)
     ON CONFLICT (org_id, environment, policy_id, version) DO UPDATE SET policy = EXCLUDED.policy`,
    [orgId, environment, validated.id, validated.version, validated]
  );
}

export async function setActivePolicy(
  orgId: string,
  environment: string,
  policyId: string,
  version: string
): Promise<void> {
  const exists = await db.query(
    `SELECT 1 FROM policies WHERE org_id = $1 AND environment = $2 AND policy_id = $3 AND version = $4`,
    [orgId, environment, policyId, version]
  );
  if (exists.rowCount === 0) {
    throw new Error('Policy version not found');
  }

  await db.query(
    `INSERT INTO active_policies (org_id, environment, policy_id, version, activated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (org_id, environment) DO UPDATE SET policy_id = EXCLUDED.policy_id, version = EXCLUDED.version, activated_at = now()`,
    [orgId, environment, policyId, version]
  );

  await db.query(
    `UPDATE policies
     SET is_active = (policy_id = $3 AND version = $4)
     WHERE org_id = $1 AND environment = $2`,
    [orgId, environment, policyId, version]
  );
}

export async function getActivePolicy(
  orgId: string,
  environment: string
): Promise<Policy | null> {
  const { rows } = await db.query<{ policy: Policy }>(
    `SELECT p.policy
     FROM active_policies a
     JOIN policies p ON p.org_id = a.org_id AND p.environment = a.environment AND p.policy_id = a.policy_id AND p.version = a.version
     WHERE a.org_id = $1 AND a.environment = $2`,
    [orgId, environment]
  );

  return rows[0]?.policy ?? null;
}

export async function getPolicyById(
  orgId: string,
  environment: string,
  policyId: string,
  version?: string
): Promise<Policy | null> {
  if (version) {
    const { rows } = await db.query<{ policy: Policy }>(
      `SELECT policy FROM policies WHERE org_id = $1 AND environment = $2 AND policy_id = $3 AND version = $4`,
      [orgId, environment, policyId, version]
    );
    return rows[0]?.policy ?? null;
  }

  // Latest version
  const { rows } = await db.query<{ policy: Policy }>(
    `SELECT policy FROM policies WHERE org_id = $1 AND environment = $2 AND policy_id = $3 ORDER BY created_at DESC LIMIT 1`,
    [orgId, environment, policyId]
  );
  return rows[0]?.policy ?? null;
}

export async function listPolicies(
  orgId: string,
  environment: string
): Promise<Array<Policy & { createdAt: string; isActive: boolean }>> {
  const { rows } = await db.query<{
    policy: Policy;
    created_at: string;
    is_active: boolean;
  }>(
    `SELECT policy, created_at, is_active
     FROM policies
     WHERE org_id = $1 AND environment = $2
     ORDER BY created_at DESC`,
    [orgId, environment]
  );

  return rows.map((row) => ({
    ...row.policy,
    createdAt: row.created_at,
    isActive: row.is_active,
  }));
}
