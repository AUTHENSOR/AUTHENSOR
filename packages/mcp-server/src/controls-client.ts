/**
 * Controls Client
 *
 * Fetches execution controls from the control-plane with caching.
 * Provides defense-in-depth by checking controls before executing tools.
 */

export interface Controls {
  disableExecution: boolean;
  disableHttp: boolean;
  disableGithub: boolean;
  disableStripe: boolean;
  updatedAt: string;
}

// Cache state
let controlsCache: Controls | null = null;
let cacheExpiresAt: number = 0;
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Fetch controls from the control-plane
 */
export async function fetchControls(controlPlaneUrl: string, apiKey?: string): Promise<Controls> {
  const now = Date.now();

  // Return cached controls if still valid
  if (controlsCache && now < cacheExpiresAt) {
    return controlsCache;
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${controlPlaneUrl}/controls`, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      // If controls endpoint fails, default to allowing execution
      console.warn(`[controls] Failed to fetch controls: ${response.status} ${response.statusText}`);
      return getDefaultControls();
    }

    const data = await response.json() as Controls;
    controlsCache = data;
    cacheExpiresAt = now + CACHE_TTL_MS;
    return data;
  } catch (error) {
    console.warn('[controls] Failed to fetch controls, using defaults:', error);
    return getDefaultControls();
  }
}

/**
 * Get default controls (all enabled)
 */
function getDefaultControls(): Controls {
  return {
    disableExecution: false,
    disableHttp: false,
    disableGithub: false,
    disableStripe: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Check if a tool is allowed to execute
 * Returns error info if blocked, null if allowed
 */
export async function checkToolAllowed(
  controlPlaneUrl: string,
  toolName: string,
  apiKey?: string
): Promise<{ allowed: false; code: string; message: string } | { allowed: true }> {
  const controls = await fetchControls(controlPlaneUrl, apiKey);

  // Global kill switch
  if (controls.disableExecution) {
    return {
      allowed: false,
      code: 'EXECUTION_DISABLED',
      message: 'Execution is globally disabled',
    };
  }

  // Per-tool checks
  const toolLower = toolName.toLowerCase();

  if (toolLower.startsWith('http') && controls.disableHttp) {
    return {
      allowed: false,
      code: 'TOOL_DISABLED',
      message: 'HTTP tool is disabled',
    };
  }

  if (toolLower.startsWith('stripe') && controls.disableStripe) {
    return {
      allowed: false,
      code: 'TOOL_DISABLED',
      message: 'Stripe tool is disabled',
    };
  }

  if (toolLower.startsWith('github') && controls.disableGithub) {
    return {
      allowed: false,
      code: 'TOOL_DISABLED',
      message: 'GitHub tool is disabled',
    };
  }

  return { allowed: true };
}

/**
 * Clear the controls cache (for testing)
 */
export function clearControlsCache(): void {
  controlsCache = null;
  cacheExpiresAt = 0;
}
