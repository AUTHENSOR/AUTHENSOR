# Directory Submission Content

Prepared 2026-03-14. Copy-paste each section into the respective submission form.

---

## 1. awesome-mcp-servers (GitHub PR)

**Status: DONE** — PR created at https://github.com/punkpeye/awesome-mcp-servers/pull/3244

Entry added to the Security section:

```
- [authensor/authensor](https://github.com/authensor/authensor/tree/main/packages/mcp-server) 📇 ☁️ 🏠 🍎 🪟 🐧 - Policy enforcement gateway for MCP tool calls. Every tool invocation is evaluated against declarative YAML policies before execution. Supports allow/deny/escalate-to-human decisions, cryptographic audit receipts, and content safety scanning via Aegis. MIT licensed.
```

---

## 2. Glama MCP Registry (glama.ai/mcp/servers)

Submit at: https://glama.ai/mcp/servers/submit (or via GitHub sync)

| Field | Value |
|-------|-------|
| **Server name** | @authensor/mcp-server |
| **GitHub URL** | https://github.com/authensor/authensor/tree/main/packages/mcp-server |
| **npm package** | @authensor/mcp-server |
| **Category** | Security |

**Description:**

```
Policy enforcement gateway for MCP tool calls. Every tool invocation is evaluated against declarative YAML policies before execution. Supports allow/deny/review decisions, cryptographic audit receipts, and content safety scanning. Zero-dependency policy engine. MIT licensed.
```

**Long description (if available):**

```
Authensor's MCP server wraps any MCP tool with a policy enforcement layer. Define rules in YAML — which tools can be called, by whom, under what conditions — and every invocation is evaluated before execution.

Features:
- Declarative YAML policies with allow/deny/escalate-to-human decisions
- Cryptographic hash-chained audit receipts (tamper-evident)
- Built-in content safety scanning via Aegis (zero dependencies)
- Real-time anomaly detection via Sentinel
- Works as a gateway in front of any existing MCP server
- 1,148+ tests across the full stack
- MIT licensed, self-hostable
```

---

## 3. MCP.so

Submit at: https://mcp.so/submit

| Field | Value |
|-------|-------|
| **Name** | Authensor MCP Server |
| **npm** | @authensor/mcp-server |
| **GitHub** | https://github.com/authensor/authensor/tree/main/packages/mcp-server |
| **Category** | Security |
| **Language** | TypeScript |

**Short description:**

```
Policy enforcement gateway for MCP tool calls — evaluate every invocation against YAML policies before execution, with cryptographic audit trails and content safety scanning.
```

**Full description:**

```
Authensor's MCP server acts as a policy enforcement gateway. Wrap any MCP tool with declarative YAML policies that control who can call what, when, and under what conditions. Every decision produces a cryptographic hash-chained receipt for tamper-evident auditing.

Key capabilities:
- Allow/deny/escalate-to-human decisions based on YAML policy rules
- Cryptographic audit receipts with hash chaining
- Content safety scanning via Aegis (built-in, zero dependencies)
- Real-time monitoring and anomaly detection via Sentinel
- Gateway mode: sits in front of any existing MCP server
- Framework adapters for LangChain, OpenAI Agents SDK, CrewAI
- 1,148+ tests, OWASP 10/10 coverage
- MIT licensed, fully self-hostable

Install: npx @authensor/mcp-server
```

---

## 4. MCPServers.org

Submit at: https://mcpservers.org/submit

| Field | Value |
|-------|-------|
| **Server name** | Authensor MCP Server |
| **Package** | @authensor/mcp-server |
| **Source** | https://github.com/authensor/authensor/tree/main/packages/mcp-server |
| **Category** | Security |
| **Runtime** | Node.js / TypeScript |

**Description:**

```
Policy enforcement gateway for MCP tool calls. Evaluates every tool invocation against declarative YAML policies before execution. Supports allow/deny/escalate-to-human decisions, cryptographic hash-chained audit receipts, and content safety scanning. Works as a gateway in front of any existing MCP server. MIT licensed, zero-dependency core engine.
```

---

## 5. DevHunt (devhunt.org)

Submit at: https://devhunt.org/submit

| Field | Value |
|-------|-------|
| **Tool name** | Authensor |
| **Tagline** | The open-source safety stack for AI agents |
| **GitHub** | https://github.com/authensor/authensor |
| **Website** | https://authensor.com |
| **Category** | Security / Developer Tools |

**Description:**

