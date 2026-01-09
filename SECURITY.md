# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.5.x   | :white_check_mark: |
| < 0.5   | :x:                |

## Reporting a Vulnerability

Please report security vulnerabilities to security@authensor.dev (or your security contact).

Do NOT open public GitHub issues for security vulnerabilities.

## Known Audit Warnings

The following vulnerabilities are in **development-only** dependencies and do not affect production runtime:

### fast-json-patch (high severity)
- **Package**: `fast-json-patch@2.2.1`
- **Path**: `packages/schemas > ajv-cli > fast-json-patch`
- **Issue**: Prototype pollution vulnerability
- **Why it's acceptable**: `ajv-cli` is only used at build time to compile JSON schemas. It is never included in production bundles.
- **Tracking**: https://github.com/advisories/GHSA-8gh8-hqwg-xf34

### esbuild (moderate severity)
- **Package**: `esbuild@0.18.x - 0.19.x`
- **Path**: `packages/control-plane > drizzle-kit > esbuild`
- **Issue**: Dev server allows cross-origin requests
- **Why it's acceptable**: `drizzle-kit` is only used for database migrations at development time. The vulnerable component (esbuild's dev server) is never exposed in production.
- **Tracking**: https://github.com/advisories/GHSA-67mh-4wv8-2f99

## Runtime Security Measures

1. **API Key Hashing**: All API keys are SHA-256 hashed before storage
2. **Constant-Time Comparison**: Token validation uses `crypto.timingSafeEqual`
3. **SSRF Protection**: HTTP tool blocks private IPs and follows safe redirect policy
4. **Secret Redaction**: Sensitive fields are redacted in receipt viewers and exports
5. **CSP Headers**: All HTML views have strict Content-Security-Policy
6. **Rate Limiting**: Token-scoped rate limits prevent abuse
7. **Atomic Claims**: Database-level constraints prevent race conditions

## Security Headers

All HTML endpoints include:
- `Content-Security-Policy: default-src 'none'; ...`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: no-referrer`
- `Cache-Control: no-store`
- `X-Robots-Tag: noindex`

## Production Checklist

Before going to production:

- [ ] Set `AUTHENSOR_SANDBOX_MODE=real` (only when ready)
- [ ] Configure tool-specific allowlists (GITHUB_ALLOWED_REPOS, etc.)
- [ ] Review API key roles and revoke any test keys
- [ ] Enable rate limiting (`AUTHENSOR_RL_*_PER_MIN`)
- [ ] Configure CORS appropriately for your domain
- [ ] Ensure `TRUST_PROXY=true` if behind a reverse proxy
- [ ] Review and test your policies

*Last updated: 2026-01-03*
