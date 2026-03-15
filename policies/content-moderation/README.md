# Content Moderation Policy Template

Policy for AI agents that review and moderate user-generated content. The
core principle: agents identify and flag, but humans decide on all
consequential outcomes — bans, removals, and warnings.

## What It Does

| Action | Decision |
|---|---|
| Permanent user ban | deny |
| Content deletion without `context.auditLogged = true` | deny |
| Bulk/mass moderation actions | deny |
| Temporary user ban / suspension | require approval (team lead) |
| Content removal / hide / suppress | require approval (senior moderator) |
| User warnings | require approval (moderator) |
| DMCA / legal takedowns | require approval (senior moderator + legal) |
| Content reading, viewing, inspection | allow (rate-limited 1,000/hr) |
| Content flagging / reporting | allow |
| Moderation queue management | allow |
| Short mutes (≤ 24 hours) | allow |
| Mass-flag then ban sequence | require approval (session rule) |
| Everything else | deny |

## Design Philosophy

Moderation agents are powerful but error-prone. A false positive ban harms
an innocent user; a false positive deletion may be irreversible. This policy
implements a **flag-then-approve** model:

1. The agent reads and inspects content (fully autonomous)
2. The agent flags problematic content (fully autonomous)
3. The agent proposes an action (require_approval — human confirms)
4. Irreversible actions are hard-blocked (permanent bans, deletions without logs)

## The Audit Log Requirement

Rule 2 (`deny-deletion-without-audit`) requires your SDK to set
`context.auditLogged = true` before a deletion envelope is submitted. Your
agent workflow should write to the audit log first, then submit the envelope:

```typescript
// 1. Write audit log entry
await auditLog.write({
  action: "content.delete.permanent",
  contentId: "post_123",
  reason: "violates_tos_section_4",
  moderatorId: agent.id,
});

// 2. Set the flag in the envelope
const envelope = {
  action: { type: "content.delete.permanent", resource: "posts://post_123" },
  context: {
    auditLogged: true,   // required for deletion
    auditLogId: "audit_entry_456",
  },
};
```

## Approval Routing

Different actions route to different approver roles:

| Action | Approver | Expiry |
|---|---|---|
| Temporary ban | `moderation-team-lead` | 1 hour |
| Content removal | `senior-moderator` | 2 hours |
| User warning | `moderator` | 4 hours |
| DMCA takedown | `senior-moderator` + `legal-team` | 48 hours |

Replace these role IDs with your actual Authensor principal IDs:

```yaml
approvalConfig:
  approvers:
    - type: user
      id: "user_sarah_jones"       # specific user
    - type: role
      id: "senior-moderator"       # any user with this role
    - type: webhook
      id: "https://slack.example.com/hooks/approve"  # Slack integration
```

## Adjusting the Mute Threshold

The `allow-short-mutes` rule permits mutes up to 24 hours without approval.
To tighten or loosen this:

```yaml
- id: allow-short-mutes
  condition:
    ...
    - field: action.parameters.durationHours
      operator: lte
      value: 6    # reduce from 24 to 6 hours
```

Or to require approval for all mutes:

```yaml
- id: require-approval-all-mutes
  effect: require_approval
  condition:
    any:
      - field: action.type
        operator: contains
        value: "user.mute"
```

## Adding Platform-Specific Actions

For a video platform with live stream moderation:

```yaml
- id: require-approval-stream-termination
  name: "Require approval for live stream termination"
  effect: require_approval
  condition:
    any:
      - field: action.type
        operator: eq
        value: "stream.terminate"
      - field: action.type
        operator: eq
        value: "stream.ban"
  approvalConfig:
    expiresIn: "5m"    # fast expiry for live events
    requiredApprovals: 1
    approvers:
      - type: role
        id: "live-moderation-supervisor"
```

## Session Risk Scoring

The `sessionRiskThreshold` accumulates risk across a moderation session.
At score 100, further actions require approval:

- Content flag: 2 points (low risk, non-destructive)
- User warning: 10 points
- Content removal: 15 points
- Content delete: 25 points
- User ban: 30 points

A session that bans 3 users (90 points) will require approval before
proceeding. This catches runaway ban sweeps.

## EU Digital Services Act (DSA) Notes

The DSA requires platforms to maintain appeals mechanisms and transparency
reporting. The approval workflow in this policy creates an audit trail for
every moderation action that can be used to generate DSA reports. The
`metadata.compliance` field tags this policy for DSA compliance tracking.
