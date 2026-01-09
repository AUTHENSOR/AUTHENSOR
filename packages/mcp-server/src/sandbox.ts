/**
 * Sandbox Module
 *
 * Provides stubbed execution mode for partner-safe testing.
 * When AUTHENSOR_SANDBOX_MODE=stub, tools return deterministic fake outputs
 * without making actual upstream API calls.
 */

export type SandboxMode = 'stub' | 'real';

/**
 * Get current sandbox mode from environment
 */
export function getSandboxMode(): SandboxMode {
  const mode = process.env.AUTHENSOR_SANDBOX_MODE?.toLowerCase();
  if (mode === 'stub') return 'stub';
  return 'real';
}

/**
 * Check if running in sandbox (stub) mode
 */
export function isSandboxMode(): boolean {
  return getSandboxMode() === 'stub';
}

/**
 * Generate a deterministic stub result based on receipt ID and action type
 * Uses receipt ID as seed for reproducibility
 */
function deterministicId(receiptId: string, prefix: string): string {
  // Create a simple hash from receipt ID
  let hash = 0;
  for (let i = 0; i < receiptId.length; i++) {
    const char = receiptId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  const positive = Math.abs(hash);
  return `${prefix}_stub_${positive.toString(16).padStart(8, '0')}`;
}

/**
 * Generate stub result for HTTP requests
 */
export function stubHttpResult(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const method = (params.method as string) || 'GET';
  const url = params.url as string;

  return {
    _stub: true,
    _mode: 'stub',
    status: 200,
    statusText: 'OK (Stubbed)',
    finalUrl: url,
    resolvedIps: ['127.0.0.1'],
    headers: {
      'content-type': 'application/json',
      'x-stub-mode': 'true',
    },
    body: JSON.stringify({
      message: 'Stubbed HTTP response',
      method,
      url,
      receiptId,
    }),
  };
}

/**
 * Generate stub result for Stripe list customers
 */
export function stubStripeListCustomers(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const limit = Math.min((params.limit as number) || 10, 100);
  const customers = [];
  for (let i = 0; i < Math.min(limit, 3); i++) {
    customers.push({
      id: deterministicId(`${receiptId}-${i}`, 'cus'),
      email: `stub${i}@example.com`,
    });
  }
  return { _stub: true, _mode: 'stub', customers };
}

/**
 * Generate stub result for Stripe create customer
 */
export function stubStripeCreateCustomer(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    _stub: true,
    _mode: 'stub',
    stripeId: deterministicId(receiptId, 'cus'),
    objectType: 'customer',
    email: params.email as string,
  };
}

/**
 * Generate stub result for Stripe create charge
 */
export function stubStripeCreateCharge(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  return {
    _stub: true,
    _mode: 'stub',
    stripeId: deterministicId(receiptId, 'ch'),
    objectType: 'charge',
    status: 'succeeded',
    amount: params.amount as number,
    currency: ((params.currency as string) || 'usd').toLowerCase(),
  };
}

/**
 * Generate stub result for Stripe list charges
 */
export function stubStripeListCharges(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const limit = Math.min((params.limit as number) || 10, 100);
  const charges = [];
  for (let i = 0; i < Math.min(limit, 3); i++) {
    charges.push({
      id: deterministicId(`${receiptId}-${i}`, 'ch'),
      amount: 1000 + i * 100,
      currency: 'usd',
    });
  }
  return { _stub: true, _mode: 'stub', charges };
}

/**
 * Generate stub result for GitHub list repos
 */
export function stubGithubListRepos(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const org = params.org as string | undefined;
  const repos = [];
  for (let i = 0; i < 3; i++) {
    repos.push({
      name: `stub-repo-${i}`,
      full_name: org ? `${org}/stub-repo-${i}` : `stub-user/stub-repo-${i}`,
      private: false,
    });
  }
  return { _stub: true, _mode: 'stub', repos };
}

/**
 * Generate stub result for GitHub create issue
 */
export function stubGithubCreateIssue(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const owner = params.owner as string;
  const repo = params.repo as string;
  const issueNumber = Math.abs(receiptId.charCodeAt(0) * 100 + receiptId.charCodeAt(1));

  return {
    _stub: true,
    _mode: 'stub',
    issueUrl: `https://github.com/${owner}/${repo}/issues/${issueNumber}`,
    issueNumber,
    repo: `${owner}/${repo}`,
  };
}

/**
 * Generate stub result for GitHub list issues
 */
export function stubGithubListIssues(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const owner = params.owner as string;
  const repo = params.repo as string;
  const issues = [];
  for (let i = 0; i < 3; i++) {
    issues.push({
      number: i + 1,
      title: `Stub Issue ${i + 1}`,
      state: 'open',
      url: `https://github.com/${owner}/${repo}/issues/${i + 1}`,
    });
  }
  return { _stub: true, _mode: 'stub', issues };
}

/**
 * Generate stub result for GitHub create comment
 */
export function stubGithubCreateComment(receiptId: string, params: Record<string, unknown>): Record<string, unknown> {
  const owner = params.owner as string;
  const repo = params.repo as string;
  const issueNumber = params.issue_number as number;

  return {
    _stub: true,
    _mode: 'stub',
    commentUrl: `https://github.com/${owner}/${repo}/issues/${issueNumber}#issuecomment-stub`,
    repo: `${owner}/${repo}`,
    issueNumber,
  };
}

/**
 * Get stub result for a given tool and action type
 */
export function getStubResult(
  toolName: string,
  receiptId: string,
  params: Record<string, unknown>
): Record<string, unknown> | null {
  switch (toolName) {
    case 'http_request':
      return stubHttpResult(receiptId, params);
    case 'stripe_list_customers':
      return stubStripeListCustomers(receiptId, params);
    case 'stripe_create_customer':
      return stubStripeCreateCustomer(receiptId, params);
    case 'stripe_create_charge':
      return stubStripeCreateCharge(receiptId, params);
    case 'stripe_list_charges':
      return stubStripeListCharges(receiptId, params);
    case 'github_list_repos':
      return stubGithubListRepos(receiptId, params);
    case 'github_create_issue':
      return stubGithubCreateIssue(receiptId, params);
    case 'github_list_issues':
      return stubGithubListIssues(receiptId, params);
    case 'github_create_comment':
      return stubGithubCreateComment(receiptId, params);
    default:
      return null;
  }
}
