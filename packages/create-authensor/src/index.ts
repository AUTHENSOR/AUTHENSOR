#!/usr/bin/env node

/**
 * create-authensor
 *
 * Scaffold an AI agent project with Authensor safety built in.
 *
 * Usage:
 *   npx create-authensor              Interactive wizard
 *   npx create-authensor my-agent     Create in ./my-agent
 *   npx create-authensor --template claude-hooks
 */

import { mkdirSync, writeFileSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { createInterface } from 'readline';
import { execSync } from 'child_process';

const VERSION = '0.0.1';

// ── Colors ───────────────────────────────────────────────────────────

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

// ── Helpers ──────────────────────────────────────────────────────────

function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${dim(`(${defaultValue})`)}` : '';
  return new Promise((res) => {
    rl.question(`${question}${suffix} `, (answer) => {
      rl.close();
      res(answer.trim() || defaultValue || '');
    });
  });
}

function askChoice(question: string, options: Array<{ key: string; label: string; desc: string }>): Promise<string> {
  return new Promise(async (res) => {
    console.log(`\n  ${bold(question)}\n`);
    options.forEach((o, i) => {
      console.log(`  ${cyan(`${i + 1})`)} ${bold(o.label)}`);
      console.log(`     ${dim(o.desc)}\n`);
    });
    const choice = await ask(`  ${dim('Choice (1-' + options.length + '):')}`, '1');
    const idx = parseInt(choice, 10) - 1;
    res(options[idx]?.key || options[0].key);
  });
}

function ensureDir(dir: string) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function write(dir: string, path: string, content: string) {
  const full = join(dir, path);
  ensureDir(join(full, '..'));
  writeFileSync(full, content);
}

// ── Templates ────────────────────────────────────────────────────────

interface Template {
  key: string;
  label: string;
  desc: string;
  generate: (dir: string, name: string) => void;
}

const TEMPLATES: Template[] = [
  {
    key: 'guard-ts',
    label: 'TypeScript Agent with guard()',
    desc: 'Minimal agent with zero-config policy enforcement — no server needed',
    generate: generateGuardTs,
  },
  {
    key: 'claude-hooks',
    label: 'Claude Code Hooks',
    desc: 'PreToolUse/PostToolUse hooks for Claude Code with Authensor policy gating',
    generate: generateClaudeHooks,
  },
  {
    key: 'mcp-gateway',
    label: 'MCP Gateway',
    desc: 'Transparent proxy for any MCP server with policy enforcement',
    generate: generateMcpGateway,
  },
  {
    key: 'docker',
    label: 'Self-Hosted Control Plane',
    desc: 'Full control plane with PostgreSQL, approval workflows, and audit receipts',
    generate: generateDocker,
  },
  {
    key: 'guard-py',
    label: 'Python Agent with Authensor',
    desc: 'Python agent with Authensor SDK policy enforcement',
    generate: generateGuardPy,
  },
];

function generateGuardTs(dir: string, name: string) {
  write(dir, 'package.json', JSON.stringify({
    name,
    version: '0.0.1',
    type: 'module',
    scripts: {
      start: 'npx tsx src/agent.ts',
      build: 'tsc',
      test: 'npx tsx src/agent.ts',
    },
    dependencies: {
      '@authensor/sdk': 'latest',
    },
    devDependencies: {
      typescript: '^5.3.0',
      '@types/node': '^20.10.0',
      tsx: '^4.7.0',
    },
  }, null, 2) + '\n');

  write(dir, 'tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      strict: true,
      esModuleInterop: true,
      outDir: './dist',
      rootDir: './src',
    },
    include: ['src/**/*'],
  }, null, 2) + '\n');

  write(dir, 'src/agent.ts', `/**
 * ${name} — AI Agent with Authensor Safety
 *
 * Every action is evaluated against the built-in policy before execution.
 * No server required. No config needed. Safe by default.
 */

import { guard, guardExecute } from '@authensor/sdk';

// ── Example: Check if an action is allowed ──────────────────────────

// Read operations are allowed by default
const readResult = guard('data.read', '/api/users');
console.log('Read allowed:', readResult.allowed);  // true

// Write operations require approval
const writeResult = guard('file.write', '/etc/config');
console.log('Write allowed:', writeResult.allowed);  // false (require_approval)
console.log('Write outcome:', writeResult.outcome);   // 'require_approval'

// Destructive operations are hard-denied
const dropResult = guard('db.drop', 'postgres://users');
console.log('Drop allowed:', dropResult.allowed);  // false
console.log('Drop outcome:', dropResult.outcome);   // 'deny'

// ── Example: Guard an async action ──────────────────────────────────

async function main() {
  try {
    // guardExecute wraps your action — only runs if policy allows
    const data = await guardExecute(
      'data.read',
      '/api/users',
      async () => {
        // This only runs if the policy allows it
        return { users: ['alice', 'bob'] };
      }
    );
    console.log('Data:', data);
  } catch (error) {
    console.error('Blocked by policy:', error);
  }

  // This will throw GuardDeniedError
  try {
    await guardExecute(
      'shell.execute',
      '/bin/bash',
      async () => 'should not run'
    );
  } catch (error) {
    console.log('Shell execute correctly blocked:', (error as Error).message);
  }
}

main();
`);

  write(dir, '.gitignore', `node_modules/
dist/
.env
`);
}

function generateClaudeHooks(dir: string, name: string) {
  write(dir, 'package.json', JSON.stringify({
    name,
    version: '0.0.1',
    type: 'module',
    dependencies: {
      '@authensor/sdk': 'latest',
      '@authensor/aegis': 'latest',
    },
    devDependencies: {
      tsx: '^4.7.0',
    },
  }, null, 2) + '\n');

  write(dir, 'hooks/pre-tool-use.ts', `#!/usr/bin/env npx tsx
/**
 * Claude Code PreToolUse Hook
 *
 * Evaluates every tool call against Authensor policy before execution.
 * Blocks dangerous operations, requires approval for sensitive ones.
 *
 * Setup: Add to ~/.claude/settings.json:
 *   "hooks": {
 *     "PreToolUse": [{
 *       "matcher": "*",
 *       "hooks": ["npx tsx hooks/pre-tool-use.ts"]
 *     }]
 *   }
 */

import { guard } from '@authensor/sdk';

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
}

