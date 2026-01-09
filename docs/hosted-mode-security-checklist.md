# Hosted-Mode Security Checklist

Verification checklist for Authensor control plane security posture.
Run this before giving any tenant access to credentials.

**Last verified:** ____________
**Verified by:** ____________
**Tenant:** ____________

---

## 1. Bootstrap Lock (Safe-by-Default)

When no API keys exist and no bootstrap token is set, the system should be locked down.

### Test: Verify 503 on protected endpoints

```bash
# Clear all keys (test environment only!)
# Then restart control plane without AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN

# Should return 503 BOOTSTRAP_REQUIRED
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/evaluate
# Expected: 503

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/receipts
# Expected: 503

curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/policies
# Expected: 503
```

### Test: Verify /health still works

```bash
curl -s http://localhost:3000/health
# Expected: {"status":"ok"}
```

- [ ] **PASS:** Protected endpoints return 503 when no keys exist
- [ ] **PASS:** /health returns 200

---

## 2. Authentication Enforcement

### Test: 401 without valid key

```bash
# No auth header
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/receipts
# Expected: 401

# Invalid key
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/receipts \
  -H "Authorization: Bearer invalid_key_here"
# Expected: 401
```

### Test: Revoked keys rejected

```bash
# Revoke a key (as admin)
curl -X DELETE "http://localhost:3000/keys/$KEY_ID" \
  -H "Authorization: Bearer $ADMIN_KEY"

# Try to use revoked key
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/receipts \
  -H "Authorization: Bearer $REVOKED_KEY"
# Expected: 401
```

- [ ] **PASS:** Requests without auth return 401
- [ ] **PASS:** Requests with invalid keys return 401
- [ ] **PASS:** Revoked keys return 401

---

## 3. Authorization (Role-Based Access)

### Test: Ingest role restrictions

```bash
# Ingest can POST /evaluate
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/evaluate \
  -H "Authorization: Bearer $INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"test","timestamp":"2024-01-01T00:00:00Z","action":{"type":"test","resource":"test"},"principal":{"type":"agent","id":"test"},"context":{"environment":"development"}}'
# Expected: 200

# Ingest CANNOT access receipts
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/receipts/some-id \
  -H "Authorization: Bearer $INGEST_KEY"
# Expected: 403

# Ingest CANNOT access metrics
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/metrics/summary \
  -H "Authorization: Bearer $INGEST_KEY"
# Expected: 403

# Ingest CANNOT access controls
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/controls \
  -H "Authorization: Bearer $INGEST_KEY"
# Expected: 403
```

### Test: Executor role restrictions

```bash
# Executor can claim receipts
curl -s -o /dev/null -w "%{http_code}" -X POST "http://localhost:3000/receipts/$RECEIPT_ID/claim" \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: 200 or 409 (already claimed)

# Executor can GET controls
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/controls \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: 200

# Executor CANNOT POST policies
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/policies \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: 403

# Executor CANNOT manage keys
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/keys \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: 403
```

- [ ] **PASS:** Ingest restricted to POST /evaluate only
- [ ] **PASS:** Executor restricted to claim/finalize + read controls
- [ ] **PASS:** Admin has full access

---

## 4. Receipt Viewer Access Control

### Test: Viewer endpoints require admin

```bash
# Admin can view receipt
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/receipts/$RECEIPT_ID/view" \
  -H "Authorization: Bearer $ADMIN_KEY"
# Expected: 200

# Non-admin cannot view receipt
curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000/receipts/$RECEIPT_ID/view" \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: 403
```

- [ ] **PASS:** Receipt viewer requires admin role

---

## 5. Metrics Access Control

### Test: Metrics summary requires admin

```bash
# Admin can access metrics
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/metrics/summary \
  -H "Authorization: Bearer $ADMIN_KEY"
# Expected: 200

# Ingest cannot access metrics
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/metrics/summary \
  -H "Authorization: Bearer $INGEST_KEY"
# Expected: 403
```

- [ ] **PASS:** Metrics endpoints require admin role

---

## 6. Rate Limiting

### Test: Rate limit headers present

