/**
 * Dashboard Route
 *
 * GET /dashboard - Admin dashboard with real-time receipt flow,
 *                  approval queue, and chain verification status.
 *
 * Uses HTMX for interactivity without a build step.
 * Admin role required.
 */

import { Hono } from 'hono';
import { getReceipts, verifyReceiptChain } from '../services/receipt-service.js';
import { getApprovalResponses } from '../services/receipt-service.js';
import { requireRole } from '../auth/middleware.js';

export const dashboardRoute = new Hono();

dashboardRoute.use('*', requireRole(['admin']));

function esc(str: string | undefined | null): string {
  const value = String(str ?? '');
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badge(text: string, color: string): string {
  return `<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:600;background:${color};color:#fff">${esc(text)}</span>`;
}

function statusBadge(status: string): string {
  const colors: Record<string, string> = {
    pending: '#e6a817',
    executed: '#2ea043',
    failed: '#cf222e',
    skipped: '#8b949e',
    cancelled: '#8b949e',
  };
  return badge(status, colors[status] || '#8b949e');
}

function decisionBadge(outcome: string): string {
  const colors: Record<string, string> = {
    allow: '#2ea043',
    deny: '#cf222e',
    require_approval: '#e6a817',
    rate_limited: '#cf222e',
  };
  return badge(outcome, colors[outcome] || '#8b949e');
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const LAYOUT_HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authensor Dashboard</title>
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #0d1117; color: #e6edf3; padding: 0;
    }
    .topbar {
      background: #161b22; border-bottom: 1px solid #30363d;
      padding: 12px 24px; display: flex; align-items: center; gap: 16px;
    }
    .topbar h1 { font-size: 18px; font-weight: 600; }
    .topbar .sep { color: #484f58; }
    .topbar a { color: #58a6ff; text-decoration: none; font-size: 14px; }
    .topbar a:hover { text-decoration: underline; }
    .topbar a.active { color: #e6edf3; font-weight: 600; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .card {
      background: #161b22; border: 1px solid #30363d; border-radius: 8px;
      padding: 16px;
    }
    .card h3 { font-size: 13px; color: #8b949e; font-weight: 500; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 0.5px; }
    .card .value { font-size: 28px; font-weight: 700; }
    .card .sub { font-size: 12px; color: #8b949e; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; font-size: 14px; }
    th { text-align: left; padding: 10px 12px; color: #8b949e; font-weight: 500; border-bottom: 1px solid #30363d; font-size: 12px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #21262d; }
    tr:hover { background: #161b22; }
    .section { margin-bottom: 32px; }
    .section-title { font-size: 16px; font-weight: 600; margin-bottom: 12px; display: flex; align-items: center; gap: 8px; }
    .refresh-indicator { font-size: 11px; color: #484f58; }
    a { color: #58a6ff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .approval-actions button {
      padding: 4px 12px; border-radius: 4px; border: 1px solid #30363d;
      cursor: pointer; font-size: 12px; margin-right: 4px;
    }
    .btn-approve { background: #238636; color: #fff; border-color: #238636; }
    .btn-reject { background: #da3633; color: #fff; border-color: #da3633; }
    .chain-ok { color: #2ea043; }
    .chain-broken { color: #cf222e; }
    .htmx-indicator { display: none; }
    .htmx-request .htmx-indicator { display: inline; }
  </style>
</head>
<body>
  <div class="topbar">
    <h1>Authensor</h1>
    <span class="sep">|</span>
    <a href="/dashboard" class="active">Dashboard</a>
    <a href="/receipts/view">Receipts</a>
    <a href="/health">Health</a>
  </div>`;

const LAYOUT_FOOT = `</body></html>`;

// Main dashboard page
dashboardRoute.get('/', async (c) => {
  c.header('Cache-Control', 'no-store');
  c.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; script-src https://unpkg.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'");

  return c.html(`${LAYOUT_HEAD}
  <div class="container">
    <div hx-get="/dashboard/stats" hx-trigger="load, every 10s" hx-swap="innerHTML">
      <div class="grid">
        <div class="card"><h3>Loading...</h3><div class="value">-</div></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">
        Approval Queue
        <span class="refresh-indicator">(auto-refreshes every 5s)</span>
      </div>
      <div hx-get="/dashboard/approval-queue" hx-trigger="load, every 5s" hx-swap="innerHTML">
        <p style="color:#8b949e">Loading...</p>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Recent Receipts</div>
      <div hx-get="/dashboard/recent" hx-trigger="load, every 10s" hx-swap="innerHTML">
        <p style="color:#8b949e">Loading...</p>
      </div>
    </div>
  </div>
  ${LAYOUT_FOOT}`);
});

// Stats cards (HTMX partial)
dashboardRoute.get('/stats', async (c) => {
  const [recent, chain] = await Promise.all([
    getReceipts({ limit: 200 }),
    verifyReceiptChain({ limit: 1000 }),
  ]);

  const total = recent.length;
  const allowed = recent.filter((r) => r.decision.outcome === 'allow').length;
  const denied = recent.filter((r) => r.decision.outcome === 'deny' || r.decision.outcome === 'rate_limited').length;
  const pendingApproval = recent.filter((r) => r.decision.outcome === 'require_approval' && r.approval?.status === 'pending').length;
  const executed = recent.filter((r) => r.status === 'executed').length;
  const failed = recent.filter((r) => r.status === 'failed').length;

  const chainStatus = chain.broken === 0
    ? `<span class="chain-ok">Intact</span>`
    : `<span class="chain-broken">${chain.broken} broken</span>`;

  return c.html(`
    <div class="grid">
      <div class="card">
        <h3>Total Receipts</h3>
        <div class="value">${total}</div>
        <div class="sub">${executed} executed, ${failed} failed</div>
      </div>
      <div class="card">
        <h3>Allowed</h3>
        <div class="value" style="color:#2ea043">${allowed}</div>
        <div class="sub">${total ? Math.round((allowed / total) * 100) : 0}% of total</div>
      </div>
      <div class="card">
        <h3>Denied</h3>
        <div class="value" style="color:#cf222e">${denied}</div>
        <div class="sub">${total ? Math.round((denied / total) * 100) : 0}% of total</div>
      </div>
      <div class="card">
        <h3>Pending Approval</h3>
        <div class="value" style="color:#e6a817">${pendingApproval}</div>
      </div>
      <div class="card">
        <h3>Hash Chain</h3>
        <div class="value">${chainStatus}</div>
        <div class="sub">${chain.verified} verified, ${chain.unchained} unchained</div>
      </div>
    </div>
  `);
});

// Approval queue (HTMX partial)
dashboardRoute.get('/approval-queue', async (c) => {
  const pending = await getReceipts({
    limit: 50,
    decisionOutcome: 'require_approval',
    status: 'pending',
  });

  // Filter to only those with pending approval status
  const queue = pending.filter((r) => r.approval?.status === 'pending');

  if (queue.length === 0) {
    return c.html(`<p style="color:#8b949e;padding:12px 0">No pending approvals</p>`);
  }

  const rows = await Promise.all(queue.map(async (r) => {
    const responses = await getApprovalResponses(r.id);
    const required = (r.approval as any)?.requiredApprovals ?? 1;
    const approveCount = responses.filter((resp) => resp.decision === 'approve').length;

    return `<tr>
      <td>${esc(timeAgo(r.timestamp))}</td>
      <td>${esc(r.envelope?.action?.type || '')}</td>
      <td>${esc(r.envelope?.principal?.id || '')}</td>
      <td>${esc(r.decision.reason || '')}</td>
      <td>${approveCount}/${required}</td>
      <td><a href="/receipts/${esc(r.id)}/view">view</a></td>
    </tr>`;
  }));

  return c.html(`
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>Tool</th>
          <th>Actor</th>
          <th>Reason</th>
          <th>Approvals</th>
          <th>Link</th>
        </tr>
      </thead>
      <tbody>${rows.join('')}</tbody>
    </table>
  `);
});

// Recent receipts table (HTMX partial)
dashboardRoute.get('/recent', async (c) => {
  const receipts = await getReceipts({ limit: 25 });

  if (receipts.length === 0) {
    return c.html(`<p style="color:#8b949e;padding:12px 0">No receipts yet</p>`);
  }

  const rows = receipts.map((r) => `<tr>
    <td>${esc(timeAgo(r.timestamp))}</td>
    <td>${statusBadge(r.status)}</td>
    <td>${decisionBadge(r.decision.outcome)}</td>
    <td>${esc(r.envelope?.action?.type || '')}</td>
    <td>${esc(r.envelope?.principal?.id || '')}</td>
    <td>${r.receiptHash ? esc(r.receiptHash.slice(0, 8)) + '...' : '<span style="color:#484f58">-</span>'}</td>
    <td><a href="/receipts/${esc(r.id)}/view">view</a></td>
  </tr>`).join('');

  return c.html(`
    <table>
      <thead>
        <tr>
          <th>When</th>
          <th>Status</th>
          <th>Decision</th>
          <th>Tool</th>
          <th>Actor</th>
          <th>Hash</th>
          <th>Link</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `);
});