```
Enterprise-grade agent safety, completely free and open source.

Authensor provides everything you need to make AI agents safe for production:

- Policy Engine — Declarative YAML rules that evaluate every agent action. Allow, deny, or escalate to a human. Fail-closed by default.
- Approval Workflows — Human-in-the-loop gates for high-risk actions. Configurable timeouts and escalation paths.
- Content Safety (Aegis) — Built-in scanner for prompt injection, PII leakage, toxic content, and secrets exposure. Zero dependencies.
- Cryptographic Audit Trails — Every decision produces a hash-chained receipt. Tamper-evident, compliance-ready.
- Real-Time Monitoring (Sentinel) — Anomaly detection, rate limiting, and drift alerts. Zero dependencies.
- MCP Tool Governance — Policy enforcement gateway for Model Context Protocol servers.

Works with LangChain, OpenAI Agents SDK, CrewAI, Claude, Vercel AI SDK. 1,148+ tests. OWASP Agentic AI top-10 coverage at 10/10. MIT licensed.

Self-host with Docker Compose or use the hosted tier for $5/mo.
```

---

## 6. Toolify.ai

Submit at: https://www.toolify.ai/submit

| Field | Value |
|-------|-------|
| **Tool name** | Authensor |
| **Website** | https://authensor.com |
| **Category** | AI Safety / Developer Tools |
| **Pricing** | Free (open source) / Hosted $5/mo |

**Short description:**

```
Open-source safety stack for AI agents — policy enforcement, approval workflows, content scanning, cryptographic audit trails, and real-time monitoring.
```

**Full description:**

```
Authensor is the open-source safety stack for AI agents. It provides the complete set of guardrails needed to deploy agents in production.

Core components:
1. Policy Engine — Declarative YAML rules evaluate every agent action before execution. Allow, deny, or escalate to a human. Synchronous, zero-dependency, fail-closed by default.
2. Aegis Content Scanner — Detects prompt injection, PII leakage, toxic content, secrets exposure, and more. Zero runtime dependencies.
3. Sentinel Monitoring — Real-time anomaly detection, rate limiting, and behavioral drift alerts. Zero runtime dependencies.
4. Cryptographic Receipts — Every decision is recorded in a hash-chained, tamper-evident audit trail.
5. MCP Gateway — Policy enforcement for Model Context Protocol tool calls.
6. Control Plane API — HTTP API with PostgreSQL backing, role-based auth, webhook integrations.

Framework support: LangChain, LangGraph, OpenAI Agents SDK, CrewAI, Claude MCP, Vercel AI SDK.

1,148+ tests. OWASP Agentic AI top-10 coverage: 10/10. MIT licensed. Self-host with Docker Compose or use the managed tier at $5/month.

GitHub: https://github.com/authensor/authensor
```

---

## 7. OpenTools.ai

Submit at: https://www.opentools.ai/submit

| Field | Value |
|-------|-------|
| **Tool name** | Authensor |
| **Website** | https://authensor.com |
| **GitHub** | https://github.com/authensor/authensor |
| **Category** | Security / Developer Tools |
| **Pricing** | Free / Open Source (hosted $5/mo) |

**Short description:**

```
Open-source safety stack for AI agents. Policy engine, content scanning, cryptographic audit trails, and real-time monitoring.
```

**Full description:**

```
Authensor is an open-source safety infrastructure for AI agents. It evaluates every agent action against declarative YAML policies before execution, producing cryptographic audit receipts for every decision.

What it does:
- Policy enforcement with allow/deny/escalate-to-human decisions
- Content safety scanning (prompt injection, PII, toxic content, secrets)
- Cryptographic hash-chained audit trail
- Real-time anomaly detection and monitoring
- Human-in-the-loop approval workflows
- MCP tool governance gateway

Built for production: 1,148+ tests, OWASP 10/10 coverage, fail-closed by default. Works with LangChain, OpenAI, CrewAI, Claude, Vercel AI SDK. MIT licensed.

Self-host free with Docker Compose. Hosted tier: $5/month.
```

---

## 8. Product Hunt (launch prep)

Save for launch day. Create at: https://www.producthunt.com/posts/new

| Field | Value |
|-------|-------|
| **Name** | Authensor |
| **Tagline** | The open-source safety stack for AI agents |
| **Website** | https://authensor.com |
| **GitHub** | https://github.com/authensor/authensor |
| **Topics** | Open Source, Developer Tools, Artificial Intelligence, Security, APIs |
| **Pricing** | Free + Paid ($5/mo hosted) |
| **Makers** | @your-ph-handle |

