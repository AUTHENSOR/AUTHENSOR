# Sandbox Mode & Constrained Real Mode

## Overview

Authensor supports two execution modes for alpha partners:

1. **Sandbox Mode** (Default) - Stubbed responses, no real API calls
2. **Constrained Real Mode** - Real API calls with strict allowlists

Partners start in sandbox mode and graduate to constrained real mode after proving their workflow.

---

## Sandbox Mode (Default for All Partners)

### Configuration

```bash
# Enable sandbox mode (default for new partners)
AUTHENSOR_SANDBOX_MODE=stub
```

### Behavior

| Tool | Sandbox Behavior |
|------|------------------|
| **HTTP** | Returns stubbed 200 OK response with echo of request |
| **Stripe** | Returns fake customer/charge IDs (e.g., `cus_stub_abc123`) |
| **GitHub** | Returns fake issue URLs/numbers |

### Stub Characteristics

- **Deterministic**: Same `receiptId` produces same stub response
- **Marked**: All stubs include `_stub: true` and `_mode: "stub"`
- **Auditable**: Receipts record `execution.mode: "stub"`

### Example Stub Responses

```json
// Stripe create customer (sandbox)
{
  "_stub": true,
  "_mode": "stub",
  "stripeId": "cus_stub_7f3d2a1b",
  "objectType": "customer",
  "email": "test@example.com",
  "apiVersion": "2023-10-16"
}

// GitHub create issue (sandbox)
{
  "_stub": true,
  "_mode": "stub",
  "issueUrl": "https://github.com/org/repo/issues/42",
  "issueNumber": 42,
  "repo": "org/repo"
}
```

### When to Use

- Initial workflow testing
- Policy development
- Demo and training
- CI/CD tests

---

## Constrained Real Mode

### Prerequisites

Before enabling constrained real mode, the partner must:

1. [ ] Successfully run workflow in sandbox mode
2. [ ] Create and test policies
3. [ ] Understand rate limits and error handling
4. [ ] Confirm support escalation path
5. [ ] Sign off on data retention policy

### Configuration

```bash
# Disable sandbox mode
AUTHENSOR_SANDBOX_MODE=real

# Required: Strict allowlists
AUTHENSOR_GITHUB_ALLOWED_REPOS=partner-org/approved-repo
AUTHENSOR_GITHUB_ALLOWED_ORGS=  # Empty = deny all orgs
AUTHENSOR_STRIPE_ALLOW_LIVE=false  # Test mode only initially
STRIPE_TEST_KEY=sk_test_...  # Never live key in alpha!
```

### Tool-Specific Constraints

#### GitHub

```bash
# Allow only specific repos (comma-separated)
AUTHENSOR_GITHUB_ALLOWED_REPOS=acme/test-repo,acme/sandbox-repo

# Or allow entire org (use sparingly)
AUTHENSOR_GITHUB_ALLOWED_ORGS=acme-test-org

# In production environment, empty allowlists = deny all
# In development environment, empty allowlists = allow all (dangerous!)
```

**Recommendation:** Start with a single test repo. Expand only after successful operation.

#### Stripe

```bash
# Test mode ONLY for alpha
AUTHENSOR_STRIPE_ALLOW_LIVE=false
STRIPE_TEST_KEY=sk_test_...

# Amount bounds (in cents)
AUTHENSOR_STRIPE_MIN_AMOUNT=50      # $0.50 minimum
AUTHENSOR_STRIPE_MAX_AMOUNT=10000   # $100.00 maximum

# Allowed currencies
AUTHENSOR_STRIPE_ALLOWED_CURRENCIES=usd
```

**Recommendation:** Keep amounts low and single-currency until workflow is proven.

#### HTTP

```bash
# HTTP is disabled by default (HTTPS only)
AUTHENSOR_ALLOW_HTTP=false

# SSRF protection is always on (cannot be disabled)
# Blocked: 127.x, 10.x, 192.168.x, 169.254.x, etc.
```

**Recommendation:** Most partners don't need raw HTTP access. Use specific integrations instead.

---

## Graduation Path

```
Week 1-2: Sandbox Mode
├── Run smoke test
├── Execute workflow with stubs
├── Create initial policies
└── Verify receipts look correct

Week 3: Constrained Real Mode (Test)
├── Enable real mode with strict allowlists
├── Single test repo / Stripe test mode
├── Monitor for errors
└── Review metrics together

Week 4+: Expanded Real Mode (if successful)
├── Add more repos to allowlist
├── Consider higher Stripe limits
└── Production readiness assessment
```

---

## Safety Mechanisms

### Always Active (Cannot Be Disabled)

| Mechanism | Description |
|-----------|-------------|
| SSRF Protection | Blocks requests to private/internal IPs |
| Redirect Blocking | Prevents SSRF via redirects |
| Token Redaction | Never logs or exposes API keys in errors |
| Idempotency | Receipt ID used as idempotency key for creates |
| Claim Gating | Exactly-once execution per receipt |

### Controllable

| Mechanism | Control |
|-----------|---------|
| Kill Switch | `POST /controls` with `disable_execution: true` |
| Tool Disable | `POST /controls` with `disable_http/stripe/github: true` |
| Allowlists | Environment variables |
| Sandbox Mode | `AUTHENSOR_SANDBOX_MODE` environment variable |

---

## Rollback Procedure

If constrained real mode causes issues:

### Immediate (< 1 minute)

```bash
# Kill switch - disable all execution
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_execution": true}'
```

### Short-term (< 5 minutes)

```bash
# Redeploy with sandbox mode
AUTHENSOR_SANDBOX_MODE=stub
# Restart control plane and MCP server
```

### Investigation

1. Review receipts for failed executions
2. Check metrics for error spikes
3. Audit claim/execution logs
4. Root cause analysis

---

## Metrics to Monitor

When in constrained real mode, watch these metrics:

| Metric | Healthy | Warning | Action |
|--------|---------|---------|--------|
| `receipts.by_status.failed` | < 5% | > 10% | Review errors, consider rollback |
| `receipts.by_decision_outcome.deny` | Expected % | Spike | Check policies |
| `claims.conflicts` | < 1% | > 5% | Check claim TTL, concurrency |
| `insights.config_blocked_spike` | false | true | Check allowlists |

---

## Partner Checklist: Ready for Constrained Real Mode

- [ ] Workflow runs successfully in sandbox mode
- [ ] At least 100 sandbox executions without errors
- [ ] Policies defined and tested
- [ ] Partner understands error codes and handling
- [ ] Support contact confirmed
- [ ] Data retention policy acknowledged
- [ ] Weekly sync scheduled
- [ ] Rollback procedure understood

**Sign-off:**

Partner: _________________ Date: _________

Authensor: _______________ Date: _________
