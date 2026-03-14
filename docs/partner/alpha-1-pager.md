# Authensor Alpha Program

## What Authensor Is

Authensor is a **policy-enforced execution layer for AI agents**. Every action your AI agent takes is:

1. **Evaluated** against configurable policies before execution
2. **Claimed** with exactly-once execution guarantees
3. **Receipted** with full audit trail (who, what, when, why)

Think of it as a programmable approval + audit layer between your AI and external APIs.

---

## What You Get in Alpha

### Core Capabilities

| Capability | What It Does |
|------------|--------------|
| **Policy Engine** | Deny, allow, or require approval for actions based on rules you define |
| **Execution Gating** | Claims ensure no duplicate API calls; idempotency keys built-in |
| **Audit Receipts** | Every action produces a receipt with decision rationale, execution result, and timestamps |
| **Kill Switch** | Instantly disable all execution or specific tools (HTTP, Stripe, GitHub) |
| **Sandbox Mode** | Test workflows without making real API calls |

### Pre-Built Integrations

| Tool | Safety Features |
|------|-----------------|
| **HTTP** | SSRF protection, redirect blocking, domain allowlisting |
| **GitHub** | Repo/org allowlisting, rate limit mapping, token redaction |
| **Stripe** | Test-mode default, amount bounds, idempotency via receipts |

### What's Included

- Self-hosted deployment via Docker Compose (recommended), or managed hosted tier
- API keys for ingest, executor, and admin roles
- Receipt viewer (HTML dashboard)
- Metrics summary endpoint
- Weekly sync with Authensor team

---

## Alpha Expectations

### From You

- [ ] Deploy one AI workflow through Authensor
- [ ] Create at least one custom policy
- [ ] Weekly 30-minute sync to share feedback
- [ ] Permission to quote (anonymized) for case studies

### From Us

- [ ] < 2 hour response time on support questions
- [ ] Same-day resolution for blocking issues
- [ ] Weekly metrics review together
- [ ] Feature requests considered for roadmap

---

## How It Works

```
Your AI Agent                    Authensor                      External API
     │                              │                               │
     │──── POST /evaluate ─────────▶│                               │
     │                              │ Policy check                  │
     │◀─── receiptId + decision ────│                               │
     │                              │                               │
     │──── POST /claim ────────────▶│                               │
     │◀─── claimId (one winner) ────│                               │
     │                              │                               │
     │                              │──── Execute with idempotency ─▶│
     │                              │◀─── Result ───────────────────│
     │                              │                               │
     │──── PATCH (finalize) ───────▶│                               │
     │◀─── Receipt complete ────────│                               │
```

---

## Getting Started

1. **Receive credentials** (admin, ingest, executor API keys)
2. **Run smoke test** (`./scripts/smoke_tenant.sh`)
3. **Enable sandbox mode** for initial testing
4. **Define your first workflow** (we'll help!)
5. **Create policies** for your use case
6. **Graduate to constrained real mode** when ready

---

## Pricing

**Alpha is free.** We're looking for partners who will:
- Push the boundaries of what's possible
- Give candid feedback on what works and what doesn't
- Help us build the right product

Post-alpha pricing will be usage-based (receipts/month). Alpha partners get preferred terms.

---

## Contact

- **Support:** [support email/slack]
- **Weekly sync:** Scheduled after onboarding
- **Emergency:** [phone/pager]

---

*Authensor Alpha v1.0 | Updated [DATE]*
