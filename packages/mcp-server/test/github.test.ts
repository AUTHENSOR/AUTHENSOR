import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AuthensorClient } from '../src/authensor-client.js';
import { executeGithubTool } from '../src/tools/github.js';

type MockAuthensor = AuthensorClient & {
  evaluate: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  updateReceipt: ReturnType<typeof vi.fn>;
  evaluateAndExecute: ReturnType<typeof vi.fn>;
};

const mockAuthensor = (): MockAuthensor => {
  const mock = {
    createEnvelope: vi.fn().mockImplementation((actionType, resource, options) => ({
      id: 'env',
      timestamp: new Date().toISOString(),
      action: { type: actionType, resource, operation: options.operation, parameters: options.parameters },
      principal: { type: 'agent', id: 'tester' },
      context: { environment: options.context?.environment ?? 'development' },
    })),
    evaluate: vi.fn().mockResolvedValue({
      receiptId: 'rec_123',
      decision: { outcome: 'allow', policyId: 'p', policyVersion: 'v1' },
      evaluationTimeMs: 1,
    }),
    claim: vi.fn().mockResolvedValue({ claimId: 'claim_1' }),
    updateReceipt: vi.fn().mockResolvedValue(undefined),
    evaluateAndExecute: vi.fn(),
  };

  // Implement evaluateAndExecute to chain through internal methods
  mock.evaluateAndExecute.mockImplementation(async (actionType, resource, executor, options = {}) => {
    const envelope = mock.createEnvelope(actionType, resource, options);
    const evaluation = await mock.evaluate(envelope);

    if (evaluation.decision.outcome !== 'allow') {
      throw new Error(`Action denied: ${evaluation.decision.reason || evaluation.decision.outcome}`);
    }

    const claim = await mock.claim(evaluation.receiptId);
    if (!claim.claimId) {
      throw new Error('Unable to claim receipt for execution');
    }

    const startTime = Date.now();

    try {
      const result = await executor(evaluation.receiptId);
      const durationMs = Date.now() - startTime;

      await mock.updateReceipt(
        evaluation.receiptId,
        'executed',
        { durationMs, result },
        claim.claimId
      );

      return { result, receiptId: evaluation.receiptId };
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorInfo = error instanceof Error
        ? { message: error.message, code: (error as any).code, retryAt: (error as any).retryAt }
        : { message: 'Unknown error' };

      await mock.updateReceipt(
        evaluation.receiptId,
        'failed',
        { durationMs, error: errorInfo },
        claim.claimId
      );

      throw error;
    }
  });

  return mock as unknown as MockAuthensor;
};

const fetchMock = vi.fn();

const makeResponse = (status: number, body: any, headers: Record<string, string> = {}) => {
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: {
      get: (key: string) => lower[key.toLowerCase()] ?? null,
    },
    async text() {
      return typeof body === 'string' ? body : JSON.stringify(body);
    },
  };
};

const resetEnv = () => {
  process.env.GITHUB_TOKEN = 'ghp_test';
  delete process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS;
  delete process.env.AUTHENSOR_GITHUB_ALLOWED_ORGS;
};

describe('github tool hardening', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    resetEnv();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('blocks disallowed repo before calling upstream', async () => {
    const authensor = mockAuthensor();

    const res = await executeGithubTool(
      'github_create_issue',
      { owner: 'foo', repo: 'bar', title: 'hi', environment: 'prod' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(res.content[0]?.text).toContain('CONFIG_BLOCKED');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(authensor.evaluate).not.toHaveBeenCalled();
  });

  it('redacts token from errors and normalizes failure', async () => {
    process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS = 'foo/bar';
    const authensor = mockAuthensor();
    fetchMock.mockResolvedValue(makeResponse(400, { message: `bad token ${process.env.GITHUB_TOKEN}` }));

    const res = await executeGithubTool(
      'github_create_issue',
      { owner: 'foo', repo: 'bar', title: 'hi', body: 'test' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'failed',
      expect.objectContaining({
        error: expect.objectContaining({ code: 'UPSTREAM_4XX' }),
      }),
      'claim_1'
    );
    const serialized = JSON.stringify(authensor.updateReceipt.mock.calls[0]);
    expect(serialized).not.toContain(process.env.GITHUB_TOKEN as string);
  });

  it('maps 429 to RATE_LIMITED with retryAt and no retries', async () => {
    process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS = 'foo/bar';
    const authensor = mockAuthensor();
    fetchMock.mockResolvedValue(makeResponse(429, { message: 'rate limited' }, { 'retry-after': '120' }));

    const res = await executeGithubTool(
      'github_create_comment',
      { owner: 'foo', repo: 'bar', issue_number: 1, body: 'hello' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'failed',
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMITED', retryAt: expect.any(String) }),
      }),
      'claim_1'
    );
  });

  it('maps 403 with rate limit headers to RATE_LIMITED', async () => {
    process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS = 'foo/bar';
    const authensor = mockAuthensor();
    const retryAt = Math.floor(Date.now() / 1000) + 90;
    fetchMock.mockResolvedValue(
      makeResponse(403, { message: 'secondary rate limit' }, { 'x-ratelimit-reset': `${retryAt}` })
    );

    const res = await executeGithubTool(
      'github_create_comment',
      { owner: 'foo', repo: 'bar', issue_number: 1, body: 'hello' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'failed',
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMITED', retryAt: expect.any(String) }),
      }),
      'claim_1'
    );
  });

  it('maps 403 secondary rate limit body to RATE_LIMITED', async () => {
    process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS = 'foo/bar';
    const authensor = mockAuthensor();
    fetchMock.mockResolvedValue(
      makeResponse(403, { message: 'You have exceeded a secondary rate limit' })
    );

    const res = await executeGithubTool(
      'github_create_comment',
      { owner: 'foo', repo: 'bar', issue_number: 1, body: 'hello' },
      authensor
    );

    expect(res.isError).toBe(true);
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'failed',
      expect.objectContaining({
        error: expect.objectContaining({ code: 'RATE_LIMITED', retryAt: expect.any(String) }),
      }),
      'claim_1'
    );
  });

  it('adds receipt marker and normalizes success result', async () => {
    process.env.AUTHENSOR_GITHUB_ALLOWED_REPOS = 'foo/bar';
    const authensor = mockAuthensor();
    fetchMock.mockResolvedValue(
      makeResponse(201, { html_url: 'https://github.com/foo/bar/issues/1', number: 1 })
    );

    const res = await executeGithubTool(
      'github_create_issue',
      { owner: 'foo', repo: 'bar', title: 'hi', body: 'test body' },
      authensor
    );

    expect(res.isError).toBeUndefined();
    const call = fetchMock.mock.calls[0];
    const payload = JSON.parse(call?.[1]?.body);
    expect(payload.body).toContain('Authensor-Receipt: rec_123');
    expect(authensor.updateReceipt).toHaveBeenCalledWith(
      'rec_123',
      'executed',
      expect.objectContaining({
        result: expect.objectContaining({ issueUrl: 'https://github.com/foo/bar/issues/1', issueNumber: 1 }),
      }),
      'claim_1'
    );
  });
});
