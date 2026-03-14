# Authensor Agent Safety Certification (ASC) Program

**Status:** Design Proposal
**Version:** 0.1.0
**Date:** 2026-03-14

---

## Executive Summary

The Authensor Agent Safety Certification (ASC) is a tiered badge program that lets AI agent developers demonstrate their agent meets verifiable safety standards. Unlike traditional certifications that rely on manual audits and self-attestation, ASC uses **automated verification** against a live Authensor deployment, producing cryptographically signed proof that can be independently verified.

The program draws design principles from:

- **OpenSSF Scorecard** — automated, API-driven checks with 0-10 scoring per criterion
- **SLSA** — tiered levels with increasing provenance and verification requirements
- **OpenSSF Best Practices Badge** — three progressive tiers (passing/silver/gold) with clear criteria
- **PCI DSS** — risk-proportional tiers where higher levels require third-party assessment
- **SOC 2** — trust service criteria with Type I (point-in-time) and Type II (sustained) evidence
- **ISO 42001** — AI management system controls with governance, risk, and accountability

ASC adds what none of these have: **a certification specifically designed for autonomous AI agent safety**, grounded in the Authensor safety stack and aligned with EU AI Act conformity assessment requirements.

---

## Design Principles

1. **Automated over manual.** Every check that can be verified programmatically is verified programmatically. No honor-system checkboxes.
2. **Evidence-based.** Certification is backed by cryptographic proof (signed attestations), not just a claim.
3. **Progressive.** Three tiers let teams start simple and level up. You don't need to be perfect on day one.
4. **Continuous.** Certification is re-verified on a cadence (not a one-time snapshot), similar to SOC 2 Type II.
5. **Open.** The criteria, the CLI tool, and the verification logic are all open source. Anyone can audit the certifier.
6. **Composable.** ASC evidence maps directly to EU AI Act conformity assessment, ISO 42001, NIST AI RMF, and OWASP Agentic Top 10 coverage.

---

## Certification Tiers

### Tier Overview

| Tier | Name | Target Audience | Verification | Renewal |
|------|------|-----------------|--------------|---------|
| **ASC-1** | Foundational | Any team deploying agents | Fully automated (CLI) | Every 90 days |
| **ASC-2** | Comprehensive | Production agent systems | Automated + evidence review | Every 180 days |
| **ASC-3** | Enterprise | Regulated industries, EU AI Act scope | Automated + independent assessment | Every 365 days |

### Visual Badges

```
ASC-1: ██ FOUNDATIONAL ██   (color: #3B82F6 blue)
ASC-2: ██ COMPREHENSIVE ██  (color: #8B5CF6 purple)
ASC-3: ██ ENTERPRISE ██     (color: #F59E0B gold)
```

---

## ASC-1: Foundational

**Goal:** Demonstrate that basic safety infrastructure is in place. The agent has a policy, logging is enabled, and fail-closed behavior is configured.

### Criteria (16 checks)

All checks are automated and binary (pass/fail).

#### 1.1 Policy Exists and Is Active
| ID | Check | How Verified |
|----|-------|-------------|
| F-01 | At least one active policy is loaded | `GET /policies` returns >= 1 enabled policy |
| F-02 | Policy has a `defaultEffect` of `deny` | Policy JSON inspection |
| F-03 | Policy version follows semver | Regex match on `version` field |
| F-04 | Policy has at least one explicit `deny` rule | Rule list inspection |

#### 1.2 Fail-Closed Behavior
| ID | Check | How Verified |
|----|-------|-------------|
| F-05 | Fail-closed on missing policy | `AUTHENSOR_ALLOW_FALLBACK_POLICY` is `false` or unset |
| F-06 | Unknown action types are denied | Send synthetic envelope with unknown action type, verify `deny` decision |
| F-07 | Health endpoint responds | `GET /health` returns 200 |
| F-08 | Database connectivity confirmed | `GET /health/ready` returns 200 with `database: ok` |

