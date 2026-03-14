# Tenant Provisioning Runbook

Step-by-step guide for provisioning a new Authensor tenant for alpha design partners.

**Target time: < 30 minutes per tenant**

---

## Prerequisites

- [ ] Docker and Docker Compose installed
- [ ] Access to partner deployment infrastructure (or local dev environment)
- [ ] Partner contact info and company name
- [ ] Agreed-upon tenant identifier (e.g., `acme-corp`)

---

## Step 1: Deploy Infrastructure

### Option A: Docker Compose (Recommended for Alpha)

```bash
# Clone the repo
git clone https://github.com/your-org/authensor.git
cd authensor

# Create environment file
cat > .env << 'EOF'
POSTGRES_USER=authensor
POSTGRES_PASSWORD=$(openssl rand -hex 32)
POSTGRES_DB=authensor_<tenant-id>
AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=$(openssl rand -hex 32)
EOF

# Start services
docker compose up -d postgres control-plane

# Wait for health
until curl -s http://localhost:3000/health | grep -q "ok"; do
  echo "Waiting for control plane..."
  sleep 2
done
```

### Option B: Kubernetes / Cloud Run

```bash
# Set tenant-specific environment
export TENANT_ID="acme-corp"
export DATABASE_URL="postgres://..."
export AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=$(openssl rand -hex 32)

# Deploy (example for Cloud Run)
gcloud run deploy authensor-$TENANT_ID \
  --image gcr.io/your-project/authensor-control-plane:latest \
  --set-env-vars DATABASE_URL=$DATABASE_URL \
  --set-env-vars AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=$AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN
```

---

## Step 2: Bootstrap Admin Key

```bash
# Set the base URL
export BASE_URL="http://localhost:3000"  # or deployed URL
export BOOTSTRAP_TOKEN="<from .env file>"

# Create first admin key
curl -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $BOOTSTRAP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "<Partner Name> Admin", "role": "admin"}'

# Save the returned key securely!
# Example response: {"id":"...","name":"...","role":"admin","key":"authensor_abc123..."}
```

---

## Step 3: Create Role-Specific Keys

Using the admin key from Step 2:

```bash
export ADMIN_KEY="authensor_abc123..."  # from Step 2

# Ingest key (for AI agent evaluate calls)
curl -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "<Partner Name> Ingest", "role": "ingest"}'

# Executor key (for claim + finalize)
curl -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "<Partner Name> Executor", "role": "executor"}'
```

---

## Step 4: Configure Sandbox Mode (Default for Alpha)

For alpha partners, always start in sandbox mode:

```bash
# Set in deployment environment
AUTHENSOR_SANDBOX_MODE=stub
```

This ensures:
- No real API calls to Stripe/GitHub
- All tool executions return stubbed responses
- Safe to test with real-ish workflows

---

## Step 5: Run Smoke Test

```bash
export BASE_URL="http://localhost:3000"
export AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN="<bootstrap-token>"

./scripts/smoke_tenant.sh
```

**Expected output:**
```
==> Checking control plane health...
[OK] Control plane is healthy
==> Bootstrapping admin key...
[OK] Admin key created
==> Verifying admin auth with /whoami...
[OK] Authenticated as role: admin
==> Creating ingest key...
[OK] Ingest key created
==> Creating executor key...
[OK] Executor key created
==> Evaluating action (POST /evaluate)...
[OK] Evaluation succeeded: decision=allow, receiptId=...
==> Claiming receipt...
[OK] Receipt claimed: claimId=...
==> Finalizing receipt...
[OK] Receipt finalized successfully
==> Fetching receipt...
[OK] Receipt shows status=executed
==> Checking metrics...
[OK] Metrics summary returned data
==> Checking controls...
[OK] Controls retrieved: disable_execution=false

==========================================
SMOKE TEST PASSED
==========================================
```

---

## Step 6: Verify Security Posture

Run through the [Hosted-Mode Security Checklist](./hosted-mode-security-checklist.md):

- [ ] Bootstrap lock works (503 except /health when no keys)
- [ ] Receipt viewer is admin-only
- [ ] Metrics is admin-only
- [ ] Rate limits work
- [ ] Kill switch blocks claims

---

## Step 7: Deliver Credentials to Partner

**Secure delivery options:**
1. 1Password shared vault
2. Encrypted email (PGP/S/MIME)
3. Secure file transfer

**Credentials to provide:**
- Admin API key
- Ingest API key
- Executor API key
- Control plane URL
- Receipt viewer URL (if separate)

**Documentation to provide:**
- `docs/alpha_onboarding.md`
- Quick-start examples for their use case
- Support contact / Slack channel

---

## Step 8: Set Up Weekly Check-in

Schedule:
- [ ] Weekly 30-min sync
- [ ] Metrics review at each sync
- [ ] Collect feedback and feature requests

Create tracking doc:
- Partner: `<company name>`
- Workflow: `<what they're testing>`
- Success criteria: `<what we're measuring>`
- Week 1 notes: ...

---

## Troubleshooting

### 503 BOOTSTRAP_REQUIRED

The control plane has no API keys and no bootstrap token set.

```bash
# Check if bootstrap token is set
curl http://localhost:3000/health

# If no keys exist, set AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN and restart
```

### 401 Unauthorized

API key is invalid or revoked.

```bash
# Verify key with /whoami
curl http://localhost:3000/whoami -H "Authorization: Bearer $YOUR_KEY"
```

### 403 Forbidden

Key exists but role doesn't have permission for this endpoint.

```bash
# Check role assignments
# ingest: POST /evaluate only
# executor: POST /evaluate, /receipts/:id/claim, PATCH /receipts/:id, GET /controls
# admin: everything
```

### Claim Blocked (EXECUTION_DISABLED)

Kill switch is enabled.

```bash
# Check controls
curl http://localhost:3000/controls -H "Authorization: Bearer $ADMIN_KEY"

# Re-enable execution
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_execution": false}'
```

---

## Post-Provisioning Checklist

- [ ] Infrastructure deployed and healthy
- [ ] Bootstrap completed
- [ ] All 3 role keys created (admin, ingest, executor)
- [ ] Sandbox mode enabled
- [ ] Smoke test passed
- [ ] Security checklist verified
- [ ] Credentials delivered securely
- [ ] Weekly check-in scheduled
- [ ] Partner added to support channel
