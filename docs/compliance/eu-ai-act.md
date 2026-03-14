# EU AI Act Compliance Mapping for Authensor

**Document version**: 1.0
**Last updated**: March 14, 2026
**Applicable regulation**: Regulation (EU) 2024/1689 (EU AI Act)
**Applicable Authensor version**: v1.5.0+

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Regulatory Timeline and Deadlines](#regulatory-timeline-and-deadlines)
3. [Article-by-Article Compliance Mapping](#article-by-article-compliance-mapping)
   - [Article 9 -- Risk Management System](#article-9--risk-management-system)
   - [Article 11 -- Technical Documentation](#article-11--technical-documentation)
   - [Article 12 -- Record-Keeping (Automatic Logging)](#article-12--record-keeping-automatic-logging)
   - [Article 14 -- Human Oversight](#article-14--human-oversight)
   - [Article 15 -- Accuracy, Robustness, and Cybersecurity](#article-15--accuracy-robustness-and-cybersecurity)
   - [Article 17 -- Quality Management System](#article-17--quality-management-system)
   - [Article 43 -- Conformity Assessment](#article-43--conformity-assessment)
4. [Colorado AI Act Mapping](#colorado-ai-act-mapping)
5. [US Federal Regulatory Landscape](#us-federal-regulatory-landscape)
6. [Gap Analysis](#gap-analysis)
7. [Implementation Guide for Compliance Teams](#implementation-guide-for-compliance-teams)
8. [Comparison with Alternatives](#comparison-with-alternatives)
9. [Penalty Framework](#penalty-framework)
10. [Appendix: Schema Reference](#appendix-schema-reference)

---

## Executive Summary

The EU AI Act (Regulation 2024/1689) is the world's first comprehensive AI regulation. For organizations deploying high-risk AI systems -- including AI agents that make autonomous decisions in healthcare, finance, employment, law enforcement, and critical infrastructure -- compliance is mandatory.

**The high-risk deadline is August 2, 2026.** Non-compliance carries penalties of up to EUR 35 million or 7% of global annual turnover.

Authensor is purpose-built to satisfy the technical requirements that the EU AI Act imposes on high-risk AI systems. This document provides an article-by-article mapping between EU AI Act requirements and specific Authensor features, schema fields, and API endpoints.

### What Authensor Covers

| EU AI Act Requirement | Authensor Feature | Coverage |
|---|---|---|
| Risk management (Art. 9) | Fail-closed policy engine, content safety scanning | **Full** |
| Technical documentation (Art. 11) | JSON Schema-driven architecture, exported types | **Substantial** |
| Automatic logging (Art. 12) | Hash-chained receipts, NDJSON export | **Full** |
| Human oversight (Art. 14) | Multi-party approval workflows with quorum | **Full** |
| Accuracy & robustness (Art. 15) | Aegis content scanner, Sentinel anomaly detection | **Substantial** |
| Quality management (Art. 17) | Policy versioning, rate limiting, kill switch | **Partial** |
| Conformity assessment (Art. 43) | Audit trail export, chain verification | **Substantial** |

### What Needs Additional Tooling

- Model training documentation and data governance (Art. 10)
- Bias testing and fairness metrics (Art. 10, Art. 15)
- User-facing transparency disclosures (Art. 13)
- Full QMS process documentation (Art. 17 procedural requirements)
- CE marking and EU Declaration of Conformity (Art. 47-49)

---

## Regulatory Timeline and Deadlines

| Date | Milestone | Impact |
|---|---|---|
| Aug 1, 2024 | EU AI Act entered into force | -- |
| Feb 2, 2025 | Prohibited AI practices apply | Immediate |
| Feb 2, 2026 | Article 6 guidance (missed by Commission) | Uncertainty for classification |
| **Jun 30, 2026** | **Colorado AI Act enforcement begins** | US state law |
| **Aug 2, 2026** | **High-risk AI system obligations apply** | Full compliance required |
| Aug 2, 2027 | Obligations for Annex I AI systems | Extended scope |
| Dec 9, 2026 | EU Product Liability Directive transposition | Strict liability for AI |
| Dec 2027 | Possible extended deadline (Digital Omnibus proposal) | Under negotiation |

**Key context**: The European Commission missed its February 2, 2026 deadline to publish Article 6 classification guidance. Agent-specific guidance does not yet exist -- AI agents are classified under existing AI system categories based on their domain of deployment.

---

## Article-by-Article Compliance Mapping

### Article 9 -- Risk Management System

**Requirement**: High-risk AI systems shall have a risk management system established, implemented, documented, and maintained as a continuous iterative process throughout the entire lifecycle.

**Specific obligations** (Art. 9(2)):
- Identification and analysis of known and reasonably foreseeable risks
- Estimation and evaluation of risks from intended use and foreseeable misuse
- Adoption of risk management measures

#### Authensor Implementation

**1. Fail-Closed Policy Engine** (`@authensor/engine`)

The policy engine defaults to DENY when no policy is configured or no rules match. This is the foundational risk management posture -- an agent cannot act without explicit authorization.

- **Schema field**: `policy.defaultEffect` defaults to `"deny"` (`packages/schemas/src/policy.schema.json`, line 160)
- **Engine behavior**: `PolicyEngine.evaluate()` returns `deny` with reason `"No matching policy found (fail-closed)"` when no policies match (`packages/engine/src/policy-engine.ts`, line 99-104)
- **Control plane enforcement**: When `AUTHENSOR_ALLOW_FALLBACK_POLICY` is not `"true"`, the evaluate route returns a deny decision with reason `NO_POLICY_CONFIGURED` and fires a webhook alert (`packages/control-plane/src/routes/evaluate.ts`, lines 113-132)

**2. Policy-Based Risk Rules**

Policies encode risk management decisions as versioned, auditable rules:

```json
{
  "id": "high-risk-agent-policy",
  "name": "Financial Agent Controls",
  "version": "2.1.0",
  "rules": [
    {
      "id": "block-large-transactions",
      "effect": "deny",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "stripe.charges.create" },
          { "field": "constraints.maxAmount", "operator": "gt", "value": 10000 }
        ]
      },
      "description": "Block transactions exceeding EUR 10,000 without human review"
    },
    {
      "id": "require-approval-for-payments",
      "effect": "require_approval",
      "approvalConfig": {
        "approvers": [{ "type": "user", "id": "finance-lead" }],
        "requiredApprovals": 2,
        "expiresIn": "4h"
      },
      "condition": {
        "field": "action.type", "operator": "startsWith", "value": "stripe."
      }
    }
  ],
  "defaultEffect": "deny"
}
```

- **API endpoint**: `POST /policies` (admin only) -- create versioned policies
- **API endpoint**: `POST /policies/active` -- activate a specific policy version
- **API endpoint**: `GET /policies` -- list all policies with active pointer
- **Schema**: `packages/schemas/src/policy.schema.json`

**3. Content Safety Scanning** (`@authensor/aegis`)

Aegis provides automated risk identification across five detector categories:

| Detector | Risk Category | Rule Count | EU AI Act Relevance |
|---|---|---|---|
| `injection` | Prompt injection, jailbreak attempts | 17+ rules | Adversarial robustness (Art. 15) |
| `pii` | Personal data exposure | SSN, email, phone, etc. | GDPR intersection |
| `credentials` | API keys, tokens, passwords | Regex-based | Security risk |
| `exfiltration` | DNS exfil, SSRF, data tunneling | URL/IP patterns | Data leakage risk |
| `code_safety` | Dangerous code patterns | Shell injection, eval | Execution risk |

- **API endpoint**: `POST /aegis/scan` -- scan arbitrary content
- **API endpoint**: `GET /aegis/stats` -- scanning statistics
- **Integration**: Automatically runs on every `POST /evaluate` call when `AUTHENSOR_AEGIS_ENABLED=true`
- **Modes**: `block` (deny on critical threat), `redact` (mask sensitive data), `warn` (log only)
- **Source**: `packages/aegis/src/scanner.ts`

**4. Rate Limiting**

Per-rule rate limiting prevents runaway agent behavior:

- **Schema field**: `policy.rules[].rateLimit` with `requests`, `window`, and `scope` (principal/action/global)
- **Engine behavior**: Rate limit state is injected into the pure engine via `getRateLimitState` callback
- **Decision outcome**: `rate_limited` recorded in receipt

**5. Kill Switch and Execution Controls**

Emergency shutdown capabilities for risk mitigation:

- **API endpoint**: `POST /controls` -- toggle `disableExecution`, `disableHttp`, `disableGithub`, `disableStripe`
- **API endpoint**: `GET /controls/check?tool=<name>` -- check if tool is allowed
- **Behavior**: When kill switch is active, all executions are blocked regardless of policy

**Compliance summary for Art. 9**:
- Risk identification: Aegis content scanning + Sentinel anomaly detection
- Risk evaluation: Policy engine with conditional rules and priority ordering
- Risk mitigation: Fail-closed default, rate limiting, kill switch, approval workflows
- Continuous process: Policy versioning, metrics dashboard, real-time monitoring

---

### Article 11 -- Technical Documentation

**Requirement**: Technical documentation shall be drawn up before the system is placed on the market or put into service and shall be kept up to date. It shall demonstrate that the high-risk AI system complies with the requirements of this Section.

**Specific obligations** (Annex IV):
- General description of the AI system
- Detailed description of elements and development process
- Information about monitoring, functioning, and control
- Description of the risk management system
- Description of post-market monitoring

#### Authensor Implementation

**1. Schema-Driven Architecture**

All Authensor data structures are defined as JSON Schema (Draft 07), serving as machine-readable technical documentation:

| Schema | Location | What It Documents |
|---|---|---|
| `action-envelope.schema.json` | `packages/schemas/src/` | Every action an agent can request |
| `policy.schema.json` | `packages/schemas/src/` | Complete policy evaluation model |
| `action-receipt.schema.json` | `packages/schemas/src/` | Decision records with hash chain |

These schemas are the **source of truth** for all TypeScript types (generated via `pnpm gen:check`), ensuring documentation and implementation can never drift apart.

**2. Versioned Policies as Documentation**

Every policy has:
- `id`: Unique identifier
- `name`: Human-readable description
- `version`: Semantic versioning (`"2.1.0"`)
- `description`: What the policy does
- `rules[].description`: What each rule enforces

Policy versions are stored in PostgreSQL with timestamps, creating a complete history of risk management decisions.

**3. Envelope and Receipt Traceability**

Every action envelope includes:
- `action.type`: Machine-readable action identifier (e.g., `stripe.charges.create`)
- `action.resource`: Target resource
- `action.operation`: CRUDE operation type
- `principal.type`: Whether the actor is a user, agent, service, or system
- `context.traceId`: Distributed trace ID for observability
- `context.environment`: Deployment environment

Every receipt records:
- `decision.policyId`: Which policy made the decision
- `decision.policyVersion`: Which version of the policy was active
- `decision.matchedRules[]`: Which specific rules matched
- `decision.reason`: Human-readable explanation

**Compliance summary for Art. 11**:
- System description: JSON Schemas define the complete data model
- Development process: Open-source codebase with full git history
- Monitoring capabilities: Sentinel monitoring, metrics dashboard
- Risk management: Documented policies with version history
- **Gap**: Annex IV requires model training documentation -- Authensor does not cover this (it operates at the agent orchestration layer, not the model layer)

---

### Article 12 -- Record-Keeping (Automatic Logging)

**Requirement**: High-risk AI systems shall technically allow for the automatic recording of events (logs) over the lifetime of the system. The logging capabilities shall conform to recognised standards or common specifications.

**Specific obligations** (Art. 12(2)):
- Recording of the period of each use (start/end date and time, reference database)
- Input data for which the search has led to a match
- Identification of natural persons involved in the verification of results

This is Authensor's strongest compliance area.

#### Authensor Implementation

**1. Hash-Chained Receipt Trail**

Every policy evaluation produces an immutable `ActionReceipt`:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "envelopeId": "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
  "timestamp": "2026-03-14T10:30:00.000Z",
  "decision": {
    "outcome": "allow",
    "evaluatedAt": "2026-03-14T10:30:00.000Z",
    "policyId": "financial-agent-policy",
    "policyVersion": "2.1.0",
    "reason": "Action permitted by rule: standard-financial-ops",
    "matchedRules": [
      { "ruleId": "standard-ops", "ruleName": "Standard Operations", "effect": "allow" }
    ]
  },
  "status": "executed",
  "execution": {
    "startedAt": "2026-03-14T10:30:00.100Z",
    "completedAt": "2026-03-14T10:30:01.250Z",
    "durationMs": 1150
  },
  "envelope": { "...original action envelope..." },
  "receiptHash": "a1b2c3d4e5f6...",
  "prevReceiptHash": "9f8e7d6c5b4a..."
}
```

**Tamper resistance**: Each receipt contains a `receiptHash` (SHA-256 of core fields: `envelopeId`, `timestamp`, `decision.outcome`, `status`) and a `prevReceiptHash` (hash of the preceding receipt). This forms a linear hash chain. Any modification to a receipt breaks the chain, which is detectable via the verification endpoint.

- **Schema**: `packages/schemas/src/action-receipt.schema.json`
- **Hash fields**: `receiptHash` (line 167), `prevReceiptHash` (line 172)

**2. Chain Verification**

- **API endpoint**: `GET /receipts/verify?limit=1000` (admin only)
- **Response**: `{ chainIntact: true, verified: 1000, broken: 0, unchained: 5, checkedAt: "..." }`
- **Dashboard**: The admin dashboard displays chain integrity status in real-time with visual indicators

**3. NDJSON Export**

- **API endpoint**: `GET /receipts/export?from=ISO&to=ISO&limit=10000` (admin only)
- **Format**: Newline-delimited JSON, suitable for SIEM ingestion, data lake storage, and regulatory submission
- **Security**: Sensitive keys are automatically redacted before export (authorization tokens, API keys, passwords, session identifiers -- see `SENSITIVE_KEYS` list in `packages/control-plane/src/routes/receipts.ts`, lines 24-56)
- **Content-Type**: `application/x-ndjson`
- **Filename**: `receipts-export-YYYY-MM-DD.ndjson`

**4. Receipt Filtering and Querying**

- **API endpoint**: `GET /receipts?status=X&principalId=Y&toolName=Z&decisionOutcome=W&limit=N&offset=M`
- **Filters**: By status, principal ID, tool name, decision outcome
- **Pagination**: Limit/offset with max 200 per page
- **HTML views**: `GET /receipts/view` and `GET /receipts/:id/view` for human-readable audit review

**5. Metrics and Statistics**

- **API endpoint**: `GET /metrics/summary?window=1h|24h|7d`
- **Data**: Receipts by status, by decision outcome, deny rates, approval rates, claim conflict rates
- **Insights**: Automated detection of anomalous patterns (deny spike, config blocked spike, approvals stuck)

**Art. 12(2) requirement mapping**:

| Art. 12(2) Requirement | Authensor Implementation |
|---|---|
| Period of each use (start/end) | `receipt.execution.startedAt`, `receipt.execution.completedAt`, `receipt.execution.durationMs` |
| Input data reference | `receipt.envelope` embeds the complete original action envelope |
| Reference database | `receipt.decision.policyId` + `receipt.decision.policyVersion` identifies the exact policy used |
| Persons involved in verification | `receipt.approval.responses[].responderId` + `respondedAt` for multi-party approval |

**Compliance summary for Art. 12**: **Full coverage.** Authensor's receipt system exceeds the logging requirements by providing cryptographic tamper detection (hash chain), structured export, and automated anomaly detection on the audit trail itself.

---

### Article 14 -- Human Oversight

**Requirement**: High-risk AI systems shall be designed and developed in such a way as to allow for effective human oversight, including by appropriately qualified natural persons during the period of use.

**Specific obligations** (Art. 14(4)):
- (a) Fully understand the capacities and limitations of the system
- (b) Remain aware of automation bias
- (c) Correctly interpret the output
- (d) Be able to decide not to use the system or disregard, override, or reverse the output
- (e) Be able to intervene or interrupt the system with a "stop" button

#### Authensor Implementation

**1. Multi-Party Approval Workflows**

The `require_approval` decision outcome creates a human-in-the-loop gate:

**Policy configuration** (schema: `policy.rules[].approvalConfig`):
```json
{
  "approvers": [
    { "type": "user", "id": "alice@example.com" },
    { "type": "user", "id": "bob@example.com" }
  ],
  "requiredApprovals": 2,
  "expiresIn": "4h"
}
```

**Approval response** (API: `POST /approvals/:id/respond`):
```json
{
  "responderId": "alice@example.com",
  "responderType": "user",
  "decision": "approve",
  "comment": "Reviewed transaction details, within budget limits"
}
```

**Quorum tracking**: The system tracks individual responses and determines when quorum is reached:
- `quorumReached: true/false`
- `approveCount: N`
- `rejectCount: M`
- `requiredApprovals: K`

**Receipt audit trail** (schema: `receipt.approval.responses[]`):
```json
{
  "id": "uuid",
  "responderId": "alice@example.com",
  "responderName": "Alice Chen",
  "decision": "approve",
  "comment": "Reviewed and approved",
  "respondedAt": "2026-03-14T10:35:00.000Z"
}
```

**API endpoints**:
- `POST /approvals/:id/respond` -- submit individual approval response (multi-party)
- `GET /approvals/:id` -- get approval status and all responses
- `POST /approvals/:id/approve` -- legacy single-approver approve
- `POST /approvals/:id/reject` -- reject pending approval
- `POST /approvals/:id/expire` -- expire approval request
- All endpoints require admin role

**Source**: `packages/control-plane/src/routes/approvals.ts`

**2. Dashboard with Approval Queue**

The real-time admin dashboard (`GET /dashboard`) includes:
- Approval queue with auto-refresh (every 5 seconds)
- Pending approval count in statistics cards
- Receipt details with decision rationale
- Hash chain integrity status

**Source**: `packages/control-plane/src/routes/dashboard.ts`

**3. Kill Switch (Art. 14(4)(e) -- "Stop Button")**

- **API endpoint**: `POST /controls` with `{ "disableExecution": true }`
- **Effect**: Immediately blocks all agent execution regardless of policy
- **Granularity**: Global kill switch, or per-tool disable (`disableHttp`, `disableGithub`, `disableStripe`)
- **API endpoint**: `GET /controls/check?tool=X` -- used by MCP server for defense-in-depth enforcement
- **Source**: `packages/control-plane/src/routes/controls.ts`

**4. Override and Reversal Capability (Art. 14(4)(d))**

- Receipt status can be updated to `cancelled` or `skipped` via `PATCH /receipts/:id`
- Approval can be rejected even after initial approval responses via `POST /approvals/:id/reject`
- Policies can be swapped in real-time via `POST /policies/active` without restarting the system

**Art. 14(4) requirement mapping**:

| Art. 14(4) | Authensor Implementation |
|---|---|
| (a) Understand system capacities | Dashboard, metrics summary, policy introspection |
| (b) Awareness of automation bias | Multi-party quorum (requires >1 human agreeing) |
| (c) Interpret output correctly | `decision.reason`, `decision.matchedRules[]`, receipt HTML view |
| (d) Override/reverse output | `POST /approvals/:id/reject`, `PATCH /receipts/:id`, policy swap |
| (e) Stop button | `POST /controls { disableExecution: true }` |

**Compliance summary for Art. 14**: **Full coverage.** Authensor is one of the only AI safety tools that implements multi-party human oversight with quorum semantics, not just binary allow/deny.

---

### Article 15 -- Accuracy, Robustness, and Cybersecurity

**Requirement**: High-risk AI systems shall achieve an appropriate level of accuracy, robustness, and cybersecurity, including resilience against attempts by unauthorised third parties to alter their use or performance.

#### Authensor Implementation

**1. Adversarial Robustness -- Aegis Content Scanner**

Aegis detects prompt injection, jailbreak, and adversarial attacks using 17+ regex-based rules with confidence scoring:

- Entropy analysis for obfuscated payloads
- Heuristic scoring across multiple detection signals
- Threat level classification: `none` | `low` | `medium` | `high` | `critical`
- Zero external dependencies (no API calls, no model inference -- fully deterministic)

**API endpoints**:
- `POST /aegis/scan` -- scan content with configurable detectors
- `GET /aegis/scans` -- recent scan results
- `GET /aegis/stats` -- scanning statistics (24h)
- `GET /aegis/status` -- scanner status and rule count

**2. Behavioral Anomaly Detection -- Sentinel**

Sentinel (`@authensor/sentinel`) provides real-time statistical anomaly detection:

- **EWMA** (Exponentially Weighted Moving Average): Tracks metric trends
- **CUSUM** (Cumulative Sum): Detects sustained shifts in agent behavior
- **Per-agent tracking**: Risk scores (0-100), deny rates, cost rates, error rates
- **Alert engine**: Configurable rules with severity levels (info/warning/critical)

Default alert rules:
| Rule | Metric | Threshold | Severity |
|---|---|---|---|
| High deny rate | `deny_rate` | > 0.3 (30%) | Critical |
| Cost spike | `cost_rate` | > 10 | Warning |
| High latency | `latency` | > 5000ms | Warning |
| High error rate | `error_rate` | > 0.1 (10%) | Critical |

**API endpoints**:
- `GET /sentinel/status` -- monitoring status
- `GET /sentinel/agents` -- per-agent behavioral statistics
- `GET /sentinel/alerts` -- active/recent alerts
- `POST /sentinel/alerts/:id/ack` -- acknowledge alert
- `GET /sentinel/rules` -- alert rule configuration

**3. Cybersecurity Architecture**

| Security Measure | Implementation |
|---|---|
| Role-based access control | API keys with roles: `admin`, `ingest`, `executor` |
| Secret redaction | 25+ sensitive key patterns automatically redacted on export |
| Security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy |
| Input validation | Zod schema validation on all API inputs |
| SSRF protection | Domain allowlists, IP blocking |
| Claim-based execution | Atomic claim/execute/finalize prevents concurrent execution |
| Hash chain integrity | SHA-256 chain verification detects tampering |

**Compliance summary for Art. 15**:
- Accuracy: Policy engine is deterministic (pure function, no ML inference)
- Robustness: Aegis prompt injection detection, Sentinel anomaly detection
- Cybersecurity: RBAC, secret redaction, input validation, hash chain integrity
- **Gap**: No bias testing, fairness metrics, or model accuracy measurement (these are model-layer concerns, not agent orchestration concerns)

---

### Article 17 -- Quality Management System

**Requirement**: Providers of high-risk AI systems shall put a quality management system in place that ensures compliance.

#### Authensor Implementation

| Art. 17(1) Requirement | Authensor Feature |
|---|---|
| Strategy for regulatory compliance | This document + policy-as-code approach |
| Design and development controls | JSON Schema source of truth, generated types, 400+ tests |
| Testing and validation | Vitest test suite, `pnpm gen:check` for schema validation |
| Post-market monitoring | Sentinel real-time monitoring, metrics dashboard |
| Risk management system | Fail-closed engine, Aegis scanning, kill switch |
| Data management | Receipt storage in PostgreSQL, NDJSON export |
| Record-keeping | Hash-chained receipts with verification endpoint |

**Compliance summary for Art. 17**: **Partial.** Authensor provides the technical infrastructure for a QMS, but organizations must build their own procedural documentation (organizational policies, training records, incident response procedures) around it.

---

### Article 43 -- Conformity Assessment

**Requirement**: For high-risk AI systems, providers shall follow the conformity assessment procedure, which may include third-party assessment by a notified body.

#### Authensor Implementation

**1. Audit Trail Export**

The receipt export endpoint (`GET /receipts/export`) produces a complete, machine-readable record of all authorization decisions. This export:

- Contains the full action envelope (what was requested)
- Contains the complete decision (what was decided, by which policy, matching which rules)
- Contains execution details (what actually happened)
- Contains approval records (who approved, when, with what comment)
- Is hash-chained for tamper detection
- Automatically redacts secrets

**2. Chain Verification for Auditors**

`GET /receipts/verify` allows auditors to verify the integrity of the entire receipt chain:

```json
{
  "chainIntact": true,
  "verified": 10000,
  "broken": 0,
  "unchained": 5,
  "checkedAt": "2026-03-14T12:00:00.000Z"
}
```

**3. Policy Version History**

All policies are stored with version numbers and timestamps. Auditors can reconstruct:
- Which policy was active at any point in time
- What changed between policy versions
- Who activated each policy version

**Compliance summary for Art. 43**: **Substantial.** Authensor provides the technical evidence required for conformity assessment. Organizations still need to complete the procedural aspects (self-assessment under Annex VI or third-party assessment under Annex VII).

---

## Colorado AI Act Mapping

**Enforcement date**: June 30, 2026
**Scope**: Developers and deployers of high-risk AI systems that make "consequential decisions" (employment, education, financial, housing, insurance, healthcare, legal, government services)

| Colorado AI Act Requirement | Authensor Feature | Coverage |
|---|---|---|
| Reasonable care to protect consumers | Fail-closed engine, Aegis scanning | Full |
| Impact assessment before deployment | Policy-as-code with version history | Partial |
| Risk management program | Policy engine + Sentinel monitoring | Full |
| Governance practices | RBAC, approval workflows, audit trail | Full |
| Annual impact assessment updates | Metrics export, receipt analytics | Substantial |
| Consumer notification of AI interaction | Not applicable (agent-level, not consumer-facing) | N/A |
| Right to appeal consequential decision | Approval workflow + receipt reversal | Substantial |
| Documentation of AI system purpose and limitations | JSON Schema documentation, policy descriptions | Substantial |
| Transparency report to Attorney General | Receipt export in machine-readable format | Substantial |

**Key Colorado-specific requirements Authensor enables**:

1. **Risk management program** (SB 24-205, Section 6-1-1703): The combination of fail-closed policy engine, content safety scanning, and behavioral monitoring constitutes a technical risk management program.

2. **Right to appeal** (Section 6-1-1704): The approval workflow with `POST /approvals/:id/reject` and receipt status updates provides a mechanism for overriding automated decisions.

3. **Documentation** (Section 6-1-1705): Receipt exports and policy version histories provide the records the Attorney General may request.

---

## US Federal Regulatory Landscape

### Executive Orders

| Order | Date | Relevance |
|---|---|---|
| EO 14179 | Jan 2025 | Revoked Biden AI safety EO, innovation-oriented |
| EO on National AI Framework | Dec 2025 | Establishes federal preemption, limits state authority |

### NIST AI Agent Standards Initiative (February 2026)

NIST's NCCoE concept paper "Accelerating the Adoption of Software and AI Agent Identity and Authorization" describes an architecture that maps closely to Authensor:

| NIST Concept | Authensor Implementation |
|---|---|
| Agent identity | `principal.type` + `principal.id` in action envelope |
| Authorization decisions | Policy engine with conditional rules |
| Delegation chains | `context.parentEnvelopeId` + `context.traceId` |
| Audit trail | Hash-chained receipts |
| Human oversight | Multi-party approval workflows |

NIST comment period is open until **April 2, 2026**, with virtual workshops in **April 2026** for healthcare, finance, and education sectors.

### State-Level Activity

| State Law | Date | Key Requirement |
|---|---|---|
| Texas RAIGA | Jan 1, 2026 | AI disclosures for government/healthcare |
| Colorado AI Act | Jun 30, 2026 | High-risk AI system governance |
| Utah AI Policy Act | Active | AI actions treated as company's own acts |
| 1,000+ AI bills | 2025-present | Processed across state capitals |

### Industry-Specific Regulators

| Regulator | Action | Authensor Relevance |
|---|---|---|
| SEC | 2026 Examination Priorities expanded AI oversight | Receipt trail for regulated entities |
| FDA | "Secure by design" AI guidance | Content safety + audit trail |
| OCC/Fed/FDIC | Applying MRM/TPRM to AI agents | Policy versioning + monitoring |

---

## Gap Analysis

### What Authensor Fully Covers

| Requirement | Feature | Evidence |
|---|---|---|
| Automatic event logging (Art. 12) | Hash-chained receipts | `receiptHash`, `prevReceiptHash`, `GET /receipts/verify` |
| Human oversight mechanisms (Art. 14) | Multi-party approval with quorum | `POST /approvals/:id/respond`, `approval.responses[]` |
| Intervention capability (Art. 14(4)(e)) | Kill switch | `POST /controls { disableExecution: true }` |
| Risk mitigation measures (Art. 9(4)) | Fail-closed, rate limiting, content scanning | Policy engine, Aegis, Sentinel |

### What Authensor Substantially Covers (With Configuration)

| Requirement | Feature | What's Needed |
|---|---|---|
| Technical documentation (Art. 11) | JSON Schema + policy versioning | Organizations must write Annex IV documentation around these artifacts |
| Conformity assessment (Art. 43) | Audit export + chain verification | Organizations must complete Annex VI/VII procedural requirements |
| Accuracy/robustness (Art. 15) | Aegis + Sentinel | Organizations may need additional bias testing tools |
| Quality management (Art. 17) | Technical infrastructure | Organizations must build procedural QMS documentation |

### What Authensor Does Not Cover (Additional Tooling Required)

| Requirement | Gap | Recommended Tools |
|---|---|---|
| Training data governance (Art. 10) | Authensor operates at agent runtime, not model training | Model cards, dataset documentation (Hugging Face, Fiddler) |
| Bias and fairness testing (Art. 10, 15) | No demographic disparity analysis | Fairlearn, AI Fairness 360, Holistic AI |
| Transparency to end users (Art. 13) | Agent-level tooling, not consumer-facing UI | Application-layer disclosures |
| CE marking (Art. 48) | Regulatory procedure, not a software feature | Legal/compliance teams |
| EU Declaration of Conformity (Art. 47) | Regulatory document | Legal/compliance teams |
| Registration in EU database (Art. 49) | Regulatory procedure | Legal/compliance teams |
| Notified body engagement (Art. 43) | Third-party assessment process | Notified bodies per Annex VII |

---

## Implementation Guide for Compliance Teams

### Phase 1: Foundation (Weeks 1-2)

**Goal**: Establish fail-closed baseline and audit trail.

1. **Deploy Authensor control plane** with PostgreSQL backend
2. **Create a deny-all baseline policy**:
   ```json
   {
     "id": "baseline-deny-all",
     "name": "EU AI Act Baseline -- Deny All",
     "version": "1.0.0",
     "rules": [],
     "defaultEffect": "deny"
   }
   ```
3. **Activate the policy**: `POST /policies/active { "policy_id": "baseline-deny-all", "version": "1.0.0" }`
4. **Verify receipt chain**: `GET /receipts/verify`
5. **Enable Aegis scanning**: Set `AUTHENSOR_AEGIS_ENABLED=true` and `AUTHENSOR_AEGIS_MODE=block`

### Phase 2: Risk-Based Rules (Weeks 3-4)

**Goal**: Encode your risk management decisions as policy rules.

1. **Map your high-risk actions** to action types (e.g., `stripe.charges.create`, `github.repos.delete`)
2. **Define approval requirements** for high-risk actions using `require_approval` with `approvalConfig`
3. **Set rate limits** appropriate to each action type
4. **Version your policy** and activate it via the API
5. **Test with shadow mode**: Deploy alongside the deny-all baseline and compare decisions

### Phase 3: Monitoring (Weeks 5-6)

**Goal**: Establish real-time oversight.

1. **Enable Sentinel**: Set `AUTHENSOR_SENTINEL_ENABLED=true`
2. **Configure alert rules** appropriate to your risk tolerance
3. **Set up dashboard access** for compliance officers (admin API keys)
4. **Configure webhook alerts** for policy-missing events (`AUTHENSOR_POLICY_ALERT_WEBHOOK_URL`)
5. **Establish export schedule**: Regular NDJSON exports for long-term archival

### Phase 4: Documentation and Assessment (Weeks 7-8)

**Goal**: Prepare conformity assessment evidence.

1. **Export receipt archive**: `GET /receipts/export?limit=10000`
2. **Run chain verification**: `GET /receipts/verify`
3. **Document policy history**: Retrieve all policy versions with change rationale
4. **Compile Annex IV documentation** referencing Authensor schemas and API specifications
5. **Engage notified body** if required for your risk category

### Ongoing Operations

- **Weekly**: Review metrics summary and Sentinel alerts
- **Monthly**: Export receipts to long-term archival storage
- **Quarterly**: Verify hash chain integrity, review and update policies
- **Annually**: Full conformity assessment review

---

## Comparison with Alternatives

### Feature Comparison Matrix

| Requirement | Authensor | AWS Cedar | Galileo Agent Control | NeMo Guardrails | Guardrails AI |
|---|---|---|---|---|---|
| **Fail-closed default** | Yes | Yes | No | No | No |
| **Hash-chained audit trail** | Yes | No | No | No | No |
| **Human approval workflows** | Multi-party quorum | No | No | No | No |
| **Content safety scanning** | Aegis (zero deps) | No | Pluggable evaluators | Via NemoGuard | Hub validators |
| **Behavioral monitoring** | Sentinel (EWMA/CUSUM) | No | No | No | No |
| **Kill switch** | Yes | No | No | No | No |
| **Rate limiting** | Per-rule, configurable | IAM-level | No | No | No |
| **Self-hosted / data sovereignty** | Yes | AWS only | Cloud | Self-hosted | Cloud + self |
| **MCP-native** | Yes | No | No | No | No |
| **Open source** | Yes (MIT) | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes (Apache 2.0) | Yes (Apache 2.0) |
| **EU AI Act Art. 9 (Risk mgmt)** | Full | Partial | Partial | Partial | Minimal |
| **EU AI Act Art. 12 (Logging)** | Full | Minimal | Minimal | Minimal | Minimal |
| **EU AI Act Art. 14 (Human oversight)** | Full | None | None | None | None |

### Key Differentiators for EU AI Act Compliance

**1. Authensor is the only solution combining all four pillars**: authorization, content safety, monitoring, and cryptographic audit -- all required by the EU AI Act across Articles 9, 12, 14, and 15.

**2. Hash-chained receipts are unique to Authensor.** No competitor provides tamper-evident, hash-linked audit records of individual authorization decisions. This directly maps to Art. 12 requirements and provides evidence for Art. 43 conformity assessments.

**3. Multi-party approval workflows are unique to Authensor.** Every competitor implements binary allow/deny. Only Authensor implements quorum-based human oversight, which is what Art. 14 actually requires for high-risk systems.

**4. Self-hosted deployment solves data sovereignty.** The EU AI Act intersects with GDPR. Authensor's self-hosted model means no data leaves the deployer's infrastructure. No vendor can be compelled under foreign jurisdictions to hand over audit data.

---

## Penalty Framework

### EU AI Act Penalties (Art. 99)

| Violation | Maximum Fine |
|---|---|
| Prohibited AI practices (Art. 5) | EUR 35M or 7% of global annual turnover |
| High-risk obligations (Art. 9-15) | EUR 15M or 3% of global annual turnover |
| Incorrect information to authorities | EUR 7.5M or 1% of global annual turnover |
| SME/startup: proportionality principle applies | Lower of amount or percentage |

### EU Product Liability Directive (Directive 2024/2853)

- **Transposition deadline**: December 9, 2026
- Software and AI systems are explicitly defined as "products"
- **Strict liability**: Defective AI product = manufacturer liability
- Authensor's audit trail provides evidence of due diligence

### Colorado AI Act Penalties

- Attorney General enforcement
- Violation treated as unfair or deceptive trade practice
- Existing Consumer Protection Act penalties apply

### Insurance Impact

Verisk AI exclusion forms (effective January 1, 2026) exclude AI-related losses from general liability and E&O policies. Organizations need governance evidence for coverage. **Authensor's receipt chain IS that governance evidence.**

---

## Appendix: Schema Reference

### ActionEnvelope Schema (`packages/schemas/src/action-envelope.schema.json`)

| Field | Type | Required | EU AI Act Relevance |
|---|---|---|---|
| `id` | UUID | Yes | Unique event identifier (Art. 12) |
| `timestamp` | ISO 8601 | Yes | Event timing (Art. 12) |
| `action.type` | string | Yes | Action classification (Art. 9 risk categorization) |
| `action.resource` | string | Yes | Target resource (Art. 12 reference database) |
| `action.operation` | enum | No | CRUDE operation type |
| `principal.type` | enum | Yes | Actor type: user/agent/service/system (Art. 14) |
| `principal.id` | string | Yes | Actor identification (Art. 12, Art. 14) |
| `context.traceId` | string | No | Distributed tracing (Art. 12) |
| `context.environment` | enum | No | Deployment environment (Art. 9) |
| `constraints.maxAmount` | number | No | Financial risk limits (Art. 9) |

### Policy Schema (`packages/schemas/src/policy.schema.json`)

| Field | Type | Required | EU AI Act Relevance |
|---|---|---|---|
| `id` | string | Yes | Policy identification (Art. 17) |
| `name` | string | Yes | Human-readable name (Art. 11) |
| `version` | semver | Yes | Version tracking (Art. 11) |
| `rules[].effect` | enum | Yes | `allow`/`deny`/`require_approval` (Art. 9, Art. 14) |
| `rules[].condition` | object | No | Risk-based conditions (Art. 9) |
| `rules[].rateLimit` | object | No | Usage limits (Art. 9, Art. 15) |
| `rules[].approvalConfig` | object | No | Human oversight config (Art. 14) |
| `defaultEffect` | enum | No | Defaults to `deny` (Art. 9 fail-closed) |

### ActionReceipt Schema (`packages/schemas/src/action-receipt.schema.json`)

| Field | Type | Required | EU AI Act Relevance |
|---|---|---|---|
| `id` | UUID | Yes | Receipt identification (Art. 12) |
| `envelopeId` | UUID | Yes | Links to original request (Art. 12) |
| `timestamp` | ISO 8601 | Yes | Decision timing (Art. 12) |
| `decision.outcome` | enum | Yes | `allow`/`deny`/`require_approval`/`rate_limited` (Art. 12) |
| `decision.policyId` | string | No | Which policy decided (Art. 17) |
| `decision.policyVersion` | string | No | Which version decided (Art. 17) |
| `decision.matchedRules[]` | array | No | Which rules matched (Art. 11) |
| `decision.reason` | string | No | Human-readable explanation (Art. 13) |
| `approval.status` | enum | No | `pending`/`approved`/`rejected`/`expired` (Art. 14) |
| `approval.responses[]` | array | No | Individual approver decisions (Art. 14) |
| `approval.requiredApprovals` | integer | No | Quorum threshold (Art. 14) |
| `execution.startedAt` | ISO 8601 | No | Execution start (Art. 12) |
| `execution.completedAt` | ISO 8601 | No | Execution end (Art. 12) |
| `execution.durationMs` | integer | No | Execution duration (Art. 12) |
| `receiptHash` | string | No | SHA-256 hash for tamper detection (Art. 12) |
| `prevReceiptHash` | string | No | Previous receipt hash for chain integrity (Art. 12) |

### API Endpoints Summary

| Endpoint | Method | Role | EU AI Act Relevance |
|---|---|---|---|
| `/evaluate` | POST | ingest, admin | Core policy evaluation (Art. 9) |
| `/receipts` | GET | admin | Audit trail access (Art. 12) |
| `/receipts/export` | GET | admin | Audit trail export (Art. 12, Art. 43) |
| `/receipts/verify` | GET | admin | Chain integrity verification (Art. 12) |
| `/receipts/:id` | GET | admin, executor | Individual receipt access (Art. 12) |
| `/approvals/:id/respond` | POST | admin | Multi-party approval (Art. 14) |
| `/approvals/:id` | GET | admin | Approval status (Art. 14) |
| `/policies` | GET/POST | admin | Policy management (Art. 9, Art. 17) |
| `/policies/active` | GET/POST | admin | Active policy control (Art. 9) |
| `/controls` | GET/POST | admin/executor | Kill switch and tool controls (Art. 14) |
| `/aegis/scan` | POST | ingest, admin | Content safety scanning (Art. 15) |
| `/aegis/stats` | GET | admin | Scanning statistics (Art. 15) |
| `/sentinel/status` | GET | admin | Monitoring status (Art. 9) |
| `/sentinel/alerts` | GET | admin | Active alerts (Art. 9, Art. 15) |
| `/sentinel/agents` | GET | admin | Per-agent behavioral tracking (Art. 9) |
| `/metrics/summary` | GET | admin | Operational metrics (Art. 17) |
| `/dashboard` | GET | admin | Real-time oversight interface (Art. 14) |

---

*This document is provided for informational purposes to assist compliance teams in mapping Authensor's technical capabilities to EU AI Act requirements. It does not constitute legal advice. Organizations should consult qualified legal counsel for definitive compliance guidance.*