#### 1.3 Audit Logging
| ID | Check | How Verified |
|----|-------|-------------|
| F-09 | Receipts are being created | `GET /receipts?limit=1` returns at least 1 receipt |
| F-10 | Receipts include decision provenance | Receipt contains `decision.policyId` and `decision.reason` |
| F-11 | Receipts include principal identity | Receipt contains `principal.type` and `principal.id` |
| F-12 | Receipt hash chain is intact | Verify `prev_receipt_hash` linkage on last N receipts |

#### 1.4 Authentication
| ID | Check | How Verified |
|----|-------|-------------|
| F-13 | API key authentication is enforced | Unauthenticated `POST /evaluate` returns 401 |
| F-14 | Role separation exists | `GET /keys` shows keys with different roles (ingest vs admin) |
| F-15 | Admin endpoints are protected | Unauthenticated `GET /policies` returns 401 |
| F-16 | Health endpoint is publicly accessible | Unauthenticated `GET /health` returns 200 (intentional public access) |

### Scoring
- **Pass threshold:** All 16 checks must pass
- **Output:** ASC-1 attestation (signed JSON) + badge SVG

---

## ASC-2: Comprehensive

**Goal:** Demonstrate defense-in-depth with content scanning, approval workflows, rate limiting, and behavioral monitoring. This tier indicates a production-grade safety posture.

**Prerequisite:** ASC-1 (all 16 Foundational checks pass)

### Criteria (24 additional checks, 40 total)

#### 2.1 Content Safety (Aegis)
| ID | Check | How Verified |
|----|-------|-------------|
| C-01 | Aegis content scanning is enabled | `AUTHENSOR_AEGIS_ENABLED=true` or Aegis scan endpoint responds |
| C-02 | PII detection is active | Send test string with SSN pattern, verify detection |
| C-03 | Prompt injection detection is active | Send known injection pattern, verify detection |
| C-04 | Credential detection is active | Send test API key pattern, verify detection |
| C-05 | Exfiltration detection is active | Send data exfiltration pattern, verify detection |

#### 2.2 Approval Workflows
| ID | Check | How Verified |
|----|-------|-------------|
| C-06 | At least one `require_approval` rule exists | Policy inspection |
| C-07 | Approval notification channel is configured | Webhook/SMS/Slack/email config check |
| C-08 | Multi-party approval is configured for at least one rule | `approvalConfig.requiredApprovals >= 2` in at least one rule |
| C-09 | Approval expiration is configured | `approvalConfig.expiresIn` is set |
| C-10 | Approval endpoint is functional | `POST /approvals/:id/approve` returns valid response |

#### 2.3 Rate Limiting
| ID | Check | How Verified |
|----|-------|-------------|
| C-11 | Rate limiting is configured in at least one policy rule | Policy rule has `rateLimit` block |
| C-12 | Global rate limit environment variables are set | `AUTHENSOR_RL_INGEST_PER_MIN` or equivalent is configured |
| C-13 | Rate limit webhook is configured | `AUTHENSOR_RATE_LIMIT_WEBHOOK_URL` is set |
| C-14 | Rate-limited actions produce receipts | Verify receipt with `rate_limited` decision exists |

#### 2.4 Controls and Kill Switch
| ID | Check | How Verified |
|----|-------|-------------|
| C-15 | Kill switch endpoint is functional | `GET /controls` returns valid controls state |
| C-16 | Per-tool disable is available | `POST /controls` can disable a specific tool |
| C-17 | Kill switch can halt all agent execution | Activate kill switch, verify all evaluations return `deny`, deactivate |

#### 2.5 Behavioral Monitoring (Sentinel)
| ID | Check | How Verified |
|----|-------|-------------|
| C-18 | Sentinel monitoring is enabled | `AUTHENSOR_SENTINEL_ENABLED=true` or sentinel status responds |
| C-19 | At least one alert rule is configured | Sentinel status shows configured alert rules |
| C-20 | Agent tracking is active | `GET /sentinel/agents` returns agent data |
| C-21 | Anomaly detection thresholds are configured | EWMA or CUSUM parameters are non-default |

