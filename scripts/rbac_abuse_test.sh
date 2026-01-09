#!/bin/bash
#
# RBAC Abuse Test - Tests role-based access control enforcement
#
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_step() { echo -e "${YELLOW}==>${NC} $1"; }
log_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
log_fail() { echo -e "${RED}[FAIL]${NC} $1"; }

# Test counters
PASSED=0
FAILED=0
TESTS=()

test_endpoint() {
  local method="$1"
  local endpoint="$2"
  local token="$3"
  local expected_code="$4"
  local description="$5"
  local body="${6:-}"

  local headers="-H 'Content-Type: application/json'"
  if [[ -n "$token" ]]; then
    headers="$headers -H 'Authorization: Bearer $token'"
  fi

  local cmd="curl -s -o /dev/null -w '%{http_code}' -X $method"
  if [[ -n "$body" ]]; then
    cmd="$cmd -d '$body'"
  fi
  cmd="$cmd $headers '$BASE_URL$endpoint'"

  local actual_code=$(eval $cmd)

  if [[ "$actual_code" == "$expected_code" ]]; then
    log_ok "$description: $method $endpoint → $actual_code"
    ((PASSED++))
  else
    log_fail "$description: $method $endpoint → $actual_code (expected $expected_code)"
    ((FAILED++))
    TESTS+=("$description|$method $endpoint|$expected_code|$actual_code|FAIL")
  fi
}

# Bootstrap and create test keys
log_step "Setting up test keys..."

# Use bootstrap token to create keys
BOOTSTRAP_TOKEN="${AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN:-test-bootstrap-token}"

