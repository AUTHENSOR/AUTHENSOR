# Internal IT Admin Agent Policy

**Template ID:** `internal-admin`
**Version:** 1.0.0
**Category:** Infrastructure Administration
**Environment:** All (development, staging, production)

## Use Case

This template governs an IT admin agent that performs infrastructure operations:
querying logs, reading metrics, checking service health, running deployments,
restarting servers, modifying DNS, and rotating certificates.

The admin domain has the largest blast radius of any agent type. This policy
enforces strict layering: observability is free, infrastructure mutations require
multi-party approval, and certain actions have no approval path at all.

## What It Allows (No Approval Required)

- Log queries (`log.query`, `log.read`, `log.search`) — 500/hour
- Metric reads (`metric.read`, `metric.query`, Prometheus, Datadog, CloudWatch) — 1000/hour
- Health checks (`health.check`, `service.status`, `.health`, `.status`) — unlimited
- Read-only database queries (`db.read`, `db.query`, `db.explain`) — 200/hour

## What It Blocks (Unconditional — No Approval Path)

These actions cannot be performed by any agent under any circumstances:

| Action | Reason |
|--------|--------|
| Production database drops (`db.drop`, `db.truncate`) | Irreversible data destruction |
| IAM modifications (`iam.*`, `aws.iam.*`, `k8s.rbac.*`) | Privilege escalation risk |
| Billing modifications (`billing.*`, account up/downgrades) | Uncontrolled financial exposure |

## What Requires 2-Approver Sign-Off (Four-Eyes Principle)

Infrastructure mutations with the widest blast radius require two independent human
approvers before proceeding:

| Action Category | Approvers |
|-----------------|-----------|
| Server restart / stop / provision / terminate | infra-engineer + on-call-lead |
| DNS record changes | infra-engineer + on-call-lead |
| TLS certificate rotation / renewal | infra-engineer + security-reviewer |

## What Requires Single Approver

| Action Category | Approver | Expiry |
|-----------------|----------|--------|
| Deployments (app, container, K8s) | on-call-lead | 4 hours |
| Database migrations (schema, index) | infra-engineer | 2 hours |

## Session Controls

- Maximum 50 actions per session (admin work should be targeted, not sprawling)
- IAM action followed by infra action: denied (backdoor pattern)
- DB schema read followed by DB delete: denied (data destruction pattern)
- Certificate action without preceding backup: requires approval
- Cumulative risk score > 30: requires approval

## Multi-Party Approval Configuration

The four-eyes principle (2 approvers) is implemented via `requiredApprovals: 2`.
Both named approvers must independently approve before the action executes.
Approval requests expire in 2 hours.

To change approver roles, update the `approvers` list in each rule:

```yaml
approvalConfig:
  requiredApprovals: 2
  expiresIn: "2h"
  approvers:
    - type: "role"
      id: "your-infra-engineer-role-id"
    - type: "role"
      id: "your-on-call-lead-role-id"
```

## Why Some Actions Have No Approval Path

The unconditional blocks (Rules 1–3) are not approval-gated because the risk is
asymmetric: the downside of a wrong approval (dropped production DB, compromised IAM)
massively outweighs any convenience of an approval flow. The correct control for
these operations is a human at a console with MFA — not an agent with a permission slip.

If you believe an agent needs IAM or billing capabilities, create a separate,
dedicated policy with significantly higher oversight (3+ approvers, time-limited
token, separate audit trail) rather than modifying this template.

## How to Customise

**Add K8s operations:**
Add rules for `k8s.namespace.*`, `k8s.configmap.*`, etc. before `deny-all-other`.
Follow the same pattern: block destructive ops, 2-approver for impactful ops, allow
read-only status operations.

**Relax staging rules:**
Add a condition to the 2-approver rules that only fires in production:

```yaml
condition:
  all:
    - field: action.type
      operator: eq
      value: "infra.server.restart"
    - field: context.environment
      operator: eq
      value: "production"
```

This allows single-approver restarts in staging while keeping the four-eyes
requirement in production.
