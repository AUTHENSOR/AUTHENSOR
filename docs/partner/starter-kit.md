# Partner Starter Kit

Quick reference for getting started with Authensor. For detailed guides, see the [full onboarding docs](../alpha_onboarding.md).

---

## Operational Safety Defaults

**All partner deployments start with these safety defaults:**

```bash
# REQUIRED: Start in sandbox mode (no real API calls)
AUTHENSOR_SANDBOX_MODE=stub

# RECOMMENDED: Disable execution until policies are configured
AUTHENSOR_DISABLE_EXECUTION=true
```

These defaults ensure:
- No real API calls are made until you're ready
- Time to configure policies before any execution
- Safe exploration of workflows and receipts

---

## Environment Variables by Category

### Core (Required)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | - | Postgres connection string |
| `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` | - | Initial admin token for key creation |
| `AUTHENSOR_SANDBOX_MODE` | `stub` | `stub` = no real calls, `real` = live execution |

### Safety Controls

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTHENSOR_DISABLE_EXECUTION` | `false` | Kill switch: block all execution |
| `AUTHENSOR_CLAIM_TTL_SECONDS` | `30` | Claim lock duration |
| `TRUST_PROXY` | `false` | Trust X-Forwarded-* headers |

### HTTP Tool

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTHENSOR_ALLOW_HTTP` | `false` | Allow non-HTTPS (security risk) |
| SSRF protection | Always on | Blocks private IPs, redirects |

### GitHub Tool

| Variable | Default | Description |
|----------|---------|-------------|
| `GITHUB_TOKEN` | - | Personal access token or app token |
| `AUTHENSOR_GITHUB_ALLOWED_REPOS` | - | Comma-separated: `org/repo,org/repo2` |
| `AUTHENSOR_GITHUB_ALLOWED_ORGS` | - | Comma-separated org names |

> **Note**: Empty allowlists = deny all in production, allow all in development.

### Stripe Tool

| Variable | Default | Description |
|----------|---------|-------------|
| `STRIPE_TEST_KEY` | - | Stripe test secret key |
| `STRIPE_LIVE_KEY` | - | Stripe live secret key (use sparingly) |
| `AUTHENSOR_STRIPE_ALLOW_LIVE` | `false` | Allow live mode (requires live key) |
| `AUTHENSOR_STRIPE_ALLOWED_CURRENCIES` | `usd` | Comma-separated currency codes |
| `AUTHENSOR_STRIPE_MIN_AMOUNT` | `50` | Minimum amount in cents |
| `AUTHENSOR_STRIPE_MAX_AMOUNT` | `100000` | Maximum amount in cents |

### Rate Limiting

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTHENSOR_RL_INGEST_PER_MIN` | `120` | Rate limit for ingest role |
| `AUTHENSOR_RL_EXECUTOR_PER_MIN` | `60` | Rate limit for executor role |
| `AUTHENSOR_RL_ADMIN_PER_MIN` | `120` | Rate limit for admin role |
| `AUTHENSOR_RATE_LIMIT_WEBHOOK_URL` | - | Optional webhook to notify on rate limit events |
| `AUTHENSOR_RATE_LIMIT_WEBHOOK_SECRET` | - | Optional shared secret sent as `Authorization: Bearer ...` |
| `AUTHENSOR_ALLOW_FALLBACK_POLICY` | `false` | Allow fallback allow-all policy when no active policy exists (dev only) |
| `AUTHENSOR_POLICY_ALERT_WEBHOOK_URL` | - | Optional alert webhook when no policy is configured |
| `AUTHENSOR_POLICY_ALERT_WEBHOOK_SECRET` | - | Optional shared secret for policy alert webhook |

---

## Role Mappings

| Role | Capabilities | Use For |
|------|--------------|---------|
| **admin** | All endpoints, key management, controls, policies | Human operators, dashboards |
| **ingest** | `POST /evaluate` only | SDKs, your application code |
| **executor** | Claim, read, update receipts; read controls | MCP server, execution workers |

---

## Curl Cheatsheet

All examples assume:
```bash
# Self-hosted (default):
export BASE_URL=http://localhost:3000
# Hosted tier: export BASE_URL=https://your-tenant.up.railway.app

