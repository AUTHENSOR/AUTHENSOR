/**
 * GitHub Tools
 *
 * GitHub API tools with Authensor policy enforcement.
 * Uses evaluateAndExecute() for consistent sandbox/claim handling.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { AuthensorClient } from '../authensor-client.js';
import {
  configBlocked,
  rateLimited,
  upstream4xx,
  upstream5xx,
  type ExecutionError,
} from '../hardening/errors.js';

export const githubTools: Tool[] = [
  {
    name: 'github_list_repos',
    description:
      'List repositories for the authenticated user or an organization. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        org: {
          type: 'string',
          description: 'Organization name (if listing org repos)',
        },
        type: {
          type: 'string',
          enum: ['all', 'owner', 'public', 'private', 'member'],
          description: 'Type of repositories to list (default: all)',
        },
        per_page: {
          type: 'number',
          description: 'Results per page (default: 30, max: 100)',
        },
      },
    },
  },
  {
    name: 'github_create_issue',
    description: 'Create a new issue in a repository. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        title: { type: 'string', description: 'Issue title' },
        body: { type: 'string', description: 'Issue body/description' },
        labels: { type: 'array', items: { type: 'string' }, description: 'Labels to apply' },
        assignees: { type: 'array', items: { type: 'string' }, description: 'Users to assign' },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  {
    name: 'github_list_issues',
    description: 'List issues in a repository. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        state: { type: 'string', enum: ['open', 'closed', 'all'], description: 'Issue state' },
        per_page: { type: 'number', description: 'Results per page (default: 30, max: 100)' },
      },
      required: ['owner', 'repo'],
    },
  },
  {
    name: 'github_create_comment',
    description: 'Create a comment on an issue or pull request. Subject to Authensor policy enforcement.',
    inputSchema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo: { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue or PR number' },
        body: { type: 'string', description: 'Comment body' },
      },
      required: ['owner', 'repo', 'issue_number', 'body'],
    },
  },
];

const GITHUB_API = 'https://api.github.com';

const parseList = (val?: string): string[] =>
  (val || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

const sanitizeRepoPart = (part: unknown): string | null => {
  if (typeof part !== 'string') return null;
  const trimmed = part.trim();
  if (!trimmed || trimmed.length > 100) return null;
  if (!/^[A-Za-z0-9_.-]+$/.test(trimmed)) return null;
  return trimmed;
};

const computeRetryAt = (headers: { get: (k: string) => string | null }): string => {
  const retryAfter = headers.get('retry-after');
  if (retryAfter) {
    const numeric = Number(retryAfter);
    if (!Number.isNaN(numeric)) return new Date(Date.now() + numeric * 1000).toISOString();
    const parsed = Date.parse(retryAfter);
    if (!Number.isNaN(parsed)) return new Date(parsed).toISOString();
  }
  const reset = headers.get('x-ratelimit-reset');
  if (reset) {
    const numeric = Number(reset);
    if (!Number.isNaN(numeric)) return new Date(numeric * 1000).toISOString();
  }
  return new Date(Date.now() + 60_000).toISOString();
};

const isRepoAllowed = (
  owner: string,
  repo: string,
  env: string,
  allowedRepos: string[],
  allowedOrgs: string[]
): boolean => {
  const isDev = env === 'dev' || env === 'development';
  if (allowedRepos.length === 0 && allowedOrgs.length === 0) {
    return isDev;
  }
  const key = `${owner}/${repo}`.toLowerCase();
  if (allowedRepos.map((r) => r.toLowerCase()).includes(key)) return true;
  if (allowedOrgs.map((o) => o.toLowerCase()).includes(owner.toLowerCase())) return true;
  return false;
};

/**
 * Custom error class for GitHub errors with retry info
 */
class GitHubExecutionError extends Error {
  code: string;
  retryable: boolean;
  retryAt?: string;

  constructor(err: ExecutionError) {
    super(err.message);
    this.code = err.code;
    this.retryable = err.retryable ?? false;
    this.retryAt = err.retryAt;
  }
}

/**
 * Make a GitHub API request
 */