# Create fresh admin key
ADMIN_RESP=$(curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $BOOTSTRAP_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "RBAC Test Admin", "role": "admin"}')
ADMIN_KEY=$(echo "$ADMIN_RESP" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')

if [[ -z "$ADMIN_KEY" ]]; then
  log_fail "Failed to create admin key. Using bootstrap token."
  ADMIN_KEY="$BOOTSTRAP_TOKEN"
fi

# Create ingest key
INGEST_RESP=$(curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "RBAC Test Ingest", "role": "ingest"}')
INGEST_KEY=$(echo "$INGEST_RESP" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')

# Create executor key
EXECUTOR_RESP=$(curl -s -X POST "$BASE_URL/keys" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "RBAC Test Executor", "role": "executor"}')
EXECUTOR_KEY=$(echo "$EXECUTOR_RESP" | grep -o '"token":"[^"]*"' | sed 's/"token":"//;s/"$//')

log_ok "Test keys created"

# Create a test receipt for testing executor endpoints
log_step "Creating test receipt..."
EVAL_RESP=$(curl -s -X POST "$BASE_URL/evaluate" \
  -H "Authorization: Bearer $INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "'$(uuidgen | tr '[:upper:]' '[:lower:]')'",
    "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'",
    "action": {"type": "rbac.test", "resource": "test://rbac"},
    "principal": {"type": "agent", "id": "rbac-test"},
    "context": {"environment": "development"}
  }')
RECEIPT_ID=$(echo "$EVAL_RESP" | grep -o '"receiptId":"[^"]*"' | sed 's/"receiptId":"//;s/"$//')
log_ok "Receipt created: $RECEIPT_ID"

echo ""
log_step "Testing public endpoints..."
test_endpoint GET "/health" "" "200" "Health (no auth)"
test_endpoint GET "/health" "invalid_token" "200" "Health (invalid token)"

echo ""
log_step "Testing auth requirements..."
test_endpoint GET "/whoami" "" "401" "Whoami (no auth)"
test_endpoint GET "/whoami" "invalid_token" "401" "Whoami (invalid token)"
test_endpoint GET "/whoami" "$ADMIN_KEY" "200" "Whoami (admin)"
test_endpoint GET "/whoami" "$INGEST_KEY" "200" "Whoami (ingest)"
test_endpoint GET "/whoami" "$EXECUTOR_KEY" "200" "Whoami (executor)"

echo ""
log_step "Testing /keys endpoints..."
test_endpoint GET "/keys" "" "401" "List keys (no auth)"
test_endpoint GET "/keys" "$INGEST_KEY" "403" "List keys (ingest)"
test_endpoint GET "/keys" "$EXECUTOR_KEY" "403" "List keys (executor)"
test_endpoint GET "/keys" "$ADMIN_KEY" "200" "List keys (admin)"

echo ""
log_step "Testing POST /keys..."
test_endpoint POST "/keys" "" "401" "Create key (no auth)" '{"name":"test","role":"ingest"}'
test_endpoint POST "/keys" "$INGEST_KEY" "403" "Create key (ingest)" '{"name":"test","role":"ingest"}'
test_endpoint POST "/keys" "$EXECUTOR_KEY" "403" "Create key (executor)" '{"name":"test","role":"ingest"}'
# Skip admin create to avoid creating too many keys

echo ""
log_step "Testing POST /evaluate..."
EVAL_BODY='{"id":"'$(uuidgen | tr '[:upper:]' '[:lower:]')'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":{"type":"test","resource":"test://"},"principal":{"type":"agent","id":"test"},"context":{}}'
test_endpoint POST "/evaluate" "" "401" "Evaluate (no auth)" "$EVAL_BODY"
test_endpoint POST "/evaluate" "$INGEST_KEY" "200" "Evaluate (ingest)" "$EVAL_BODY"
EVAL_BODY='{"id":"'$(uuidgen | tr '[:upper:]' '[:lower:]')'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":{"type":"test","resource":"test://"},"principal":{"type":"agent","id":"test"},"context":{}}'
test_endpoint POST "/evaluate" "$EXECUTOR_KEY" "200" "Evaluate (executor)" "$EVAL_BODY"
EVAL_BODY='{"id":"'$(uuidgen | tr '[:upper:]' '[:lower:]')'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":{"type":"test","resource":"test://"},"principal":{"type":"agent","id":"test"},"context":{}}'
test_endpoint POST "/evaluate" "$ADMIN_KEY" "200" "Evaluate (admin)" "$EVAL_BODY"

echo ""
log_step "Testing GET /receipts (list)..."
test_endpoint GET "/receipts" "" "401" "List receipts (no auth)"
test_endpoint GET "/receipts" "$INGEST_KEY" "403" "List receipts (ingest)"
test_endpoint GET "/receipts" "$EXECUTOR_KEY" "403" "List receipts (executor)"
test_endpoint GET "/receipts" "$ADMIN_KEY" "200" "List receipts (admin)"

echo ""
log_step "Testing GET /receipts/:id..."
test_endpoint GET "/receipts/$RECEIPT_ID" "" "401" "Get receipt (no auth)"
test_endpoint GET "/receipts/$RECEIPT_ID" "$INGEST_KEY" "403" "Get receipt (ingest)"
test_endpoint GET "/receipts/$RECEIPT_ID" "$EXECUTOR_KEY" "200" "Get receipt (executor)"
test_endpoint GET "/receipts/$RECEIPT_ID" "$ADMIN_KEY" "200" "Get receipt (admin)"

echo ""
log_step "Testing POST /receipts/:id/claim..."
# Create fresh receipt for claim test
CLAIM_EVAL_BODY='{"id":"'$(uuidgen | tr '[:upper:]' '[:lower:]')'","timestamp":"'$(date -u +%Y-%m-%dT%H:%M:%SZ)'","action":{"type":"claim.test","resource":"test://claim"},"principal":{"type":"agent","id":"claim-test"},"context":{}}'
CLAIM_EVAL=$(curl -s -X POST "$BASE_URL/evaluate" \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d "$CLAIM_EVAL_BODY")
CLAIM_RECEIPT_ID=$(echo "$CLAIM_EVAL" | grep -o '"receiptId":"[^"]*"' | sed 's/"receiptId":"//;s/"$//')

test_endpoint POST "/receipts/$CLAIM_RECEIPT_ID/claim" "" "401" "Claim (no auth)"
test_endpoint POST "/receipts/$CLAIM_RECEIPT_ID/claim" "$INGEST_KEY" "403" "Claim (ingest)"
test_endpoint POST "/receipts/$CLAIM_RECEIPT_ID/claim" "$EXECUTOR_KEY" "200" "Claim (executor)"

echo ""
log_step "Testing GET /controls..."
test_endpoint GET "/controls" "" "401" "Get controls (no auth)"
test_endpoint GET "/controls" "$INGEST_KEY" "403" "Get controls (ingest)"
test_endpoint GET "/controls" "$EXECUTOR_KEY" "200" "Get controls (executor)"
test_endpoint GET "/controls" "$ADMIN_KEY" "200" "Get controls (admin)"

echo ""
log_step "Testing POST /controls..."
test_endpoint POST "/controls" "" "401" "Update controls (no auth)" '{"disable_execution":false}'
test_endpoint POST "/controls" "$INGEST_KEY" "403" "Update controls (ingest)" '{"disable_execution":false}'
test_endpoint POST "/controls" "$EXECUTOR_KEY" "403" "Update controls (executor)" '{"disable_execution":false}'
test_endpoint POST "/controls" "$ADMIN_KEY" "200" "Update controls (admin)" '{"disable_execution":false}'

echo ""
log_step "Testing GET /metrics/summary..."
test_endpoint GET "/metrics/summary" "" "401" "Metrics (no auth)"
test_endpoint GET "/metrics/summary" "$INGEST_KEY" "403" "Metrics (ingest)"
test_endpoint GET "/metrics/summary" "$EXECUTOR_KEY" "403" "Metrics (executor)"
test_endpoint GET "/metrics/summary" "$ADMIN_KEY" "200" "Metrics (admin)"

echo ""
log_step "Testing GET /receipts/export..."
test_endpoint GET "/receipts/export" "" "401" "Export (no auth)"
test_endpoint GET "/receipts/export" "$INGEST_KEY" "403" "Export (ingest)"
test_endpoint GET "/receipts/export" "$EXECUTOR_KEY" "403" "Export (executor)"
test_endpoint GET "/receipts/export" "$ADMIN_KEY" "200" "Export (admin)"

echo ""
echo "=========================================="
if [[ $FAILED -eq 0 ]]; then
  echo -e "${GREEN}RBAC TEST PASSED${NC}"
else
  echo -e "${RED}RBAC TEST FAILED${NC}"
fi
echo "=========================================="
echo "Passed: $PASSED"
echo "Failed: $FAILED"

if [[ $FAILED -gt 0 ]]; then
  echo ""
  echo "Failed tests:"
  for t in "${TESTS[@]}"; do
    echo "  - $t"
  done
  exit 1
fi