#### 2.6 Policy Quality
| ID | Check | How Verified |
|----|-------|-------------|
| C-22 | Policy uses environment scoping | `scope.environments` is set in at least one policy |
| C-23 | Policy uses principal scoping | `scope.principalTypes` is set in at least one policy |
| C-24 | Policy rules use conditions (not just blanket allow/deny) | At least 50% of rules have `condition` blocks |

### Scoring
- **Pass threshold:** All 16 ASC-1 checks + all 24 ASC-2 checks (40 total)
- **Output:** ASC-2 attestation (signed JSON) + badge SVG

---

## ASC-3: Enterprise

**Goal:** Demonstrate enterprise-grade safety suitable for regulated industries. Includes penetration testing evidence, compliance mapping, sustained operational evidence, and independent verification.

**Prerequisite:** ASC-2 (all 40 checks pass)

### Criteria (18 additional checks + 4 evidence requirements, 62 total)

#### 3.1 Advanced Approval Workflows
| ID | Check | How Verified |
|----|-------|-------------|
| E-01 | Multi-party approval with quorum >= 2 on all high-risk actions | All rules with monetary/destructive scope require `requiredApprovals >= 2` |
| E-02 | Approval audit trail is complete | All approval receipts have `respondedBy`, `respondedAt`, and `reason` |
| E-03 | Approval response time SLA is enforced | `approvalConfig.expiresIn` <= 1h for critical actions |

#### 3.2 Hash Chain Integrity
| ID | Check | How Verified |
|----|-------|-------------|
| E-04 | Full hash chain verification passes | Verify entire receipt chain from genesis to HEAD (no breaks) |
| E-05 | Receipt retention >= 6 months | Oldest receipt timestamp is >= 180 days ago |
| E-06 | Receipt export is functional | `GET /receipts/export` returns valid NDJSON |
| E-07 | AAR format export is available | Receipts can be converted to Agent Action Receipt standard format |

#### 3.3 Advanced Content Safety
| ID | Check | How Verified |
|----|-------|-------------|
| E-08 | Aegis is configured with custom rules | Custom detection rules beyond defaults are loaded |
| E-09 | Content scanning covers both input and output | Aegis scans both action parameters and execution results |
| E-10 | Aegis canary detection is active | Canary token detection is enabled and functional |

#### 3.4 Operational Maturity
| ID | Check | How Verified |
|----|-------|-------------|
| E-11 | Separate policies for dev/staging/production | Distinct policies exist with environment scoping |
| E-12 | API key rotation has occurred | Key rotation history shows at least one rotation event |
| E-13 | Alert acknowledgment workflow exists | Sentinel alerts have been acknowledged (not just triggered) |
| E-14 | Deny rate is below threshold | Overall deny rate < 30% (indicates policies are well-tuned, not just blocking everything) |
| E-15 | Uptime >= 99% over certification period | Health check history or external monitoring evidence |

#### 3.5 Compliance Mapping
| ID | Check | How Verified |
|----|-------|-------------|
| E-16 | EU AI Act Article 12 evidence package is complete | Automated check against Article 12 requirements mapping |
| E-17 | OWASP Agentic Top 10 coverage is documented | At least 8/10 OWASP risks have corresponding policy rules |
| E-18 | NIST AI RMF mapping is documented | All four pillars (Govern, Map, Measure, Manage) have evidence |

#### 3.6 Evidence Requirements (Manual Submission)
| ID | Requirement | How Verified |
|----|-------------|-------------|
| E-19 | Penetration test report (< 12 months old) | Upload PDF, verified by independent assessor |
| E-20 | Incident response plan documented | Upload document, verified by independent assessor |
| E-21 | Red team exercise completed | `safeclaw-redteam` report or equivalent, >= 100 scenarios |
| E-22 | Independent security review completed | Third-party assessment report uploaded |

### Scoring
- **Pass threshold:** All 40 ASC-1+ASC-2 checks + all 18 automated ASC-3 checks + all 4 evidence submissions
- **Output:** ASC-3 attestation (signed JSON) + badge SVG + compliance evidence package

---