export ADMIN_KEY=authensor_your_admin_key
export INGEST_KEY=authensor_your_ingest_key
export EXECUTOR_KEY=authensor_your_executor_key
```

### API Keys

```bash
# List keys
curl $BASE_URL/keys -H "Authorization: Bearer $ADMIN_KEY"

# Create ingest key
curl -X POST $BASE_URL/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"SDK Ingest","role":"ingest"}'

# Create executor key
curl -X POST $BASE_URL/keys \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"MCP Executor","role":"executor"}'

# Revoke key
curl -X POST $BASE_URL/keys/KEY_ID/revoke \
  -H "Authorization: Bearer $ADMIN_KEY"

# Rotate key (revokes old, creates new with same name/role)
curl -X POST $BASE_URL/keys/KEY_ID/rotate \
  -H "Authorization: Bearer $ADMIN_KEY"
# Returns: { keyId, keyPrefix, token, previousKeyId, rotatedAt }
```

### Evaluate + Claim + Finalize Flow

```bash
# 1. Evaluate action (returns receiptId)
RECEIPT=$(curl -s -X POST $BASE_URL/evaluate \
  -H "Authorization: Bearer $INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "action": {"type": "stripe.list_customers", "resource": "stripe://customers"},
    "principal": {"type": "agent", "id": "my-agent"},
    "context": {"environment": "development"}
  }')
echo $RECEIPT | jq .

# 2. Claim receipt (returns claimId)
RECEIPT_ID=$(echo $RECEIPT | jq -r .receiptId)
CLAIM=$(curl -s -X POST $BASE_URL/receipts/$RECEIPT_ID/claim \
  -H "Authorization: Bearer $EXECUTOR_KEY")
echo $CLAIM | jq .

# 3. Finalize receipt (after execution)
CLAIM_ID=$(echo $CLAIM | jq -r .claimId)
curl -X PATCH $BASE_URL/receipts/$RECEIPT_ID \
  -H "Authorization: Bearer $EXECUTOR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "status": "executed",
    "claimId": "'$CLAIM_ID'",
    "execution": {
      "completedAt": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
      "result": {"ok": true}
    }
  }'
```

### Controls (Kill Switch)

```bash
# Check controls
curl $BASE_URL/controls -H "Authorization: Bearer $ADMIN_KEY"

# Enable kill switch (stop all execution)
curl -X POST $BASE_URL/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_execution": true}'

# Disable specific tool
curl -X POST $BASE_URL/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_stripe": true}'

# Re-enable execution
curl -X POST $BASE_URL/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_execution": false}'
```

### Claim Contract & Error Handling

The claim endpoint (`POST /receipts/:id/claim`) uses optimistic locking to ensure exactly one executor wins. Here's how to handle responses:

| Status | Meaning | Action |
|--------|---------|--------|
| `200` | Claim succeeded | Execute the action, then finalize with `PATCH /receipts/:id` |
| `409` | Already claimed by another executor | Retry after `retryAfterSeconds` (usually claim TTL) |
| `403` | Execution disabled (kill switch or tool disabled) | Do not retry; check controls |
| `400` | Invalid receipt ID format | Fix the ID; do not retry |
| `404` | Receipt not found | Do not retry |

**Recommended retry strategy:**

```bash
# Example: exponential backoff with jitter
MAX_RETRIES=3
RETRY_DELAY=5  # seconds

