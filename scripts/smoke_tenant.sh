#!/bin/bash
#
# Authensor Tenant Smoke Test
#
# End-to-end test that verifies a tenant is correctly provisioned and functional.
# Run this after every deployment or tenant setup.
#
# Usage: ./scripts/smoke_tenant.sh [BASE_URL] [BOOTSTRAP_TOKEN]
#
# Environment variables:
#   BASE_URL              - Control plane URL (default: http://localhost:3000)
#   AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN - Bootstrap token for initial key creation
#
set -euo pipefail

BASE_URL="${1:-${BASE_URL:-http://localhost:3000}}"
BOOTSTRAP_TOKEN="${2:-${AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN:-}}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_step() { echo -e "${YELLOW}==>${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

ADMIN_KEY=""
INGEST_KEY=""
EXECUTOR_KEY=""
RECEIPT_ID=""

cleanup() {
  echo ""
  echo "=========================================="
  echo "Smoke Test Summary"
  echo "=========================================="
  if [[ -n "$RECEIPT_ID" ]]; then
    echo "Receipt ID: $RECEIPT_ID"
    echo "View receipt: $BASE_URL/receipts/$RECEIPT_ID/view"
  fi
  echo ""
}
trap cleanup EXIT

#
# 1. Health Check
#
log_step "Checking control plane health..."
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/health" || echo "000")
if [[ "$HEALTH" != "200" ]]; then
  log_fail "Control plane not healthy (HTTP $HEALTH)"
  echo "Make sure the control plane is running:"
  echo "  docker compose up -d postgres control-plane"
  exit 1
fi
log_ok "Control plane is healthy"

#
# 2. Bootstrap Admin Key
#
log_step "Bootstrapping admin key..."
if [[ -z "$BOOTSTRAP_TOKEN" ]]; then
  log_fail "AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN not set"
  echo "Set the bootstrap token and try again:"
  echo "  export AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=your-secret-token"
  exit 1
fi

ADMIN_RESPONSE=$(curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $BOOTSTRAP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Smoke Test Admin", "role": "admin"}')

if echo "$ADMIN_RESPONSE" | grep -q '"token"'; then
  ADMIN_KEY=$(echo "$ADMIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')
  log_ok "Admin key created"
elif echo "$ADMIN_RESPONSE" | grep -q 'already exists'; then
  log_ok "Admin key already exists (reusing)"
  # Use bootstrap token as fallback admin
  ADMIN_KEY="$BOOTSTRAP_TOKEN"
else
  log_fail "Failed to create admin key: $ADMIN_RESPONSE"
  exit 1
fi

#
# 3. Verify Admin Auth with /whoami
#
log_step "Verifying admin auth with /whoami..."
WHOAMI=$(curl -s "$BASE_URL/whoami" \
  -H "Authorization: Bearer $ADMIN_KEY")

if echo "$WHOAMI" | grep -q '"role"'; then
  ROLE=$(echo "$WHOAMI" | grep -o '"role":"[^"]*"' | sed 's/"role":"//;s/"$//')
  log_ok "Authenticated as role: $ROLE"
else
  log_fail "Failed to authenticate: $WHOAMI"
  exit 1
fi

#
# 4. Create Ingest Key
#
log_step "Creating ingest key..."
INGEST_RESPONSE=$(curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Smoke Test Ingest", "role": "ingest"}')

if echo "$INGEST_RESPONSE" | grep -q '"token"'; then
  INGEST_KEY=$(echo "$INGEST_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')
  log_ok "Ingest key created"
else
  log_fail "Failed to create ingest key: $INGEST_RESPONSE"
  exit 1
fi

#
# 5. Create Executor Key
#
log_step "Creating executor key..."
EXECUTOR_RESPONSE=$(curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Smoke Test Executor", "role": "executor"}')

if echo "$EXECUTOR_RESPONSE" | grep -q '"token"'; then
  EXECUTOR_KEY=$(echo "$EXECUTOR_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')
  log_ok "Executor key created"
else
  log_fail "Failed to create executor key: $EXECUTOR_RESPONSE"
  exit 1
fi

#
# 6. Evaluate an Action (as ingest)
#
log_step "Evaluating action (POST /evaluate)..."
EVAL_RESPONSE=$(curl -s -X POST "$BASE_URL/evaluate" \
  -H "Authorization: Bearer $INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "action": {
      "type": "smoke.test",
      "resource": "test://smoke-test",
      "operation": "read"
    },
    "principal": {
      "type": "agent",
      "id": "smoke-test-agent"
    },
    "context": {
      "environment": "development"
    }
  }')

if echo "$EVAL_RESPONSE" | grep -q '"receiptId"'; then
  RECEIPT_ID=$(echo "$EVAL_RESPONSE" | grep -o '"receiptId":"[^"]*"' | sed 's/"receiptId":"//;s/"$//')
  DECISION=$(echo "$EVAL_RESPONSE" | grep -o '"outcome":"[^"]*"' | sed 's/"outcome":"//;s/"$//')
  log_ok "Evaluation succeeded: decision=$DECISION, receiptId=$RECEIPT_ID"
else
  log_fail "Evaluation failed: $EVAL_RESPONSE"
  exit 1
fi

#
# 7. Claim the Receipt (as executor)
#
log_step "Claiming receipt (POST /receipts/$RECEIPT_ID/claim)..."
CLAIM_RESPONSE=$(curl -s -X POST "$BASE_URL/receipts/$RECEIPT_ID/claim" \
  -H "Authorization: Bearer $EXECUTOR_KEY" \
  -H "Content-Type: application/json")

if echo "$CLAIM_RESPONSE" | grep -q '"claimId"'; then
  CLAIM_ID=$(echo "$CLAIM_RESPONSE" | grep -o '"claimId":"[^"]*"' | head -1 | sed 's/"claimId":"//;s/"$//')
  log_ok "Receipt claimed: claimId=$CLAIM_ID"
elif echo "$CLAIM_RESPONSE" | grep -q '"already_executed"'; then
  log_ok "Receipt was already executed (idempotent replay)"
  CLAIM_ID="replay"
else
  log_fail "Claim failed: $CLAIM_RESPONSE"
  exit 1
fi

#
# 8. Finalize Receipt (as executor)
#
log_step "Finalizing receipt (PATCH /receipts/$RECEIPT_ID)..."
COMPLETED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
FINALIZE_RESPONSE=$(curl -s -X PATCH "$BASE_URL/receipts/$RECEIPT_ID" \
  -H "Authorization: Bearer $EXECUTOR_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"status\": \"executed\", \"claimId\": \"$CLAIM_ID\", \"execution\": {\"completedAt\": \"$COMPLETED_AT\", \"durationMs\": 42, \"result\": {\"smoke\": \"test\", \"success\": true}, \"mode\": \"stub\"}}")

if echo "$FINALIZE_RESPONSE" | grep -q '"id"'; then
  log_ok "Receipt finalized successfully"
else
  log_fail "Finalize failed: $FINALIZE_RESPONSE"
  exit 1
fi

#
# 9. Fetch Receipt (as admin)
#
log_step "Fetching receipt (GET /receipts/$RECEIPT_ID)..."
RECEIPT=$(curl -s "$BASE_URL/receipts/$RECEIPT_ID" \
  -H "Authorization: Bearer $ADMIN_KEY")

if echo "$RECEIPT" | grep -q '"status":"executed"'; then
  log_ok "Receipt shows status=executed"
else
  log_fail "Receipt fetch failed or wrong status: $RECEIPT"
  exit 1
fi

#
# 10. Check Metrics (as admin)
#
log_step "Checking metrics (GET /metrics/summary)..."
METRICS=$(curl -s "$BASE_URL/metrics/summary?window=1h" \
  -H "Authorization: Bearer $ADMIN_KEY")

if echo "$METRICS" | grep -q '"allow"' || echo "$METRICS" | grep -q '"executed"'; then
  log_ok "Metrics summary returned data"
else
  log_fail "Metrics summary empty or failed: $METRICS"
  # Not a fatal error for smoke test
fi

#
# 11. Check Controls (as admin)
#
log_step "Checking controls (GET /controls)..."
CONTROLS=$(curl -s "$BASE_URL/controls" \
  -H "Authorization: Bearer $ADMIN_KEY")

if echo "$CONTROLS" | grep -q '"disable_execution"'; then
  EXEC_DISABLED=$(echo "$CONTROLS" | grep -o '"disable_execution":[^,}]*' | sed 's/"disable_execution"://')
  log_ok "Controls retrieved: disable_execution=$EXEC_DISABLED"
else
  log_fail "Controls fetch failed: $CONTROLS"
  exit 1
fi

#
# Done!
#
echo ""
echo "=========================================="
echo -e "${GREEN}SMOKE TEST PASSED${NC}"
echo "=========================================="
echo ""
echo "Tenant is correctly provisioned and functional."
echo ""
echo "Keys created (save these):"
echo "  Admin:    $ADMIN_KEY"
echo "  Ingest:   $INGEST_KEY"
echo "  Executor: $EXECUTOR_KEY"
echo ""
echo "Receipt viewer: $BASE_URL/receipts/$RECEIPT_ID/view"
echo ""