const input: HookInput = JSON.parse(
  await new Promise<string>((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  })
);

const { tool_name, tool_input } = input;

// Map Claude Code tools to Authensor action types
const actionType = tool_name.includes('Write') || tool_name.includes('Edit')
  ? 'file.write'
  : tool_name.includes('Bash')
    ? 'shell.execute'
    : tool_name.includes('Read') || tool_name.includes('Glob') || tool_name.includes('Grep')
      ? 'data.read'
      : \`mcp.\${tool_name}\`;

const resource = typeof tool_input.command === 'string'
  ? tool_input.command
  : typeof tool_input.file_path === 'string'
    ? tool_input.file_path
    : tool_name;

const result = guard(actionType, resource, {
  parameters: tool_input as Record<string, string>,
});

if (!result.allowed) {
  // Output JSON to block the tool call
  console.log(JSON.stringify({
    decision: 'block',
    reason: \`[Authensor] \${result.outcome}: \${result.reason || 'Policy denied this action'}\`,
  }));
} else {
  // Allow — output nothing or explicit allow
  console.log(JSON.stringify({ decision: 'allow' }));
}
`);

  write(dir, 'hooks/post-tool-use.ts', `#!/usr/bin/env npx tsx
/**
 * Claude Code PostToolUse Hook
 *
 * Scans tool output for PII, credentials, and prompt injection using Aegis.
 */

import { AegisScanner } from '@authensor/aegis';

interface HookInput {
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_output: string;
}

const input: HookInput = JSON.parse(
  await new Promise<string>((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
  })
);

const scanner = new AegisScanner();
const result = scanner.scan(input.tool_output, { mode: 'redact' });

if (!result.safe) {
  console.log(JSON.stringify({
    decision: 'block',
    reason: \`[Aegis] Detected: \${result.detections.map(d => d.subType).join(', ')}\`,
  }));
} else {
  console.log(JSON.stringify({ decision: 'allow' }));
}
`);

  write(dir, 'settings-snippet.json', JSON.stringify({
    hooks: {
      PreToolUse: [{
        matcher: '*',
        hooks: ['npx tsx hooks/pre-tool-use.ts'],
      }],
      PostToolUse: [{
        matcher: '*',
        hooks: ['npx tsx hooks/post-tool-use.ts'],
      }],
    },
  }, null, 2) + '\n');

  write(dir, '.gitignore', `node_modules/
.env
`);
}