for i in $(seq 1 $MAX_RETRIES); do
  CLAIM=$(curl -s -w "\n%{http_code}" -X POST $BASE_URL/receipts/$RECEIPT_ID/claim \
    -H "Authorization: Bearer $EXECUTOR_KEY")
  STATUS=$(echo "$CLAIM" | tail -1)
  BODY=$(echo "$CLAIM" | head -1)

  if [ "$STATUS" = "200" ]; then
    echo "Claimed successfully!"
    CLAIM_ID=$(echo "$BODY" | jq -r .claimId)
    break
  elif [ "$STATUS" = "409" ]; then
    RETRY_AFTER=$(echo "$BODY" | jq -r .retryAfterSeconds)
    echo "Already claimed, retrying in ${RETRY_AFTER}s..."
    sleep $((RETRY_AFTER + RANDOM % 3))  # Add jitter
  else
    echo "Unexpected status $STATUS: $BODY"
    exit 1
  fi
done
```

**Response shapes:**

```json
// 200 OK - Claim succeeded
{
  "claimId": "uuid",
  "claimExpiresAt": "2026-01-03T14:30:00Z",
  "receipt": { /* full receipt */ }
}

// 409 Conflict - Already claimed
{
  "error": "Receipt already claimed",
  "retryAfterSeconds": 25,
  "claimExpiresAt": "2026-01-03T14:30:00Z"
}

// 403 Forbidden - Execution blocked
{
  "error": { "code": "EXECUTION_DISABLED", "message": "..." }
}
// or
{
  "error": { "code": "TOOL_DISABLED", "message": "..." }
}
```

---

### Receipts

```bash
# List receipts (admin only)
curl "$BASE_URL/receipts?limit=10" -H "Authorization: Bearer $ADMIN_KEY"

# View receipt HTML (browser)
open "$BASE_URL/receipts/$RECEIPT_ID/view" # requires auth header or sandbox ?token=

# Get receipt JSON
curl $BASE_URL/receipts/$RECEIPT_ID -H "Authorization: Bearer $EXECUTOR_KEY"

# Export receipts as NDJSON (for data portability)
curl "$BASE_URL/receipts/export?limit=1000" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -o receipts-export.ndjson
```

### Policies

```bash
# Create policy
curl -X POST $BASE_URL/policies \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "policy_id": "starter-policy",
    "version": "v1",
    "name": "Starter Policy",
    "rules": [
      {"id": "allow-stripe-read", "effect": "allow", "condition": {"scope.actionTypes": ["stripe.list_*"]}}
    ],
    "defaultEffect": "deny"
  }'

# Activate policy
curl -X POST $BASE_URL/policies/active \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"policy_id": "starter-policy", "version": "v1"}'

# Check active policy
curl $BASE_URL/policies/active -H "Authorization: Bearer $ADMIN_KEY"
```

### Approvals

```bash
# Approve pending receipt
curl -X POST $BASE_URL/approvals/$RECEIPT_ID/approve \
  -H "Authorization: Bearer $ADMIN_KEY"

# Reject
curl -X POST $BASE_URL/approvals/$RECEIPT_ID/reject \
  -H "Authorization: Bearer $ADMIN_KEY"

# Expire
curl -X POST $BASE_URL/approvals/$RECEIPT_ID/expire \
  -H "Authorization: Bearer $ADMIN_KEY"
```

---

## First Day Checklist

- [ ] Receive credentials (admin, ingest, executor keys)
- [ ] Verify sandbox mode is enabled (`AUTHENSOR_SANDBOX_MODE=stub`)
- [ ] Run smoke test: `./scripts/smoke_tenant.sh $BASE_URL`
- [ ] Create your first evaluate request
- [ ] View receipt in HTML viewer
- [ ] Create a simple allow/deny policy
- [ ] Test the kill switch (enable and disable)

---

## Graduation to Real Mode

When you're ready to make real API calls, see [Sandbox & Constrained Real Mode](../sandbox-and-constrained-real-mode.md) for:

1. Constrained real mode configuration
2. Tool-specific allowlists
3. Graduation checklist
4. Rollback procedures

---

## Support

- **Receipts**: Always include `receiptLink` when reporting issues
- **Logs**: Last 50 lines of control-plane logs
- **Weekly sync**: Scheduled after onboarding

*Last updated: 2026-01-03*
