import dns from 'node:dns/promises';
import ipaddr from 'ipaddr.js';

export type GuardErrorCode = 'INVALID_URL' | 'SSRF_BLOCKED' | 'REDIRECT_BLOCKED' | 'PORT_BLOCKED';

export class HttpGuardError extends Error {
  code: GuardErrorCode;
  constructor(code: GuardErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export interface GuardResult {
  url: URL;
  resolvedIps: string[];
}

function isBlockedIp(ip: string): boolean {
  try {
    const parsed = ipaddr.parse(ip);
    if (parsed.range() === 'loopback') return true;
    if (parsed.range() === 'linkLocal') return true;
    if (parsed.range() === 'private') return true;
    if (parsed.range() === 'multicast') return true;
    if (parsed.kind() === 'ipv4' && parsed.toString() === '0.0.0.0') return true;
    return false;
  } catch {
    return true;
  }
}

export async function validateHttpTarget(input: string, opts?: { allowHttp?: boolean }): Promise<GuardResult> {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new HttpGuardError('INVALID_URL', 'Invalid URL');
  }

  if (parsed.username || parsed.password) {
    throw new HttpGuardError('INVALID_URL', 'Credentials in URL are not allowed');
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol === 'http:') {
    if (!opts?.allowHttp) {
      throw new HttpGuardError('SSRF_BLOCKED', 'Plain HTTP not allowed');
    }
  } else if (protocol !== 'https:') {
    throw new HttpGuardError('INVALID_URL', 'Unsupported scheme');
  }

  const port = parsed.port ? Number(parsed.port) : protocol === 'https:' ? 443 : 80;
  if (Number.isNaN(port) || port <= 0 || port > 65535) {
    throw new HttpGuardError('PORT_BLOCKED', 'Invalid port');
  }
  if (protocol === 'https:' && port !== 443) {
    throw new HttpGuardError('PORT_BLOCKED', 'Port not allowed');
  }
  if (protocol === 'http:' && port !== 80) {
    throw new HttpGuardError('PORT_BLOCKED', 'Port not allowed');
  }

  const lookup = await dns.lookup(parsed.hostname, { all: true });
  const ips = lookup.map((r) => r.address);
  for (const ip of ips) {
    if (isBlockedIp(ip)) {
      throw new HttpGuardError('SSRF_BLOCKED', 'Destination not allowed');
    }
  }

  return { url: parsed, resolvedIps: ips };
}
