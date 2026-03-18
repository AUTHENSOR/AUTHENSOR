# Authensor Shield

One-click AI safety proxy. Sits between your app and the AI provider.
No code changes required.

## Quick Start

```bash
npx @authensor/shield
```

Then add to your `.env`:

```
ANTHROPIC_BASE_URL=http://localhost:8900/anthropic
OPENAI_BASE_URL=http://localhost:8900/openai
```

## GUI

Open http://localhost:8901 for the visual dashboard.

## CLI Options

```
authensor-shield [options]

  --port <port>     Proxy port (default: 8900)
  --gui-port <port> GUI port (default: 8901)
  --no-gui          Disable web GUI
  -h, --help        Show help
```

## How It Works

1. Start the shield proxy
2. Point your AI SDK at the proxy (via BASE_URL env vars)
3. Every request is scanned for prompt injection, credential leaks, and attack patterns
4. Every response is scanned with Aegis (if installed) for indirect injection and data exfiltration
5. Clean traffic passes through transparently; threats are blocked

## Scanning

Built-in pattern detection covers:

- Prompt injection (ignore instructions, system overrides, jailbreaks, delimiter escapes)
- Data exfiltration (URL smuggling, markdown image exfiltration)
- Credential exposure (API keys, tokens in prompts)
- Dangerous code execution patterns

When `@authensor/aegis` is installed, response scanning includes the full Aegis detector suite (PII, injection, credentials, code safety, exfiltration, output injection).
