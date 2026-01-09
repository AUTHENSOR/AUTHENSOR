# Authensor Alpha Onboarding Kit

> **New to Authensor?** Start with the [Alpha 1-Pager](partner/alpha-1-pager.md) for a quick overview.

---

## Deploy Your Own Tenant (Recommended)

Deploy your own Authensor control plane on Render (free tier works).

### Step 1: Deploy via Render Blueprint

1. Go to [Render Dashboard](https://dashboard.render.com) → **New** → **Blueprint**
2. Connect to GitHub repo `JKEARN/Authensor`, branch `release/v0.5.0-alpha`
3. Set the required environment variable:
   - `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN`: Generate with `openssl rand -base64 32`
4. Click **Apply** and wait (~3 minutes)

### Step 2: Verify with Smoke Test

```bash
export AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN="<your-token>"
./scripts/smoke_tenant.sh https://<your-service>.onrender.com
```

Save the API keys printed at the end:
- **Admin key**: Full access, manage policies and keys
- **Ingest key**: Send action envelopes for evaluation
- **Executor key**: Claim and execute receipts

### Step 3: Your First Governed Action

**Option A: Direct API (curl)**
```bash
# Evaluate an action (id must be a UUID)
curl -X POST https://<your-service>.onrender.com/evaluate \
  -H "Authorization: Bearer <ingest-key>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "action": {"type": "stripe.list_customers", "resource": "stripe://customers", "operation": "read"},
    "principal": {"type": "agent", "id": "my-agent"},
    "context": {"environment": "development"}
  }'
# Returns: receiptId, decision, receiptLink
```

**Option B: Node SDK Quickstart**
```bash
# Clone and run the quickstart (no global pnpm needed)
git clone https://github.com/JKEARN/Authensor.git
cd Authensor/examples/node-quickstart
corepack enable
corepack pnpm install

# Set your endpoint and API key
export CONTROL_PLANE_URL=https://<your-service>.onrender.com
export AUTHENSOR_API_KEY=<your-ingest-key>

# Run the quickstart
corepack pnpm start
```

Or use the SDK directly:
```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: process.env.CONTROL_PLANE_URL,
  apiKey: process.env.AUTHENSOR_API_KEY,
  principalId: 'my-agent',
});

const result = await authensor.execute('stripe.list_customers', 'stripe://customers', async () => {
  // Your actual Stripe call here (stubbed in sandbox mode)
  return { customers: [] };
});
// Returns stubbed response + receipt recorded
```

**Option C: MCP Server** (for MCP-compatible clients)
```bash
CONTROL_PLANE_URL=https://<your-service>.onrender.com \
AUTHENSOR_API_KEY=<your-executor-key> \
AUTHENSOR_SANDBOX_MODE=stub \
npx @authensor/mcp-server
```

> **Note**: By default, your deployment runs in sandbox mode (`AUTHENSOR_SANDBOX_MODE=stub`), which returns stubbed responses without making real API calls. This is safe for testing.

---

## Quick Links

| Document | Purpose |
|----------|---------|
| [Alpha 1-Pager](partner/alpha-1-pager.md) | What Authensor is, what you get, expectations |
| [Success Criteria Template](partner/success-criteria-template.md) | Track your progress and weekly syncs |
| [Data Retention Policy](partner/data-retention-policy.md) | How we handle your data |
| [Sandbox & Constrained Real Mode](sandbox-and-constrained-real-mode.md) | Execution mode progression |
| [Tenant Provisioning Runbook](tenant-provisioning-runbook.md) | Internal: How to set up a tenant |
| [Security Checklist](hosted-mode-security-checklist.md) | Internal: Pre-launch verification |

---

## 1) What Authensor is
Authensor wraps every agent action in an auditable receipt, evaluates it against policies, and gates execution via claims/approvals. The control-plane is a small Hono + Postgres API; SDKs and MCP tools feed it action envelopes and persist receipts.

## 2) What you get in Alpha
- Three hardened integrations: HTTP (SSRF-safe), GitHub (allowlist + rate-limit mapping), Stripe (test-mode default, idempotent).
- Deterministic execution: evaluate → claim → execute → PATCH with claimId; retries are safe and receipt-backed.
- Receipts + approvals: every action yields a receipt (JSON + HTML viewer) with decision, approval status, claim state, and execution metadata.

## 3) Prerequisites
- Node.js 20+ and `corepack` (pnpm 9 is auto-enabled).
- Docker (for Postgres via `docker compose`).
- Optional: Python 3.12+ if you plan to use the Python SDK.

## 4) Quickstart (≈5 minutes)
Commands (run from repo root):
```bash
corepack enable
corepack pnpm install
corepack pnpm gen:check
docker compose up -d postgres
corepack pnpm dev
corepack pnpm --filter @authensor/example-node-quickstart start
```
What you should see:
- `corepack pnpm dev` starts the control-plane on `http://localhost:3000` (see console banner).
- Quickstart prints a `receiptId` and **`Receipt Link: http://localhost:3000/receipts/<id>/view`** (absolute URL).

Open the receipts viewer:
- List: http://localhost:3000/receipts/view
- Detail: the `receiptLink` printed above (e.g., http://localhost:3000/receipts/<id>/view)
If you see `CONFIG_BLOCKED` in quickstart output, set env vars (e.g., `AUTHENSOR_GITHUB_ALLOWED_REPOS` or `AUTHENSOR_STRIPE_ALLOW_LIVE=false` with `STRIPE_TEST_KEY`).

## 5) Your first governed action
- Flow: `POST /evaluate` → receives decision + `receiptId` + `receiptLink` → `POST /receipts/:id/claim` → execute tool → `PATCH /receipts/:id` with `claimId` and status `executed` or `failed`.
- In the detail viewer you care about:
  - `status` (pending/executed/failed), `decision.outcome` (allow/deny/require_approval/rate_limited)
  - `approval.status` (pending/approved/rejected/expired)
  - `metadata.claimId` + `claimExpiresAt`
  - `execution.result` or `execution.error.code` (deterministic codes like SSRF_BLOCKED, CONFIG_BLOCKED, RATE_LIMITED, INVALID_INPUT, TIMEOUT, UPSTREAM_4XX/5XX)

## 6) Policies (create, activate, verify)
Headers: `x-authensor-org: default`, `x-authensor-env: dev` (defaults if omitted).

Known-safe demo policy set (deny HTTP, require approval for Stripe, allow GitHub only for one repo):
```bash
curl -X POST http://localhost:3000/policies \
  -H 'Content-Type: application/json' \
  -d '{
    "policy_id":"alpha-demo",
    "version":"v1",
    "id":"alpha-demo",
    "name":"Alpha demo policy",
    "version":"v1",
    "rules":[
      {"id":"deny-http","effect":"deny","condition":{"scope.actionTypes":["http.request"]}},
      {"id":"approve-stripe","effect":"require_approval","condition":{"scope.actionTypes":["stripe.*"]}},
      {"id":"allow-github","effect":"allow","condition":{"scope.actionTypes":["github.*"],"scope.resources":["github://repos/your-org/your-repo/*"]}}
    ],
    "defaultEffect":"deny"
  }'
curl -X POST http://localhost:3000/policies/active \
  -H 'Content-Type: application/json' \
  -d '{"policy_id":"alpha-demo","version":"v1"}'
```
Update `your-org/your-repo` to a real repo you allow.

Create a deny-http policy:
```bash
curl -X POST http://localhost:3000/policies \
  -H 'Content-Type: application/json' \
  -d '{
    "policy_id":"deny-http",
    "version":"v1",
    "id":"deny-http",
    "name":"Deny HTTP requests",
    "version":"v1",
    "rules":[{"id":"block-http","effect":"deny","condition":{"action.type":"http.request"}}],
    "defaultEffect":"allow"
  }'

curl -X POST http://localhost:3000/policies/active \
  -H 'Content-Type: application/json' \
  -d '{"policy_id":"deny-http","version":"v1"}'
```

Verify (denied receipt):
```bash
corepack pnpm --filter @authensor/example-node-quickstart start
# or curl evaluate directly:
curl -X POST http://localhost:3000/evaluate \
  -H 'Content-Type: application/json' \
  -d '{
    "id":"11111111-1111-1111-1111-111111111111",
    "timestamp":"2024-01-01T00:00:00Z",
    "action":{"type":"http.request","resource":"https://example.com","operation":"read"},
    "principal":{"type":"agent","id":"alpha-user"},
    "context":{"environment":"development"}
  }'
```
Open the `receiptLink` → outcome should be `deny`.

## 7) Approvals walkthrough
Require approval for `stripe.*` in dev:
```bash
curl -X POST http://localhost:3000/policies \
  -H 'Content-Type: application/json' \
  -d '{
    "policy_id":"stripe-approval",
    "version":"v1",
    "id":"stripe-approval",
    "name":"Stripe requires approval",
    "version":"v1",
    "rules":[{"id":"approve-stripe","effect":"require_approval","condition":{"scope.actionTypes":["stripe.*"]}}],
    "defaultEffect":"allow"
  }'

curl -X POST http://localhost:3000/policies/active \
  -H 'Content-Type: application/json' \
  -d '{"policy_id":"stripe-approval","version":"v1"}'
```
Trigger an action (e.g., call `/evaluate` for a Stripe charge envelope or run the Stripe MCP tool). The receipt will show `decision_outcome=require_approval` and `approval.status=pending`.

Approve it:
```bash
curl -X POST http://localhost:3000/approvals/<receipt_id>/approve
# or reject/expire via /reject or /expire
```
Then claim and finalize:
```bash
curl -X POST http://localhost:3000/receipts/<receipt_id>/claim
curl -X PATCH http://localhost:3000/receipts/<receipt_id> \
  -H 'Content-Type: application/json' \
  -d '{"status":"executed","claimId":"<claim_id>","execution":{"completedAt":"'"$(date -Iseconds)"'","result":{"ok":true}}}'
```
Refresh the receipt viewer to see the updated status.

## 8) Tool configuration (HTTP/GitHub/Stripe)
- Env vars (from `.env.example`):
  - Core: `CONTROL_PLANE_URL`, `AUTHENSOR_CLAIM_TTL_SECONDS`, `AUTHENSOR_ALLOW_HTTP`
  - Stripe: `STRIPE_TEST_KEY`, `STRIPE_LIVE_KEY`, `AUTHENSOR_STRIPE_ALLOW_LIVE`, `AUTHENSOR_STRIPE_ALLOWED_CURRENCIES`, `AUTHENSOR_STRIPE_MIN_AMOUNT`, `AUTHENSOR_STRIPE_MAX_AMOUNT`, `STRIPE_API_VERSION`
  - GitHub: `GITHUB_TOKEN`, `AUTHENSOR_GITHUB_ALLOWED_REPOS`, `AUTHENSOR_GITHUB_ALLOWED_ORGS`
- Safety defaults:
  - HTTP: SSRF blocked (127/10/192.168/169.254/etc), redirects blocked → errors `SSRF_BLOCKED` or `REDIRECT_BLOCKED`.
  - GitHub: deny-all in prod if allowlists empty; rate limits map to `RATE_LIMITED` with `retryAt`.
  - Stripe: live blocked unless `AUTHENSOR_STRIPE_ALLOW_LIVE=true` + live key; writes use `Idempotency-Key=receiptId`.
- Examples:
  - SSRF block: `curl https://localhost` via HTTP tool will yield `SSRF_BLOCKED` in receipt error.
  - GitHub allowlist: set `AUTHENSOR_GITHUB_ALLOWED_REPOS=your-org/your-repo` before running GitHub tools.
  - Stripe test: set `STRIPE_TEST_KEY` and keep `AUTHENSOR_STRIPE_ALLOW_LIVE=false`; run Stripe MCP tool or a Stripe envelope evaluate to see allowed/test-mode behavior.

## 9) Testing with MCP Inspector
- Start MCP server (stdio): `corepack pnpm --filter @authensor/mcp-server dev`
- Configure MCP Inspector/Claude to run `npx authensor-mcp` (stdio). Control plane URL from `.env` (`http://localhost:3000`).
- Try tools:
  - `http_request` to https://example.com
  - `github_create_issue` against an allowlisted repo
  - `stripe_create_customer` (test mode)
- Watch receipts at http://localhost:3000/receipts/view; each tool call generates a receipt with decision and execution/error details.

## 10) Troubleshooting matrix

| Symptom / code | Likely cause | Fix | Where to look |
|---|---|---|---|
| `SSRF_BLOCKED` | URL resolves to loopback/private or HTTP disabled | Use public HTTPS; set `AUTHENSOR_ALLOW_HTTP=true` only if you accept risk | Receipt `execution.error.code`, control-plane logs |
| `REDIRECT_BLOCKED` | Upstream redirect blocked by HTTP guard | Use final URL; redirects are disallowed | Receipt error |
| `CONFIG_BLOCKED` | GitHub allowlist empty in prod, Stripe live gating, repo not allowed | Set allowlists (`AUTHENSOR_GITHUB_ALLOWED_REPOS/ORGS`), or enable live Stripe with env + key | Receipt error, viewer banner |
| `RATE_LIMITED` | GitHub 429/secondary rate limit | Wait until `retryAt` in receipt error; reduce calls | Receipt error.retryAt |
| `INVALID_INPUT` | Bad amount/currency, missing params | Fix request parameters | Receipt execution.error |
| `TIMEOUT` | Upstream timed out | Increase timeout constraint; retry | Receipt error |
| `UPSTREAM_4XX` | Upstream client error (GitHub/Stripe) | Correct request; check receipt error details | Receipt error |
| `UPSTREAM_5XX` | Upstream/server error | Retry with backoff; receipts track attemptCount | Receipt error |
| Claim 409 / already claimed | Another executor holds claim or TTL not expired | Wait for `claim_expires_at`/retry_after; claims require claimId | Claim response + receipt metadata |
| Approval pending | Policy `require_approval` and not approved | Call `/approvals/:id/approve` (or reject/expire) then claim+patch | Receipt approval section |
| Postgres not running | Control plane fails to start | `docker compose up -d postgres`; check `DATABASE_URL` | Control-plane logs |

## 11) Support packet (what to share)
When asking for help, include:
- `receiptLink` and receipt JSON (`GET /receipts/:id`)
- Timestamps of the issue
- `x-authensor-org` / `x-authensor-env` used
- Tool name + parameters (redacted of secrets)
- Env vars set (names only): e.g., `CONTROL_PLANE_URL`, `STRIPE_TEST_KEY`, `AUTHENSOR_GITHUB_ALLOWED_REPOS`, etc.
- Last 50 lines of control-plane and tool logs

## 12) Hosted Alpha Authentication

For hosted single-tenant alpha deployments, Authensor provides API key authentication with role-based access control.

### Roles
- **ingest**: Can POST to `/evaluate` (send action envelopes)
- **executor**: Can claim and execute receipts, read controls
- **admin**: Full access to all endpoints including key management, policies, and controls

### Bootstrap Mode
When no API keys exist, the control plane allows all requests (bootstrap mode). Create your first admin key to enable authentication:

Option A - Environment variable bootstrap:
```bash
# Set before starting control plane
export AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=authensor_my_secret_bootstrap_token
# Start control plane - first admin key is created automatically
corepack pnpm dev
```

Option B - Bootstrap mode (no keys exist):
```bash
# Create admin key when no keys exist (bootstrap mode)
curl -X POST http://localhost:3000/keys \
  -H 'Content-Type: application/json' \
  -d '{"name":"My Admin Key","role":"admin"}'
# Response includes token (shown ONCE): {"id":"...","token":"authensor_...","role":"admin"}
```

### Managing API Keys
```bash
# List keys (admin only) - token hashes not exposed
curl http://localhost:3000/keys -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'

# Create ingest key for SDKs
curl -X POST http://localhost:3000/keys \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"name":"SDK Ingest","role":"ingest"}'

# Create executor key for MCP server
curl -X POST http://localhost:3000/keys \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"name":"MCP Executor","role":"executor"}'

# Revoke a key
curl -X POST http://localhost:3000/keys/KEY_ID/revoke \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

### Using API Keys
```bash
# Authorization header (preferred)
curl http://localhost:3000/receipts \
  -H 'Authorization: Bearer YOUR_TOKEN'

# x-authensor-key header (alternative)
curl http://localhost:3000/receipts \
  -H 'x-authensor-key: YOUR_TOKEN'

# ?token= query param (SANDBOX MODE ONLY - for browser access)
# Only works when AUTHENSOR_SANDBOX_MODE=stub, disabled in production
open "http://localhost:3000/receipts/RECEIPT_ID/view?token=YOUR_TOKEN"
```

> **Security Note**: The `?token=` query param is only enabled in sandbox mode (`AUTHENSOR_SANDBOX_MODE=stub`) because tokens in URLs can leak via browser history, referrer headers, and logs. In production, use headers.

### MCP Server Authentication
Set the API key in environment for MCP server:
```bash
export AUTHENSOR_API_KEY=authensor_your_executor_token
corepack pnpm --filter @authensor/mcp-server dev
```

## 13) Kill Switch & Execution Controls

Admins can disable execution globally or per-tool without deploying new policies.

### Reading Controls
```bash
curl http://localhost:3000/controls \
  -H 'Authorization: Bearer YOUR_TOKEN'
# Returns: {"disable_execution":false,"disable_http":false,"disable_github":false,"disable_stripe":false}
```

### Updating Controls (admin only)
```bash
# Kill switch - disable ALL execution
curl -X POST http://localhost:3000/controls \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"disable_execution":true}'

# Disable specific tool
curl -X POST http://localhost:3000/controls \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"disable_http":true}'
```

### Defense-in-Depth
Controls are enforced at two layers:
1. **Control Plane**: Claim requests return 403 with `EXECUTION_DISABLED` or `TOOL_DISABLED`
2. **MCP Server**: Tools check `/controls/check?tool=<name>` before execution

## 14) Sandbox Mode (Partner-Safe Testing)

For partners to safely explore Authensor without making real API calls.

### Enabling Sandbox Mode
```bash
export AUTHENSOR_SANDBOX_MODE=stub
corepack pnpm --filter @authensor/mcp-server dev
```

### What Happens in Sandbox Mode
- Tools return **deterministic stubbed responses** (no real upstream calls)
- Stubs are seeded by `receiptId` for reproducibility
- All stub results include `_stub: true` and `_mode: "stub"` markers
- Receipts record `execution.mode: "stub"` for auditability

### Example Stub Responses
```json
// HTTP stub
{"_stub":true,"_mode":"stub","status":200,"statusText":"OK (Stubbed)","body":"..."}

// Stripe stub
{"_stub":true,"_mode":"stub","stripeId":"cus_stub_abc123","objectType":"customer"}

// GitHub stub
{"_stub":true,"_mode":"stub","issueUrl":"https://github.com/org/repo/issues/42","issueNumber":42}
```

## 15) Rate Limiting

Token-scoped, role-aware rate limiting protects the control plane.

### Limits by Role (per minute, per route group)
| Role | Default Limit |
|------|---------------|
| ingest | 120 |
| executor | 60 |
| admin | 120 |

### Response Headers
```
X-RateLimit-Limit: 120
X-RateLimit-Remaining: 119
X-RateLimit-Reset: 1704067260
```

### When Exceeded
```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Rate limit exceeded. Limit: 120 requests per minute.",
    "retryAfterSeconds": 42
  }
}
```

### Configuring Limits
```bash
export AUTHENSOR_RL_INGEST_PER_MIN=200
export AUTHENSOR_RL_EXECUTOR_PER_MIN=100
export AUTHENSOR_RL_ADMIN_PER_MIN=200
```

## Alpha Stability Guarantees
Scope: 0.x alpha; contracts are stable within 0.x unless explicitly noted in CHANGELOG.md.

Stable endpoints (won't be removed/renamed in alpha):
- POST `/evaluate`
- GET `/receipts/:id`
- GET `/receipts/:id/view`
- GET `/receipts/view`
- POST `/receipts/:id/claim`
- PATCH `/receipts/:id`
- POST `/approvals/:id/approve`, `/reject`, `/expire`
- POST `/policies`
- POST `/policies/active`
- GET `/policies/active`
- POST `/keys`, GET `/keys`, POST `/keys/:id/revoke` (Phase 2)
- GET `/controls`, POST `/controls`, GET `/controls/check` (Phase 4)

Stable response fields (won’t be removed/renamed in alpha):
- `/evaluate`: `receiptId`, `receiptUrl`/`receiptLink`, `decision` (with `outcome`), `policy` {`id`, `version`, `source`}
- Receipt JSON: `id`, `status`, `decision`/`decision.outcome`, `tool_name`, `actor_id`, `approval_status`, `created_at`, `updated_at`, plus `envelope`/`decision`/`execution`/`result`/`error`
- Claim response: `claimId`, `claimExpiresAt` (or 409 conflict with `retryAfterSeconds`/`claimExpiresAt`)

Stable schema objects: Action Envelope, Decision, Receipt, Policy (in `packages/schemas`).

Breaking changes policy:
- No silent breaking changes in 0.x
- Breaking changes require: (1) changelog entry (`CHANGELOG.md`), (2) schema version bump (schemas package), (3) migration notes if DB changes.

Compatibility promise:
- Optional fields/endpoints may be added anytime.
- Existing fields/endpoints won’t be removed without a minor version bump and notes.

Operational Metrics:
- `GET /metrics/summary?window=1h|24h|7d` returns grouped counts:
  - `receipts.by_status`, `receipts.by_decision_outcome`
  - `claims.conflicts` (claim conflicts), `claims.expired_reclaimed`
  - `generated_at` timestamp
- Scoping: headers `x-authensor-org` / `x-authensor-env` or query params `?org=&env=` are accepted. Current mode is reported as `scope.mode` (`global` when org/env columns are not stored yet).
- Ratios & insights: response includes `ratios` (deny_rate, config_blocked_rate, claim_conflict_rate, expired_reclaim_rate, approval rates) and `insights` with `id/message/suggestions` when spikes are detected (deny_spike, config_blocked_spike, claim_conflicts_spike, expired_reclaimed_spike, approvals_stuck). Use these hints to adjust policies, env allowlists, and claim TTL.
