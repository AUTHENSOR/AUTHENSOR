# Reddit Launch Posts

---

## r/MachineLearning

### Title

[P] Authensor: Open-source action authorization and safety scanning for AI agents — policy engine, hash-chained audit trail, prompt injection detection

### Body

We open-sourced the safety stack we built for AI agent deployments. Authensor provides a policy evaluation layer, content safety scanning, and cryptographic audit trails for any AI agent framework.

**Technical details:**

The core policy engine is synchronous and pure (no I/O, no side effects). Actions are described as envelopes with a tool name, parameters, and agent identity. The engine evaluates these against YAML-defined rules and returns allow/deny/escalate decisions in microseconds.

The audit trail uses SHA-256 hash chaining. Each receipt includes the decision, the envelope hash, a timestamp, and the hash of the previous receipt. This creates a tamper-evident log — modifying any historical record breaks the chain. This satisfies the record-keeping requirements in EU AI Act Article 12 and maps to OWASP Agentic Top 10 controls.

The content scanner (Aegis) runs 15+ prompt injection detection rules, PII pattern matching, credential detection, and 22 MINJA (Memory Injection Attack) rules. It has zero runtime dependencies and runs before policy evaluation to catch adversarial inputs early. We published our detection methodology and rule definitions in the repo.

The monitoring engine (Sentinel) tracks per-agent behavioral metrics using EWMA (Exponentially Weighted Moving Average) and CUSUM (Cumulative Sum) algorithms to detect anomalous tool usage patterns, action rate spikes, and scope drift.

**Integrations:** LangChain/LangGraph, OpenAI Agents SDK, CrewAI, Claude Agent SDK, Vercel AI SDK. TypeScript and Python SDKs. MCP gateway for tool-level authorization.

**Try it:**

```bash
npx @authensor/create-authensor my-agent
cd my-agent && npm install
npm run demo
```

MIT licensed. No enterprise tier. Self-host with Docker Compose.

GitHub: https://github.com/authensor/authensor

Happy to discuss the detection methodology, the hash chaining approach, or the policy evaluation model. Feedback welcome.

---

## r/LangChain

### Title

We built an open-source safety layer that integrates with LangChain in 3 lines — policy enforcement, approval workflows, and audit trails for your agents

### Body

We kept running into the same problem: LangChain agents that could call any tool with no authorization check, no approval step, and no audit trail. So we built Authensor.

**What it does for your LangChain agent:**

1. **Policy enforcement** — Define YAML rules for which tools your agent can use and under what conditions. `file.read` might be allowed, `db.delete` requires human approval, `shell.exec` is denied entirely. If no policy is loaded, everything is denied (fail-closed).

2. **Approval workflows** — When an action requires approval, the agent pauses and waits. You can route approvals to Slack, a webhook, or a custom UI. The agent resumes once approved or times out.

3. **Audit trail** — Every decision creates a SHA-256 hash-chained receipt. You get a tamper-evident log of everything your agent did, what was allowed, denied, and why.

4. **Content scanning** — Aegis scans tool inputs for prompt injection, PII, credentials, and memory poisoning before the policy engine even runs.

**LangChain integration:**

```python
from authensor import Authensor

authensor = Authensor(api_url="http://localhost:4000")
# Wrap your tools
safe_tools = authensor.guard_tools(your_tools)
# Use safe_tools in your agent as normal
```

That's it. Your existing tool definitions don't change. Authensor wraps them with policy checks.

Works with LangGraph too — the approval workflow integrates with LangGraph's interrupt/resume pattern.

**Try the demo:**

```bash
npx @authensor/create-authensor my-agent
cd my-agent && npm install
npm run demo
```

Shows an unprotected agent running destructive actions, then the same agent with Authensor blocking them.

MIT licensed. Free. Self-hosted.

GitHub: https://github.com/authensor/authensor

---

## r/LocalLLaMA

### Title

Open-source safety layer for self-hosted AI agents — policy engine, content scanning, audit trail. Fully self-hosted, no cloud dependency.

### Body

If you're running local agents, you probably have even less safety infrastructure than the cloud crowd. No API provider rate limiting your calls. No managed safety layer. Your agent talks directly to tools on your machine.

Authensor is a self-hosted safety stack that sits between your agent and its tools:

- **Policy engine**: YAML rules define what tools your agent can use. Fail-closed — if no policy is loaded, everything is denied.
- **Content scanning**: Aegis detects prompt injection, PII, and credential exposure. Zero dependencies, runs locally, sub-millisecond.
- **Audit trail**: SHA-256 hash-chained receipts for every decision. Tamper-evident.
- **Anomaly detection**: Sentinel monitors per-agent behavior for rate spikes, scope drift, and unusual tool usage patterns.

