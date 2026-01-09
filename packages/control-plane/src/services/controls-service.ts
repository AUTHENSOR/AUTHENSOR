/**
 * Controls Service
 *
 * Manages execution controls (kill switch, per-tool disables).
 */

import { db } from '../db.js';

export interface Controls {
  disable_execution: boolean;
  disable_http: boolean;
  disable_github: boolean;
  disable_stripe: boolean;
  updated_at: string;
}

interface ControlsRow {
  id: number;
  disable_execution: boolean;
  disable_http: boolean;
  disable_github: boolean;
  disable_stripe: boolean;
  updated_at: string;
}

/**
 * Get current controls state
 */
export async function getControls(): Promise<Controls> {
  const { rows } = await db.query<ControlsRow>('SELECT * FROM controls WHERE id = 1');

  if (rows.length === 0) {
    // Return defaults if row doesn't exist (shouldn't happen after migration)
    return {
      disable_execution: false,
      disable_http: false,
      disable_github: false,
      disable_stripe: false,
      updated_at: new Date().toISOString(),
    };
  }

  const row = rows[0];
  return {
    disable_execution: row.disable_execution,
    disable_http: row.disable_http,
    disable_github: row.disable_github,
    disable_stripe: row.disable_stripe,
    updated_at: row.updated_at,
  };
}

/**
 * Update controls (partial update)
 * Accepts both snake_case and camelCase input
 */
export async function updateControls(
  updates: Partial<Omit<Controls, 'updated_at'>> & {
    disableExecution?: boolean;
    disableHttp?: boolean;
    disableGithub?: boolean;
    disableStripe?: boolean;
  }
): Promise<Controls> {
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  const disableExecution = updates.disable_execution ?? updates.disableExecution;
  const disableHttp = updates.disable_http ?? updates.disableHttp;
  const disableGithub = updates.disable_github ?? updates.disableGithub;
  const disableStripe = updates.disable_stripe ?? updates.disableStripe;

  if (disableExecution !== undefined) {
    setClauses.push(`disable_execution = $${paramIndex++}`);
    params.push(disableExecution);
  }
  if (disableHttp !== undefined) {
    setClauses.push(`disable_http = $${paramIndex++}`);
    params.push(disableHttp);
  }
  if (disableGithub !== undefined) {
    setClauses.push(`disable_github = $${paramIndex++}`);
    params.push(disableGithub);
  }
  if (disableStripe !== undefined) {
    setClauses.push(`disable_stripe = $${paramIndex++}`);
    params.push(disableStripe);
  }

  if (setClauses.length === 0) {
    return getControls();
  }

  setClauses.push('updated_at = now()');

  const { rows } = await db.query<ControlsRow>(
    `UPDATE controls SET ${setClauses.join(', ')} WHERE id = 1 RETURNING *`,
    params
  );

  const row = rows[0];
  return {
    disable_execution: row.disable_execution,
    disable_http: row.disable_http,
    disable_github: row.disable_github,
    disable_stripe: row.disable_stripe,
    updated_at: row.updated_at,
  };
}

/**
 * Check if execution is allowed for a specific tool
 * Returns error code if blocked, null if allowed
 */
export async function checkToolExecution(
  toolName: string | null | undefined
): Promise<{ allowed: false; code: string; message: string } | { allowed: true }> {
  const controls = await getControls();

  // Global kill switch
  if (controls.disable_execution) {
    return {
      allowed: false,
      code: 'EXECUTION_DISABLED',
      message: 'Execution is globally disabled',
    };
  }

  // Per-tool disables
  if (toolName) {
    const toolLower = toolName.toLowerCase();

    if (toolLower.startsWith('http') && controls.disable_http) {
      return {
        allowed: false,
        code: 'TOOL_DISABLED',
        message: 'HTTP tool is disabled',
      };
    }

    if (toolLower.startsWith('github') && controls.disable_github) {
      return {
        allowed: false,
        code: 'TOOL_DISABLED',
        message: 'GitHub tool is disabled',
      };
    }

    if (toolLower.startsWith('stripe') && controls.disable_stripe) {
      return {
        allowed: false,
        code: 'TOOL_DISABLED',
        message: 'Stripe tool is disabled',
      };
    }
  }

  return { allowed: true };
}
