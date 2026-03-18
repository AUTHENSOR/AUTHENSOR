/**
 * ShieldProxy -- local HTTP proxy that intercepts AI API calls.
 *
 * Routes:
 *   /anthropic/* -> api.anthropic.com/*
 *   /openai/*    -> api.openai.com/*
 *   /api/status  -> shield status JSON
 *   /api/toggle  -> toggle proxy on/off
 *
 * Uses only Node.js built-in modules (http, https, url).
 */

import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';
import { scanRequest, scanResponse } from './scanner.js';
import type { ScanResult } from './scanner.js';

// ── Types ──────────────────────────────────────────────────────────────

export interface ProxyStats {
  requestsScanned: number;
  threatsBlocked: number;
  requestsAllowed: number;
  startTime: number;
  uptimeSeconds: number;
}

export interface ActivityEntry {
  timestamp: number;
  provider: string;
  path: string;
  method: string;
  verdict: 'allow' | 'block';
  threatLevel: string;
  reason?: string;
}

export interface ShieldStatus {
  active: boolean;
  stats: ProxyStats;
  recentActivity: ActivityEntry[];
}

export interface ProxyConfig {
  port: number;
  guiPort: number;
}

// ── Route targets ──────────────────────────────────────────────────────

interface RouteTarget {
  host: string;
  protocol: 'https:';
  provider: string;
}

const ROUTE_MAP: Record<string, RouteTarget> = {
  '/anthropic': {
    host: 'api.anthropic.com',
    protocol: 'https:',
    provider: 'Anthropic',
  },
  '/openai': {
    host: 'api.openai.com',
    protocol: 'https:',
    provider: 'OpenAI',
  },
};

// ── Proxy state ────────────────────────────────────────────────────────

let active = true;
let port = 8900;
let stats: ProxyStats = {
  requestsScanned: 0,
  threatsBlocked: 0,
  requestsAllowed: 0,
  startTime: Date.now(),
  uptimeSeconds: 0,
};
const recentActivity: ActivityEntry[] = [];
const MAX_ACTIVITY = 50;

function pushActivity(entry: ActivityEntry): void {
  recentActivity.unshift(entry);
  if (recentActivity.length > MAX_ACTIVITY) {
    recentActivity.length = MAX_ACTIVITY;
  }
}

function refreshUptime(): void {
  stats.uptimeSeconds = Math.floor((Date.now() - stats.startTime) / 1000);
}

// ── Helpers ────────────────────────────────────────────────────────────

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

function jsonResponse(
  res: http.ServerResponse,
  status: number,
  data: unknown,
): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': '*',
  });
  res.end(body);
}

function findRoute(pathname: string): { target: RouteTarget; downstream: string } | null {
  for (const [prefix, target] of Object.entries(ROUTE_MAP)) {
    if (pathname.startsWith(prefix)) {
      const downstream = pathname.slice(prefix.length) || '/';
      return { target, downstream };
    }
  }
  return null;
}

// ── Proxy forwarding ───────────────────────────────────────────────────

function forwardRequest(
  target: RouteTarget,
  downstream: string,
  method: string,
  headers: http.IncomingHttpHeaders,
  body: string | null,
): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const url = new URL(downstream, `${target.protocol}//${target.host}`);

    // Clone and adjust headers for the upstream request
    const forwardHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(headers)) {
      if (key === 'host' || key === 'connection') continue;
      if (typeof value === 'string') {
        forwardHeaders[key] = value;
      } else if (Array.isArray(value)) {
        forwardHeaders[key] = value.join(', ');
      }
    }
    forwardHeaders['host'] = target.host;

    if (body !== null) {
      forwardHeaders['content-length'] = Buffer.byteLength(body, 'utf-8').toString();
    }

    const options: https.RequestOptions = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: forwardHeaders,
    };

    const upstreamReq = https.request(options, (upstreamRes) => {
      const chunks: Buffer[] = [];
      upstreamRes.on('data', (chunk: Buffer) => chunks.push(chunk));
      upstreamRes.on('end', () => {
        resolve({
          statusCode: upstreamRes.statusCode ?? 502,
          headers: upstreamRes.headers,
          body: Buffer.concat(chunks).toString('utf-8'),
        });
      });
      upstreamRes.on('error', reject);
    });

    upstreamReq.on('error', reject);

    if (body !== null) {
      upstreamReq.write(body);
    }
    upstreamReq.end();
  });
}

