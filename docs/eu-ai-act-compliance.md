# EU AI Act Compliance Guide — Authensor

This document maps Authensor's features to the EU AI Act requirements relevant to AI agent systems. The **August 2, 2026** deadline for Annex III high-risk AI systems makes this compliance mapping urgent for any team deploying agents in EU markets.

**Penalties**: Up to 35M EUR or 7% of global annual turnover for prohibited AI violations; up to 15M EUR or 3% for non-compliance with high-risk obligations.

---

## Article 12: Record-Keeping (Logging)

**Requirement**: High-risk AI systems must automatically record events (logs) over their lifetime, enabling traceability. Logs must capture enough to identify malfunctions, performance drift, and must be tamper-resistant. Minimum retention: 6 months.

**Authensor Implementation**:

| Requirement | Feature | Details |
|-------------|---------|---------|
| Automatic event recording | Receipt chain | Every action creates a structured receipt with full provenance — no manual logging required |
| Traceability | `envelopeId` + `parentReceiptId` | Complete delegation chains from user intent to final action, including cross-agent tracing via `GET /receipts/:id/chain` |
| Tamper resistance | Hash-chained receipts | `prev_receipt_hash` field creates a SHA-256 chain; any modification breaks the chain and is detectable |
| Third-party attestation | Sigstore/Rekor transparency | Optional publishing of receipt hashes to Sigstore's public transparency log — provides independent, immutable proof that logs haven't been retroactively modified |
| Decision provenance | `policyId` + `policyVersion` + `matchedRules` | Every receipt records exactly which policy version and which rules produced the decision |
| Content safety logging | Aegis scan results | Pre-evaluation content safety scans (prompt injection, PII, memory poisoning) are recorded alongside each receipt |
| Malfunction identification | `status` + `execution.error` | Failed actions are recorded with error details and duration |
| Anomaly detection | Sentinel monitoring | EWMA/CUSUM-based anomaly detection tracks per-agent baselines and flags behavioral drift — creating automatic audit entries when malfunctions are detected |
| Retention | PostgreSQL persistence | Receipts are stored indefinitely; configurable retention policies for compliance |

**Receipt fields that directly satisfy Article 12**:
```json
{
  "id": "receipt-uuid",
  "envelopeId": "original-action-uuid",
  "timestamp": "2026-03-13T10:00:00Z",
  "decision": {
    "outcome": "allow",
    "policyId": "prod-eu-policy",
    "policyVersion": "3.1.0",
    "matchedRules": [{ "ruleId": "r-42", "ruleName": "allow-read-ops", "effect": "allow" }],
    "reason": "Matched rule: allow-read-ops for read operations under 1000 records"
  },
  "status": "executed",
  "execution": { "durationMs": 230, "result": { "recordsReturned": 47 } }
}
```

---

## Article 14: Human Oversight

**Requirement**: High-risk AI systems must be designed for effective human oversight, including the ability to detect anomalies, avoid automation bias, and intervene/interrupt via stop buttons or override mechanisms.

**Authensor Implementation**:

| Requirement | Feature | Details |
|-------------|---------|---------|
| Effective oversight | `require_approval` decision | Policy rules can mandate human approval for any action type, parameter range, or context |
| Anomaly detection | Sentinel real-time monitoring | Per-agent behavioral baselines (EWMA/CUSUM) detect deny rate spikes, latency anomalies, and unusual action patterns — firing alerts before human oversight is needed |
| Avoid automation bias | Multi-party approval | `approvers_required: N` prevents single-person rubber-stamping |
| Temporal consistency | TOCTOU re-evaluation | When approved actions are claimed for execution, they are re-evaluated against the *current* policy — prevents stale approvals from executing under changed conditions |
| Policy validation | Shadow/canary evaluation | Test new policies alongside production policies before enforcement — builds confidence in policy changes without risking agent disruption |
| Intervene/interrupt | Kill switch | `POST /controls` instantly halts all agent execution globally |
| Stop button | Per-tool disable | Individual tools can be disabled without affecting others via controls API |
| Override mechanism | Approval reject/expire | Pending approvals can be rejected or expired, cancelling the action |
| Budget controls | Per-principal spending limits | Daily/weekly/monthly spend caps with per-action cost limits prevent unbounded resource consumption |

**Approval workflow for Article 14 compliance**:
```
Agent wants to act
       ↓
Policy evaluation → require_approval
       ↓
Notification sent (SMS/Slack/email/webhook)
       ↓
Human reviews action details + context
       ↓
Approve → action executes, receipt finalized
Reject  → action cancelled, receipt records rejection
Expire  → action cancelled after timeout
```

---

## Article 9: Risk Management System

**Requirement**: Continuous risk management system throughout the AI system lifecycle.

