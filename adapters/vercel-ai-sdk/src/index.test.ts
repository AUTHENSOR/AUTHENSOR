/**
 * @authensor/vercel-ai-sdk — Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AuthensorVercelGuard,
  AuthensorDeniedError,
} from './index.js';

// ── Mock fetch globally ────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);
vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-5678' });

function mockEvaluateResponse(outcome: string, reason?: string) {
  return {
    ok: true,
    json: async () => ({
      receiptId: 'receipt-002',
      decision: { outcome, reason },
    }),
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('AuthensorVercelGuard', () => {
  let guard: AuthensorVercelGuard;

  beforeEach(() => {
    vi.clearAllMocks();
    guard = new AuthensorVercelGuard({
      controlPlaneUrl: 'http://localhost:3000',
      apiKey: 'test-key',
    });
  });

  describe('constructor', () => {
    it('accepts a string URL shorthand', () => {
      const g = new AuthensorVercelGuard('http://localhost:3000');
      expect(g).toBeInstanceOf(AuthensorVercelGuard);
    });

    it('strips trailing slash from URL', async () => {
      const g = new AuthensorVercelGuard('http://localhost:3000/');
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

      const result = await guard.evaluate('search', { query: 'hello' });

      expect(result.allowed).toBe(true);
      expect(result.requiresApproval).toBe(false);
      expect(result.outcome).toBe('allow');
      expect(result.receiptId).toBe('receipt-002');
    });

    it('returns allowed: false for deny outcome', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('deny', 'Blocked'),
      );

      const result = await guard.evaluate('drop_table');

      expect(result.allowed).toBe(false);
      expect(result.outcome).toBe('deny');
      expect(result.reason).toBe('Blocked');
    });

    it('returns requiresApproval: true for require_approval', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Needs review'),
      );

      const result = await guard.evaluate('write_file', { path: '/etc/config' });

      expect(result.allowed).toBe(false);
      expect(result.requiresApproval).toBe(true);
    });

    it('sends correct envelope structure', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      await guard.evaluate('get_weather', { city: 'Dublin' });

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('http://localhost:3000/evaluate');
      expect(options.method).toBe('POST');

      const body = JSON.parse(options.body);
      expect(body.action.type).toBe('vercel-ai.get_weather');
      expect(body.action.resource).toBe('vercel-ai://get_weather');
      expect(body.action.operation).toBe('execute');
      expect(body.action.parameters).toEqual({ city: 'Dublin' });
      expect(body.principal.type).toBe('agent');
      expect(body.principal.id).toBe('vercel-ai-agent');
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
        status: 503,
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
      expect(receiptId).toBe('receipt-002');
    });

    it('throws AuthensorDeniedError on deny', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('deny', 'Not allowed'),
      );

      await expect(guard.guard('delete_all')).rejects.toThrow(AuthensorDeniedError);
    });

    it('throws on require_approval (no approval handler in Vercel adapter)', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Needs approval'),
      );

      await expect(guard.guard('send_email')).rejects.toThrow(AuthensorDeniedError);
    });
  });

  describe('wrapTool', () => {
    it('returns tool with guarded execute function', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const execute = vi.fn().mockResolvedValue({ temp: 22 });
      const toolDef = {
        description: 'Get weather',
        parameters: {},
        execute,
      };

      const wrapped = guard.wrapTool('get_weather', toolDef);

      expect(wrapped.description).toBe('Get weather');
      const result = await wrapped.execute!({ city: 'Dublin' });
      expect(result).toEqual({ temp: 22 });
      expect(execute).toHaveBeenCalledWith({ city: 'Dublin' }, undefined);
    });

    it('blocks execute when denied', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('deny', 'Nope'));

      const execute = vi.fn().mockResolvedValue({ result: 'ok' });
      const toolDef = { description: 'Dangerous', execute };

      const wrapped = guard.wrapTool('drop_database', toolDef);

      await expect(wrapped.execute!({})).rejects.toThrow(AuthensorDeniedError);
      expect(execute).not.toHaveBeenCalled();
    });

    it('passes through tools without execute unchanged', () => {
      const toolDef = { description: 'No execute' };
      const wrapped = guard.wrapTool('passive_tool', toolDef);
      expect(wrapped).toEqual(toolDef);
    });

    it('passes options through to original execute', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const execute = vi.fn().mockResolvedValue('ok');
      const toolDef = { description: 'Test', execute };
      const wrapped = guard.wrapTool('test', toolDef);

      const toolOptions = { abortSignal: new AbortController().signal };
      await wrapped.execute!({ query: 'hello' }, toolOptions);

      expect(execute).toHaveBeenCalledWith({ query: 'hello' }, toolOptions);
    });
  });

  describe('wrapTools', () => {
    it('wraps all tools in a record', async () => {
      mockFetch
        .mockResolvedValueOnce(mockEvaluateResponse('allow'))
        .mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const tools = {
        search: {
          description: 'Search',
          execute: vi.fn().mockResolvedValue(['result']),
        },
        weather: {
          description: 'Weather',
          execute: vi.fn().mockResolvedValue({ temp: 20 }),
        },
      };

      const wrapped = guard.wrapTools(tools);

      expect(Object.keys(wrapped)).toEqual(['search', 'weather']);
      await wrapped.search.execute!({ q: 'test' });
      await wrapped.weather.execute!({ city: 'NYC' });
      expect(tools.search.execute).toHaveBeenCalled();
      expect(tools.weather.execute).toHaveBeenCalled();
    });
  });

  describe('needsApproval', () => {
    it('returns false when action is allowed', async () => {
      mockFetch.mockResolvedValueOnce(mockEvaluateResponse('allow'));

      const check = guard.needsApproval('safe_tool');
      const needs = await check({ query: 'hello' });

      expect(needs).toBe(false);
    });

    it('returns true when action requires approval', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('require_approval', 'Sensitive'),
      );

      const check = guard.needsApproval('send_email');
      const needs = await check({ to: 'ceo@company.com' });

      expect(needs).toBe(true);
    });

    it('returns true when action is denied', async () => {
      mockFetch.mockResolvedValueOnce(
        mockEvaluateResponse('deny', 'Blocked'),
      );

      const check = guard.needsApproval('dangerous_tool');
      const needs = await check({});

      expect(needs).toBe(true);
    });

    it('returns true on evaluation error (fail closed)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

      const check = guard.needsApproval('any_tool');
      const needs = await check({});

      expect(needs).toBe(true);
    });
  });
});
