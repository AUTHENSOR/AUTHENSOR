<p align="center">
  <strong>Authensor</strong><br>
  Free AI safety stack. Frontier adversarial red teaming.
</p>

<p align="center">
  <em>350+ verified vulnerabilities across 168 AI/ML repositories. 126 responsible disclosures. Two novel vulnerability classes discovered.</em>
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
  <a href="#two-sides-of-the-same-problem">Why Both</a> &middot;
  <a href="#try-it-in-30-seconds">Try It</a> &middot;
  <a href="#adversarial-red-teaming">Red Teaming</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#packages">Packages</a> &middot;
  <a href="#owasp-agentic-top-10-coverage">OWASP</a> &middot;
  <a href="docs/eu-ai-act-compliance.md">EU AI Act</a>
</p>

---

## Two Sides of the Same Problem

Most AI safety tooling either defends or attacks. Authensor does both.

**Free safety stack.** Open-source, MIT-licensed, self-hostable. Policy engine, content scanner, behavioral monitor, cryptographic audit trail, approval workflows. Deploy it, protect your agents, pay nothing.

**Frontier adversarial red teaming.** Automated, mass-scale safety testing. Thousands of multi-step attack chains against your agents, MCP servers, and safety infrastructure. We break it before someone else does.

We give away the defense because safety tooling shouldn't have a paywall. We sell the offense because finding out your system breaks *after* deployment costs more.

### Track Record

- **168+ repos audited** across NVIDIA, Microsoft, Meta, Google, HuggingFace, OpenAI, and 50+ organizations
- **350+ verified vulnerabilities**, 126 responsible disclosure reports prepared, coordinated disclosure in progress
- **2 novel vulnerability classes** -- SafeTensors Bypass (pickle inside "safe" model files) and AST Sandbox Escape via allowed library semantics
- **Critical findings** in PyTorch core, DeepSpeed, BentoML, TorchServe, Ray, Ollama, vLLM, LangChain, Gradio, NVIDIA Triton, and dozens more
- Security fix merged into UK AISI's ControlArena ([PR #798](https://github.com/UKGovernmentBEIS/control-arena/pull/798))
- Found that NVIDIA's NeMo Guardrails loads its jailbreak classifier via pickle.load()
- Found SQL injection in Microsoft's AI red teaming tool (PyRIT)

The systems built to secure AI have bugs. We find them.

---

## Try It in 30 Seconds

```bash
npx @authensor/create-authensor my-agent
cd my-agent && npm install && npm run demo
```

The demo runs an agent that attempts destructive file operations, unauthorized API calls, and data exfiltration. Authensor catches each one through policy enforcement, content scanning, and approval workflows.

### One-Click Deploy

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/template/authensor)
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy)

---

## The Free Safety Stack

Everything below is open-source, self-hostable, MIT-licensed. No usage-based pricing. No enterprise sales calls. No feature gates.

| Layer | What It Does | Elsewhere |
|---|---|---|
| **Policy Engine** | Action-level authorization, conditions, rate limits, budgets | $0.000025/req (AWS) or enterprise contract |
| **Aegis Content Scanner** | Prompt injection, jailbreak, PII, memory poisoning detection (zero-dep) | $10K+/yr (Lakera, etc.) |
| **Sentinel Monitor** | Per-agent behavioral baselines, EWMA/CUSUM anomaly detection | $15K+/yr |
| **Approval Workflows** | Human-in-the-loop for high-consequence actions | Custom build ($50K+) |
| **Cryptographic Audit Trail** | Hash-chained receipts, Sigstore transparency log integration | Custom build |
| **MCP Tool Governance** | Policy enforcement for MCP server tool calls | Doesn't exist elsewhere |
| **8 Framework Adapters** | LangChain, OpenAI, CrewAI, Vercel AI, Claude, vanilla TS/Python | Vendor-locked |

We open-source all of this because safety tooling shouldn't have a paywall. The more people who deploy proper agent governance, the safer the ecosystem gets for everyone.

---

## Architecture

