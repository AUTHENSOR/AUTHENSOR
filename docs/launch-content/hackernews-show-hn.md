# Hacker News — Show HN Post

## Title

Show HN: Authensor – Open-source safety stack for AI agents (policy engine, audit trail, content scanning)

## Body

Authensor is an open-source (MIT) safety layer for AI agents. It sits between your agent and the tools it uses.

What it does:
- Policy engine: YAML rules that evaluate every action before execution. Fail-closed by default.
- Approval workflows: Pause dangerous actions and route to humans.
- Audit trail: SHA-256 hash-chained receipts (tamper-evident, EU AI Act Article 12).
- Content scanning: Aegis detects prompt injection, PII, credentials, memory poisoning. Zero dependencies.
- Monitoring: Sentinel detects behavioral anomalies per-agent using EWMA/CUSUM.
- MCP Gateway: Authorization proxy for MCP tool calls.

Works with LangChain, OpenAI Agents SDK, CrewAI, Claude, Vercel AI SDK. TypeScript + Python SDKs.

Try it: npx @authensor/create-authensor my-agent && cd my-agent && npm install && npm run demo

The demo shows an unprotected agent executing destructive actions, then the same agent with Authensor blocking them.

Self-host with Docker Compose. Everything is free. No enterprise pricing.

GitHub: https://github.com/authensor/authensor
