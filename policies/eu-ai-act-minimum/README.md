# EU AI Act Minimum Compliance Policy

**Template ID:** `eu-ai-act-minimum`
**Version:** 1.0.0
**Category:** Compliance
**Environment:** Production

## Use Case

This template implements the minimum set of Authensor controls needed to operate
an AI agent within the scope of the EU AI Act (Regulation 2024/1689). It is designed
for organisations deploying "high-risk" AI systems as defined in Annex III of the Act.

## What the EU AI Act Requires

The Act distinguishes AI systems by risk tier. **Annex III high-risk** systems include:

- Biometric identification and categorisation
- Employment and HR decision support
- Credit scoring and financial services
- Law enforcement and predictive policing
- Border control and migration management
- Administration of justice and democratic processes
- Education and vocational training assessment

For systems in these categories, the Act imposes obligations across Articles 9–14:

| Article | Obligation | How This Policy Addresses It |
|---------|-----------|------------------------------|
| Art. 9 | Risk management system | Session risk scoring, forbidden sequences |
| Art. 10 | Data governance | Approval gate for all data deletions |
| Art. 12 | Record keeping | All actions logged via Authensor receipts |
| Art. 13 | Transparency | `reasoning` field required on high-risk envelopes |
| Art. 14 | Human oversight | `require_approval` for all Annex III actions |

## What It Allows

- Read-only operations (`.read`, `.list`, `.get`, `.search`, `.query`, `.view`, `.fetch`)
- Standard write operations (`.create`, `.update`, `.send`, `.submit`, `.publish`) — rate-limited to 100/hour

## What It Blocks

- High-risk actions that lack a `reasoning` field in `action.parameters` (transparency gate)
- Any action matching detected oversight-bypass sequences (auth → admin escalation)
- Session exceeding 50 consecutive actions without a human checkpoint

## What Requires Approval

- **All Annex III actions** — biometric, employment, credit, law enforcement, migration, judicial, education
- **All deletion operations** — `.delete`, `.destroy`, `.purge` — to protect audit trail integrity
- Actions triggering the session risk threshold (cumulative score > 40)

## Multi-Party Approval

This template uses single approver (`requiredApprovals: 1`) as the minimum. For law
enforcement, justice, or biometric contexts, change this:

```yaml
approvalConfig:
  requiredApprovals: 2
  approvers:
    - type: "role"
      id: "ai-act-compliance-officer"
    - type: "role"
      id: "department-head"
```

## How to Customise

**Expand the allowed action set:**
Add new verbs to the `allow-reads` or `allow-writes-with-rate-limit` rules. Only add
action types you have assessed as non-high-risk under Annex III.

**Adjust session limits:**
Lower `maxActionsPerSession` for higher-risk contexts. A biometrics agent might warrant
a limit of 10; a document-summarisation agent can safely use 200.

**Increase risk weights:**
Edit `sessionRules.sessionRiskThreshold.riskWeights` to assign higher scores to the
action types most sensitive in your domain.

**Add your compliance officer to approvers:**
Replace the placeholder role IDs with actual Authensor user or group IDs registered
in your control plane.

## Important Limitations

This template addresses the **technical controls** layer of EU AI Act compliance.
It does not replace:
- Conformity assessments (Annex VI)
- Registration in the EU database (Article 51)
- Post-market monitoring plans (Article 72)
- CE marking obligations

Consult your Data Protection Officer and legal counsel for a full compliance programme.