## Automated Verification: `npx authensor certify`

### CLI Design

```
npx authensor certify                    # Run ASC-1 checks against local/default control plane
npx authensor certify --level 2          # Run ASC-1 + ASC-2 checks
npx authensor certify --level 3          # Run all automated checks (ASC-1 + ASC-2 + ASC-3)
npx authensor certify --url <cp-url>     # Target a specific control plane
npx authensor certify --output json      # Machine-readable output
npx authensor certify --output badge     # Generate badge SVG
npx authensor certify --sign             # Sign the attestation with a private key
npx authensor certify --submit           # Submit attestation to Authensor registry
```

### Verification Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                     npx authensor certify                        │
│                                                                  │
│  1. Connect to control plane                                     │
│  2. Run all checks for requested level                           │
│  3. For each check:                                              │
│     a. Execute API call or synthetic test                        │
│     b. Record pass/fail + evidence (response hash)               │
│     c. Timestamp each check                                      │
│  4. Compute aggregate score                                      │
│  5. If all checks pass:                                          │
│     a. Generate attestation JSON                                 │
│     b. Sign with Ed25519 key (if --sign)                         │
│     c. Output badge SVG                                          │
│     d. Submit to registry (if --submit)                          │
│  6. Output detailed report                                       │
└──────────────────────────────────────────────────────────────────┘
```

### Check Execution Model

Modeled after OpenSSF Scorecard's approach: each check is a pure function that takes a control plane URL and API key, performs API calls, and returns a `CheckResult`:

```typescript
interface CheckResult {
  id: string;              // e.g., "F-01"
  name: string;            // e.g., "Policy exists and is active"
  tier: 1 | 2 | 3;
  category: string;        // e.g., "policy", "audit", "content-safety"
  passed: boolean;
  evidence: {
    method: string;        // HTTP method used
    endpoint: string;      // API endpoint called
    responseHash: string;  // SHA-256 of response body (proof without leaking data)
    timestamp: string;     // ISO 8601
  };
  reason: string;          // Human-readable explanation
  remediation?: string;    // How to fix if failed
  regulatoryMapping?: {    // Which regulations this check satisfies
    euAiAct?: string[];    // e.g., ["Article 12.1", "Article 14.3"]
    owasp?: string[];      // e.g., ["ASI01", "ASI02"]
    nistAiRmf?: string[];  // e.g., ["GOVERN 1.1", "MANAGE 2.3"]
    iso42001?: string[];   // e.g., ["A.5.2", "A.6.1"]
  };
}
```

### Attestation Format

The attestation is a signed JSON document following the in-toto attestation format (same as SLSA):

```json
{
  "_type": "https://in-toto.io/Statement/v1",
  "subject": [
    {
      "name": "authensor-control-plane",
      "digest": {
        "sha256": "<hash-of-control-plane-health-response>"
      }
    }
  ],
  "predicateType": "https://authensor.dev/asc/v1",
  "predicate": {
    "certificationLevel": 2,
    "certificationName": "ASC-2 Comprehensive",
    "issuedAt": "2026-03-14T10:00:00Z",
    "expiresAt": "2026-09-14T10:00:00Z",
    "controlPlaneUrl": "https://cp.example.com",
    "controlPlaneVersion": "1.5.0",
    "checks": {
      "total": 40,
      "passed": 40,
      "failed": 0,
      "results": [ /* array of CheckResult objects */ ]
    },
    "regulatoryCoverage": {
      "euAiAct": {
        "articles": ["9", "12", "13", "14", "43"],
        "coveragePercent": 85
      },
      "owaspAgentic": {
        "risks": ["ASI01", "ASI02", "ASI03", "ASI05", "ASI08", "ASI09", "ASI10"],
        "coveragePercent": 70
      }
    },
    "verifier": {
      "tool": "@authensor/cli",
      "version": "1.5.0"
    }
  }
}
```

### Signing

Attestations are signed using Ed25519 keys (same algorithm used by Sigstore and SiteSitter's federation):

```bash
# Generate a signing key
npx authensor certify keygen --output ./asc-key.pem

