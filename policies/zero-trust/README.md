# Zero Trust Policy

**Template ID:** `zero-trust`
**Version:** 1.0.0
**Category:** Security
**Environment:** All (development, staging, production)

## Use Case

The zero-trust template is the most restrictive policy in the Authensor library.
It requires explicit human approval before **every single action**, with no exceptions.

Use this policy when:

- Deploying an agent for the first time in a production environment
- Operating in a high-security context (financial institutions, government, healthcare)
- Responding to a security incident and needing full visibility into agent behaviour
- Your compliance framework mandates human review of all automated decisions
- You are in an initial trust-building phase and have not yet observed what the agent does

## What It Allows

Nothing — autonomously. Every action goes through the approval queue.

## What It Blocks

Actions that form forbidden sequences, even after individual approvals:
- Two consecutive admin actions within a 3-action lookback window (escalation pattern)
- Data access immediately followed by an outbound HTTP POST (exfiltration pattern)

Sessions exceeding 20 actions are blocked to prevent approval queue flooding.

## What Requires Approval

Everything. The single rule `require-approval-everything` has no condition and
matches all envelopes unconditionally.

## Four-Eyes Principle

To require two independent human approvals (dual control / four-eyes), change:

```yaml
approvalConfig:
  requiredApprovals: 2
  approvers:
    - type: "role"
      id: "security-reviewer"
    - type: "role"
      id: "compliance-officer"
```

Both named approvers will need to approve before the action can proceed.

## Approval Expiry

Approval requests expire in 1 hour by default. Unanswered requests are automatically
denied, preventing stale approvals from accumulating in the queue. Adjust with:

```yaml
expiresIn: "30m"   # more urgent environments
expiresIn: "4h"    # teams with slower review cycles
expiresIn: "24h"   # async approval workflows
```

## Graduating Away From Zero Trust

Zero trust is a starting point. After operating under this policy:

1. Use the Authensor audit trail to identify the most frequent approved action types.
2. Assess whether those actions are low-risk enough to allow autonomously.
3. Move to a more targeted template (e.g., `starter`, `research-agent`) for those domains.
4. Keep zero-trust rules only for the action types that genuinely require human judgment.

The objective is proportionate security: high friction for high-risk actions,
low friction for routine safe operations.

## Priority Note

This template sets `priority: 1000`, the highest in the library. When multiple policies
are active simultaneously, zero-trust rules will override all others. If you run this
alongside a more permissive policy, zero-trust wins.
