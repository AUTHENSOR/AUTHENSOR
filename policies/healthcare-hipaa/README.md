# Healthcare / HIPAA Policy Template

HIPAA-aligned policy for AI agents operating in healthcare environments.
Protects Protected Health Information (PHI) while allowing routine clinical
reference workflows.

## What It Does

| Action | Decision |
|---|---|
| PHI resource access without `context.encrypted = true` | deny |
| PHI access by non-clinical principals | deny |
| Patient data exports (`*.export`, `bulk_download`) | require approval |
| External API calls when `context.hasPatientContext = true` | require approval (2 approvers) |
| Clinical reference reads (drug DB, ICD codes, formulary) | allow (rate-limited 500/hr) |
| Appointment and scheduling reads | allow |
| PHI leakage sequence: patient read → external HTTP call | require approval |
| Bulk extraction: multi-patient read → export | deny |
| Everything else | deny |

## HIPAA Controls Addressed

| CFR Section | Control | Implementation |
|---|---|---|
| §164.502(b) | Minimum Necessary | Role-based PHI access restriction (rule 2) |
| §164.312(a) | Access Control | Encryption flag enforcement (rule 1) |
| §164.312(b) | Audit Controls | All decisions produce tamper-evident receipts |
| §164.312(e) | Transmission Security | Blocks unencrypted PHI reads |

## Key Concepts

### The Encryption Flag

This policy checks `context.encrypted` in the action envelope. Your agent
(or your SDK wrapper) must set this field before submitting the envelope:

```typescript
const envelope = {
  action: { type: "ehr.patient_record.read", resource: "ehr://patients/p-123/phi" },
  context: {
    encrypted: true,          // required for PHI resources
    hasPatientContext: true,   // required for external API gating
    role: "clinical",          // required for patient record access
  },
};
```

### Forbidden Sequences

The `sessionRules.forbiddenSequences` block detects attack patterns across
a session:

- **phi-leakage-sequence**: `patient_record.read` followed by any `http.*`
  call within 5 actions triggers a `require_approval` outcome.
- **bulk-phi-extraction**: Reading multiple patient records then calling any
  `*.export` action within 10 actions is denied outright.

### Risk Scoring

Actions accumulate a session risk score. Once the cumulative score exceeds
50, further actions require approval:

- PHI record access: 8–10 points
- Export operations: 15 points
- External HTTP/API calls: 5–8 points
- Delete operations: 20 points

## How to Customize

### Update resource URI patterns

The `contains: "phi"` and `contains: "patients"` conditions must match your
EHR system's actual URI scheme. Common schemes:

```yaml
# HL7 FHIR R4
- field: action.resource
  operator: startsWith
  value: "fhir://Patient/"

# Epic EHR
- field: action.resource
  operator: matches
  value: "^epic://.*/(patient|phi)/.*$"

# Cerner
- field: action.resource
  operator: startsWith
  value: "cerner://patients/"
```

### Add de-identification exception

If your agent works with de-identified data (Safe Harbor or Expert
Determination), add a rule before the PHI block:

```yaml
- id: allow-deidentified
  name: "Allow de-identified data access"
  effect: allow
  condition:
    field: context.deidentified
    operator: eq
    value: true
```

### Adjust approvers

Replace the role IDs in `approvalConfig.approvers` with your actual
approver IDs or webhook endpoints:

```yaml
approvalConfig:
  approvers:
    - type: user
      id: "user_dr_jane_smith"
    - type: webhook
      id: "https://your-pager-system.example.com/approve"
```

### Tighten the budget

The `$50/day` budget on clinical reference reads is a starting point.
Adjust `maxBudget` to match your actual API cost envelope.

## Important Disclaimer

This template addresses technical controls only. A complete HIPAA compliance
program requires administrative safeguards, physical safeguards, BAA
agreements, workforce training, and risk analysis. Engage your HIPAA Privacy
Officer and legal counsel before deploying this policy in a production
covered entity environment.
