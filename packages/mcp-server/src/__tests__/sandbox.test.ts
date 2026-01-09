/**
 * Sandbox Mode Tests
 *
 * Tests for stubbed execution in sandbox mode.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getSandboxMode,
  isSandboxMode,
  getStubResult,
  stubHttpResult,
  stubStripeListCustomers,
  stubStripeCreateCustomer,
  stubStripeCreateCharge,
  stubStripeListCharges,
  stubGithubListRepos,
  stubGithubCreateIssue,
  stubGithubListIssues,
  stubGithubCreateComment,
} from '../sandbox.js';

describe('Sandbox Mode', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getSandboxMode', () => {
    it('returns "real" by default', () => {
      delete process.env.AUTHENSOR_SANDBOX_MODE;
      expect(getSandboxMode()).toBe('real');
    });

    it('returns "stub" when AUTHENSOR_SANDBOX_MODE=stub', () => {
      process.env.AUTHENSOR_SANDBOX_MODE = 'stub';
      expect(getSandboxMode()).toBe('stub');
    });

    it('is case-insensitive', () => {
      process.env.AUTHENSOR_SANDBOX_MODE = 'STUB';
      expect(getSandboxMode()).toBe('stub');

      process.env.AUTHENSOR_SANDBOX_MODE = 'Stub';
      expect(getSandboxMode()).toBe('stub');
    });

    it('returns "real" for unknown values', () => {
      process.env.AUTHENSOR_SANDBOX_MODE = 'unknown';
      expect(getSandboxMode()).toBe('real');
    });
  });

  describe('isSandboxMode', () => {
    it('returns false by default', () => {
      delete process.env.AUTHENSOR_SANDBOX_MODE;
      expect(isSandboxMode()).toBe(false);
    });

    it('returns true when AUTHENSOR_SANDBOX_MODE=stub', () => {
      process.env.AUTHENSOR_SANDBOX_MODE = 'stub';
      expect(isSandboxMode()).toBe(true);
    });
  });

  describe('Deterministic Results', () => {
    it('produces the same result for the same receiptId', () => {
      const receiptId = 'test-receipt-123';
      const params = { url: 'https://example.com', method: 'GET' };

      const result1 = stubHttpResult(receiptId, params);
      const result2 = stubHttpResult(receiptId, params);

      expect(result1).toEqual(result2);
    });

    it('produces different results for different receiptIds', () => {
      const params = { email: 'test@example.com' };

      const result1 = stubStripeCreateCustomer('receipt-1', params);
      const result2 = stubStripeCreateCustomer('receipt-2', params);

      expect(result1.stripeId).not.toBe(result2.stripeId);
    });
  });
});

describe('HTTP Stub Results', () => {
  it('stubHttpResult includes _stub marker', () => {
    const result = stubHttpResult('receipt-1', { url: 'https://api.example.com', method: 'POST' });

    expect(result._stub).toBe(true);
    expect(result._mode).toBe('stub');
    expect(result.status).toBe(200);
    expect(result.statusText).toBe('OK (Stubbed)');
  });

  it('stubHttpResult includes request info in body', () => {
    const url = 'https://api.example.com/data';
    const method = 'PUT';
    const result = stubHttpResult('receipt-1', { url, method });

    const body = JSON.parse(result.body as string);
    expect(body.url).toBe(url);
    expect(body.method).toBe(method);
    expect(body.receiptId).toBe('receipt-1');
  });
});

describe('Stripe Stub Results', () => {
  describe('stubStripeListCustomers', () => {
    it('returns customers array with _stub marker', () => {
      const result = stubStripeListCustomers('receipt-1', { limit: 10 });

      expect(result._stub).toBe(true);
      expect(result._mode).toBe('stub');
      expect(Array.isArray(result.customers)).toBe(true);
      expect(result.customers).toHaveLength(3); // Max 3 stub customers
    });

    it('respects limit parameter', () => {
      const result = stubStripeListCustomers('receipt-1', { limit: 2 });
      expect(result.customers).toHaveLength(2);
    });

    it('caps at 3 customers regardless of higher limit', () => {
      const result = stubStripeListCustomers('receipt-1', { limit: 100 });
      expect(result.customers).toHaveLength(3);
    });
  });

  describe('stubStripeCreateCustomer', () => {
    it('returns customer with deterministic ID', () => {
      const result = stubStripeCreateCustomer('receipt-1', { email: 'test@example.com' });

      expect(result._stub).toBe(true);
      expect(result.stripeId).toContain('cus_stub_');
      expect(result.objectType).toBe('customer');
      expect(result.email).toBe('test@example.com');
    });
  });

  describe('stubStripeCreateCharge', () => {
    it('returns charge with succeeded status', () => {
      const result = stubStripeCreateCharge('receipt-1', { amount: 2000, currency: 'USD' });

      expect(result._stub).toBe(true);
      expect(result.stripeId).toContain('ch_stub_');
      expect(result.objectType).toBe('charge');
      expect(result.status).toBe('succeeded');
      expect(result.amount).toBe(2000);
      expect(result.currency).toBe('usd'); // Normalized to lowercase
    });

    it('defaults currency to usd', () => {
      const result = stubStripeCreateCharge('receipt-1', { amount: 1000 });
      expect(result.currency).toBe('usd');
    });
  });

  describe('stubStripeListCharges', () => {
    it('returns charges array', () => {
      const result = stubStripeListCharges('receipt-1', { limit: 10 });

      expect(result._stub).toBe(true);
      expect(Array.isArray(result.charges)).toBe(true);
      expect(result.charges).toHaveLength(3);
    });

    it('each charge has deterministic ID', () => {
      const result = stubStripeListCharges('receipt-1', {});
      const charges = result.charges as Array<{ id: string }>;

      charges.forEach((charge) => {
        expect(charge.id).toContain('ch_stub_');
      });
    });
  });
});

describe('GitHub Stub Results', () => {
  describe('stubGithubListRepos', () => {
    it('returns repos array with org context', () => {
      const result = stubGithubListRepos('receipt-1', { org: 'my-org' });

      expect(result._stub).toBe(true);
      expect(Array.isArray(result.repos)).toBe(true);
      expect(result.repos).toHaveLength(3);

      const repos = result.repos as Array<{ full_name: string }>;
      expect(repos[0].full_name).toContain('my-org/');
    });

    it('uses stub-user when no org provided', () => {
      const result = stubGithubListRepos('receipt-1', {});

      const repos = result.repos as Array<{ full_name: string }>;
      expect(repos[0].full_name).toContain('stub-user/');
    });
  });

  describe('stubGithubCreateIssue', () => {
    it('returns issue URL and number', () => {
      const result = stubGithubCreateIssue('receipt-1', {
        owner: 'my-org',
        repo: 'my-repo',
        title: 'Test Issue',
      });

      expect(result._stub).toBe(true);
      expect(result.issueUrl).toContain('https://github.com/my-org/my-repo/issues/');
      expect(typeof result.issueNumber).toBe('number');
      expect(result.repo).toBe('my-org/my-repo');
    });

    it('produces deterministic issue number', () => {
      const result1 = stubGithubCreateIssue('receipt-1', { owner: 'org', repo: 'repo' });
      const result2 = stubGithubCreateIssue('receipt-1', { owner: 'org', repo: 'repo' });

      expect(result1.issueNumber).toBe(result2.issueNumber);
    });
  });

  describe('stubGithubListIssues', () => {
    it('returns issues array', () => {
      const result = stubGithubListIssues('receipt-1', { owner: 'my-org', repo: 'my-repo' });

      expect(result._stub).toBe(true);
      expect(Array.isArray(result.issues)).toBe(true);
      expect(result.issues).toHaveLength(3);

      const issues = result.issues as Array<{ url: string; state: string }>;
      issues.forEach((issue) => {
        expect(issue.url).toContain('https://github.com/my-org/my-repo/issues/');
        expect(issue.state).toBe('open');
      });
    });
  });

  describe('stubGithubCreateComment', () => {
    it('returns comment URL', () => {
      const result = stubGithubCreateComment('receipt-1', {
        owner: 'my-org',
        repo: 'my-repo',
        issue_number: 42,
        body: 'Test comment',
      });

      expect(result._stub).toBe(true);
      expect(result.commentUrl).toContain('https://github.com/my-org/my-repo/issues/42#issuecomment-stub');
      expect(result.issueNumber).toBe(42);
      expect(result.repo).toBe('my-org/my-repo');
    });
  });
});

describe('getStubResult', () => {
  it('dispatches to correct stub function for http_request', () => {
    const result = getStubResult('http_request', 'receipt-1', { url: 'https://example.com' });

    expect(result).not.toBeNull();
    expect(result?._stub).toBe(true);
    expect(result?.status).toBe(200);
  });

  it('dispatches to correct stub function for stripe tools', () => {
    expect(getStubResult('stripe_list_customers', 'r1', {})?._stub).toBe(true);
    expect(getStubResult('stripe_create_customer', 'r1', {})?._stub).toBe(true);
    expect(getStubResult('stripe_create_charge', 'r1', {})?._stub).toBe(true);
    expect(getStubResult('stripe_list_charges', 'r1', {})?._stub).toBe(true);
  });

  it('dispatches to correct stub function for github tools', () => {
    expect(getStubResult('github_list_repos', 'r1', {})?._stub).toBe(true);
    expect(getStubResult('github_create_issue', 'r1', { owner: 'o', repo: 'r' })?._stub).toBe(true);
    expect(getStubResult('github_list_issues', 'r1', { owner: 'o', repo: 'r' })?._stub).toBe(true);
    expect(getStubResult('github_create_comment', 'r1', { owner: 'o', repo: 'r', issue_number: 1 })?._stub).toBe(true);
  });

  it('returns null for unknown tools', () => {
    const result = getStubResult('unknown_tool', 'receipt-1', {});
    expect(result).toBeNull();
  });
});

describe('Integration: Stub marker in all results', () => {
  const tools = [
    { name: 'http_request', params: { url: 'https://example.com' } },
    { name: 'stripe_list_customers', params: {} },
    { name: 'stripe_create_customer', params: { email: 'test@example.com' } },
    { name: 'stripe_create_charge', params: { amount: 1000 } },
    { name: 'stripe_list_charges', params: {} },
    { name: 'github_list_repos', params: {} },
    { name: 'github_create_issue', params: { owner: 'org', repo: 'repo' } },
    { name: 'github_list_issues', params: { owner: 'org', repo: 'repo' } },
    { name: 'github_create_comment', params: { owner: 'org', repo: 'repo', issue_number: 1 } },
  ];

  tools.forEach(({ name, params }) => {
    it(`${name} includes _stub and _mode markers`, () => {
      const result = getStubResult(name, 'receipt-test', params);

      expect(result).not.toBeNull();
      expect(result?._stub).toBe(true);
      expect(result?._mode).toBe('stub');
    });
  });
});