# Sign during certification
npx authensor certify --level 2 --sign --key ./asc-key.pem

# Verify a signed attestation
npx authensor certify verify --attestation ./asc-attestation.json --pubkey ./asc-key.pub
```

---

## Badge Display

### SVG Badge (Shields.io-compatible)

Badges are served from a public endpoint and can be embedded in READMEs, websites, and dashboards.

#### Badge URL Format

```
https://authensor.dev/badge/asc/<org-id>.svg
https://authensor.dev/badge/asc/<org-id>.json   (Shields.io endpoint format)
```

#### Badge JSON Endpoint (for Shields.io dynamic badges)

```json
{
  "schemaVersion": 1,
  "label": "Agent Safety",
  "message": "ASC-2 Comprehensive",
  "color": "8B5CF6",
  "namedLogo": "authensor",
  "logoColor": "white"
}
```

#### Embedding

```markdown
<!-- In README.md -->
[![Agent Safety Certification](https://authensor.dev/badge/asc/my-org.svg)](https://authensor.dev/verify/my-org)

<!-- With Shields.io -->
![ASC Badge](https://img.shields.io/endpoint?url=https://authensor.dev/badge/asc/my-org.json)
```

#### HTML Badge with Verification Link

```html
<a href="https://authensor.dev/verify/my-org">
  <img src="https://authensor.dev/badge/asc/my-org.svg"
       alt="Authensor Agent Safety Certification: ASC-2 Comprehensive" />
</a>
```

### Verification Page

`https://authensor.dev/verify/<org-id>` displays:

- Current certification level and expiration date
- Individual check results (pass/fail with timestamps)
- Attestation signature verification status
- Regulatory coverage summary
- History of certification runs

### API Endpoint

```
GET https://authensor.dev/api/v1/certifications/<org-id>
```

Returns the full attestation JSON, allowing programmatic verification by CI/CD pipelines, procurement tools, and compliance platforms.

---

## EU AI Act Conformity Assessment Integration

ASC is specifically designed to produce evidence for EU AI Act conformity assessments (Article 43). Most Annex III high-risk systems allow internal self-assessment (Annex VI), and ASC generates the evidence needed.

### Evidence Mapping

| EU AI Act Requirement | ASC Tier | Evidence Source |
|---|---|---|
| Art. 9: Risk management system | ASC-1 | Policy with deny rules + fail-closed config |
| Art. 12: Record-keeping (logging) | ASC-1 | Receipt chain with hash integrity |
| Art. 13: Transparency | ASC-2 | Decision provenance in receipts + policy versioning |
| Art. 14: Human oversight | ASC-2 | Approval workflows + kill switch + multi-party approval |
| Art. 15: Accuracy, robustness, cybersecurity | ASC-3 | Penetration test + red team + content scanning |
| Art. 43: Conformity assessment | ASC-3 | Complete evidence package with signed attestation |
| Art. 61: Post-market monitoring | ASC-2 | Sentinel monitoring + alert acknowledgment |

### Conformity Evidence Package

`npx authensor certify --level 3 --output eu-evidence-pack` generates:

```
eu-evidence-pack/
  attestation.json              # Signed ASC-3 attestation
  receipt-chain-verification.json  # Hash chain integrity proof
  policy-history.json           # All policy versions with change log
  approval-audit.json           # Complete approval decision history
  aegis-coverage-report.json    # Content safety scanner coverage
  sentinel-monitoring-report.json  # Behavioral monitoring evidence
  owasp-coverage-matrix.json    # OWASP Agentic Top 10 mapping
  nist-ai-rmf-mapping.json      # NIST AI RMF evidence mapping
  eu-ai-act-mapping.json        # Article-by-article evidence mapping
```

This package can be submitted directly to a Notified Body for conformity assessment or used as evidence for internal self-assessment under Annex VI.

---

## Continuous Verification

### Re-certification Cadence

| Tier | Re-certification | Grace Period | Consequence of Lapse |
|------|-----------------|--------------|---------------------|
| ASC-1 | Every 90 days | 14 days | Badge shows "expired" |
| ASC-2 | Every 180 days | 30 days | Badge downgrades to ASC-1 |
| ASC-3 | Every 365 days | 60 days | Badge downgrades to ASC-2 |

### Automated Re-certification

Using GitHub Actions or equivalent CI:

```yaml
# .github/workflows/asc-certification.yml
name: Agent Safety Certification
on:
  schedule:
    - cron: '0 6 1 */3 *'  # Quarterly for ASC-1
  workflow_dispatch:

jobs:
  certify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Run ASC Certification
        run: npx authensor certify --level 2 --sign --key ${{ secrets.ASC_SIGNING_KEY }} --submit
        env:
          AUTHENSOR_URL: ${{ secrets.CONTROL_PLANE_URL }}
          AUTHENSOR_API_KEY: ${{ secrets.AUTHENSOR_ADMIN_KEY }}
```

### Webhook Notifications

When certification status changes:

```json
{
  "event": "asc.certification.status_change",
  "orgId": "my-org",
  "previousLevel": 2,
  "currentLevel": 1,
  "reason": "Check C-18 failed: Sentinel monitoring is not enabled",
  "timestamp": "2026-06-14T06:00:00Z",
  "nextCertificationDue": "2026-09-14T00:00:00Z"
}
```

---

## Implementation Roadmap

### Phase 1: ASC-1 + CLI (v1.6.0)
- [ ] Implement 16 Foundational checks in `packages/cli/src/certify/`
- [ ] Add `npx authensor certify` command
- [ ] Attestation JSON generation (unsigned)
- [ ] Terminal report output (pass/fail per check)
- [ ] Badge SVG generation (static, local file)

### Phase 2: ASC-2 + Signing (v1.7.0)
- [ ] Implement 24 Comprehensive checks
- [ ] Ed25519 attestation signing
- [ ] Shields.io-compatible badge endpoint
- [ ] Regulatory mapping in check results
- [ ] `--output eu-evidence-pack` for conformity assessment

### Phase 3: ASC-3 + Registry (v1.8.0)
- [ ] Implement 18 Enterprise automated checks
- [ ] Evidence upload and review workflow
- [ ] Public verification page at authensor.dev/verify/
- [ ] API endpoint for programmatic verification
- [ ] Webhook notifications for status changes
- [ ] GitHub Actions marketplace action

### Phase 4: Ecosystem (v2.0.0)
- [ ] Third-party assessor integration for ASC-3
- [ ] CSA STAR for AI cross-certification pathway
- [ ] ISO 42001 evidence mapping export
- [ ] Procurement integration (Aravo, OneTrust, etc.)
- [ ] Annual certification report generation

---

## Comparison to Existing Programs

| Feature | OpenSSF Scorecard | OpenSSF Best Practices | SLSA | SOC 2 | ASC (Authensor) |
|---|---|---|---|---|---|
| Domain | OSS security | OSS practices | Supply chain | Enterprise security | AI agent safety |
| Automation | Fully automated | Self-attestation + automated | Build provenance | Manual audit | Automated + evidence |
| Levels | 0-10 score | Passing/Silver/Gold | L1-L3 | Type I/II | ASC-1/2/3 |
| Signed proof | No | No | Yes (in-toto) | Audit report | Yes (in-toto/Ed25519) |
| Renewal | Continuous | Manual update | Per-build | Annual | 90/180/365 days |
| AI-specific | No | No | No | No | Yes |
| EU AI Act mapping | No | No | No | No | Yes |
| OWASP Agentic mapping | No | No | No | No | Yes |
| Cost | Free | Free | Free | $50k-$500k+ | Free (self-hosted) |

---

## Monetization Alignment

Following the Authensor friction-based tiering model:

| Feature | Self-hosted (Free) | Hosted ($5/mo) |
|---|---|---|
| CLI certification checks | Yes | Yes |
| Local attestation generation | Yes | Yes |
| Badge SVG (local file) | Yes | Yes |
| Public badge endpoint | No (self-host your own) | Yes (authensor.dev/badge/) |
| Public verification page | No | Yes (authensor.dev/verify/) |
| Registry submission | No | Yes |
| Webhook notifications | No | Yes |
| EU evidence pack generation | Yes | Yes |
| Third-party assessor routing (ASC-3) | DIY | Managed |
| Certification history dashboard | No | Yes |

The certification logic itself is entirely open source. The hosted tier adds convenience (public badge hosting, verification pages, automated re-certification), consistent with the "self-hosted works but hosted is easier" model.

---

## Appendix A: Check Implementation Pseudocode

### Example: Check F-01 (Policy Exists and Is Active)

```typescript
import type { CheckResult } from '../types.js';

export async function checkPolicyExists(
  cpUrl: string,
  apiKey: string
): Promise<CheckResult> {
  const startTime = Date.now();

  try {
    const res = await fetch(`${cpUrl}/policies`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    if (!res.ok) {
      return {
        id: 'F-01',
        name: 'Policy exists and is active',
        tier: 1,
        category: 'policy',
        passed: false,
        evidence: {
          method: 'GET',
          endpoint: '/policies',
          responseHash: '',
          timestamp: new Date().toISOString(),
        },
        reason: `Failed to fetch policies: HTTP ${res.status}`,
        remediation: 'Ensure the control plane is running and the API key has admin role.',
      };
    }

    const data = await res.json();
    const policies = data.policies || [];
    const activePolicies = policies.filter((p: any) => p.enabled !== false);

    const body = JSON.stringify(data);
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(body)
    );
    const responseHash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    return {
      id: 'F-01',
      name: 'Policy exists and is active',
      tier: 1,
      category: 'policy',
      passed: activePolicies.length >= 1,
      evidence: {
        method: 'GET',
        endpoint: '/policies',
        responseHash,
        timestamp: new Date().toISOString(),
      },
      reason: activePolicies.length >= 1
        ? `Found ${activePolicies.length} active policy(ies)`
        : 'No active policies found. Create a policy with POST /policies or apply a template.',
      remediation: activePolicies.length >= 1
        ? undefined
        : 'Run: npx authensor apply standard',
      regulatoryMapping: {
        euAiAct: ['Article 9.1'],
        owasp: ['ASI01', 'ASI02'],
        nistAiRmf: ['GOVERN 1.1'],
        iso42001: ['A.5.2'],
      },
    };
  } catch (error) {
    return {
      id: 'F-01',
      name: 'Policy exists and is active',
      tier: 1,
      category: 'policy',
      passed: false,
      evidence: {
        method: 'GET',
        endpoint: '/policies',
        responseHash: '',
        timestamp: new Date().toISOString(),
      },
      reason: `Connection error: ${(error as Error).message}`,
      remediation: 'Ensure the control plane is running. Start with: npx authensor up',
    };
  }
}
```

### Example: Check F-06 (Unknown Action Types Are Denied)

```typescript
export async function checkFailClosedUnknownAction(
  cpUrl: string,
  apiKey: string
): Promise<CheckResult> {
  const syntheticEnvelope = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: {
      type: `asc.synthetic.unknown.${Date.now()}`,
      resource: 'asc://certification-check',
      operation: 'execute',
      parameters: {},
    },
    principal: {
      type: 'system',
      id: 'asc-certifier',
      name: 'ASC Certification Check',
    },
    context: {
      environment: 'production',
      sessionId: `asc-${Date.now()}`,
    },
  };

  const res = await fetch(`${cpUrl}/evaluate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(syntheticEnvelope),
  });

  const data = await res.json();
  const isDenied = data.decision?.outcome === 'deny';

  return {
    id: 'F-06',
    name: 'Unknown action types are denied',
    tier: 1,
    category: 'fail-closed',
    passed: isDenied,
    evidence: {
      method: 'POST',
      endpoint: '/evaluate',
      responseHash: await hashBody(JSON.stringify(data)),
      timestamp: new Date().toISOString(),
    },
    reason: isDenied
      ? 'Unknown action type correctly denied (fail-closed)'
      : `Unknown action type returned "${data.decision?.outcome}" instead of "deny". This is a critical safety gap.`,
    remediation: isDenied
      ? undefined
      : 'Set AUTHENSOR_ALLOW_FALLBACK_POLICY=false and ensure defaultEffect is "deny" in all policies.',
    regulatoryMapping: {
      euAiAct: ['Article 9.2'],
      owasp: ['ASI01', 'ASI05', 'ASI10'],
      nistAiRmf: ['GOVERN 1.3', 'MANAGE 2.1'],
    },
  };
}
```

---

## Appendix B: Badge SVG Template

```svg
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="28" role="img"
     aria-label="Agent Safety: ASC-2 Comprehensive">
  <title>Agent Safety: ASC-2 Comprehensive</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="240" height="20" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="100" height="20" fill="#555"/>
    <rect x="100" width="140" height="20" fill="#8B5CF6"/>
    <rect width="240" height="20" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle"
     font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11">
    <text x="50" y="14">Agent Safety</text>
    <text x="170" y="14">ASC-2 Comprehensive</text>
  </g>