function generateMcpGateway(dir: string, name: string) {
  write(dir, 'package.json', JSON.stringify({
    name,
    version: '0.0.1',
    type: 'module',
    scripts: {
      start: 'npx authensor-mcp-gateway',
    },
    dependencies: {
      '@authensor/mcp-server': 'latest',
    },
  }, null, 2) + '\n');

  write(dir, 'README.md', `# ${name}

MCP Gateway — transparent policy proxy for any MCP server.

## Setup

Add to your Claude Desktop config (\`claude_desktop_config.json\`):

\`\`\`json
{
  "mcpServers": {
    "${name}": {
      "command": "npx",
      "args": ["authensor-mcp-gateway"],
      "env": {
        "UPSTREAM_COMMAND": "npx @modelcontextprotocol/server-filesystem /tmp",
        "CONTROL_PLANE_URL": "http://localhost:3000"
      }
    }
  }
}
\`\`\`

Every tool call will be evaluated against Authensor policies before forwarding to the upstream server.
`);

  write(dir, 'claude_desktop_config.json', JSON.stringify({
    mcpServers: {
      [name]: {
        command: 'npx',
        args: ['authensor-mcp-gateway'],
        env: {
          UPSTREAM_COMMAND: 'npx @modelcontextprotocol/server-filesystem /tmp',
          CONTROL_PLANE_URL: 'http://localhost:3000',
        },
      },
    },
  }, null, 2) + '\n');

  write(dir, '.gitignore', `node_modules/
.env
`);
}

function generateDocker(dir: string, name: string) {
  write(dir, 'docker-compose.yml', `# ${name} — Authensor Control Plane
# Start: docker compose up -d
# Dashboard: http://localhost:3000/dashboard
# Health: http://localhost:3000/health

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: authensor
      POSTGRES_USER: authensor
      POSTGRES_PASSWORD: \${POSTGRES_PASSWORD:-authensor_dev}
    volumes:
      - authensor_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U authensor"]
      interval: 5s
      timeout: 3s
      retries: 5

  control-plane:
    image: ghcr.io/authensor/control-plane:latest
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgres://authensor:\${POSTGRES_PASSWORD:-authensor_dev}@postgres:5432/authensor
      PORT: "3000"
      AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN: \${AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN:-}
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  authensor_data:
`);

  write(dir, '.env.example', `# Authensor Control Plane Configuration
POSTGRES_PASSWORD=authensor_dev
AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=authensor_$(randomHex(16))
`);

  write(dir, 'setup.sh', `#!/bin/bash
# Quick setup for Authensor Control Plane

set -e

echo "Starting Authensor Control Plane..."

# Generate bootstrap token if not set
if [ -z "$AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN" ]; then
  export AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN="authensor_$(openssl rand -hex 16)"
  echo "Bootstrap token: $AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN"
  echo "Save this token — you'll need it to create API keys."
fi

docker compose up -d

echo ""
echo "Authensor is running!"
echo "  Dashboard: http://localhost:3000/dashboard"
echo "  Health:    http://localhost:3000/health"
echo ""
echo "Create your first API key:"
echo "  curl -X POST http://localhost:3000/keys \\\\"
echo "    -H \\"Authorization: Bearer $AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN\\" \\\\"
echo "    -H \\"Content-Type: application/json\\" \\\\"
echo "    -d '{\\"name\\": \\"my-agent\\", \\"role\\": \\"ingest\\"}'"
`);

  write(dir, '.gitignore', `.env
`);
}

