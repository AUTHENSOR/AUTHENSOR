<p align="center">
  <strong>Authensor</strong><br>
  The open-source safety stack for AI agents
</p>

<p align="center">
  <em>Every agent action evaluated. Every decision auditable. Every tool governed.</em>
</p>

<p align="center">
  <a href="#quickstart">Quickstart</a> &middot;
  <a href="#why-authensor">Why Authensor</a> &middot;
  <a href="#architecture">Architecture</a> &middot;
  <a href="#the-ecosystem">Ecosystem</a> &middot;
  <a href="docs/owasp-agentic-alignment.md">OWASP Alignment</a> &middot;
  <a href="docs/eu-ai-act-compliance.md">EU AI Act</a>
</p>

---

## The Problem

AI agents are shipping to production without guardrails. They call APIs, browse the web, execute code, and manage infrastructure — often with no policy enforcement, no approval workflows, and no audit trail.

- **32% of MCP servers** have at least one critical vulnerability ([Enkrypt AI](https://www.enkryptai.com/blog/we-scanned-1-000-mcp-servers-33-had-critical-vulnerabilities))
- **Agents fall for dark patterns 41% of the time** ([arxiv 2510.18113](https://arxiv.org/abs/2510.18113))
- **88% of organizations** have confirmed or suspected AI security incidents
- **Only 6%** have advanced AI security strategies in place

Existing guardrails focus on what models *say* (prompt/response filtering). Authensor focuses on what agents *do* (action authorization, approval workflows, and cryptographic audit trails).

## The Solution

Authensor is three open-source tools that together cover the full surface area of agent risk:

| Tool | What it guards | How |
|------|---------------|-----|
| **Authensor** | Agent actions (API calls, tool use, data access) | Policy-first evaluation engine + control plane with receipts |
| **[SpiroGrapher](https://github.com/AUTHENSOR/SpiroGrapher)** | Agent web browsing | Compiles HTML to structured IR, detects dark patterns, constitutional rules |
| **[SafeClaw](SafeClaw/)** | Local agent execution | PreToolUse hook gating, deny-by-default, mobile approval workflows |

## Quickstart

### 30 seconds: Run a safe local agent

```bash
npx safeclaw init --demo
npx safeclaw run "list my project files"
# Opens dashboard at localhost:7700 with policy enforcement + audit trail
```

### 5 minutes: Self-hosted control plane

```bash
git clone https://github.com/AUTHENSOR/authensor.git
cd authensor
docker compose up -d
# Control plane running at http://localhost:3000
# Admin token printed to stdout
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

## Why Authensor

### vs. the landscape

| Capability | Authensor | AWS AgentCore + Cedar | Galileo Agent Control | NeMo Guardrails | Guardrails AI |
|---|---|---|---|---|---|
| Action authorization (pre-execution) | Yes | Yes | Yes | No (prompt/response) | No (output validation) |
| Approval workflows (human-in-the-loop) | Yes (SMS, Slack, email, mobile PWA) | No | No | No | No |
| Cryptographic audit trail (receipts) | Yes (hash-chained) | No | No | No | No |
| Deny-by-default / fail-closed | Yes | Yes | No | No | No |
| Cloud-agnostic | Yes | No (AWS only) | Yes | Yes | Yes |
| Open source | Yes (MIT) | No (Cedar is, AgentCore isn't) | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes (Apache 2.0) |
| MCP tool governance | Yes | No | No | No | No |
| Web browsing governance | Yes (SpiroGrapher) | No | No | No | No |
| Multi-party approval | Yes | No | No | No | No |
| Mobile approval UI | Yes (PWA) | No | No | No | No |

### Key differentiators

1. **Action-level, not prompt-level.** Most guardrails filter what the model says. Authensor governs what the agent does — every tool call, API request, and side effect goes through policy evaluation before execution.

2. **Three layers of safety.** Authensor (action policies) + SpiroGrapher (web governance) + SafeClaw (local execution gating) cover the full agent attack surface. No other project offers this breadth.

3. **Receipts, not just logs.** Every action produces a structured, policy-versioned receipt recording what was requested, what policy decided, why, and what happened. Hash-chained for tamper evidence. This directly satisfies EU AI Act Article 12 (record-keeping) and SOX audit requirements.

4. **Fail-closed by default.** No policy loaded? All actions denied. Control plane unreachable? All actions denied. Unknown action type? Denied. This matches OWASP and NIST recommendations.

5. **Cross-provider.** Works with Claude, GPT, LangChain, CrewAI, AutoGen, or any agent framework. One safety layer for all your agents.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Agent                              │
│  (Claude, GPT, LangChain, AutoGen, CrewAI, custom, etc.)       │
└────────────────────────────┬────────────────────────────────────┘
                             │ SDK / MCP / Hook
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Authensor Stack                            │
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │   Schemas    │→ │    Engine    │→ │   Control Plane     │   │
│  │ (JSON Schema)│  │ (pure logic) │  │   (HTTP API)        │   │
│  └──────────────┘  └──────────────┘  └─────────┬───────────┘   │
│                                                 │               │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────▼───────────┐   │
│  │  SafeClaw    │  │ SpiroGrapher │  │     Receipts        │   │
│  │ (local gate) │  │ (web govern) │  │ (hash-chained DB)   │   │
│  └──────────────┘  └──────────────┘  └─────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### How it works

1. **Agent wants to act** → SDK wraps the action in an **Action Envelope** (who, what, where, constraints)
2. **Engine evaluates** → Pure policy logic matches rules, checks conditions, evaluates rate limits
3. **Decision returned** → `allow`, `deny`, `require_approval`, or `rate_limited`
4. **Receipt created** → Permanent, structured record of the decision with full provenance
5. **Action executes** (or doesn't) → Receipt updated with execution result or cancellation

### Core concepts

**Action Envelope** — describes what an agent wants to do:
```json
{
  "id": "uuid",
  "timestamp": "2024-01-01T00:00:00Z",
  "action": {
    "type": "stripe.charges.create",
    "resource": "stripe://customers/cus_123/charges",
    "operation": "create",
    "parameters": { "amount": 1000, "currency": "usd" }
  },
  "principal": { "type": "agent", "id": "my-agent" },
  "constraints": { "maxAmount": 10000, "currency": "USD" }
}
```

**Decision** — policy evaluation result:
```json
{
  "outcome": "allow",
  "policyId": "prod-policy-v2",
  "policyVersion": "2.1.0",
  "reason": "Matched rule: allow-stripe-under-10k"
}
```

**Receipt** — permanent, auditable record:
```json
{
  "id": "uuid",
  "envelopeId": "uuid",
  "decision": { "outcome": "allow", "policyId": "prod-policy-v2" },
  "status": "executed",
  "execution": { "durationMs": 150, "result": { "chargeId": "ch_..." } }
}
```

## The Ecosystem

### Authensor Core Packages

| Package | Description |
|---------|-------------|
| `@authensor/schemas` | JSON Schema definitions — single source of truth |
| `@authensor/engine` | Pure policy evaluation logic (zero side effects) |
| `@authensor/control-plane` | HTTP API for evaluate, receipts, approvals, policies |
| `@authensor/mcp-server` | MCP tools with policy enforcement (Stripe, GitHub, HTTP) |
| `@authensor/sdk` | TypeScript SDK for agent builders |
| `authensor` (Python) | Python SDK for agent builders |

### SafeClaw

Local-first agent safety with 446 tests, zero npm dependencies:
- PreToolUse hook intercepts every tool call
- Deny-by-default policy engine
- Mobile-responsive PWA dashboard with swipe-to-approve
- SMS/Slack/Discord/webhook approval notifications
- Append-only audit ledger with SHA-256 hash chain
- Budget controls (daily/weekly/monthly spend caps)
- Container mode for sandboxed execution

### SpiroGrapher

Web governance for browsing agents with 1,000+ tests across 13 packages:
- **Compile**: HTML → structured Web IR (typed entities, actions, regions)
- **Govern**: 26 constitutional rules across 6+ categories
- **Receipt**: Cryptographic proof (W3C Verifiable Credentials, Merkle trees)
- Dark pattern detection (8 categories with FTC/EU DSA regulatory citations)
- Federated threat intelligence observatory
- Recipe marketplace with Ed25519-signed packages

## OWASP Agentic Top 10 Coverage

Authensor addresses all 10 risks in the [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/):

| OWASP Risk | Authensor Coverage |
|---|---|
| ASI01: Agent Goal Hijacking | Policy engine evaluates action intent, not just input text |
| ASI02: Tool Misuse & Exploitation | Per-tool policies with parameter constraints and rate limits |
| ASI03: Identity & Privilege Abuse | Principal-scoped policies, RBAC, ABAC via conditions |
| ASI04: Supply Chain Vulnerabilities | MCP server governance, tool schema pinning |
| ASI05: Unexpected Code Execution | Deny-by-default, explicit allowlisting required |
| ASI06: Memory & Context Poisoning | Receipt chain provides tamper-evident audit trail |
| ASI07: Insecure Inter-Agent Communication | Parent envelope chaining, cross-agent policy scoping |
| ASI08: Cascading Failures | Kill switch, per-tool circuit breakers, rate limiting |
| ASI09: Human-Agent Trust Exploitation | Approval workflows with multi-party sign-off |
| ASI10: Rogue Agents | Fail-closed architecture, behavioral anomaly via receipt analysis |

See [full OWASP alignment document](docs/owasp-agentic-alignment.md) for details.

## Compliance

Authensor's architecture maps directly to major regulatory requirements:

- **EU AI Act** (Aug 2026 deadline): Article 12 logging → receipt chain, Article 14 human oversight → approval workflows. See [compliance guide](docs/eu-ai-act-compliance.md).
- **SOC 2**: Immutable audit trail, RBAC, rate limiting, access logging
- **SOX**: Segregation of duties via approval workflows, 7-year receipt retention support
- **HIPAA**: Action-level audit logging, access controls
- **NIST AI RMF**: Govern, Map, Measure, Manage pillars addressed via policies, receipts, and controls

## API Reference

| Method | Endpoint | Description | Role |
|--------|----------|-------------|------|
| POST | `/evaluate` | Evaluate an action envelope | ingest, admin |
| GET | `/receipts` | List receipts | ingest, executor, admin |
| GET | `/receipts/:id` | Get a receipt | ingest, executor, admin |
| PATCH | `/receipts/:id` | Update receipt status | executor, admin |
| POST | `/receipts/:id/claim` | Claim a receipt for execution | executor, admin |
| POST | `/receipts/:id/finalize` | Finalize execution | executor, admin |
| GET | `/policies` | List policies | admin |
| POST | `/policies` | Create a policy | admin |
| POST | `/approvals/:id/approve` | Approve a pending action | admin |
| POST | `/approvals/:id/reject` | Reject a pending action | admin |
| GET | `/controls` | Get kill switch / tool controls | admin |
| POST | `/controls` | Update controls | admin |
| POST | `/keys` | Create API key | admin |
| GET | `/keys` | List API keys | admin |
| GET | `/metrics/summary` | Usage metrics | admin |
| GET | `/health` | Health check | public |

## Development

```bash
# Prerequisites: Node.js 20+, Docker, pnpm (corepack enable)

corepack enable
pnpm install
pnpm gen:check          # Verify generated types are current

# Start everything
docker compose up -d    # Postgres + control plane
pnpm dev                # Dev servers with hot reload

# Test
pnpm test               # All 146+ tests

# Build
pnpm build              # Production build
```

## Self-Hosting vs. Hosted

Everything is open source. Self-host it all, or use the hosted version:

| | Self-Hosted (Free) | Hosted (Paid) |
|---|---|---|
| Policy engine | Yes | Yes |
| Control plane | Yes | Yes, managed |
| Receipts & audit trail | Yes | Yes, with retention SLA |
| Approval workflows | Yes | Yes, with SMS/email gateway |
| SpiroGrapher | Yes | Yes, with federated threat intel |
| Support | Community | Dedicated |
| Compliance reports | DIY | Automated |
| SLA | None | 99.9% uptime |

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Authensor is built on the belief that **safety tooling should not have a paywall**. We open-source every line of safety code because the more people who use these tools, the safer agents get for everyone.

## License

MIT — use it however you want.