```
+---------------------------------------------------------------------+
|                           Your Agent                                |
|  (Claude, GPT, LangChain, CrewAI, Vercel AI, custom, etc.)         |
+----------------------------------+----------------------------------+
                                   | SDK / MCP / Hook
                                   v
+---------------------------------------------------------------------+
|                          Authensor Stack                             |
|                                                                     |
|  +------------+  +------------+  +------------+  +--------------+   |
|  |   Aegis    |->|   Engine   |->|  Control   |->|   Sentinel   |   |
|  |  (content  |  |   (pure    |  |   Plane    |  |  (real-time  |   |
|  |   safety)  |  |   logic)   |  |  (HTTP API)|  |  monitoring) |   |
|  +------------+  +------------+  +-----+------+  +--------------+   |
|                                        |                            |
|  +------------+  +------------+  +-----v------+  +--------------+   |
|  |  SafeClaw  |  |SpiroGrapher|  |  Receipts  |  |   Adapters   |   |
|  |(local gate)|  |(web govern)|  |(hash chain)|  | (8 adapters) |   |
|  +------------+  +------------+  +------------+  +--------------+   |
+---------------------------------------------------------------------+
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
| `@authensor/schemas` | JSON Schema definitions -- single source of truth | 0 |
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
| [Chainbreaker](https://github.com/chainbreaker-ai/chainbreaker) | Adversarial red-teaming for AI agents -- multi-step attack chains, MITRE ATLAS mapped, 15-dimension CBS scoring |

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

## Why Authensor

1. **Defense and offense, same team.** The safety stack is free. The adversarial testing that proves it holds (or shows where it doesn't) is the service.

2. **Action-level governance.** Not prompt filtering. Authensor evaluates what the agent *does*: every tool call, API request, and side effect goes through policy before execution.

3. **Research-validated.** 350+ verified vulnerabilities across 168+ repos. Two novel vulnerability classes. We broke PyTorch, DeepSpeed, BentoML, TorchServe, and the tools built to secure AI (NeMo Guardrails, PyRIT, Garak). When we test yours, we test at that depth.

4. **Seven layers.** Aegis content scanning, session rules, policy engine, approval workflows, Sentinel behavioral monitoring, hash-chained receipts, TOCTOU protection.

5. **Fail-closed.** No policy loaded? Denied. Control plane unreachable? Denied. Unknown action type? Denied.

6. **Cross-provider.** Claude, GPT, LangChain, CrewAI, Vercel AI, Claude Code, or any framework. One safety layer, all your agents.

7. **Free stack, paid testing.** Self-host everything at no cost. No usage-based pricing, no feature gates on safety. Revenue comes from adversarial testing services, not from gating the defense.

## Features

### Content Safety (Aegis)

Zero-dependency content scanner that runs *before* policy evaluation:
- **Prompt injection detection** -- 15+ heuristic rules
- **Jailbreak detection** -- pattern matching for common bypass techniques
- **PII detection** -- emails, SSNs, credit cards, phone numbers
- **Memory poisoning detection** -- 22 MINJA-informed rules for persistent memory attacks
- **Multimodal safety** -- 6 heuristic categories for image/file content
- **Output scanning** -- post-execution content validation

### Session Rules

Detect privilege escalation through multi-action patterns:
- **Forbidden sequences** -- block `[auth.login, admin.escalate]` chains with glob matching
- **Risk scoring** -- cumulative per-session risk with configurable weights
- **Max actions** -- cap total actions per session
- **Lookback windows** -- configurable history depth for sequence matching

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
- **Cross-agent chain tracking** -- depth and fan-out metrics for delegation chains

### Shadow/Canary Policy Testing

Test new policies alongside active ones without enforcement:
- `?shadow=policy-id` query parameter or `AUTHENSOR_SHADOW_POLICY_ID` env var
- Divergence reports: agreement rate, rule breakdown, per-receipt comparison
- Zero-risk policy migration path

### Transparency & Compliance

- **Hash-chained receipts** -- SHA-256 chain makes audit trail tamper-evident
- **Sigstore/Rekor integration** -- optional publishing to public transparency log
- **Cross-agent tracing** -- `parentReceiptId` links receipts across delegation chains
- **TOCTOU protection** -- re-evaluates policy on claim to prevent stale-approval attacks
- **Principal binding** -- bind API keys to specific agent identities
- **OpenTelemetry** -- spans and metrics for every evaluation

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

## Adversarial Red Teaming

Defense without testing is hope.

Proprietary automated pipeline. Same methodology that produced 350+ verified vulnerabilities across 168+ repos at NVIDIA, Microsoft, Meta, Google, HuggingFace, OpenAI, and 50+ other organizations. Two novel vulnerability classes discovered.

```
Your AI system
      │
      ▼
Authensor Red Team Pipeline
      │
      ├── Static + dynamic analysis (custom rules, not off-the-shelf)
      ├── ML-specific vulnerability detection
      ├── Multi-signal correlation and attack chain discovery
      └── Automated triage + false positive elimination
      │
      ▼
CVE-quality output
      │
      ├── Verified findings with reproduction steps
      ├── CVSS scoring with exploitability assessment
      ├── Remediation recommendations
      └── PR patches where applicable
```

### What Gets Tested

| Target | What We Find |
|--------|-------------|
| **ML infrastructure** | Deserialization, injection, auth bypass, model format exploits |
| **AI agents** | Policy bypasses, tool misuse, exfiltration, privilege escalation |
| **Safety & evaluation tools** | Guardrail bypass, sandbox escape, monitor evasion, evaluation framework vulnerabilities |
| **Native code** | Memory corruption in inference engines |
| **Supply chain** | Dependency confusion, malicious model files, compromised pipelines |

### How It Works

[Chainbreaker](https://github.com/chainbreaker-ai/chainbreaker) is the engine. It generates and executes multi-step attack chains using:

- **MITRE ATLAS mapping** -- every attack chain maps to documented tactics and techniques
- **15-dimension Chainbreaker Behavioral Score (CBS)** -- quantitative safety rating, not vibes
- **Automated at scale** -- thousands of attack variations, not a handful of manual tests
- **Rust core** -- fast, auditable, zero runtime dependencies

Findings feed back into Authensor's defense layer: new Aegis detection rules, policy templates, Sentinel behavioral signatures. The loop closes.

### For Auditors and Certification Bodies

If you're conducting AI safety assessments (AIUC-1, EU AI Act conformity, NIST AI RMF): the evaluation frameworks underlying those assessments have confirmed vulnerabilities we documented. We validate assessment infrastructure itself. Testing whether your testing works.

[Contact: security@authensor.com](mailto:security@authensor.com)

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

MIT -- use it however you want.
