<p align="center">
  <strong>Authensor</strong><br>
  The open-source safety stack for AI agents. Enterprise-grade protection, completely free.
</p>

<p align="center">
  <em>Every agent action evaluated. Every decision auditable. Every tool governed.</em>
</p>

<p align="center">
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT">
  </a>
  <a href="https://github.com/authensor/authensor/actions">
    <img src="https://img.shields.io/badge/tests-1%2C148%2B%20passing-brightgreen.svg" alt="Tests: 1,148+ passing">
  </a>
  <a href="https://www.npmjs.com/org/authensor">
    <img src="https://img.shields.io/badge/npm-%40authensor-red.svg" alt="npm: @authensor">
  </a>
  <a href="docs/owasp-agentic-alignment.md">
    <img src="https://img.shields.io/badge/OWASP-10%2F10%20coverage-green.svg" alt="OWASP: 10/10 coverage">
  </a>
</p>

<p align="center">
  <a href="#try-it-in-30-seconds">Try It</a> &middot;
  <a href="#authensor-vs-the-alternatives">Compare</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#packages">Packages</a> &middot;
  <a href="#framework-adapters">Adapters</a> &middot;
  <a href="#owasp-agentic-top-10-coverage">OWASP</a> &middot;
  <a href="docs/eu-ai-act-compliance.md">EU AI Act</a>
</p>

---

## Try It in 30 Seconds

```bash
npx @authensor/create-authensor my-agent
cd my-agent && npm install && npm run demo
```

See what happens when an AI agent runs without safety guardrails — then see Authensor stop the dangerous actions. The demo simulates an agent attempting destructive file operations, unauthorized API calls, and data exfiltration, and shows each one being caught by Authensor's policy engine, content scanner, and approval workflows.

### One-Click Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/authensor)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## Authensor vs the Alternatives

Every feature below is free and self-hostable with Authensor. No usage-based pricing. No enterprise sales calls.

| Feature | Authensor (Free) | Enterprise Tools | What you'd pay elsewhere |
|---|---|---|---|
| **Policy Engine** | ✅ | ✅ | $0.000025/req (AWS) or enterprise contract |
| **Approval Workflows** | ✅ | ❌ most lack this | Custom build ($50K+) |
| **Cryptographic Audit Trail** | ✅ Hash-chained receipts | ❌ | Custom build |
| **Content Safety Scanner** | ✅ Aegis (zero-dep) | Partial | $10K+/yr (Lakera, etc.) |
| **MCP Tool Governance** | ✅ | ❌ most lack this | Doesn't exist elsewhere |
| **Real-Time Anomaly Detection** | ✅ Sentinel | ❌ | $15K+/yr |
| **Framework Agnostic** | ✅ 8 adapters | Vendor-locked | N/A |
| **Self-Hosted** | ✅ Docker Compose | Sometimes | N/A |
| **Fail-Closed Default** | ✅ No policy = deny | ❌ most fail-open | N/A |
| **Budget Enforcement** | ✅ | ❌ | Custom build |
| **Session Threat Detection** | ✅ | ❌ | Custom build |

**Enterprise-grade agent safety shouldn't require an enterprise contract.** Authensor gives you everything above — policy engine, approval workflows, tamper-evident audit trails, content scanning, MCP governance, anomaly detection — for free. Self-host it, or use the hosted tier for $5/mo.

---

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
│  │(local gate)│  │(web govern) │  │(hash chain)│  │(8 adapters)  │   │
│  └────────────┘  └────────────┘  └────────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### How It Works

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

### Five Layers

| Layer | Package | What It Does | Dependencies |
|-------|---------|-------------|--------------|
| **Policy Engine** | `@authensor/engine` | Session rules, budget evaluation, constraint enforcement. Pure, synchronous, deterministic. | 0 |
| **Aegis Content Scanner** | `@authensor/aegis` | 15+ prompt injection rules, 22 MINJA memory poisoning rules, PII/credential scanning, exfiltration detection, multimodal safety. | 0 |
| **Sentinel Behavioral Monitor** | `@authensor/sentinel` | EWMA/CUSUM baselines, deny-rate/latency/volume anomaly detection, chain depth and fan-out alerts. | 0 |
| **Control Plane** | `@authensor/control-plane` | Hono + PostgreSQL HTTP API. Shadow/canary eval, TOCTOU protection, principal binding, Sigstore/Rekor integration. | Hono, pg |
| **MCP Gateway** | `@authensor/mcp-server` | SEP authorization protocol (`authorization/propose`, `authorization/decide`, `authorization/receipt`). | -- |

## Packages

### Core

| Package | Description | Deps |
|---------|-------------|------|
| `@authensor/schemas` | JSON Schema definitions — single source of truth | 0 |
| `@authensor/engine` | Pure policy evaluation (conditions, sessions, budgets, constraints) | 0 |
| `@authensor/aegis` | Content safety scanner (injection, jailbreak, PII, memory poisoning, multimodal) | 0 |
| `@authensor/sentinel` | Real-time monitoring (EWMA/CUSUM anomaly detection, chain tracking, alerts) | 0 |
| `@authensor/control-plane` | HTTP API: evaluate, receipts, approvals, policies, budgets, shadow eval | Hono, pg |
| `@authensor/mcp-server` | MCP tools with policy enforcement (Stripe, GitHub, HTTP) | -- |
| `@authensor/sdk` | TypeScript SDK for agent builders | -- |
| `authensor` | CLI: `authensor policy lint`, `authensor policy test`, `authensor policy diff` | -- |
| `authensor` (Python) | Python SDK | -- |
| `create-authensor` | Project scaffolder: `npx create-authensor` | -- |
| `@authensor/redteam` | Adversarial red-team test seeds (15 attack patterns, 5 categories, MITRE ATLAS mapped) | 0 |

