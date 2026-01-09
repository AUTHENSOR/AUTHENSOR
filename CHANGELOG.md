## [1.5.0-alpha] - 2026-01-08

### Bug Fixes

- **UUID validation on ID routes**: All `:id` route parameters now validate UUID format before database queries, preventing 500 errors from PostgreSQL UUID parse failures (returns 400 with "Invalid receipt ID format")
- **Race condition in claim endpoint**: Fixed atomic claim logic to prevent parallel claim requests from both succeeding. Added `claim_id IS NULL OR claim_expires_at < now()` to UPDATE WHERE clause for true atomicity.
- **Claim cleanup on finalize**: Receipt finalization now clears `claim_expires_at` along with `claim_id` and `claimed_at` to satisfy database constraints.

### Database

- **Claim invariant constraints**: Added `008_claim_constraints.sql` migration with:
  - `claim_requires_expiry`: If `claim_id` is set, `claim_expires_at` must also be set
  - `expiry_requires_claimed_at`: If `claim_expires_at` is set, `claimed_at` must also be set
  - Index `idx_receipts_claimable` for efficient lookup of claimable receipts

### Testing

- **Regression tests**: Added comprehensive regression tests for:
  - UUID validation on all `:id` routes (8 endpoint groups with 8 invalid UUIDs each)
  - Claim race condition (20 parallel claim requests, exactly 1 success)
  - Claim after TTL expiry
  - Double finalization prevention

### Security Hardening

- **Receipt viewer redaction**: Extended sensitive key redaction to include OAuth tokens (`access_token`, `refresh_token`, `id_token`, `jwt`, `bearer`), credentials (`private_key`, `public_key`, `key`, `credentials`, `credential`), session identifiers (`session`, `session_id`, `sessionid`, `csrf`, `csrf_token`), and common auth headers (`x-api-key`, `x-auth-token`, `x-access-token`)
- **CSP headers on HTML views**: Added `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Permissions-Policy` to receipt viewer endpoints
- **Token leakage prevention**: `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex` on all HTML views
- **XSS protection**: All user-supplied data escaped in HTML output
- **Security test suite**: 11 tests covering token restriction, security headers, secret redaction, and XSS protection

### Key Management Enhancements

- **Token prefix display**: API key list now shows `keyPrefix` (e.g., `authensor_abc1...xy9z`) for identification without exposing full tokens
- **Key rotation endpoint**: `POST /keys/:id/rotate` revokes old key and creates new one with same name/role, returns new token once
- **Receipts export**: `GET /receipts/export` returns NDJSON with redacted secrets for data portability

### Documentation

- **Partner Starter Kit**: New `docs/partner/starter-kit.md` with env var reference, role mappings, and curl cheatsheet
- **Operational Safety Defaults**: Documented recommended `AUTHENSOR_SANDBOX_MODE=stub` + optional kill switch for partner onboarding

### Added (Phase 2-4: Partner-Safe Access)

#### Phase 2: API Key Authentication & Role-Based Access Control
- **API Key Authentication**: SHA-256 hashed tokens with constant-time comparison
- **Three roles**: `ingest` (evaluate only), `executor` (claim + execute), `admin` (full access)
- **Key management endpoints**: `POST /keys`, `GET /keys`, `POST /keys/:id/revoke`
- **Bootstrap mode**: When no API keys exist, all requests allowed (for initial setup)
- **Bootstrap admin token**: Set `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` env var to create first admin key on startup
- **Auth headers**: `Authorization: Bearer <token>` or `x-authensor-key: <token>`
- **All endpoints protected** with role-based middleware

#### Phase 3: Sandbox Mode
- **Stubbed execution**: Set `AUTHENSOR_SANDBOX_MODE=stub` for partner-safe testing
- **Deterministic stubs**: Results seeded by `receiptId` for reproducibility
- **All tools supported**: HTTP, Stripe (list/create customers, charges), GitHub (repos, issues, comments)
- **Stub markers**: All responses include `_stub: true` and `_mode: "stub"`
- **Receipt tracking**: `execution.mode` records "stub" or "real" for auditability

#### Phase 4: Kill Switch, Per-Tool Disables, Rate Limits, Hard Caps
- **Kill switch**: `POST /controls` with `disable_execution: true` blocks all claims
- **Per-tool disables**: `disable_http`, `disable_github`, `disable_stripe` in controls
- **Defense-in-depth**: Controls enforced at both control-plane (claim) and MCP server
- **Rate limiting**: Token-scoped, role-aware limits (configurable via `AUTHENSOR_RL_*_PER_MIN`)
- **Hard caps**: Request body size limit (`AUTHENSOR_MAX_REQUEST_BYTES`), result/error truncation
- **429 responses**: Include `retryAfterSeconds` for rate-limited requests
- **Rate limit headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

### Database Migrations
- `005_api_keys.sql`: API keys table with role constraint and revocation support
- `006_controls.sql`: Controls singleton table for kill switch and per-tool disables

### New Endpoints
- `POST /keys` - Create API key (admin only, returns token once)
- `GET /keys` - List API keys (admin only, no hashes exposed)
- `POST /keys/:id/revoke` - Revoke API key (admin only)
- `GET /controls` - Read current controls (executor, admin)
- `POST /controls` - Update controls (admin only)
- `GET /controls/check?tool=<name>` - Check if tool allowed (executor, admin)

### Environment Variables
- `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` - Bootstrap first admin key
- `AUTHENSOR_API_KEY` - API key for MCP server
- `AUTHENSOR_SANDBOX_MODE` - "stub" or "real" (default)
- `AUTHENSOR_RL_INGEST_PER_MIN` - Rate limit for ingest role (default: 120)
- `AUTHENSOR_RL_EXECUTOR_PER_MIN` - Rate limit for executor role (default: 60)
- `AUTHENSOR_RL_ADMIN_PER_MIN` - Rate limit for admin role (default: 120)
- `AUTHENSOR_MAX_REQUEST_BYTES` - Request body size limit (default: 1MB)
- `AUTHENSOR_MAX_RESULT_BYTES` - Result truncation threshold (default: 64KB)
- `AUTHENSOR_MAX_ERROR_BYTES` - Error truncation threshold (default: 16KB)

### Documentation
- Updated `.env.example` with all new environment variables
- Added "Hosted Alpha Authentication" section to `alpha_onboarding.md`
- Added "Kill Switch & Execution Controls" section
- Added "Sandbox Mode" section
- Added "Rate Limiting" section

## [0.1.0-alpha] - 2024-06-01
- Control plane receipts persistence, claim gating, approvals, policies.
- Integration hardening for HTTP (SSRF guard), GitHub (allowlists, rate limits), Stripe (test-mode, idempotency).
- Receipts viewer (HTML + JSON), metrics summary, and alpha onboarding guide.
