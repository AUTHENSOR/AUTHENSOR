# Authensor

**Policy-first guardrails for AI agents.**

Authensor is a framework for adding authorization, audit logging, and guardrails to AI agent actions. Every action goes through policy evaluation, creating a complete audit trail of what your agents do.

## Quick Start

```bash
# Install dependencies
pnpm install

# Start infrastructure (Postgres)
docker compose up -d postgres

# Start development servers
pnpm dev

# The control plane is now running at http://localhost:3000

- Full alpha onboarding: docs/alpha_onboarding.md
```

When you edit any JSON Schema in `packages/schemas/src/*.schema.json`, regenerate all SDK/engine models:

```bash
pnpm gen           # regenerates TS + Python types from schemas
pnpm gen:check     # CI-friendly check that fails if generated code is stale
```

## 5-minute quickstart

**Prerequisites:**
- Node.js 20+
- Docker Desktop running (required for Postgres)
- pnpm via corepack (`corepack enable`)

```bash
corepack enable
pnpm install
pnpm gen:check
docker compose up -d postgres
pnpm dev   # starts control-plane + engine
pnpm --filter @authensor/example-node-quickstart start
```

Expected output includes a receipt link like `http://localhost:3000/receipts/<id>/view`. Open it to see the receipt details.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Your Agent                               │
│  (Claude, GPT, LangChain, AutoGen, CrewAI, custom, etc.)        │
└────────────────────────────┬────────────────────────────────────┘
                             │ SDK / MCP
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Authensor                                   │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐     │
│  │   Schemas   │→ │    Engine    │→ │   Control Plane     │     │
│  │ (JSON docs) │  │ (pure logic) │  │   (HTTP API)        │     │
│  └─────────────┘  └──────────────┘  └─────────────────────┘     │
│                                              │                   │
│                                              ▼                   │
│                                      ┌─────────────┐            │
│                                      │  Receipts   │            │
│                                      │ (Postgres)  │            │
│                                      └─────────────┘            │
└─────────────────────────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| `@authensor/schemas` | JSON schemas (single source of truth) |
| `@authensor/engine` | Pure policy evaluation logic |
| `@authensor/control-plane` | HTTP API for evaluate/receipts |
| `@authensor/mcp-server` | MCP tools (Stripe, GitHub, HTTP) |
| `@authensor/sdk` | TypeScript SDK for agent builders |
| `authensor` (Python) | Python SDK for agent builders |

## Core Concepts

### Action Envelope

An envelope describes an action an agent wants to perform:

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
  "principal": {
    "type": "agent",
    "id": "my-agent"
  },
  "constraints": {
    "maxAmount": 10000,
    "currency": "USD"
  }
}
```

### Decision

The engine evaluates the envelope against policies:

```json
{
  "outcome": "allow",  // or "deny", "require_approval", "rate_limited"
  "policyId": "default-dev",
  "reason": "Allowed in development environment"
}
```

### Receipt

Every action creates a permanent receipt:

```json
{
  "id": "uuid",
  "envelopeId": "uuid",
  "decision": { "outcome": "allow" },
  "status": "executed",
  "execution": {
    "durationMs": 150,
    "result": { "chargeId": "ch_..." }
  }
}
```

### Policy semantics

- Policies are evaluated by priority (higher `priority` first). Within a policy, rules are evaluated in order and the first matching rule applies.
- `defaultEffect` applies when no rules match within that policy. If no active policy is set for an org/env, the control plane falls back to an explicit `allow-all` policy in development (logged loudly).
- `action.type` is a dot-delimited string (e.g., `stripe.charges.create`, `github.issues.create`, `http.request`) and supports glob matching in `scope.actionTypes`.
- Receipts denormalize `action.type` as `tool_name`, and keep `decision_outcome` separate from `status` (pending/executed/failed/...).

## Usage

### TypeScript SDK

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',
  principalId: 'my-agent',
});

// Execute with policy enforcement
const result = await authensor.execute(
  'stripe.charges.create',
  'stripe://customers/cus_123/charges',
  async () => stripe.charges.create({ amount: 1000, currency: 'usd' }),
  { constraints: { maxAmount: 10000 } }
);

console.log(`Receipt: ${result.receiptId}`);
```

