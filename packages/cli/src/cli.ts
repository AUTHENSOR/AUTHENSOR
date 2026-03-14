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
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createInterface } from 'readline';

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
