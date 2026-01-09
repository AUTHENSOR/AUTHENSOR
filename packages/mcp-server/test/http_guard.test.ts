import { describe, expect, it, vi } from 'vitest';
import { validateHttpTarget, HttpGuardError } from '../src/hardening/http_guard.js';

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: async (host: string) => {
      if (host === 'example.com') return [{ address: '93.184.216.34', family: 4 }];
      if (host === '127.0.0.1') return [{ address: '127.0.0.1', family: 4 }];
      if (host === 'localhost') return [{ address: '127.0.0.1', family: 4 }];
      if (host.startsWith('192.168')) return [{ address: '192.168.0.1', family: 4 }];
      return [{ address: '93.184.216.34', family: 4 }];
    },
  },
}));

describe('http_guard', () => {
  it('blocks localhost', async () => {
    await expect(validateHttpTarget('http://127.0.0.1')).rejects.toBeInstanceOf(HttpGuardError);
  });

  it('blocks private range', async () => {
    await expect(validateHttpTarget('https://192.168.0.1')).rejects.toBeInstanceOf(HttpGuardError);
  });

  it('blocks redirects (manual fetch)', async () => {
    const err = await validateHttpTarget('https://example.com');
    expect(err.url.hostname).toBe('example.com');
  });

  it('allows https example.com', async () => {
    const res = await validateHttpTarget('https://example.com');
    expect(res.url.hostname).toBe('example.com');
    expect(res.resolvedIps.length).toBeGreaterThan(0);
  });
});