### Python SDK

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
    print(f"Receipt: {result.receipt_id}")
```

### MCP Server

Add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "authensor": {
      "command": "npx",
      "args": ["authensor-mcp"],
      "env": {
        "CONTROL_PLANE_URL": "http://localhost:3000",
        "STRIPE_TEST_KEY": "sk_test_...",
        "AUTHENSOR_STRIPE_ALLOW_LIVE": "false",
        "GITHUB_TOKEN": "ghp_...",
        "AUTHENSOR_GITHUB_ALLOWED_REPOS": "your-org/your-repo"
      }
    }
  }
}
```

**Integration guardrails**
- Stripe runs in test mode by default; production requires `AUTHENSOR_STRIPE_ALLOW_LIVE=true` and `STRIPE_LIVE_KEY`. Amounts are clamped to `AUTHENSOR_STRIPE_MIN_AMOUNT`/`MAX_AMOUNT` (cents) and currencies must be in `AUTHENSOR_STRIPE_ALLOWED_CURRENCIES`. Idempotency keys are pinned to the receipt id for deterministic retries.
- GitHub token must come from `GITHUB_TOKEN`; repos/orgs must be allowlisted via `AUTHENSOR_GITHUB_ALLOWED_REPOS` / `AUTHENSOR_GITHUB_ALLOWED_ORGS` (empty lists allow everything only in dev). Requests that hit rate limits return `RATE_LIMITED` with retry hints.

## Test with MCP Inspector

1. Run the MCP server (stdio):
   ```bash
   pnpm --filter @authensor/mcp-server dev
   ```
2. Point MCP Inspector at the stdio command `npx authensor-mcp`.
3. Try tools:
   - `http.request` to https://example.com
   - `github.issues.create` against an allowlisted repo
   - `stripe_create_customer` (test mode)
4. Open the receipts viewer at `http://localhost:3000/receipts/view` to inspect results.

## Development

```bash
# Install everything
make install

# Start dev servers
make dev

# Run tests
make test

# Generate types from schemas
make gen

# Format code
make format
```

Receipts are stored in Postgres (`receipts` table created at control-plane startup; see `packages/control-plane/src/migrations/001_init.sql`). Keep Postgres running (via `docker compose up -d postgres`) for the quickstarts and MCP tools so receipts persist across restarts.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/evaluate` | Evaluate an action envelope |
| GET | `/receipts` | List receipts (JSON) |
| GET | `/receipts/view` | List receipts (HTML) |
| GET | `/receipts/:id` | Get a receipt (JSON) |
| GET | `/receipts/:id/view` | Get a receipt (HTML view) |
| PATCH | `/receipts/:id` | Update receipt status |
| GET | `/policies` | List policies |
| POST | `/policies` | Create a policy |
| GET | `/health` | Health check |

## Environment Variables

```bash
# Required
DATABASE_URL=postgres://authensor:authensor_dev@localhost:5432/authensor

# Optional
CONTROL_PLANE_URL=http://localhost:3000

# For MCP integrations
STRIPE_TEST_KEY=sk_test_...
# Optional live key (requires AUTHENSOR_STRIPE_ALLOW_LIVE=true and prod env)
STRIPE_LIVE_KEY=
AUTHENSOR_STRIPE_ALLOW_LIVE=false
AUTHENSOR_STRIPE_ALLOWED_CURRENCIES=usd
AUTHENSOR_STRIPE_MIN_AMOUNT=50
AUTHENSOR_STRIPE_MAX_AMOUNT=500000
STRIPE_API_VERSION=2023-10-16
GITHUB_TOKEN=ghp_...
AUTHENSOR_GITHUB_ALLOWED_REPOS=owner/repo
AUTHENSOR_GITHUB_ALLOWED_ORGS=your-org
```

## License

MIT