**Self-hosting:**

```bash
docker compose up -d
```

That gives you the control plane (Hono API + PostgreSQL). No cloud calls. No telemetry. Everything runs on your machine.

If you don't want the full control plane, the policy engine and Aegis scanner work standalone with zero dependencies:

```typescript
import { PolicyEngine } from '@authensor/engine';
import { Aegis } from '@authensor/aegis';
```

Works with any agent framework (LangChain, CrewAI, OpenAI, Claude) and any MCP server.

MIT licensed. No enterprise tier hiding the good features behind a paywall.

GitHub: https://github.com/authensor/authensor

---

## r/opensource

### Title

Authensor: We open-sourced the entire safety stack for AI agents — policy engine, audit trails, content scanning, anomaly detection. MIT licensed, no enterprise tier.

### Body

We've been building Authensor for the past year as an AI agent safety layer. Today we're sharing it as a fully open-source project under the MIT license.

**Why we went open source:**

Agent safety infrastructure needs to be inspectable. If a tool is deciding whether your AI agent can execute an action, you should be able to read the source code, audit the rules, and verify the audit trail. A closed-source black box that says "trust us, it's safe" defeats the purpose.

We also think agent safety is too important to be locked behind enterprise pricing. The companies that need it most — startups, researchers, small teams — are the ones who can't afford $10K/year for a safety platform.

**What's in the repo:**

- `@authensor/engine` — Synchronous policy evaluation engine. YAML rules, fail-closed by default. Zero dependencies.
- `@authensor/aegis` — Content safety scanner. Prompt injection detection (15+ rules), PII, credentials, memory poisoning (22 MINJA rules). Zero dependencies.
- `@authensor/sentinel` — Behavioral anomaly detection. EWMA/CUSUM statistical monitoring per agent. Zero dependencies.
- `@authensor/control-plane` — HTTP API (Hono + PostgreSQL). Manages policies, receipts, API keys, tenants.
- `@authensor/mcp-server` — MCP authorization gateway.
- SDKs for TypeScript and Python.
- Adapters for LangChain, OpenAI Agents SDK, CrewAI, Claude Agent SDK, Vercel AI SDK.

**What we're NOT doing:**

- No enterprise tier. Everything is in the open-source repo.
- No "open core" bait-and-switch. The hosted version is just a convenience option.
- No telemetry or phone-home.
- No CLA. Standard MIT license.

Self-host with Docker Compose or use the standalone packages with zero dependencies.

GitHub: https://github.com/authensor/authensor

Would love feedback from the community, especially on the policy language design and the audit trail format.

---

## r/node

### Title

Authensor: TypeScript safety layer for AI agents — policy engine, content scanner, audit trail. ESM, zero-dep core packages, Hono API.

### Body

Sharing a TypeScript project we've been building: Authensor is a safety stack for AI agents.

**For the TypeScript/Node crowd, here's what might interest you:**

- **pnpm workspaces + Turborepo** monorepo with 10+ packages
- **ESM only** — `type: "module"` everywhere, NodeNext module resolution
- **Zero-dependency core packages** — The policy engine, content scanner (Aegis), and monitoring engine (Sentinel) have zero runtime dependencies. They're pure TypeScript with no `node_modules` baggage.
- **Hono for the API** — The control plane uses Hono, which gives us edge compatibility and a clean middleware pattern. We use it with `@hono/node-server` for the self-hosted version.
- **Raw SQL over ORMs** — PostgreSQL with the `pg` driver. Migrations are plain SQL files. Types are generated from JSON Schema, not inferred from database tables.
- **Vitest** — 1,148 tests across all packages.

**What it does:**

Authensor sits between your AI agent and the tools it calls. Every action is evaluated against a YAML policy. Actions can be allowed, denied, or escalated to a human for approval. Every decision creates a SHA-256 hash-chained receipt for an immutable audit trail.

The content scanner (Aegis) detects prompt injection, PII, credential exposure, and memory poisoning attacks. It runs before the policy engine evaluates, so adversarial inputs are caught early.

**Quick start:**

```bash
npx @authensor/create-authensor my-agent
cd my-agent && npm install
npm run demo
```

**Architecture pattern that might be useful for your own projects:**

The policy engine is entirely synchronous and pure — no I/O, no side effects. All I/O happens in the control plane layer. This makes the engine trivially testable and fast. The content scanner and monitoring engine follow the same pattern. If you're building evaluation/rules engines, this separation is worth considering.

MIT licensed. GitHub: https://github.com/authensor/authensor
