#!/usr/bin/env node

/**
 * authensor CLI
 *
 * Universal entry point for the Authensor safety stack.
 * Detects context, suggests the right path, and gets users running fast.
 *
 * Usage:
 *   npx authensor              — Interactive setup
 *   npx authensor init         — Initialize in current project
 *   npx authensor up           — Start control plane (docker compose)
 *   npx authensor status       — Check running services
 *   npx authensor templates    — List policy templates
 *   npx authensor apply <id>   — Apply a policy template
 *   npx authensor policy lint <file>        — Validate a policy file
 *   npx authensor policy test <file>        — Run policy test cases
 *   npx authensor policy diff <a> <b>       — Compare two policies
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';

import {
  lintPolicy,
  loadPolicyFile,
  formatDiagnostics,
  loadTestFile,
  resolvePolicy,
  runTestSuite,
  formatTestResults,
  diffPolicies,
  loadPolicyFromFile,
  loadPolicyFromControlPlane,
  formatDiffResult,
} from './policy/index.js';

const VERSION = '0.0.1';

// ── Colors (no dependencies) ──────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// ── Helpers ───────────────────────────────────────────────────────────

function ask(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function hasCommand(cmd: string): boolean {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function detectContext(): {
  hasDocker: boolean;
  hasDockerCompose: boolean;
  hasPnpm: boolean;
  hasNpm: boolean;
  isAuthensorRepo: boolean;
  hasComposeFile: boolean;
  hasSafeClaw: boolean;
  controlPlaneUrl: string | null;
} {
  const hasDocker = hasCommand('docker');
  const hasDockerCompose = hasDocker && (() => {
    try {
      execSync('docker compose version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  const cwd = process.cwd();
  const hasComposeFile = existsSync(join(cwd, 'docker-compose.yml')) || existsSync(join(cwd, 'docker-compose.yaml'));
  const isAuthensorRepo = existsSync(join(cwd, 'packages', 'control-plane'));
  const hasSafeClaw = (() => {
    try {
      execSync('npx --no-install safeclaw --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || null;

  return {
    hasDocker,
    hasDockerCompose,
    hasPnpm: hasCommand('pnpm'),
    hasNpm: hasCommand('npm'),
    isAuthensorRepo,
    hasComposeFile,
    hasSafeClaw,
    controlPlaneUrl,
  };
}

// ── Commands ──────────────────────────────────────────────────────────

async function cmdInit() {
  console.log(bold('\n  Authensor — Make your AI agent safe\n'));

  const ctx = detectContext();

  // Detect integration path
  console.log(dim('  Detecting environment...\n'));

  const paths: Array<{ key: string; label: string; desc: string }> = [];

  if (ctx.hasDockerCompose || ctx.hasDocker) {
    paths.push({
      key: 'docker',
      label: 'Self-hosted control plane',
      desc: 'Full control plane with PostgreSQL, dashboard, and API',
    });
  }

  paths.push({
    key: 'safeclaw',
    label: 'SafeClaw local gateway',
    desc: 'Local agent gating with built-in dashboard and approval workflows',
  });

  paths.push({
    key: 'sdk',
    label: 'SDK integration',
    desc: 'Add Authensor to your existing agent with a few lines of code',
  });

  console.log(bold('  Choose your integration path:\n'));
  paths.forEach((p, i) => {
    console.log(`  ${cyan(`${i + 1})`)} ${bold(p.label)}`);
    console.log(`     ${dim(p.desc)}\n`);
  });

  const choice = await ask(`  ${dim('Enter choice (1-' + paths.length + '):')} `);
  const idx = parseInt(choice, 10) - 1;
  const selected = paths[idx];

  if (!selected) {
    console.log(red('\n  Invalid choice. Run `npx authensor` to try again.\n'));
    process.exit(1);
  }

  switch (selected.key) {
    case 'docker':
      await initDocker();
      break;
    case 'safeclaw':
      await initSafeClaw();
      break;
    case 'sdk':
      await initSdk();
      break;
  }
}

async function initDocker() {
  console.log(bold('\n  Setting up self-hosted control plane...\n'));

  const cwd = process.cwd();
  const composePath = join(cwd, 'docker-compose.yml');

  if (!existsSync(composePath)) {
    console.log(dim('  Creating docker-compose.yml...'));

    const compose = `# Authensor Control Plane — Self-hosted
# Start with: docker compose up -d
# Dashboard: http://localhost:3000/dashboard
# Health:    http://localhost:3000/health

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: authensor
      POSTGRES_USER: authensor
      POSTGRES_PASSWORD: authensor_dev
    volumes:
      - authensor_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U authensor"]
      interval: 5s
      timeout: 3s
      retries: 5

  control-plane:
    image: ghcr.io/authensor/control-plane:latest
    build:
      context: .
      dockerfile: packages/control-plane/Dockerfile
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://authensor:authensor_dev@postgres:5432/authensor
      PORT: "3000"
      AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN: \${AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN:-}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  authensor_data:
`;
    writeFileSync(composePath, compose);
    console.log(green('  Created docker-compose.yml'));
  }

  // Generate a bootstrap token
  const token = generateToken();
  console.log('');
  console.log(green('  Ready to start!\n'));
  console.log(`  ${bold('1.')} Start the control plane:\n`);
  console.log(cyan(`     AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=${token} docker compose up -d\n`));
  console.log(`  ${bold('2.')} Create your first API key:\n`);
  console.log(cyan(`     curl -X POST http://localhost:3000/keys \\`));
  console.log(cyan(`       -H "Authorization: Bearer ${token}" \\`));
  console.log(cyan(`       -H "Content-Type: application/json" \\`));
  console.log(cyan(`       -d '{"name": "my-agent", "role": "ingest"}'\n`));
  console.log(`  ${bold('3.')} Browse policy templates:\n`);
  console.log(cyan(`     curl http://localhost:3000/templates\n`));
  console.log(`  ${bold('4.')} Apply a template:\n`);
  console.log(cyan(`     curl -X POST http://localhost:3000/templates/standard/apply \\`));
  console.log(cyan(`       -H "Authorization: Bearer <your-admin-key>"\n`));
  console.log(dim(`  Dashboard: http://localhost:3000/dashboard`));
  console.log(dim(`  Health:    http://localhost:3000/health\n`));
}

async function initSafeClaw() {
  console.log(bold('\n  Setting up SafeClaw local gateway...\n'));
  console.log(dim('  SafeClaw intercepts every tool call and evaluates it against'));
  console.log(dim('  your policies before execution.\n'));

  console.log(`  ${bold('Run:')}\n`);
  console.log(cyan('     npx @authensor/safeclaw init --demo\n'));
  console.log(dim('  This will:'));
  console.log(dim('  1. Create a local config at ~/.safeclaw/config.json'));
  console.log(dim('  2. Provision a demo token'));
  console.log(dim('  3. Open the setup wizard in your browser\n'));

  console.log(`  ${bold('Then run your agent:')}\n`);
  console.log(cyan('     npx @authensor/safeclaw run "your prompt here"\n'));

  const proceed = await ask(`  ${dim('Run SafeClaw setup now? (y/N):')} `);
  if (proceed.toLowerCase() === 'y') {
    console.log('');
    const child = spawn('npx', ['@authensor/safeclaw', 'init', '--demo'], {
      stdio: 'inherit',
      shell: true,
    });
    child.on('close', (code) => {
      process.exit(code ?? 0);
    });
  }
}

async function initSdk() {
  console.log(bold('\n  SDK Integration\n'));

  // Detect project language
  const cwd = process.cwd();
  const hasTsConfig = existsSync(join(cwd, 'tsconfig.json'));
  const hasPackageJson = existsSync(join(cwd, 'package.json'));
  const hasPyProject = existsSync(join(cwd, 'pyproject.toml'));
  const hasRequirements = existsSync(join(cwd, 'requirements.txt'));

  const isPython = hasPyProject || hasRequirements;
  const isTypeScript = hasTsConfig || hasPackageJson;

  if (isPython) {
    console.log(dim('  Detected: Python project\n'));
    console.log(`  ${bold('Install:')}\n`);
    console.log(cyan('     pip install authensor\n'));
    console.log(`  ${bold('Usage:')}\n`);
    console.log(cyan('     from authensor import Authensor\n'));
    console.log(cyan('     client = Authensor('));
    console.log(cyan('         control_plane_url="http://localhost:3000",'));
    console.log(cyan('         api_key="your-key",'));
    console.log(cyan('     )\n'));
    console.log(cyan('     result = await client.evaluate({'));
    console.log(cyan('         action={"type": "http.request", "resource": "https://api.example.com"},'));
    console.log(cyan('         principal={"type": "agent", "id": "my-agent"},'));
    console.log(cyan('     })\n'));

    if (hasPyProject) {
      console.log(dim('  For CrewAI integration:\n'));
      console.log(cyan('     pip install authensor-crewai\n'));
    }
  }

  if (isTypeScript || !isPython) {
    if (isPython) console.log(dim('  ---\n'));
    console.log(dim('  Detected: TypeScript/Node project\n'));
    console.log(`  ${bold('Install:')}\n`);
    console.log(cyan('     npm install @authensor/sdk\n'));
    console.log(`  ${bold('Usage:')}\n`);
    console.log(cyan("     import { Authensor } from '@authensor/sdk';\n"));
    console.log(cyan("     const client = new Authensor({"));
    console.log(cyan("       controlPlaneUrl: 'http://localhost:3000',"));
    console.log(cyan("       apiKey: 'your-key',"));
    console.log(cyan("     });\n"));
    console.log(cyan("     const result = await client.evaluate({"));
    console.log(cyan("       action: { type: 'http.request', resource: 'https://api.example.com' },"));
    console.log(cyan("       principal: { type: 'agent', id: 'my-agent' },"));
    console.log(cyan("     });\n"));

    console.log(dim('  Framework adapters:\n'));
    console.log(cyan('     npm install @authensor/langchain   # LangChain'));
    console.log(cyan('     npm install @authensor/openai      # OpenAI Agents SDK\n'));
  }

  console.log(`  ${bold('Need a control plane?')} Run: ${cyan('npx authensor init')}\n`);
}

async function cmdUp() {
  const cwd = process.cwd();
  const composePath = join(cwd, 'docker-compose.yml');

  if (!existsSync(composePath)) {
    console.log(yellow('\n  No docker-compose.yml found.'));
    console.log(dim(`  Run ${cyan('npx authensor init')} first to set up.\n`));
    process.exit(1);
  }

  console.log(bold('\n  Starting Authensor control plane...\n'));

  const child = spawn('docker', ['compose', 'up', '-d'], {
    stdio: 'inherit',
    cwd,
  });

  child.on('close', (code) => {
    if (code === 0) {
      console.log('');
      console.log(green('  Control plane is running!'));
      console.log(dim('  Dashboard: http://localhost:3000/dashboard'));
      console.log(dim('  Health:    http://localhost:3000/health'));
      console.log(dim('  Templates: http://localhost:3000/templates\n'));
    }
    process.exit(code ?? 0);
  });
}

async function cmdStatus() {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';

  console.log(bold('\n  Authensor Status\n'));

  // Check control plane
  try {
    const res = await fetch(`${controlPlaneUrl}/health`);
    if (res.ok) {
      const data = await res.json() as any;
      console.log(`  Control Plane: ${green('running')} at ${dim(controlPlaneUrl)}`);
      if (data.version) console.log(`  Version:       ${dim(data.version)}`);
    } else {
      console.log(`  Control Plane: ${yellow('unhealthy')} (${res.status})`);
    }
  } catch {
    console.log(`  Control Plane: ${red('unreachable')} at ${dim(controlPlaneUrl)}`);
  }

  // Check templates
  try {
    const res = await fetch(`${controlPlaneUrl}/templates`);
    if (res.ok) {
      const data = await res.json() as any;
      console.log(`  Templates:     ${dim(`${data.templates?.length ?? 0} available`)}`);
    }
  } catch {
    // skip
  }

  // Check active policy
  try {
    const res = await fetch(`${controlPlaneUrl}/policies/default`);
    if (res.ok) {
      const data = await res.json() as any;
      console.log(`  Default Policy: ${green(data.policy?.name || data.policy?.id || 'loaded')}`);
    }
  } catch {
    // skip
  }

  // Check Docker
  try {
    const output = execSync('docker compose ps --format json 2>/dev/null', { encoding: 'utf-8' });
    const lines = output.trim().split('\n').filter(Boolean);
    if (lines.length > 0) {
      console.log(`  Docker:        ${dim(`${lines.length} container(s)`)}`);
    }
  } catch {
    // skip
  }

  console.log('');
}

async function cmdTemplates() {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';

  console.log(bold('\n  Policy Templates\n'));

  try {
    const res = await fetch(`${controlPlaneUrl}/templates`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json() as any;

    if (!data.templates?.length) {
      console.log(dim('  No templates available.\n'));
      return;
    }

    for (const t of data.templates) {
      console.log(`  ${cyan(t.id.padEnd(16))} ${bold(t.name)}`);
      console.log(`  ${' '.repeat(16)} ${dim(t.description)}\n`);
    }

    console.log(dim(`  Apply with: npx authensor apply <template-id>\n`));
  } catch (e) {
    console.log(red(`  Could not reach control plane at ${controlPlaneUrl}`));
    console.log(dim(`  Start it with: npx authensor up\n`));
  }
}

async function cmdApply(templateId: string) {
  if (!templateId) {
    console.log(red('\n  Usage: npx authensor apply <template-id>'));
    console.log(dim('  Run `npx authensor templates` to see available templates.\n'));
    process.exit(1);
  }

  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';
  const apiKey = process.env.AUTHENSOR_API_KEY || process.env.AUTHENSOR_ADMIN_KEY;

  if (!apiKey) {
    console.log(red('\n  AUTHENSOR_API_KEY environment variable required.'));
    console.log(dim('  Set it to an admin API key for the control plane.\n'));
    process.exit(1);
  }

  console.log(bold(`\n  Applying template: ${cyan(templateId)}...\n`));

  try {
    const res = await fetch(`${controlPlaneUrl}/templates/${templateId}/apply`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await res.json() as any;

    if (res.ok && data.ok) {
      console.log(green('  Policy applied and activated!'));
      console.log(dim(`  Policy ID: ${data.applied.policyId}`));
      console.log(dim(`  Version:   ${data.applied.version}`));
      console.log(dim(`  Org/Env:   ${data.applied.orgId}/${data.applied.environment}\n`));
    } else {
      console.log(red(`  Failed: ${data.error?.message || JSON.stringify(data)}\n`));
      process.exit(1);
    }
  } catch (e) {
    console.log(red(`  Could not reach control plane at ${controlPlaneUrl}`));
    console.log(dim(`  Start it with: npx authensor up\n`));
    process.exit(1);
  }
}

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = 'authensor_';
  for (let i = 0; i < 32; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

// ── Aegis Commands ───────────────────────────────────────────────────

async function cmdAegisScan(text?: string) {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';
  const apiKey = process.env.AUTHENSOR_API_KEY || process.env.AUTHENSOR_ADMIN_KEY;

  // Read from stdin if no text argument
  if (!text) {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) {
      chunks.push(chunk);
    }
    text = Buffer.concat(chunks).toString('utf-8').trim();
  }

  if (!text) {
    console.log(red('\n  Usage: npx authensor aegis scan "text to scan"'));
    console.log(dim('  Or pipe: echo "text" | npx authensor aegis scan\n'));
    process.exit(1);
  }

  // Try local scanner first (no control plane needed)
  try {
    // @ts-ignore — @authensor/aegis is an optional dependency
    const aegis = await import('@authensor/aegis');
    const scanner = new aegis.AegisScanner();
    const result = scanner.scan(text, { mode: 'redact' });

    console.log(bold('\n  Authensor Aegis — Content Scan\n'));
    console.log(dim(`  Input: "${text.length > 60 ? text.slice(0, 57) + '...' : text}"\n`));

    if (result.safe) {
      console.log(green('  No threats detected.\n'));
      return;
    }

    console.log(bold('  Detections:\n'));
    for (const d of result.detections) {
      const icon = d.type === 'injection' || d.type === 'exfiltration' ? red('!!') : yellow('!!');
      console.log(`  ${icon} ${bold(d.type.toUpperCase())}:${d.subType.padEnd(12)} ${dim(`"${d.content}"`)}`);
      console.log(`     ${dim(`confidence: ${d.confidence}  pattern: ${d.pattern}`)}`);
      if (d.line) console.log(`     ${dim(`line: ${d.line}`)}`);
      console.log('');
    }

    const levelColors: Record<string, (s: string) => string> = {
      critical: red, high: red, medium: yellow, low: dim,
    };
    const colorFn = levelColors[result.threatLevel] || dim;
    console.log(`  Threat Level: ${colorFn(result.threatLevel.toUpperCase())}`);
    console.log(`  Scan time:    ${dim(`${result.scanTimeMs}ms`)}`);

    if (result.redacted) {
      console.log(`\n  Redacted: ${dim(result.redacted)}`);
    }
    console.log('');
    return;
  } catch {
    // Fall through to control plane API
  }

  // Try control plane API
  if (!apiKey) {
    console.log(red('\n  @authensor/aegis not installed locally and no AUTHENSOR_API_KEY set.'));
    console.log(dim('  Install: npm install @authensor/aegis'));
    console.log(dim('  Or set AUTHENSOR_API_KEY for remote scanning.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${controlPlaneUrl}/aegis/scan`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ content: text, mode: 'redact' }),
    });

    const data = await res.json() as any;
    if (!res.ok) {
      console.log(red(`\n  Error: ${data.message || data.error}\n`));
      process.exit(1);
    }

    console.log(bold('\n  Authensor Aegis — Remote Scan\n'));
    console.log(`  Safe: ${data.safe ? green('yes') : red('no')}`);
    console.log(`  Threat level: ${data.threatLevel}`);
    console.log(`  Detections: ${data.detections?.length || 0}`);
    if (data.redacted) console.log(`  Redacted: ${dim(data.redacted)}`);
    console.log('');
  } catch {
    console.log(red(`\n  Could not reach control plane at ${controlPlaneUrl}\n`));
    process.exit(1);
  }
}

async function cmdAegisStatus() {
  // Try local scanner
  try {
    // @ts-ignore — @authensor/aegis is an optional dependency
    const aegis = await import('@authensor/aegis');
    const scanner = new aegis.AegisScanner();
    const rulesByType = scanner.getRulesByDetector();
    const totalRules = scanner.getRuleCount();

    console.log(bold('\n  Authensor Aegis Status\n'));
    console.log(`  Scanner:    ${green('available')} (local)`);
    console.log(`  Rules:      ${totalRules} total`);
    console.log('');
    for (const [type, count] of Object.entries(rulesByType)) {
      console.log(`    ${type.padEnd(16)} ${count} rules`);
    }
    console.log('');
    return;
  } catch {
    console.log(yellow('\n  @authensor/aegis not installed locally.'));
    console.log(dim('  Install: npm install @authensor/aegis\n'));
  }
}

// ── Sentinel Commands ────────────────────────────────────────────────

async function cmdSentinelStatus() {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';
  const apiKey = process.env.AUTHENSOR_API_KEY || process.env.AUTHENSOR_ADMIN_KEY;

  if (!apiKey) {
    console.log(red('\n  AUTHENSOR_API_KEY required for Sentinel commands.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${controlPlaneUrl}/sentinel/status`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json() as any;

    console.log(bold('\n  Authensor Sentinel Status\n'));
    console.log(`  Enabled:       ${data.enabled ? green('yes') : red('no')}`);
    console.log(`  Total events:  ${data.totalEvents || 0}`);
    console.log(`  Active agents: ${data.activeAgents || 0}`);
    console.log(`  Active alerts: ${data.activeAlerts || 0}`);
    console.log(`  Uptime:        ${dim(formatMs(data.uptimeMs || 0))}`);
    console.log('');
  } catch {
    console.log(red(`\n  Could not reach control plane at ${controlPlaneUrl}\n`));
    process.exit(1);
  }
}

async function cmdSentinelAlerts() {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';
  const apiKey = process.env.AUTHENSOR_API_KEY || process.env.AUTHENSOR_ADMIN_KEY;

  if (!apiKey) {
    console.log(red('\n  AUTHENSOR_API_KEY required for Sentinel commands.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${controlPlaneUrl}/sentinel/alerts`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json() as any;

    console.log(bold('\n  Authensor Sentinel — Alerts\n'));
    if (!data.alerts?.length) {
      console.log(green('  No active alerts.\n'));
      return;
    }

    for (const a of data.alerts) {
      const sevColor = a.severity === 'critical' ? red : a.severity === 'warning' ? yellow : dim;
      console.log(`  ${sevColor(a.severity.toUpperCase().padEnd(9))} ${bold(a.ruleName)}`);
      console.log(`  ${dim(`  ${a.message}`)}`);
      console.log(`  ${dim(`  Agent: ${a.agentId || 'global'}  Status: ${a.status}  Triggered: ${a.triggeredAt}`)}`);
      console.log('');
    }
  } catch {
    console.log(red(`\n  Could not reach control plane at ${controlPlaneUrl}\n`));
    process.exit(1);
  }
}

async function cmdSentinelAgents() {
  const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';
  const apiKey = process.env.AUTHENSOR_API_KEY || process.env.AUTHENSOR_ADMIN_KEY;

  if (!apiKey) {
    console.log(red('\n  AUTHENSOR_API_KEY required for Sentinel commands.\n'));
    process.exit(1);
  }

  try {
    const res = await fetch(`${controlPlaneUrl}/sentinel/agents`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    const data = await res.json() as any;

    console.log(bold('\n  Authensor Sentinel — Agent Stats\n'));
    if (!data.agents?.length) {
      console.log(dim('  No agents tracked yet.\n'));
      return;
    }

    for (const a of data.agents) {
      const riskColor = a.riskScore >= 80 ? green : a.riskScore >= 50 ? yellow : red;
      console.log(`  ${bold(a.agentId.padEnd(20))} ${riskColor(`${a.riskScore}/100`)}`);
      console.log(`    Actions: ${a.totalActions}  Allow: ${a.allowCount}  Deny: ${a.denyCount}  Cost: $${a.totalCost}`);
      console.log(`    Deny rate: ${(a.denyRate * 100).toFixed(1)}%  Avg latency: ${a.avgLatencyMs}ms`);
      console.log('');
    }
  } catch {
    console.log(red(`\n  Could not reach control plane at ${controlPlaneUrl}\n`));
    process.exit(1);
  }
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`;
  if (ms < 3600_000) return `${(ms / 60_000).toFixed(0)}m`;
  return `${(ms / 3600_000).toFixed(1)}h`;
}

// ── Policy Commands ──────────────────────────────────────────────────

async function cmdPolicyLint(filePath?: string) {
  if (!filePath) {
    console.log(red('\n  Usage: npx authensor policy lint <policy-file>'));
    console.log(dim('  Example: npx authensor policy lint policy.json\n'));
    process.exit(1);
  }

  const resolvedPath = resolve(filePath);

  if (!existsSync(resolvedPath)) {
    console.log(red(`\n  File not found: ${resolvedPath}\n`));
    process.exit(1);
  }

  console.log(bold('\n  Authensor Policy Lint\n'));

  try {
    const policy = loadPolicyFile(resolvedPath);
    const result = lintPolicy(policy);
    console.log(formatDiagnostics(result, filePath));
    console.log('');
    process.exit(result.valid ? 0 : 1);
  } catch (err) {
    console.log(red(`  Failed to parse ${filePath}: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}

async function cmdPolicyTest(testFilePath?: string) {
  if (!testFilePath) {
    console.log(red('\n  Usage: npx authensor policy test <test-file>'));
    console.log(dim('  Example: npx authensor policy test policy-tests.json\n'));
    console.log(dim('  Test file format:'));
    console.log(dim('  {'));
    console.log(dim('    "policy": "./policy.json",'));
    console.log(dim('    "tests": ['));
    console.log(dim('      {'));
    console.log(dim('        "name": "should deny unauthorized requests",'));
    console.log(dim('        "envelope": { ... },'));
    console.log(dim('        "expected": { "outcome": "deny" }'));
    console.log(dim('      }'));
    console.log(dim('    ]'));
    console.log(dim('  }\n'));
    process.exit(1);
  }

  const resolvedPath = resolve(testFilePath);

  if (!existsSync(resolvedPath)) {
    console.log(red(`\n  File not found: ${resolvedPath}\n`));
    process.exit(1);
  }

  console.log(bold('\n  Authensor Policy Test\n'));

  try {
    // Load test file
    const testFile = loadTestFile(resolvedPath);
    const policy = resolvePolicy(testFile, resolvedPath);

    // Load engine dynamically
    let engine: { evaluate: (...args: any[]) => any };
    try {
      const engineModule = await import('@authensor/engine');
      const policyEngine = new engineModule.PolicyEngine();
      engine = {
        evaluate: (envelope: any, policies: any[]) => policyEngine.evaluate(envelope, policies),
      };
    } catch {
      console.log(red('  @authensor/engine is not available.'));
      console.log(dim('  Install it: pnpm add @authensor/engine'));
      console.log(dim('  Or run from the Authensor monorepo.\n'));
      process.exit(1);
    }

    const result = runTestSuite(testFile.tests, policy, engine);
    console.log(formatTestResults(result));
    console.log('');
    process.exit(result.failed === 0 ? 0 : 1);
  } catch (err) {
    console.log(red(`  Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}

async function cmdPolicyDiff(fileA?: string, fileB?: string) {
  if (!fileA) {
    console.log(red('\n  Usage: npx authensor policy diff <policy-a> <policy-b>'));
    console.log(dim('  Example: npx authensor policy diff old-policy.json new-policy.json'));
    console.log(dim('  Or:      npx authensor policy diff policy.json --active\n'));
    process.exit(1);
  }

  const resolvedA = resolve(fileA);
  if (!existsSync(resolvedA)) {
    console.log(red(`\n  File not found: ${resolvedA}\n`));
    process.exit(1);
  }

  console.log(bold('\n  Authensor Policy Diff\n'));

  try {
    const policyA = loadPolicyFromFile(resolvedA);
    let policyB: Record<string, unknown>;
    let labelB: string;

    if (fileB === '--active' || fileB === '--remote') {
      // Fetch the active policy from the control plane
      const controlPlaneUrl = process.env.CONTROL_PLANE_URL || process.env.AUTHENSOR_URL || 'http://localhost:3000';
      const apiKey = process.env.AUTHENSOR_API_KEY || process.env.AUTHENSOR_ADMIN_KEY;

      if (!apiKey) {
        console.log(red('  AUTHENSOR_API_KEY required to fetch active policy.\n'));
        process.exit(1);
      }

      policyB = await loadPolicyFromControlPlane(controlPlaneUrl, apiKey);
      labelB = 'active (control plane)';
    } else if (fileB) {
      const resolvedB = resolve(fileB);
      if (!existsSync(resolvedB)) {
        console.log(red(`  File not found: ${resolvedB}\n`));
        process.exit(1);
      }
      policyB = loadPolicyFromFile(resolvedB);
      labelB = fileB;
    } else {
      console.log(red('  Please provide a second policy file or --active to compare with the control plane.\n'));
      process.exit(1);
    }

    const result = diffPolicies(policyA, policyB);
    console.log(formatDiffResult(result, fileA, labelB));
    console.log('');
    process.exit(result.summary.breaking > 0 ? 1 : 0);
  } catch (err) {
    console.log(red(`  Error: ${err instanceof Error ? err.message : String(err)}\n`));
    process.exit(1);
  }
}

function printHelp() {
  console.log(`
  ${bold('authensor')} v${VERSION} — The open-source safety stack for AI agents

  ${bold('Usage:')}
    npx authensor              Interactive setup
    npx authensor init         Initialize Authensor in your project
    npx authensor up           Start control plane (docker compose)
    npx authensor status       Check running services
    npx authensor templates    List available policy templates
    npx authensor apply <id>   Apply a policy template

  ${bold('Policy tools:')}
    npx authensor policy lint <file>         Validate a policy file
    npx authensor policy test <test-file>    Run policy test cases
    npx authensor policy diff <a> <b>        Compare two policy versions
    npx authensor policy diff <a> --active   Compare with active policy

  ${bold('Aegis (content safety):')}
    npx authensor aegis scan "text"   Scan text for threats
    npx authensor aegis status        Scanner status and rule counts
    echo "text" | npx authensor aegis scan   Pipe content to scan

  ${bold('Sentinel (monitoring):')}
    npx authensor sentinel status     Monitoring status
    npx authensor sentinel alerts     View active alerts
    npx authensor sentinel agents     Per-agent behavioral stats

  ${bold('Environment:')}
    CONTROL_PLANE_URL          Control plane URL (default: http://localhost:3000)
    AUTHENSOR_API_KEY          Admin API key for apply/manage commands
    AUTHENSOR_URL              Alias for CONTROL_PLANE_URL

  ${bold('Learn more:')}
    https://github.com/authensor/authensor
`);
}

// ── Main ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case undefined:
  case 'init':
    cmdInit();
    break;
  case 'up':
  case 'start':
    cmdUp();
    break;
  case 'status':
    cmdStatus();
    break;
  case 'templates':
  case 'template':
    cmdTemplates();
    break;
  case 'apply':
    cmdApply(args[1]);
    break;
  case 'policy': {
    const sub = args[1];
    switch (sub) {
      case 'lint':
        cmdPolicyLint(args[2]);
        break;
      case 'test':
        cmdPolicyTest(args[2]);
        break;
      case 'diff':
        cmdPolicyDiff(args[2], args[3]);
        break;
      default:
        console.log(bold('\n  Policy — Policy management tools\n'));
        console.log(`  ${cyan('policy lint <file>')}          Validate a policy file against the schema`);
        console.log(`  ${cyan('policy test <test-file>')}     Run policy test cases`);
        console.log(`  ${cyan('policy diff <a> <b>')}         Compare two policy versions`);
        console.log(`  ${cyan('policy diff <a> --active')}    Compare with active control plane policy\n`);
    }
    break;
  }
  case 'aegis': {
    const sub = args[1];
    switch (sub) {
      case 'scan':
        cmdAegisScan(args.slice(2).join(' ') || undefined);
        break;
      case 'status':
        cmdAegisStatus();
        break;
      default:
        console.log(bold('\n  Aegis — Content safety for AI agents\n'));
        console.log(`  ${cyan('aegis scan "text"')}   Scan text for threats`);
        console.log(`  ${cyan('aegis status')}        Scanner status\n`);
    }
    break;
  }
  case 'sentinel': {
    const sub = args[1];
    switch (sub) {
      case 'status':
        cmdSentinelStatus();
        break;
      case 'alerts':
        cmdSentinelAlerts();
        break;
      case 'agents':
        cmdSentinelAgents();
        break;
      default:
        console.log(bold('\n  Sentinel — Monitoring for AI agents\n'));
        console.log(`  ${cyan('sentinel status')}    Monitoring status`);
        console.log(`  ${cyan('sentinel alerts')}    View active alerts`);
        console.log(`  ${cyan('sentinel agents')}    Per-agent stats\n`);
    }
    break;
  }
  case '--help':
  case '-h':
  case 'help':
    printHelp();
    break;
  case '--version':
  case '-v':
    console.log(VERSION);
    break;
  default:
    console.log(red(`\n  Unknown command: ${command}`));
    printHelp();
    process.exit(1);
}
