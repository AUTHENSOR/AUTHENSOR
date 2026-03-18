#!/usr/bin/env node

/**
 * Authensor Shield CLI
 *
 * Starts the proxy server and optional web GUI.
 *
 * Usage:
 *   authensor-shield [options]
 *
 * Options:
 *   --port <port>     Proxy port (default: 8900)
 *   --gui-port <port> GUI port (default: 8901)
 *   --no-gui          Disable web GUI
 *   -h, --help        Show help
 */

import { startProxy } from './proxy.js';
import { startGui } from './gui.js';
import { getScannerInfo } from './scanner.js';

// ── Argument parsing ───────────────────────────────────────────────────

interface CliOptions {
  port: number;
  guiPort: number;
  noGui: boolean;
  help: boolean;
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    port: 8900,
    guiPort: 8901,
    noGui: false,
    help: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--port':
        opts.port = parseInt(argv[++i], 10);
        if (isNaN(opts.port)) {
          console.error('Error: --port requires a numeric value');
          process.exit(1);
        }
        break;
      case '--gui-port':
        opts.guiPort = parseInt(argv[++i], 10);
        if (isNaN(opts.guiPort)) {
          console.error('Error: --gui-port requires a numeric value');
          process.exit(1);
        }
        break;
      case '--no-gui':
        opts.noGui = true;
        break;
      case '-h':
      case '--help':
        opts.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        opts.help = true;
        break;
    }
  }

  return opts;
}

function printHelp(): void {
  console.log(`
Authensor Shield - AI Safety Proxy

Usage: authensor-shield [options]

Options:
  --port <port>     Proxy port (default: 8900)
  --gui-port <port> GUI port (default: 8901)
  --no-gui          Disable web GUI
  -h, --help        Show help

The proxy intercepts AI API calls, scans for threats, and forwards
safe requests. Set your AI SDK to use the proxy base URLs:

  ANTHROPIC_BASE_URL=http://localhost:8900/anthropic
  OPENAI_BASE_URL=http://localhost:8900/openai
`);
}

// ── Open browser (best-effort) ─────────────────────────────────────────

async function openBrowser(url: string): Promise<void> {
  const { exec } = await import('node:child_process');

  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    command = `xdg-open "${url}"`;
  }

  exec(command, () => {
    // Ignore errors -- browser opening is best-effort
  });
}

// ── Main ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const opts = parseArgs(process.argv);

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  // Start the proxy
  try {
    await startProxy({ port: opts.port, guiPort: opts.guiPort });
  } catch (err) {
    console.error(`Failed to start proxy on port ${opts.port}:`, err);
    process.exit(1);
  }

  console.log('');
  console.log('  Authensor Shield active on port ' + opts.port);

  // Start the GUI
  if (!opts.noGui) {
    try {
      await startGui({ guiPort: opts.guiPort, proxyPort: opts.port });
      console.log('  Dashboard: http://localhost:' + opts.guiPort);
    } catch (err) {
      console.error(`  Warning: GUI failed to start on port ${opts.guiPort}:`, err);
    }
  }

  // Print connection info
  console.log('');
  console.log('  Add to your .env:');
  console.log('  ANTHROPIC_BASE_URL=http://localhost:' + opts.port + '/anthropic');
  console.log('  OPENAI_BASE_URL=http://localhost:' + opts.port + '/openai');
  console.log('');

  // Print scanner info
  const scannerInfo = await getScannerInfo();
  const aegisMsg = scannerInfo.aegisAvailable
    ? `Aegis loaded (${scannerInfo.aegisRules} rules)`
    : 'Aegis not installed (using built-in patterns)';
  console.log(`  Scanner: ${scannerInfo.builtInRules} built-in rules, ${aegisMsg}`);
  console.log('');

  // Open browser
  if (!opts.noGui) {
    await openBrowser(`http://localhost:${opts.guiPort}`);
  }

  // Handle shutdown
  const shutdown = async (): Promise<void> => {
    console.log('\n  Shutting down Authensor Shield...');
    const { stopProxy } = await import('./proxy.js');
    const { stopGui } = await import('./gui.js');
    await Promise.all([stopProxy(), stopGui()]);
    process.exit(0);
  };

  process.on('SIGINT', () => { void shutdown(); });
  process.on('SIGTERM', () => { void shutdown(); });
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
