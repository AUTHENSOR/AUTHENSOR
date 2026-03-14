/**
 * @authensor/claude-agent-sdk — Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthensorClaudeGuard,
  AuthensorDeniedError,
} from './index.js';

// ── Mock fetch globally ────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });

function mockEvaluateResponse(outcome: string, reason?: string) {
  return {
    ok: true,
    json: async () => ({
      receiptId: 'receipt-001',
      decision: { outcome, reason },
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AuthensorClaudeGuard', () => {
  let guard: AuthensorClaudeGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new AuthensorClaudeGuard({
      controlPlaneUrl: 'http://localhost:3000',
      apiKey: 'test-key',
    });
  });

  describe('constructor', () => {
    it('accepts a string URL shorthand', () => {
      const g = new AuthensorClaudeGuard('http://localhost:3000');
      expect(g).toBeInstanceOf(AuthensorClaudeGuard);
    });

    it('strips trailing slash from URL', async () => {
      const g = new AuthensorClaudeGuard('http://localhost:3000/');
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));
      await g.evaluate('test_tool');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/evaluate',
        expect.any(Object),
      );
    });
  });

  describe('evaluate', () => {
    it('returns allowed: true for allow outcome', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const result = await guard.evaluate('send_email', { to: 'user@test.com' });

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(result.outcome).toBe('allow');
      expect(result.receiptId).toBe('receipt-001');
    });

    it('returns allowed: false for deny outcome', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('deny', 'Action not permitted'),
      );

      const result = await guard.evaluate('delete_database');

      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(false);
      expect(result.outcome).toBe('deny');
      expect(result.reason).toBe('Action not permitted');
    });

    it('returns requiresApproval: true for require_approval outcome', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Needs human review'),
      );

      const result = await guard.evaluate('write_file', { path: '/etc/hosts' });

      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
      expect(result.outcome).toBe('require_approval');
    });

    it('sends correct envelope structure', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      await guard.evaluate('read_file', { path: '/data.json' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/evaluate');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.action.type).toBe('claude.read_file');
      expect(body.action.resource).toBe('claude://read_file');
      expect(body.action.operation).toBe('execute');
      expect(body.action.parameters).toEqual({ path: '/data.json' });
      expect(body.principal.type).toBe('agent');
      expect(body.principal.id).toBe('claude-agent');
    });

    it('includes API key in Authorization header', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      await guard.evaluate('test_tool');

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBe('Bearer test-key');
    });

    it('fails closed on fetch error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const result = await guard.evaluate('test_tool');

      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('error');
    });
  });

  describe('guard', () => {
    it('returns receipt ID on allow', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const receiptId = await guard.guard('read_file');
      expect(receiptId).toBe('receipt-001');
    });

    it('throws AuthensorDeniedError on deny', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('deny', 'Blocked by policy'),
      );

      await expect(guard.guard('delete_all')).rejects.toThrow(AuthensorDeniedError);
      try {
        mockFetch.mockResolvedValueOnce(
          mockEvaluateResponse('deny', 'Blocked by policy'),
        );
        await guard.guard('delete_all');
      } catch (err) {
        expect(err).toBeInstanceOf(AuthensorDeniedError);
        expect((err as AuthensorDeniedError).toolName).toBe('delete_all');
        expect((err as AuthensorDeniedError).outcome).toBe('deny');
      }
    });

    it('calls onApprovalRequired for require_approval', async () => {
      const onApproval = vi.fn().mockResolvedValue(true);
      const guardWithApproval = new AuthensorClaudeGuard({
        controlPlaneUrl: 'http://localhost:3000',
        onApprovalRequired: onApproval,
      });

      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Needs approval'),
      );

      const receiptId = await guardWithApproval.guard('send_email', { to: 'admin@test.com' });

      expect(onApproval).toHaveBeenCalledWith(
        'send_email',
        { to: 'admin@test.com' },
        'Needs approval',
      );
      expect(receiptId).toBe('receipt-001');
    });

    it('throws if approval is rejected', async () => {
      const onApproval = vi.fn().mockResolvedValue(false);
      const guardWithApproval = new AuthensorClaudeGuard({
        controlPlaneUrl: 'http://localhost:3000',
        onApprovalRequired: onApproval,
      });

      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Needs approval'),
      );

      await expect(
        guardWithApproval.guard('send_email'),
      ).rejects.toThrow(AuthensorDeniedError);
    });

    it('throws on require_approval when no handler provided', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Needs approval'),
      );

      await expect(guard.guard('send_email')).rejects.toThrow(AuthensorDeniedError);
    });
  });

  describe('wrapHandler', () => {
    it('calls handler when allowed', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const handler = vi.fn().mockResolvedValue({ success: true });
      const wrapped = guard.wrapHandler('my_tool', handler);

      const result = await wrapped({ query: 'hello' });

      expect(handler).toHaveBeenCalledWith({ query: 'hello' });
      expect(result).toEqual({ success: true });
    });

    it('does not call handler when denied', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('deny', 'Nope'));

      const handler = vi.fn().mockResolvedValue({ success: true });
      const wrapped = guard.wrapHandler('my_tool', handler);

      await expect(wrapped({ query: 'hello' })).rejects.toThrow(AuthensorDeniedError);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('wrapTool', () => {
    it('returns tool definition unchanged and guarded handler', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const tool = { name: 'search', description: 'Search the web' };
      const handler = vi.fn().mockResolvedValue(['result1', 'result2']);

      const wrapped = guard.wrapTool(tool, handler);

      expect(wrapped.tool).toBe(tool);
      const result = await wrapped.handler({ query: 'test' });
      expect(result).toEqual(['result1', 'result2']);
    });
  });

  describe('wrapTools', () => {
    it('wraps multiple tool/handler pairs', async () => {
      mockFetch
        .mockResolvedValueOnce(mockEvaluateResponse('allow'))
        .mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const pairs = [
        { tool: { name: 'tool_a' }, handler: vi.fn().mockResolvedValue('a') },
        { tool: { name: 'tool_b' }, handler: vi.fn().mockResolvedValue('b') },
      ];

      const wrapped = guard.wrapTools(pairs);

      expect(wrapped).toHaveLength(2);
      expect(await wrapped[0].handler({})).toBe('a');
      expect(await wrapped[1].handler({})).toBe('b');
    });
  });
});