```bash
curl -sI http://localhost:3000/receipts \
  -H "Authorization: Bearer $ADMIN_KEY" | grep -i ratelimit
# Expected:
#   x-ratelimit-limit: ...
#   x-ratelimit-remaining: ...
#   x-ratelimit-reset: ...
```

### Test: Rate limit enforced

```bash
# Hammer the endpoint (adjust limit as needed)
for i in {1..200}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/evaluate \
    -H "Authorization: Bearer $INGEST_KEY" \
    -H "Content-Type: application/json" \
    -d '{"id":"'$i'","timestamp":"2024-01-01T00:00:00Z","action":{"type":"test","resource":"test"},"principal":{"type":"agent","id":"test"},"context":{"environment":"development"}}')
  if [[ "$STATUS" == "429" ]]; then
    echo "Rate limited after $i requests"
    break
  fi
done
# Expected: Eventually returns 429
```

- [ ] **PASS:** Rate limit headers present
- [ ] **PASS:** Rate limit enforced (429 returned)

---

## 7. Kill Switch (Execution Controls)

### Test: Enable kill switch

```bash
# Enable kill switch (as admin)
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_execution": true}'
# Expected: 200
```

### Test: Claim blocked when kill switch enabled

```bash
# Create a new receipt
EVAL=$(curl -s -X POST http://localhost:3000/evaluate \
  -H "Authorization: Bearer $INGEST_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-'$RANDOM'","timestamp":"2024-01-01T00:00:00Z","action":{"type":"test","resource":"test"},"principal":{"type":"agent","id":"test"},"context":{"environment":"development"}}')
RECEIPT_ID=$(echo "$EVAL" | grep -o '"receiptId":"[^"]*"' | sed 's/"receiptId":"//;s/"$//')

# Try to claim - should be blocked
curl -s -X POST "http://localhost:3000/receipts/$RECEIPT_ID/claim" \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: 403 with EXECUTION_DISABLED
```

### Test: Disable kill switch

```bash
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_execution": false}'
# Expected: 200
```

- [ ] **PASS:** Kill switch blocks claims when enabled
- [ ] **PASS:** Kill switch can be disabled

---

## 8. Tool-Specific Controls

### Test: Disable HTTP tool

```bash
# Disable HTTP tool
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_http": true}'

# Check that it's blocked
curl -s "http://localhost:3000/controls/check?tool=http_request" \
  -H "Authorization: Bearer $EXECUTOR_KEY"
# Expected: {"allowed":false,"code":"TOOL_DISABLED","message":"HTTP tool is disabled"}

# Re-enable
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"disable_http": false}'
```

- [ ] **PASS:** Per-tool disable works for HTTP
- [ ] **PASS:** Per-tool disable works for Stripe
- [ ] **PASS:** Per-tool disable works for GitHub

---

## 9. No Sensitive Data in Errors

### Test: API keys not leaked in error messages

```bash
# Trigger various errors and check responses
curl -s http://localhost:3000/nonexistent | grep -i key
# Expected: No key values in response

curl -s -X POST http://localhost:3000/evaluate \
  -H "Authorization: Bearer invalid" | grep -i key
# Expected: No key values in response
```

- [ ] **PASS:** Error responses don't leak API keys

---

## 10. Startup Warning Check

### Test: Warning logged when bootstrap required

Check server logs after starting with no keys and no bootstrap token:

```
=========================================================
  BOOTSTRAP REQUIRED
=========================================================
  No API keys exist and AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN is not set.
  All endpoints except /health will return 503.

  To initialize:
    1. Set AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN env var
    2. POST /keys with Authorization: Bearer <token>
=========================================================
```

- [ ] **PASS:** Startup warning displayed when bootstrap required

---

## Summary

| Check | Status |
|-------|--------|
| Bootstrap lock | [ ] |
| Authentication | [ ] |
| Authorization | [ ] |
| Receipt viewer | [ ] |
| Metrics access | [ ] |
| Rate limiting | [ ] |
| Kill switch | [ ] |
| Tool controls | [ ] |
| Error safety | [ ] |
| Startup warning | [ ] |

**Overall Status:** [ ] PASS / [ ] FAIL

**Notes:**

---

**Sign-off:**

Date: ____________
Name: ____________
