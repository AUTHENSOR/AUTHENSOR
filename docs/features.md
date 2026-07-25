<!-- Moved out of the top-level README so it stays readable.     The README renders as the AUTHENSOR account profile. -->## Features

### Content Safety (Aegis)

Zero-dependency content scanner that runs *before* policy evaluation:
- **Prompt injection detection**: 15+ heuristic rules
- **Jailbreak detection**: pattern matching for common bypass techniques
- **PII detection**: emails, SSNs, credit cards, phone numbers
- **Memory poisoning detection**: 22 MINJA-informed rules for persistent memory attacks
- **Multimodal safety**: 6 heuristic categories for image/file content
- **Output scanning**: post-execution content validation

### Session Rules

Detect privilege escalation through multi-action patterns:
- **Forbidden sequences**: block `[auth.login, admin.escalate]` chains with glob matching
- **Risk scoring**: cumulative per-session risk with configurable weights
- **Max actions**: cap total actions per session
- **Lookback windows**: configurable history depth for sequence matching

### Budget Enforcement

Per-principal spending limits with period-based resets:
- Daily, weekly, monthly, or yearly periods
- Per-action cost caps
- Alert thresholds at configurable utilization levels
- Budget utilization exposed via OpenTelemetry metrics

### Real-Time Monitoring (Sentinel)

Zero-dependency anomaly detection engine:
- **Per-agent baselines** via EWMA (Exponentially Weighted Moving Average)
- **CUSUM change detection** for gradual behavioral drift
- **Configurable alerts** on deny rate, latency, cost, chain depth, and fan-out
- **Cross-agent chain tracking**: depth and fan-out metrics for delegation chains

### Shadow/Canary Policy Testing

Test new policies alongside active ones without enforcement:
- `?shadow=policy-id` query parameter or `AUTHENSOR_SHADOW_POLICY_ID` env var
- Divergence reports: agreement rate, rule breakdown, per-receipt comparison
- Zero-risk policy migration path

### Transparency & Compliance

- **Hash-chained receipts**: SHA-256 chain makes audit trail tamper-evident
- **Sigstore/Rekor integration**: optional publishing to public transparency log
- **Cross-agent tracing**: `parentReceiptId` links receipts across delegation chains
- **TOCTOU protection**: re-evaluates policy on claim to prevent stale-approval attacks
- **Principal binding**: bind API keys to specific agent identities
- **OpenTelemetry**: spans and metrics for every evaluation