**Description:**

```
AI agents are powerful — but shipping them without guardrails is a liability.

Authensor is the open-source safety stack that makes agents production-ready. Drop it into any agent framework and get:

**Policy Engine** — Write YAML rules. Every agent action is evaluated before it executes. Allow, deny, or escalate to a human. Fail-closed by default — no policy means no execution.

**Aegis Content Scanner** — Catches prompt injection, PII leakage, toxic content, and secrets in tool inputs and outputs. Zero runtime dependencies. No API calls. Everything runs locally.

**Sentinel Monitoring** — Real-time anomaly detection. Rate limiting. Behavioral drift alerts. Catches when agents go off-script.

**Cryptographic Audit Trails** — Every decision is recorded as a hash-chained receipt. Tamper-evident. Compliance-ready. Export to your SIEM.

**MCP Gateway** — Policy enforcement for Model Context Protocol tool calls. Wrap any MCP server with authorization in one line.

**Framework Adapters** — LangChain, OpenAI Agents SDK, CrewAI, Claude MCP, Vercel AI SDK. Install. Import. Done.

1,148+ tests. OWASP Agentic AI top-10 coverage: 10/10. MIT licensed.

Self-host free with Docker Compose, or use the hosted tier for $5/month for zero-ops convenience.
```

**First Comment (post as maker):**

```
Hey Product Hunt! I'm the creator of Authensor.

I've been building AI agents for the past year and kept running into the same problem: there's no standard way to make agents safe. Every team rolls their own guardrails, and most skip it entirely.

Authensor is my answer — a complete safety stack that works with any agent framework. The core insight is simple: evaluate every action against a policy before it executes, and record every decision in a tamper-evident audit trail.

The entire project is open source (MIT). The policy engine has zero dependencies and runs synchronously — no network calls, no latency surprises. The content scanner (Aegis) and monitoring engine (Sentinel) are also zero-dependency.

If you're shipping agents to production and care about safety, compliance, or just sleeping well at night — give it a try:

npm install @authensor/sdk
# or
pip install authensor

I'd love your feedback. What safety features matter most to you when deploying agents?
```

---

## 9. StackShare

Submit at: https://stackshare.io/submit

| Field | Value |
|-------|-------|
| **Tool name** | Authensor |
| **Website** | https://authensor.com |
| **GitHub** | https://github.com/authensor/authensor |
| **Category** | Security / Application Security |
| **Type** | Open Source Tool |

**Description:**

```
Authensor is the open-source safety stack for AI agents. It provides policy enforcement, content safety scanning, cryptographic audit trails, and real-time monitoring for any agent framework.

Key features:
- Declarative YAML policy engine (synchronous, zero dependencies, fail-closed)
- Content safety scanner detecting prompt injection, PII, toxic content, secrets (Aegis — zero dependencies)
- Real-time anomaly detection and behavioral monitoring (Sentinel — zero dependencies)
- Cryptographic hash-chained audit receipts
- Human-in-the-loop approval workflows
- MCP tool governance gateway
- Framework adapters: LangChain, OpenAI Agents SDK, CrewAI, Claude MCP, Vercel AI SDK
- Control plane API with PostgreSQL, role-based auth, webhooks

Tech stack: TypeScript, Hono, PostgreSQL, pnpm workspaces, Turborepo, Vitest.
1,148+ tests. OWASP Agentic AI 10/10 coverage. MIT licensed.
```

**Pros (for StackShare comparison):**

```
- Completely open source (MIT) — no vendor lock-in
- Zero-dependency core modules (engine, Aegis, Sentinel)
- Fail-closed by default — safe defaults out of the box
- Framework-agnostic with first-party adapters
- Cryptographic audit trail for compliance
- Self-hostable via Docker Compose
- Active development with 1,148+ tests
```

---

## Submission Checklist

- [x] awesome-mcp-servers — PR #3244 created
- [ ] Glama MCP Registry — paste content from Section 2
- [ ] MCP.so — paste content from Section 3
- [ ] MCPServers.org — paste content from Section 4
- [ ] DevHunt — paste content from Section 5
- [ ] Toolify.ai — paste content from Section 6
- [ ] OpenTools.ai — paste content from Section 7
- [ ] Product Hunt — save for launch day, content in Section 8
- [ ] StackShare — paste content from Section 9