### Framework Adapters

| Package | Framework | Description |
|---------|-----------|-------------|
| `@authensor/langchain` | LangChain / LangGraph | Guardrail + interrupt integration |
| `@authensor/openai` | OpenAI Agents SDK | Pre-execution guardrail |
| `@authensor/vercel-ai-sdk` | Vercel AI SDK | Middleware integration |
| `@authensor/claude-agent-sdk` | Claude Agent SDK | Tool-use guardrail |
| `@authensor/crewai` | CrewAI | Task guardrail |
| -- | Claude Code | Hooks-based PreToolUse / PostToolUse integration |
| `@authensor/sdk` | TypeScript SDK | Direct integration for any TS agent |
| `authensor` (Python) | Python SDK | Direct integration for any Python agent |

### Companion Tools

| Tool | Description |
|------|-------------|
| [SafeClaw](https://github.com/authensor/safeclaw) | Local agent gating with PreToolUse hooks, mobile PWA dashboard, swipe-to-approve |
| [SpiroGrapher](https://github.com/authensor/spirographer) | Web governance: HTML to IR compilation, 26 constitutional rules, dark pattern detection |
| [SiteSitter](https://github.com/AUTHENSOR/SiteSitter) | Website safety monitoring and governance |
| [Chainbreaker](https://github.com/chainbreaker-ai/chainbreaker) | Adversarial red-teaming for AI agents — multi-step attack chains, MITRE ATLAS mapped, 15-dimension CBS scoring |

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

// CrewAI
import { AuthensorGuardrail } from '@authensor/crewai';

// Vercel AI SDK
import { AuthensorGuardrail } from '@authensor/vercel-ai-sdk';

// Claude Agent SDK
import { AuthensorGuardrail } from '@authensor/claude-agent-sdk';

// Claude Code (hooks-based integration)
// See docs/claude-code-hooks.md
```

## Key Differentiators

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

5. **Cross-provider.** Works with Claude, GPT, LangChain, CrewAI, Vercel AI, Claude Code, or any agent framework. Eight adapters, one safety layer for all your agents.

6. **Completely free.** Self-host the entire stack at no cost. No usage-based pricing, no feature gates, no enterprise tier required for core safety features. Optional hosted tier at $5/month for teams that want managed infrastructure.

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
| ASI02: Tool Misuse | Per-tool policies, parameter constraints, rate limits, budget caps |
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

- **EU AI Act** (August 2, 2026 deadline): Article 12 logging via receipt chain, Article 14 human oversight via approval workflows. See [compliance guide](docs/eu-ai-act-compliance.md).
- **SOC 2**: Immutable audit trail, RBAC, rate limiting, access logging
- **SOX**: Segregation of duties via approval workflows, receipt retention support
- **HIPAA**: Action-level audit logging, access controls, principal binding
- **NIST AI RMF**: Govern, Map, Measure, Manage pillars addressed via policies, receipts, and controls

## Red-Team Your Safety

Authensor is the defense layer. [Chainbreaker](https://github.com/chainbreaker-ai/chainbreaker) is the offense layer. Together they close the loop.

```
Build agent → Protect with Authensor → Test with Chainbreaker → Improve → Ship
                      ▲                           │
                      └───── findings → Aegis ────┘
```

**Defense without testing is hope, not safety.** Authensor governs every action at runtime — but you need to know whether an adversary can bypass it. Chainbreaker is purpose-built for that.

### Chainbreaker — Burp Suite for AI Agents

[Chainbreaker](https://github.com/chainbreaker-ai/chainbreaker) is an adversarial red-team toolkit from [15 Research Lab](https://15researchlab.com). It stress-tests AI agents, MCP servers, and agent safety stacks — including Authensor — using systematic, multi-step attack chains.

**What it does:**

- **Multi-step attack chains** mapped to [MITRE ATLAS](https://atlas.mitre.org/) — not one-shot prompts, but realistic adversarial sequences
- **MCP server security scanner** — enumerates tools, probes for injection vectors, tests authorization boundaries
- **15-dimension Chainbreaker Behavioral Score (CBS)** — quantitative safety rating derived from Petri-net behavioral modeling
- **MITRE ATLAS coverage** — each test maps to a tactic and technique for compliance reporting
- **Rust core, MIT licensed** — fast, auditable, zero runtime dependencies
- **Desktop app + CLI** — team-friendly UI and CI/CD automation

---

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

## Self-Hosting vs. Hosted

Everything is open source. Self-host it all, or use the managed version:

| | Self-Hosted (Free) | Hosted ($5/mo) |
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

# Test (1,148+ tests across 16 packages)
pnpm test

# Build all packages
pnpm build

# Verify generated types match schemas
pnpm gen:check
```

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Authensor is built on the belief that **safety tooling should not have a paywall**. We open-source every line of safety code because the more people who use these tools, the safer agents get for everyone.

## License

MIT — use it however you want.
