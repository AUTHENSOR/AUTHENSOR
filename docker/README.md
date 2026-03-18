# Authensor Control Plane - Docker

The Authensor Control Plane is the HTTP API server for the open-source AI agent safety stack. It wraps the policy engine, Aegis content safety scanner, Sentinel real-time monitor, and a cryptographic audit trail into a single service backed by PostgreSQL.

## Quick Start

```bash
cp .env.example .env
# Edit .env -- at minimum set AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN

docker compose up -d
```

The API will be available at `http://localhost:3000`. Verify with:

```bash
curl http://localhost:3000/health
```

## First-Run Bootstrap

On the first run, no API keys exist. Set `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` in your `.env` file, then create your first admin key:

```bash
curl -X POST http://localhost:3000/keys \
  -H "Authorization: Bearer <your-bootstrap-token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "admin", "role": "admin"}'
```

Save the returned key. Remove `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` from your `.env` and restart.

## Pull from Docker Hub

```bash
docker pull authensor/control-plane:latest
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | (set by compose) | PostgreSQL connection string |
| `PORT` | `3000` | HTTP listen port |
| `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` | (none) | One-time token for creating the first admin key |
| `AUTHENSOR_AEGIS_ENABLED` | `false` | Enable Aegis content safety scanning |
| `AUTHENSOR_AEGIS_MODE` | `warn` | Aegis mode: `block`, `redact`, or `warn` |
| `AUTHENSOR_SENTINEL_ENABLED` | `true` | Enable Sentinel real-time monitoring |
| `AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL` | (none) | Webhook for Sentinel alerts |
| `AUTHENSOR_SENTINEL_ALERT_WEBHOOK_SECRET` | (none) | HMAC secret for Sentinel webhooks |
| `AUTHENSOR_ALLOW_FALLBACK_POLICY` | `false` | Allow fallback when no policy matches |
| `AUTHENSOR_SHADOW_POLICY_ID` | (none) | Policy ID for shadow-mode evaluation |
| `AUTHENSOR_STRICT_PRINCIPAL_BINDING` | `false` | Reject mismatched principal/key pairs |
| `AUTHENSOR_SKIP_DEFAULT_POLICY` | (none) | Skip auto-provisioning default policy |
| `AUTHENSOR_TOCTOU_REEVALUATE` | `true` | Re-evaluate policy at claim time |
| `AUTHENSOR_TRANSPARENCY_ENABLED` | `false` | Enable transparency log endpoint |
| `AUTHENSOR_APPROVAL_WEBHOOK_URL` | (none) | Webhook for approval requests |
| `AUTHENSOR_APPROVAL_WEBHOOK_SECRET` | (none) | HMAC secret for approval webhooks |
| `AUTHENSOR_APPROVAL_EXPIRY_INTERVAL_MS` | `60000` | Approval expiry check interval (ms) |
| `AUTHENSOR_POLICY_ALERT_WEBHOOK_URL` | (none) | Webhook for policy deny alerts |
| `AUTHENSOR_POLICY_ALERT_WEBHOOK_SECRET` | (none) | HMAC secret for policy alert webhooks |
| `AUTHENSOR_RL_INGEST_PER_MIN` | `120` | Rate limit for ingest role (req/min) |
| `AUTHENSOR_RL_EXECUTOR_PER_MIN` | `60` | Rate limit for executor role (req/min) |
| `AUTHENSOR_RL_ADMIN_PER_MIN` | `120` | Rate limit for admin role (req/min) |
| `AUTHENSOR_RATE_LIMIT_WEBHOOK_URL` | (none) | Webhook when rate limit is hit |
| `AUTHENSOR_RATE_LIMIT_WEBHOOK_SECRET` | (none) | HMAC secret for rate-limit webhooks |
| `AUTHENSOR_MAX_REQUEST_BYTES` | `256000` | Max request body size (bytes) |
| `AUTHENSOR_MAX_RESULT_BYTES` | `128000` | Max result body size (bytes) |
| `AUTHENSOR_SESSION_TTL_MS` | `3600000` | Session TTL (ms) |
| `AUTHENSOR_SESSION_MAX_HISTORY` | `1000` | Max history entries per session |
| `AUTHENSOR_CLAIM_TTL_SECONDS` | `30` | Receipt claim token TTL (seconds) |
| `AUTHENSOR_OTEL_ENABLED` | `false` | Enable OpenTelemetry tracing |
| `TRUST_PROXY` | `false` | Trust X-Forwarded-For headers |
| `AUTHENSOR_SANDBOX_MODE` | (none) | Bypass auth (dev/testing only) |

See `.env.example` for descriptions of each variable.

## Volumes

The `pgdata` volume persists PostgreSQL data across container restarts. To reset:

```bash
docker compose down -v
```

## Health Check

The API container runs a built-in health check against `GET /health` every 10 seconds.

## Full Documentation

https://authensor.com/docs

## License

MIT