// ── Request handler ────────────────────────────────────────────────────

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): Promise<void> {
  const method = req.method ?? 'GET';
  const pathname = new URL(req.url ?? '/', `http://localhost`).pathname;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': '*',
      'Access-Control-Max-Age': '86400',
    });
    res.end();
    return;
  }

  // ── API endpoints ──────────────────────────────────────────────────

  if (pathname === '/api/status') {
    refreshUptime();
    const status: ShieldStatus = {
      active,
      stats: { ...stats },
      recentActivity: recentActivity.slice(0, 20),
    };
    jsonResponse(res, 200, status);
    return;
  }

  if (pathname === '/api/toggle' && method === 'POST') {
    active = !active;
    refreshUptime();
    jsonResponse(res, 200, { active });
    return;
  }

  // Detect installed AI apps
  if (pathname === '/api/detect-apps') {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const home = os.default.homedir();
    const apps: { id: string; name: string; installed: boolean; protected: boolean; configPath: string }[] = [];

    // Claude Desktop
    const claudeConfigPath = path.default.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    const claudeInstalled = fs.default.existsSync(claudeConfigPath);
    let claudeProtected = false;
    if (claudeInstalled) {
      try {
        const cfg = JSON.parse(fs.default.readFileSync(claudeConfigPath, 'utf-8'));
        claudeProtected = !!(cfg.mcpServers?.['authensor-shield']);
      } catch {}
    }
    apps.push({ id: 'claude-desktop', name: 'Claude Desktop', installed: claudeInstalled, protected: claudeProtected, configPath: claudeConfigPath });

    // Cursor
    const cursorConfigPath = path.default.join(home, '.cursor', 'mcp.json');
    const cursorInstalled = fs.default.existsSync(path.default.join(home, '.cursor'));
    let cursorProtected = false;
    if (fs.default.existsSync(cursorConfigPath)) {
      try {
        const cfg = JSON.parse(fs.default.readFileSync(cursorConfigPath, 'utf-8'));
        cursorProtected = !!(cfg.mcpServers?.['authensor-shield']);
      } catch {}
    }
    apps.push({ id: 'cursor', name: 'Cursor', installed: cursorInstalled, protected: cursorProtected, configPath: cursorConfigPath });

    // Windsurf
    const windsurfConfigPath = path.default.join(home, '.windsurf', 'mcp.json');
    const windsurfInstalled = fs.default.existsSync(path.default.join(home, '.windsurf'));
    let windsurfProtected = false;
    if (fs.default.existsSync(windsurfConfigPath)) {
      try {
        const cfg = JSON.parse(fs.default.readFileSync(windsurfConfigPath, 'utf-8'));
        windsurfProtected = !!(cfg.mcpServers?.['authensor-shield']);
      } catch {}
    }
    apps.push({ id: 'windsurf', name: 'Windsurf', installed: windsurfInstalled, protected: windsurfProtected, configPath: windsurfConfigPath });

    // VS Code (Copilot uses MCP)
    const vscodeConfigPath = path.default.join(home, '.vscode', 'mcp.json');
    const vscodeInstalled = fs.default.existsSync(path.default.join(home, '.vscode'));
    let vscodeProtected = false;
    if (fs.default.existsSync(vscodeConfigPath)) {
      try {
        const cfg = JSON.parse(fs.default.readFileSync(vscodeConfigPath, 'utf-8'));
        vscodeProtected = !!(cfg.servers?.['authensor-shield'] || cfg.mcpServers?.['authensor-shield']);
      } catch {}
    }
    apps.push({ id: 'vscode', name: 'VS Code (Copilot)', installed: vscodeInstalled, protected: vscodeProtected, configPath: vscodeConfigPath });

    // ChatGPT Desktop (macOS)
    const chatgptPath = '/Applications/ChatGPT.app';
    const chatgptInstalled = fs.default.existsSync(chatgptPath);
    apps.push({ id: 'chatgpt', name: 'ChatGPT Desktop', installed: chatgptInstalled, protected: false, configPath: '' });

    // OpenAI API (via env var check)
    const openaiKeySet = !!process.env.OPENAI_API_KEY;
    const openaiBaseOverridden = process.env.OPENAI_BASE_URL?.includes('localhost:' + port);
    apps.push({ id: 'openai-api', name: 'OpenAI API', installed: openaiKeySet, protected: !!openaiBaseOverridden, configPath: '' });

    // Anthropic API (via env var check)
    const anthropicKeySet = !!process.env.ANTHROPIC_API_KEY;
    const anthropicBaseOverridden = process.env.ANTHROPIC_BASE_URL?.includes('localhost:' + port);
    apps.push({ id: 'anthropic-api', name: 'Anthropic API', installed: anthropicKeySet, protected: !!anthropicBaseOverridden, configPath: '' });

    jsonResponse(res, 200, { apps });
    return;
  }

  // Ecosystem status: what Authensor components are available
  if (pathname === '/api/ecosystem') {
    const components: { name: string; status: string; detail: string }[] = [];

    // Aegis
    try {
      const aegis = await import('@authensor/aegis');
      const rules = Object.keys(aegis).length;
      components.push({ name: 'Aegis Scanner', status: 'active', detail: 'Content safety scanning loaded' });
    } catch {
      components.push({ name: 'Aegis Scanner', status: 'not-installed', detail: 'Install @authensor/aegis for deep content scanning' });
    }

    // Check if SafeClaw hooks exist
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const safeClawPath = path.default.join(os.default.homedir(), '.claude', 'hooks.json');
    if (fs.default.existsSync(safeClawPath)) {
      components.push({ name: 'SafeClaw', status: 'active', detail: 'Claude Code hooks installed' });
    } else {
      components.push({ name: 'SafeClaw', status: 'not-installed', detail: 'Install SafeClaw for Claude Code hook protection' });
    }

    // Shield proxy itself
    components.push({ name: 'Shield Proxy', status: active ? 'active' : 'inactive', detail: active ? 'Scanning all proxied traffic' : 'Proxy is paused' });

    // Built-in scanner
    components.push({ name: 'Request Scanner', status: 'active', detail: '12 built-in pattern rules' });

    jsonResponse(res, 200, { components });
    return;
  }

  // Protect a specific app
  if (pathname === '/api/protect' && method === 'POST') {
    const fs = await import('node:fs');
    const body = await readBody(req);
    let parsed: { appId: string; action: 'protect' | 'unprotect' };
    try {
      parsed = JSON.parse(body);
    } catch {
      jsonResponse(res, 400, { error: 'Invalid JSON' });
      return;
    }

    const shieldMcpEntry = {
      command: 'npx',
      args: ['@authensor/mcp-server', '--gateway', '--upstream', 'passthrough'],
    };

    if (parsed.appId === 'claude-desktop') {
      const os = await import('node:os');
      const path = await import('node:path');
      const configPath = path.default.join(os.default.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

      try {
        let cfg: Record<string, unknown> = {};
        if (fs.default.existsSync(configPath)) {
          cfg = JSON.parse(fs.default.readFileSync(configPath, 'utf-8'));
        }
        if (!cfg.mcpServers) cfg.mcpServers = {};
        const servers = cfg.mcpServers as Record<string, unknown>;

        if (parsed.action === 'protect') {
          servers['authensor-shield'] = shieldMcpEntry;
        } else {
          delete servers['authensor-shield'];
        }

        fs.default.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        jsonResponse(res, 200, { success: true, action: parsed.action });
      } catch (e) {
        jsonResponse(res, 500, { error: 'Failed to update config', detail: String(e) });
      }
      return;
    }

    if (parsed.appId === 'cursor') {
      const os = await import('node:os');
      const path = await import('node:path');
      const configPath = path.default.join(os.default.homedir(), '.cursor', 'mcp.json');

      try {
        let cfg: Record<string, unknown> = {};
        if (fs.default.existsSync(configPath)) {
          cfg = JSON.parse(fs.default.readFileSync(configPath, 'utf-8'));
        }
        if (!cfg.mcpServers) cfg.mcpServers = {};
        const servers = cfg.mcpServers as Record<string, unknown>;

        if (parsed.action === 'protect') {
          servers['authensor-shield'] = shieldMcpEntry;
        } else {
          delete servers['authensor-shield'];
        }

        fs.default.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        jsonResponse(res, 200, { success: true, action: parsed.action });
      } catch (e) {
        jsonResponse(res, 500, { error: 'Failed to update config', detail: String(e) });
      }
      return;
    }

    // Windsurf and VS Code use same MCP config pattern
    if (parsed.appId === 'windsurf' || parsed.appId === 'vscode') {
      const os = await import('node:os');
      const path = await import('node:path');
      const configDir = parsed.appId === 'windsurf' ? '.windsurf' : '.vscode';
      const configPath = path.default.join(os.default.homedir(), configDir, 'mcp.json');

      try {
        let cfg: Record<string, unknown> = {};
        if (fs.default.existsSync(configPath)) {
          cfg = JSON.parse(fs.default.readFileSync(configPath, 'utf-8'));
        }
        if (!cfg.mcpServers) cfg.mcpServers = {};
        const servers = cfg.mcpServers as Record<string, unknown>;

        if (parsed.action === 'protect') {
          servers['authensor-shield'] = shieldMcpEntry;
        } else {
          delete servers['authensor-shield'];
        }

        const dir = path.default.dirname(configPath);
        if (!fs.default.existsSync(dir)) fs.default.mkdirSync(dir, { recursive: true });
        fs.default.writeFileSync(configPath, JSON.stringify(cfg, null, 2));
        jsonResponse(res, 200, { success: true, action: parsed.action });
      } catch (e) {
        jsonResponse(res, 500, { error: 'Failed to update config', detail: String(e) });
      }
      return;
    }

    jsonResponse(res, 400, { error: 'Unknown app: ' + parsed.appId });
    return;
  }

  // ── Proxy routes ───────────────────────────────────────────────────

  const route = findRoute(pathname);
  if (!route) {
    jsonResponse(res, 404, {
      error: 'Not found',
      hint: 'Use /anthropic/* or /openai/* to proxy AI API calls',
    });
    return;
  }

  const { target, downstream } = route;

  // If shield is off, pass through without scanning
  if (!active) {
    try {
      const body = (method !== 'GET' && method !== 'HEAD')
        ? await readBody(req)
        : null;

      const upstream = await forwardRequest(target, downstream, method, req.headers, body);

      // Copy upstream response headers
      const responseHeaders: Record<string, string> = {};
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (typeof value === 'string') responseHeaders[key] = value;
      }
      responseHeaders['access-control-allow-origin'] = '*';
      responseHeaders['x-authensor-shield'] = 'passthrough';

      res.writeHead(upstream.statusCode, responseHeaders);
      res.end(upstream.body);

      pushActivity({
        timestamp: Date.now(),
        provider: target.provider,
        path: downstream,
        method,
        verdict: 'allow',
        threatLevel: 'none',
        reason: 'Shield inactive (passthrough)',
      });
    } catch (err) {
      jsonResponse(res, 502, {
        error: 'Upstream request failed',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
    return;
  }

  // ── Active scanning ────────────────────────────────────────────────

  stats.requestsScanned++;

  let requestBody: string | null = null;
  if (method !== 'GET' && method !== 'HEAD') {
    requestBody = await readBody(req);
  }

  // Scan the request
  let requestScan: ScanResult = { safe: true, threatLevel: 'none', findings: [], scanTimeMs: 0 };
  if (requestBody) {
    requestScan = scanRequest(requestBody);
  }

  // If request is dangerous, block it
  if (!requestScan.safe && (requestScan.threatLevel === 'high' || requestScan.threatLevel === 'critical')) {
    stats.threatsBlocked++;
    pushActivity({
      timestamp: Date.now(),
      provider: target.provider,
      path: downstream,
      method,
      verdict: 'block',
      threatLevel: requestScan.threatLevel,
      reason: requestScan.findings[0]?.description ?? 'Threat detected in request',
    });

    jsonResponse(res, 403, {
      error: 'Blocked by Authensor Shield',
      threatLevel: requestScan.threatLevel,
      findings: requestScan.findings.map((f) => ({
        rule: f.rule,
        description: f.description,
        threatLevel: f.threatLevel,
      })),
    });
    return;
  }

  // Forward to upstream
  try {
    const upstream = await forwardRequest(target, downstream, method, req.headers, requestBody);

    // Scan the response
    const responseScan = await scanResponse(upstream.body);

    if (!responseScan.safe && (responseScan.threatLevel === 'high' || responseScan.threatLevel === 'critical')) {
      stats.threatsBlocked++;
      pushActivity({
        timestamp: Date.now(),
        provider: target.provider,
        path: downstream,
        method,
        verdict: 'block',
        threatLevel: responseScan.threatLevel,
        reason: responseScan.findings[0]?.description ?? 'Threat detected in response',
      });

      jsonResponse(res, 502, {
        error: 'Response blocked by Authensor Shield',
        threatLevel: responseScan.threatLevel,
        findings: responseScan.findings.map((f) => ({
          rule: f.rule,
          description: f.description,
          threatLevel: f.threatLevel,
        })),
      });
      return;
    }

    // Clean response -- forward it
    stats.requestsAllowed++;
    pushActivity({
      timestamp: Date.now(),
      provider: target.provider,
      path: downstream,
      method,
      verdict: 'allow',
      threatLevel: requestScan.threatLevel === 'none'
        ? responseScan.threatLevel
        : requestScan.threatLevel,
    });

    // Copy upstream response headers
    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(upstream.headers)) {
      if (typeof value === 'string') responseHeaders[key] = value;
    }
    responseHeaders['access-control-allow-origin'] = '*';
    responseHeaders['x-authensor-shield'] = 'scanned';
    responseHeaders['x-authensor-threat-level'] = requestScan.threatLevel === 'none'
      ? responseScan.threatLevel
      : requestScan.threatLevel;

    res.writeHead(upstream.statusCode, responseHeaders);
    res.end(upstream.body);
  } catch (err) {
    jsonResponse(res, 502, {
      error: 'Upstream request failed',
      message: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

// ── Server lifecycle ───────────────────────────────────────────────────

let server: http.Server | null = null;

export function startProxy(config: ProxyConfig): Promise<void> {
  return new Promise((resolve, reject) => {
    stats = {
      requestsScanned: 0,
      threatsBlocked: 0,
      requestsAllowed: 0,
      startTime: Date.now(),
      uptimeSeconds: 0,
    };
    recentActivity.length = 0;
    active = true;
    port = config.port;

    server = http.createServer((req, res) => {
      handleRequest(req, res).catch((err) => {
        console.error('[shield] Unhandled error:', err);
        if (!res.headersSent) {
          jsonResponse(res, 500, { error: 'Internal proxy error' });
        }
      });
    });

    server.on('error', reject);
    server.listen(config.port, () => resolve());
  });
}

export function stopProxy(): Promise<void> {
  return new Promise((resolve) => {
    if (server) {
      server.close(() => resolve());
      server = null;
    } else {
      resolve();
    }
  });
}

export function getStatus(): ShieldStatus {
  refreshUptime();
  return {
    active,
    stats: { ...stats },
    recentActivity: recentActivity.slice(0, 20),
  };
}

export function isActive(): boolean {
  return active;
}

export function toggleActive(): boolean {
  active = !active;
  return active;
}