async function githubRequest(
  path: string,
  token: string,
  options: RequestInit = {}
): Promise<any> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...options.headers,
    },
  });

  const bodyText = await response.text();

  if (!response.ok) {
    const lower = bodyText.toLowerCase();
    const hasSecondarySignal =
      lower.includes('secondary rate limit') || lower.includes('abuse detection') || lower.includes('rate limit');
    const retryAt =
      response.status === 429 || response.status === 403 || hasSecondarySignal
        ? computeRetryAt(response.headers)
        : undefined;

    if (response.status === 429 || response.status === 403 || hasSecondarySignal) {
      throw new GitHubExecutionError(rateLimited(retryAt, 'GitHub rate limited'));
    }
    if (response.status >= 500) {
      throw new GitHubExecutionError(upstream5xx(response.status, 'GitHub upstream error'));
    }
    throw new GitHubExecutionError(upstream4xx(response.status, 'GitHub request failed'));
  }

  return bodyText ? JSON.parse(bodyText) : null;
}

export async function executeGithubTool(
  toolName: string,
  args: unknown,
  authensor: AuthensorClient,
  tokenOverride?: string
) {
  const token = process.env.GITHUB_TOKEN || tokenOverride;
  if (!token) {
    return {
      content: [
        {
          type: 'text' as const,
          text: 'GitHub token not configured. Set GITHUB_TOKEN environment variable.',
        },
      ],
      isError: true,
    };
  }

  const params = args as Record<string, unknown>;
  const env = (params.environment as string) || process.env.AUTHENSOR_ENV || process.env.NODE_ENV || 'development';
  const allowedRepos = parseList(process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS).map((r) => r.toLowerCase());
  const allowedOrgs = parseList(process.env.AUTHENSOR_GITHUB_ALLOWED_ORGS).map((o) => o.toLowerCase());
  const allowAllInDev = (env === 'dev' || env === 'development') && allowedRepos.length === 0 && allowedOrgs.length === 0;

  try {
    switch (toolName) {
      case 'github_list_repos': {
        const org = params.org as string | undefined;
        const path = org ? `/orgs/${org}/repos` : '/user/repos';

        if (!allowAllInDev && allowedRepos.length === 0 && allowedOrgs.length === 0) {
          const err = configBlocked('GitHub allowlist not configured');
          return { content: [{ type: 'text' as const, text: `${err.code}: ${err.message}` }], isError: true };
        }
        if (org && !allowAllInDev && !allowedOrgs.includes(org.toLowerCase())) {
          const err = configBlocked('Organization not allowed by allowlist');
          return { content: [{ type: 'text' as const, text: `${err.code}: ${err.message}` }], isError: true };
        }

        const query = new URLSearchParams();
        if (params.type) query.set('type', params.type as string);
        query.set('per_page', String(Math.min((params.per_page as number) || 30, 100)));

        const { result, receiptId } = await authensor.evaluateAndExecute(
          'github.repos.list',
          org ? `github://orgs/${org}/repos` : 'github://user/repos',
          async (_receiptId: string) => {
            const response = await githubRequest(`${path}?${query.toString()}`, token);
            return {
              repos:
                (response as any[])?.map((repo) => ({
                  name: repo.name,
                  full_name: repo.full_name,
                  private: repo.private,
                })) ?? [],
            };
          },
          {
            operation: 'read',
            parameters: params,
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'github_list_repos',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      case 'github_create_issue': {
        const owner = sanitizeRepoPart(params.owner);
        const repo = sanitizeRepoPart(params.repo);
        if (!owner || !repo) {
          return { content: [{ type: 'text' as const, text: 'INVALID_INPUT: owner/repo required' }], isError: true };
        }
        if (!isRepoAllowed(owner, repo, env, allowedRepos, allowedOrgs)) {
          const err = configBlocked('Repository not allowed by allowlist');
          return { content: [{ type: 'text' as const, text: `${err.code}: ${err.message}` }], isError: true };
        }

        const title = params.title as string | undefined;
        const body = (params.body as string | undefined) || '';
        if (!title) {
          return { content: [{ type: 'text' as const, text: 'INVALID_INPUT: title required' }], isError: true };
        }

        const { result, receiptId } = await authensor.evaluateAndExecute(
          'github.issues.create',
          `github://repos/${owner}/${repo}/issues`,
          async (idempotencyReceiptId: string) => {
            const response = await githubRequest(`/repos/${owner}/${repo}/issues`, token, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title,
                body: `${body}\n\nAuthensor-Receipt: ${idempotencyReceiptId}`,
                labels: params.labels,
                assignees: params.assignees,
              }),
            });
            return {
              issueUrl: (response as any).html_url || (response as any).url,
              issueNumber: (response as any).number,
              repo: `${owner}/${repo}`,
            };
          },
          {
            operation: 'create',
            parameters: { ...params, owner, repo },
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'github_create_issue',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      case 'github_list_issues': {
        const owner = sanitizeRepoPart(params.owner);
        const repo = sanitizeRepoPart(params.repo);
        if (!owner || !repo) {
          return { content: [{ type: 'text' as const, text: 'INVALID_INPUT: owner/repo required' }], isError: true };
        }
        if (!isRepoAllowed(owner, repo, env, allowedRepos, allowedOrgs)) {
          const err = configBlocked('Repository not allowed by allowlist');
          return { content: [{ type: 'text' as const, text: `${err.code}: ${err.message}` }], isError: true };
        }

        const query = new URLSearchParams();
        if (params.state) query.set('state', params.state as string);
        if (params.per_page) query.set('per_page', String(params.per_page));

        const { result, receiptId } = await authensor.evaluateAndExecute(
          'github.issues.list',
          `github://repos/${owner}/${repo}/issues`,
          async (_receiptId: string) => {
            const response = await githubRequest(`/repos/${owner}/${repo}/issues?${query}`, token);
            return {
              issues:
                (response as any[])?.map((issue) => ({
                  number: issue.number,
                  title: issue.title,
                  state: issue.state,
                  url: issue.html_url || issue.url,
                })) ?? [],
            };
          },
          {
            operation: 'read',
            parameters: { ...params, owner, repo },
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'github_list_issues',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      case 'github_create_comment': {
        const owner = sanitizeRepoPart(params.owner);
        const repo = sanitizeRepoPart(params.repo);
        const issueNumber = params.issue_number as number | undefined;
        const body = params.body as string | undefined;
        if (!owner || !repo || typeof issueNumber !== 'number' || !body) {
          return {
            content: [{ type: 'text' as const, text: 'INVALID_INPUT: owner, repo, issue_number, body required' }],
            isError: true,
          };
        }
        if (!isRepoAllowed(owner, repo, env, allowedRepos, allowedOrgs)) {
          const err = configBlocked('Repository not allowed by allowlist');
          return { content: [{ type: 'text' as const, text: `${err.code}: ${err.message}` }], isError: true };
        }

        const { result, receiptId } = await authensor.evaluateAndExecute(
          'github.issues.createComment',
          `github://repos/${owner}/${repo}/issues/${issueNumber}/comments`,
          async (idempotencyReceiptId: string) => {
            const response = await githubRequest(`/repos/${owner}/${repo}/issues/${issueNumber}/comments`, token, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ body: `${body}\n\nAuthensor-Receipt: ${idempotencyReceiptId}` }),
            });
            return {
              commentUrl: (response as any).html_url || (response as any).url,
              repo: `${owner}/${repo}`,
              issueNumber,
            };
          },
          {
            operation: 'create',
            parameters: { ...params, owner, repo },
            context: { environment: env as 'development' | 'staging' | 'production' },
            toolName: 'github_create_comment',
          }
        );

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ...result, receiptId }, null, 2),
            },
          ],
        };
      }

      default:
        return {
          content: [{ type: 'text' as const, text: `Unknown GitHub tool: ${toolName}` }],
          isError: true,
        };
    }
  } catch (error) {
    if (error instanceof GitHubExecutionError) {
      return {
        content: [{ type: 'text' as const, text: `${error.code}: ${error.message}` }],
        isError: true,
      };
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{ type: 'text' as const, text: `GitHub operation failed: ${message}` }],
      isError: true,
    };
  }
}