**Authensor Implementation**:

| Requirement | Feature |
|-------------|---------|
| Risk identification | Policy engine evaluates every action against configurable risk rules |
| Risk estimation | Receipt analytics: frequency, error rates, approval rates per tool/agent |
| Risk mitigation | Rate limiting, budget controls, parameter constraints, approval workflows |
| Continuous monitoring | Sentinel real-time monitoring with EWMA/CUSUM anomaly detection provides automated surveillance of agent behavior patterns |
| Content safety | Aegis pre-evaluation scanning: 15+ prompt injection rules, 22 memory poisoning rules, PII detection, multimodal safety |
| Session-level risk | Session risk scoring with cumulative weights and forbidden sequence detection catches multi-step attack patterns |
| Residual risk documentation | Receipts with `deny` or `rate_limited` outcomes document risks that were caught |

---

## Article 13: Transparency

**Requirement**: High-risk AI systems must provide sufficient transparency for users to interpret outputs and use appropriately.

**Authensor Implementation**:

| Requirement | Feature |
|-------------|---------|
| Decision explanation | `decision.reason` in every receipt explains why an action was allowed or denied |
| Rule traceability | `matchedRules` array shows exactly which policy rules applied |
| Policy versioning | `policyVersion` enables before/after comparison when rules change |
| Shadow evaluation transparency | Shadow results included in evaluate responses show how alternative policies would have decided — enabling transparent policy iteration |
| Public verifiability | Sigstore/Rekor transparency log publishing enables third-party verification of receipt integrity |
| Audit export | Receipts are queryable via API with filters for status, principal, tool, and decision outcome |

---

## Conformity Assessment (Article 43)

Most Annex III high-risk systems allow internal self-assessment (Annex VI). Authensor provides the evidence needed:

| Evidence Required | Authensor Source |
|-------------------|-----------------|
| System description | Action envelope schema + policy definitions |
| Risk management documentation | Receipt chain with decision provenance + Aegis scan results |
| Human oversight procedures | Approval workflow configuration + multi-party approval receipts + TOCTOU re-evaluation logs |
| Logging capabilities | Receipt API + hash-chain verification + Sigstore transparency log attestations |
| Testing results | 924+ automated tests + red team harness (100+ scenarios) |
| Post-market monitoring plan | Sentinel anomaly detection + receipt analytics + rate limit webhooks + kill switch |
| Content safety evidence | Aegis scan records: prompt injection attempts detected, PII flagged, memory poisoning blocked |

---

## Implementation Checklist

For teams deploying agents in EU markets before August 2, 2026:

- [ ] Deploy Authensor control plane with `AUTHENSOR_ALLOW_FALLBACK_POLICY=false` (fail-closed)
- [ ] Enable Aegis content safety scanning (`AUTHENSOR_AEGIS_ENABLED=true`)
- [ ] Enable Sentinel real-time monitoring (`AUTHENSOR_SENTINEL_ENABLED=true`)
- [ ] Create policies with `require_approval` for all high-consequence action types
- [ ] Configure multi-party approval (`approvers_required: N`) for critical actions
- [ ] Enable hash-chained receipts for tamper-evident audit trail
- [ ] Enable Sigstore transparency log (`AUTHENSOR_TRANSPARENCY_ENABLED=true`) for third-party attestation
- [ ] Configure TOCTOU re-evaluation (`AUTHENSOR_TOCTOU_REEVALUATE=true`) to prevent stale approvals
- [ ] Set up budget enforcement with daily/weekly/monthly spend limits per principal
- [ ] Configure session rules with forbidden sequences for multi-step attack prevention
- [ ] Configure receipt retention policy (minimum 6 months, recommend 12-24 months)
- [ ] Set up kill switch and per-tool circuit breakers via controls API
- [ ] Configure rate limiting appropriate to your workload
- [ ] Set up approval notification channels (SMS/Slack/email)
- [ ] Use shadow evaluation to test policy changes before enforcement
- [ ] Document your risk management process using receipt analytics + Sentinel alerts
- [ ] Run safeclaw-redteam scenarios against your deployment
- [ ] Export receipts for conformity assessment documentation

---

## Related Standards

Authensor's architecture also supports compliance with:

- **SOC 2**: Immutable audit trail, RBAC, rate limiting, access logging
- **SOX**: Segregation of duties (approval workflows), 7-year retention support
- **HIPAA**: Action-level audit logging, access controls, BAA-compatible deployment
- **ISO/IEC 42001**: AI management system controls for bias mitigation, transparency, accountability
- **NIST AI RMF**: Govern, Map, Measure, Manage pillars via policies, receipts, and controls
- **GDPR Article 22**: Automated decision-making transparency via receipt provenance