function generateGuardPy(dir: string, name: string) {
  write(dir, 'pyproject.toml', `[project]
name = "${name}"
version = "0.0.1"
description = "AI Agent with Authensor safety"
requires-python = ">=3.10"
dependencies = [
    "authensor>=0.0.1",
]

[build-system]
requires = ["setuptools"]
build-backend = "setuptools.backends._legacy:_Backend"
`);

  write(dir, 'agent.py', `"""
${name} — AI Agent with Authensor Safety

Every action is evaluated against Authensor policies before execution.
"""

from authensor import Authensor

# Initialize — connects to your control plane
client = Authensor(
    control_plane_url="http://localhost:3000",
    api_key="your-api-key",  # Get from: npx authensor init
)


async def main():
    # Evaluate an action before executing it
    result = await client.evaluate(
        action={
            "type": "http.request",
            "resource": "https://api.example.com/data",
        },
        principal={
            "type": "agent",
            "id": "${name}",
        },
    )

    if result.allowed:
        print("Action allowed — proceeding")
        # ... execute the action ...
    elif result.outcome == "require_approval":
        print(f"Approval required: {result.reason}")
        # ... wait for human approval ...
    else:
        print(f"Action denied: {result.reason}")


if __name__ == "__main__":
    import asyncio
    asyncio.run(main())
`);

  write(dir, '.gitignore', `__pycache__/
*.egg-info/
.env
venv/
`);
}

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  // Simple PRNG for scaffolding (not crypto-grade)
  for (let i = 0; i < bytes; i++) {
    arr[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
  ${bold('create-authensor')} v${VERSION}

  ${bold('Usage:')}
    npx create-authensor              Interactive wizard
    npx create-authensor my-agent     Create in ./my-agent
    npx create-authensor --template guard-ts my-agent

  ${bold('Templates:')}
    guard-ts       TypeScript agent with guard() (no server needed)
    claude-hooks   Claude Code PreToolUse/PostToolUse hooks
    mcp-gateway    MCP Gateway transparent policy proxy
    docker         Self-hosted control plane with PostgreSQL
    guard-py       Python agent with Authensor SDK
`);
    process.exit(0);
  }

  if (args.includes('--version') || args.includes('-v')) {
    console.log(VERSION);
    process.exit(0);
  }

  console.log(`
  ${bold('create-authensor')} — Make your AI agent safe in 30 seconds
  `);

  // Parse args
  let templateKey: string | undefined;
  let projectName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--template' || args[i] === '-t') {
      templateKey = args[++i];
    } else if (!args[i].startsWith('-')) {
      projectName = args[i];
    }
  }

  // Ask for project name if not provided
  if (!projectName) {
    projectName = await ask(`  ${bold('Project name:')}`, 'my-safe-agent');
  }

  // Ask for template if not provided
  if (!templateKey) {
    templateKey = await askChoice('Choose your setup:', TEMPLATES.map(t => ({
      key: t.key,
      label: t.label,
      desc: t.desc,
    })));
  }

  const template = TEMPLATES.find(t => t.key === templateKey);
  if (!template) {
    console.log(red(`\n  Unknown template: ${templateKey}`));
    console.log(dim(`  Available: ${TEMPLATES.map(t => t.key).join(', ')}\n`));
    process.exit(1);
  }

  const dir = resolve(process.cwd(), projectName);

  if (existsSync(dir)) {
    const overwrite = await ask(`  ${dim('Directory exists. Continue? (y/N)')}`);
    if (overwrite.toLowerCase() !== 'y') {
      console.log(dim('\n  Aborted.\n'));
      process.exit(0);
    }
  }

  console.log(`\n  ${dim('Creating')} ${bold(projectName)} ${dim('with')} ${cyan(template.label)}${dim('...')}\n`);

  // Generate files
  template.generate(dir, projectName);

  // Install dependencies
  const hasPackageJson = existsSync(join(dir, 'package.json'));
  if (hasPackageJson) {
    console.log(dim('  Installing dependencies...\n'));
    try {
      execSync('npm install', { cwd: dir, stdio: 'pipe' });
      console.log(green('  Dependencies installed.\n'));
    } catch {
      console.log(dim('  Run `npm install` in the project directory.\n'));
    }
  }

  // Print next steps
  console.log(green('  Done!\n'));
  console.log(`  ${bold('Next steps:')}\n`);
  console.log(cyan(`     cd ${projectName}`));

  switch (template.key) {
    case 'guard-ts':
      console.log(cyan('     npx tsx src/agent.ts'));
      break;
    case 'claude-hooks':
      console.log(cyan('     # Copy hooks config to ~/.claude/settings.json'));
      console.log(cyan('     cat settings-snippet.json'));
      break;
    case 'mcp-gateway':
      console.log(cyan('     # Add to Claude Desktop config'));
      console.log(cyan('     cat claude_desktop_config.json'));
      break;
    case 'docker':
      console.log(cyan('     chmod +x setup.sh && ./setup.sh'));
      break;
    case 'guard-py':
      console.log(cyan('     pip install -e .'));
      console.log(cyan('     python agent.py'));
      break;
  }

  console.log('');
  console.log(dim(`  Docs: https://github.com/authensor/authensor`));
  console.log(dim(`  Help: npx authensor --help\n`));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
