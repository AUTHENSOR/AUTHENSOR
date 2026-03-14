<p align="center">
  <strong>Authensor</strong><br>
  The open-source safety stack for AI agents
</p>

<p align="center">
  <em>Every agent action evaluated. Every decision auditable. Every tool governed.</em>
</p>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://github.com/authensor/authensor/actions">
    <img src="https://img.shields.io/badge/tests-924%20passing-brightgreen.svg" alt="Tests: 924 passing">
  </a>
  <a href="https://www.npmjs.com/org/authensor">
    <img src="https://img.shields.io/badge/npm-%40authensor-red.svg" alt="npm: @authensor">
  </a>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="#why-authensor">Why Authensor</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#packages">Packages</a> &middot;
  <a href="#owasp-agentic-top-10-coverage">OWASP Coverage</a> &middot;
  <a href="docs/eu-ai-act-compliance.md">EU AI Act</a>
</p>

---

## The Problem

AI agents are shipping to production without guardrails. They call APIs, browse the web, execute code, and manage infrastructure — often with no policy enforcement, no approval workflows, and no audit trail.

- **32% of MCP servers** have at least one critical vulnerability ([Enkrypt AI](https://www.enkryptai.com/blog/we-scanned-1-000-mcp-servers-33-had-critical-vulnerabilities))
- **Agents fall for dark patterns 41% of the time** ([arxiv 2510.18113](https://arxiv.org/abs/2510.18113))
- **88% of organizations** have confirmed or suspected AI security incidents
- **EU AI Act high-risk deadline is August 2, 2026** — creating urgent compliance demand

Existing guardrails focus on what models *say* (prompt/response filtering). Authensor focuses on what agents *do* (action authorization, approval workflows, and cryptographic audit trails).

## The Solution

Authensor is three open-source tools that together cover the full surface area of agent risk:

| Tool | What it guards | How |
|------|---------------|-----|
| **Authensor** | Agent actions (API calls, tool use, data access) | Policy engine + control plane with hash-chained receipts |
| **[SpiroGrapher](https://github.com/authensor/spirographer)** | Agent web browsing | Compiles HTML to structured IR, detects dark patterns, constitutional rules |
| **[SafeClaw](https://github.com/authensor/safeclaw)** | Local agent execution | PreToolUse hook gating, deny-by-default, mobile approval workflows |

## Quickstart

### Self-hosted (recommended)

```bash
git clone https://github.com/authensor/authensor.git
cd authensor
docker compose up -d
# Control plane running at http://localhost:3000
# Admin token printed to logs: docker compose logs control-plane
```

That's it. Postgres starts, migrations run, a bootstrap admin key is created, and a default-safe policy (deny-by-default) is provisioned. Aegis content safety and Sentinel monitoring are enabled out of the box.

### 30 seconds: Run a safe local agent

```bash
npx safeclaw init --demo
npx safeclaw run "list my project files"
# Opens dashboard at localhost:7700 with policy enforcement + audit trail
```

### Add to any agent (TypeScript)

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',
  principalId: 'my-agent',
});

const result = await authensor.execute(
  'stripe.charges.create',
  'stripe://customers/cus_123/charges',
  async () => stripe.charges.create({ amount: 1000, currency: 'usd' }),
  { constraints: { maxAmount: 10000 } }
);
// Receipt created, policy enforced, action audited
```

### Add to any agent (Python)

```python
from authensor import Authensor

async with Authensor(
    control_plane_url="http://localhost:3000",
    principal_id="my-agent",
) as authensor:
    result = await authensor.execute(
        action_type="stripe.charges.create",
        resource="stripe://customers/cus_123/charges",
        executor=lambda: create_charge(),
        constraints={"max_amount": 10000},
    )
```

### Framework adapters

Drop-in integration for popular agent frameworks:

```typescript
// LangChain / LangGraph
import { AuthensorGuardrail } from '@authensor/langchain';
const guardrail = new AuthensorGuardrail({ controlPlaneUrl: '...' });

// OpenAI Agents SDK
import { AuthensorGuardrail } from '@authensor/openai';

// CrewAI — coming soon
// Vercel AI SDK
import { AuthensorGuardrail } from '@authensor/vercel-ai-sdk';

// Claude Agent SDK
import { AuthensorGuardrail } from '@authensor/claude-agent-sdk';
```

## Why Authensor

### vs. the landscape

| Capability | Authensor | AWS AgentCore + Cedar | Galileo Agent Control | NeMo Guardrails | Guardrails AI |
|---|---|---|---|---|---|
| Action authorization (pre-execution) | Yes | Yes | Yes | No (prompt/response) | No (output validation) |
| Content safety scanning (pre-eval) | Yes (Aegis) | No | No | Yes | Yes |
| Approval workflows (human-in-the-loop) | Yes (SMS, Slack, email, mobile PWA) | No | No | No | No |
| Cryptographic audit trail (receipts) | Yes (hash-chained, Sigstore) | No | No | No | No |
| Real-time anomaly detection | Yes (Sentinel) | No | No | No | No |
| Deny-by-default / fail-closed | Yes | Yes | No | No | No |
| Cloud-agnostic | Yes | No (AWS only) | Yes | Yes | Yes |
| Open source | Yes (MIT) | No (Cedar is, AgentCore isn't) | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes (Apache 2.0) |
| MCP tool governance | Yes | No | No | No | No |
| Web browsing governance | Yes (SpiroGrapher) | No | No | No | No |
| Multi-party approval | Yes | No | No | No | No |
| Cross-agent chain tracing | Yes (parentReceiptId) | No | No | No | No |
| Session-level threat detection | Yes (forbidden sequences, risk scoring) | No | No | No | No |
| Budget enforcement | Yes (per-principal spending limits) | No | No | No | No |
| Shadow/canary policy testing | Yes | No | No | No | No |
| Framework adapters | 5 (LangChain, OpenAI, CrewAI, Vercel AI, Claude) | 1 (Bedrock) | 1 (custom) | 1 (custom) | 1 (custom) |

### Key differentiators

1. **Action-level, not prompt-level.** Most guardrails filter what the model says. Authensor governs what the agent *does* — every tool call, API request, and side effect goes through policy evaluation before execution.

2. **Defense in depth.** Seven layers of safety in one stack:
   - **Aegis** scans for prompt injection, jailbreak, PII, and memory poisoning *before* policy evaluation
   - **Session rules** detect privilege escalation through action sequences and cumulative risk scoring
   - **Policy engine** evaluates conditions, constraints, rate limits, and budgets
   - **Approval workflows** force human review for high-consequence actions
   - **Sentinel** monitors per-agent baselines and detects anomalies in real-time
   - **Receipts** create a tamper-evident audit trail with hash chains and optional Sigstore transparency
   - **TOCTOU protection** re-evaluates policy on claim to prevent time-of-check/time-of-use attacks

3. **Receipts, not just logs.** Every action produces a structured, policy-versioned receipt recording what was requested, what policy decided, why, and what happened. Hash-chained for tamper evidence. This directly satisfies EU AI Act Article 12 (record-keeping) and SOX audit requirements.

4. **Fail-closed by default.** No policy loaded? Denied. Control plane unreachable? Denied. Unknown action type? Denied. This matches OWASP and NIST recommendations.

5. **Cross-provider.** Works with Claude, GPT, LangChain, CrewAI, Vercel AI, or any agent framework. One safety layer for all your agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Your Agent                                    │
│  (Claude, GPT, LangChain, CrewAI, Vercel AI, custom, etc.)           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ SDK / MCP / Hook
                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Authensor Stack                                │
│                                                                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │
│  │   Aegis    │→ │   Engine   │→ │  Control   │→ │  Sentinel    │   │
│  │  (content  │  │   (pure    │  │   Plane    │  │  (real-time  │   │
│  │   safety)  │  │   logic)   │  │  (HTTP API)│  │  monitoring) │   │
│  └────────────┘  └────────────┘  └─────┬──────┘  └──────────────┘   │
│                                        │                              │
│  ┌────────────┐  ┌────────────┐  ┌─────▼──────┐  ┌──────────────┐   │
│  │  SafeClaw  │  │ SpiroGrapher│  │  Receipts  │  │   Adapters   │   │
│  │(local gate)│  │(web govern) │  │(hash chain)│  │(5 frameworks)│   │
│  └────────────┘  └────────────┘  └────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### How it works

```
Agent wants to act
  │
  ▼
Action Envelope created (who, what, where, constraints)
  │
  ▼
Aegis scans for injection, jailbreak, PII, memory poisoning
  │
  ▼
Session rules check forbidden sequences + risk threshold
  │
  ▼
Policy engine evaluates conditions, rate limits, budgets
  │
  ▼
Decision: allow | deny | require_approval | rate_limited
  │
  ▼
Receipt created (hash-chained, policy-versioned)
  │
  ▼
Sentinel monitors for anomalies
  │
  ▼
Action executes (or doesn't) → receipt updated
```

### Core concepts

**Action Envelope** — describes what an agent wants to do:
```json
{
  "id": "uuid",
  "timestamp": "2026-01-01T00:00:00Z",
  "action": {
    "type": "stripe.charges.create",
    "resource": "stripe://customers/cus_123/charges",
    "operation": "create",
    "parameters": { "amount": 1000, "currency": "usd" }
  },
  "principal": { "type": "agent", "id": "my-agent" },
  "context": { "sessionId": "sess_abc", "parentReceiptId": "uuid" },
  "constraints": { "maxAmount": 10000, "currency": "USD" }
}
```

**Receipt** — permanent, auditable, hash-chained record:
```json
{
  "id": "uuid",
  "envelopeId": "uuid",
  "parentReceiptId": "uuid",
  "decision": { "outcome": "allow", "policyId": "prod-v2", "policyVersion": "2.1.0" },
  "status": "executed",
  "receiptHash": "sha256:...",
  "prevReceiptHash": "sha256:..."
}
```

## Packages

### Core

| Package | Description | Deps |
|---------|-------------|------|
| `@authensor/schemas` | JSON Schema definitions — single source of truth | 0 |
| `@authensor/engine` | Pure policy evaluation (conditions, sessions, budgets, constraints) | 0 |
| `@authensor/aegis` | Content safety scanner (injection, jailbreak, PII, memory poisoning, multimodal) | 0 |
| `@authensor/sentinel` | Real-time monitoring (EWMA/CUSUM anomaly detection, chain tracking, alerts) | 0 |
| `@authensor/control-plane` | HTTP API: evaluate, receipts, approvals, policies, budgets, shadow eval | Hono, pg |
| `@authensor/mcp-server` | MCP tools with policy enforcement (Stripe, GitHub, HTTP) | — |
| `@authensor/sdk` | TypeScript SDK for agent builders | — |
| `authensor` | CLI: `authensor policy lint`, `authensor policy test`, `authensor policy diff` | — |
| `authensor` (Python) | Python SDK | — |

### Framework Adapters

| Package | Framework | Description |
|---------|-----------|-------------|
| `@authensor/langchain` | LangChain / LangGraph | Guardrail + interrupt integration |
| `@authensor/openai` | OpenAI Agents SDK | Pre-execution guardrail |
| `@authensor/vercel-ai-sdk` | Vercel AI SDK | Middleware integration |
| `@authensor/claude-agent-sdk` | Claude Agent SDK | Tool-use guardrail |
| `@authensor/crewai` | CrewAI | Task guardrail (coming soon) |

### Companion Tools

| Tool | Description |
|------|-------------|
| [SafeClaw](https://github.com/authensor/safeclaw) | Local agent gating with PreToolUse hooks, mobile PWA dashboard, swipe-to-approve |
| [SpiroGrapher](https://github.com/authensor/spirographer) | Web governance: HTML→IR compilation, 26 constitutional rules, dark pattern detection |

## Features

### Content Safety (Aegis)

Zero-dependency content scanner that runs *before* policy evaluation:
- **Prompt injection detection** — 15+ heuristic rules
- **Jailbreak detection** — pattern matching for common bypass techniques
- **PII detection** — emails, SSNs, credit cards, phone numbers
- **Memory poisoning detection** — 22 MINJA-informed rules for persistent memory attacks
- **Multimodal safety** — 6 heuristic categories for image/file content
- **Output scanning** — post-execution content validation

### Session Rules

Detect privilege escalation through multi-action patterns:
- **Forbidden sequences** — block `[auth.login, admin.escalate]` chains with glob matching
- **Risk scoring** — cumulative per-session risk with configurable weights
- **Max actions** — cap total actions per session
- **Lookback windows** — configurable history depth for sequence matching

### Budget Enforcement

Per-principal spending limits with period-based resets:
- Daily, weekly, monthly, or yearly periods
- Per-action cost caps
- Alert thresholds at configurable utilization levels
- Budget utilization exposed via OpenTelemetry metrics

### Real-Time Monitoring (Sentinel)

Zero-dependency anomaly detection engine:
- **Per-agent baselines** via EWMA (Exponentially Weighted Moving Average)
- **CUSUM change detection** for gradual behavioral drift
- **Configurable alerts** on deny rate, latency, cost, chain depth, and fan-out
- **Cross-agent chain tracking** — depth and fan-out metrics for delegation chains

### Shadow/Canary Policy Testing

Test new policies alongside active ones without enforcement:
- `?shadow=policy-id` query parameter or `AUTHENSOR_SHADOW_POLICY_ID` env var
- Divergence reports: agreement rate, rule breakdown, per-receipt comparison
- Zero-risk policy migration path

### Transparency & Compliance

- **Hash-chained receipts** — SHA-256 chain makes audit trail tamper-evident
- **Sigstore/Rekor integration** — optional publishing to public transparency log
- **Cross-agent tracing** — `parentReceiptId` links receipts across delegation chains
- **TOCTOU protection** — re-evaluates policy on claim to prevent stale-approval attacks
- **Principal binding** — bind API keys to specific agent identities
- **OpenTelemetry** — spans and metrics for every evaluation

## OWASP Agentic Top 10 Coverage

Authensor addresses all 10 risks in the [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/):

| OWASP Risk | Authensor Coverage |
|---|---|
| ASI01: Agent Goal Hijacking | Aegis pre-eval scanning + policy engine evaluates action intent, not input text |
| ASI02: Tool Misuse & Exploitation | Per-tool policies, parameter constraints, rate limits, budget caps |
| ASI03: Identity & Privilege Abuse | Principal binding, RBAC, ABAC conditions, session risk scoring |
| ASI04: Supply Chain Vulnerabilities | MCP tool governance, domain allowlisting, SSRF protection |
| ASI05: Unexpected Code Execution | Deny-by-default, explicit allowlisting, SafeClaw container mode |
| ASI06: Memory & Context Poisoning | Aegis memory poisoning detector (22 MINJA rules), hash-chained receipts |
| ASI07: Insecure Inter-Agent Communication | Cross-agent chain tracing (parentReceiptId), Sentinel chain depth alerts |
| ASI08: Cascading Failures | Kill switch, per-tool circuit breakers, rate limiting, Sentinel anomaly detection |
| ASI09: Human-Agent Trust Exploitation | Multi-party approval workflows, TOCTOU re-evaluation, shadow policy testing |
| ASI10: Rogue Agents | Fail-closed architecture, Sentinel behavioral baselines, forbidden action sequences |

See [full OWASP alignment document](docs/owasp-agentic-alignment.md) for detailed mapping.

## Compliance

Authensor's architecture maps directly to major regulatory requirements:

- **EU AI Act** (Aug 2026 deadline): Article 12 logging → receipt chain, Article 14 human oversight → approval workflows. See [compliance guide](docs/eu-ai-act-compliance.md).
- **SOC 2**: Immutable audit trail, RBAC, rate limiting, access logging
- **SOX**: Segregation of duties via approval workflows, receipt retention support
- **HIPAA**: Action-level audit logging, access controls, principal binding
- **NIST AI RMF**: Govern, Map, Measure, Manage pillars addressed via policies, receipts, and controls

## API Reference

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/evaluate` | Evaluate an action envelope | ingest, admin |
| POST | `/evaluate?shadow=id` | Evaluate with shadow policy | ingest, admin |
| GET | `/receipts` | List receipts | admin |
| GET | `/receipts/:id` | Get a receipt | admin |
| GET | `/receipts/:id/view` | Human-readable receipt viewer | admin |
| GET | `/receipts/:id/chain` | Get cross-agent receipt chain | admin |
| GET | `/receipts/:id/transparency` | Get Sigstore transparency proof | admin |
| POST | `/receipts/:id/claim` | Claim a receipt for execution | executor, admin |
| POST | `/receipts/:id/finalize` | Finalize execution | executor, admin |
| GET | `/policies` | List policies | admin |
| POST | `/policies` | Create a policy | admin |
| POST | `/policies/:id/activate` | Activate a policy version | admin |
| POST | `/approvals/:id/approve` | Approve a pending action | admin |
| POST | `/approvals/:id/reject` | Reject a pending action | admin |
| GET | `/budgets` | List budgets with utilization | admin |
| POST | `/budgets` | Create/update a budget | admin |
| GET | `/shadow/report` | Shadow evaluation divergence report | admin |
| GET | `/controls` | Get kill switch / tool controls | executor, admin |
| POST | `/controls` | Update controls | admin |
| POST | `/keys` | Create API key | admin |
| GET | `/keys` | List API keys | admin |
| POST | `/keys/:id/principal` | Bind principal to key | admin |
| GET | `/metrics/summary` | Usage metrics | admin |
| GET | `/health` | Health check | public |

## CLI

```bash
# Lint a policy for common issues
authensor policy lint policy.json

# Test a policy against scenarios
authensor policy test policy.json scenarios.json

# Diff two policy versions
authensor policy diff v1.json v2.json
```

## Development

```bash
# Prerequisites: Node.js 20+, Docker, pnpm
corepack enable
pnpm install

# Start the stack
docker compose up -d    # Postgres + control plane
pnpm dev                # Dev servers with hot reload

# Test (924 tests across 10 packages)
pnpm test

# Build all packages
pnpm build

# Verify generated types match schemas
pnpm gen:check
```

## Self-Hosting vs. Hosted

Everything is open source. Self-host it all, or use the managed version:

| | Self-Hosted (Free) | Hosted |
|---|---|---|
| Policy engine | Yes | Yes |
| Control plane | Yes | Yes, managed |
| Aegis content safety | Yes | Yes |
| Sentinel monitoring | Yes | Yes, with dashboards |
| Receipts & audit trail | Yes | Yes, with retention SLA |
| Approval workflows | Yes | Yes, with SMS/email gateway |
| SpiroGrapher | Yes | Yes, with federated threat intel |
| OpenTelemetry export | Yes | Yes, pre-configured |
| Support | Community | Dedicated |
| Compliance reports | DIY | Automated |
| SLA | None | 99.9% uptime |

## Deployment

### Docker Compose (simplest)

```bash
docker compose up -d
```

### Helm (Kubernetes)

```bash
helm install authensor deploy/helm/authensor \
  --set postgresql.auth.password=your-password \
  --set controlPlane.env.AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=your-token
```

### Terraform

Modules available for AWS (ECS + RDS), GCP (Cloud Run + Cloud SQL), and Railway:

```bash
cd deploy/terraform/aws
terraform init && terraform apply
```

### One-line install (CLI only)

```bash
curl -fsSL https://raw.githubusercontent.com/authensor/authensor/main/install.sh | sh
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Authensor is built on the belief that **safety tooling should not have a paywall**. We open-source every line of safety code because the more people who use these tools, the safer agents get for everyone.

## License

MIT — use it however you want.