</svg>
```

---

## Appendix C: Regulatory Coverage Matrix

This matrix shows which ASC checks provide evidence for which regulatory requirements.

| Regulation | Article/Control | ASC-1 Checks | ASC-2 Checks | ASC-3 Checks |
|---|---|---|---|---|
| **EU AI Act** | Art. 9 (Risk mgmt) | F-01, F-02, F-04, F-05, F-06 | C-11, C-15, C-17 | E-16 |
| | Art. 12 (Logging) | F-09, F-10, F-11, F-12 | | E-04, E-05, E-06, E-07 |
| | Art. 13 (Transparency) | F-10 | C-22, C-23, C-24 | E-16 |
| | Art. 14 (Human oversight) | | C-06, C-07, C-08, C-09, C-10, C-15, C-16, C-17 | E-01, E-02, E-03 |
| | Art. 15 (Accuracy/robustness) | | C-01, C-02, C-03, C-04, C-05 | E-08, E-09, E-10, E-19, E-21 |
| | Art. 43 (Conformity) | | | E-16, E-17, E-18, E-22 |
| **OWASP Agentic** | ASI01 (Goal hijacking) | F-01, F-04, F-06 | C-01, C-03, C-06 | |
| | ASI02 (Tool misuse) | F-02 | C-11, C-14, C-24 | E-01 |
| | ASI03 (Identity abuse) | F-13, F-14, F-15 | C-23 | E-12 |
| | ASI05 (Code execution) | F-05, F-06 | C-15, C-17 | |
| | ASI06 (Memory poisoning) | F-09, F-12 | | E-04 |
| | ASI08 (Cascading failures) | | C-11, C-12, C-15, C-17 | E-15 |
| | ASI09 (Trust exploitation) | | C-06, C-08 | E-01, E-03 |
| | ASI10 (Rogue agents) | F-05, F-06 | C-18, C-19, C-21 | E-14, E-21 |
| **NIST AI RMF** | GOVERN | F-01, F-02, F-03, F-14 | C-22, C-23, C-24 | E-11, E-18 |
| | MAP | | C-01, C-18 | E-17, E-18 |
| | MEASURE | F-09, F-10, F-12 | C-20, C-21 | E-04, E-05, E-14 |
| | MANAGE | F-05, F-06 | C-15, C-16, C-17, C-13 | E-12, E-13, E-15 |
| **ISO 42001** | A.5 (AI policies) | F-01, F-02, F-03 | C-22, C-23 | E-11 |
| | A.6 (Planning) | F-04 | C-06, C-11 | E-16, E-17 |
| | A.7 (Support) | F-13, F-14 | C-07 | E-20 |
| | A.8 (Operation) | F-09, F-10 | C-01, C-15, C-18 | E-04, E-08 |
| | A.9 (Evaluation) | F-12 | C-20, C-21 | E-14, E-21, E-22 |
| | A.10 (Improvement) | | C-13 | E-12, E-13 |
