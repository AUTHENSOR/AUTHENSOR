# Developer Tools Policy Template

Policy for AI agents that write, test, and deploy code. Implements a
tiered safety model: local operations run freely, staging changes require
peer review, and production is always gated behind human approval.

## What It Does

| Action | Decision |
|---|---|
| Production deployment | deny |
| Database migration | deny |
| Secrets / credentials access | deny |
| Staging deployment | require approval (engineer, 2hr expiry) |
| PR merge | require approval (code reviewer, 24hr expiry) |
| Package installation | require approval (tech lead, 1hr expiry) |
| Code reads, file search, diff, log | allow (rate-limited 2,000/hr) |
| Test runs | allow (rate-limited 50/hr) |
| Linting, type-checking, formatting | allow |
| Local builds (non-deploy) | allow (rate-limited 20/hr) |
| File writes to non-sensitive paths | allow |
| Config read → shell exec sequence | deny (session rule) |
| Secrets access → network call sequence | deny (session rule) |
| Everything else | deny |

## The Four Safety Boundaries

### 1. Production is always gated

Rule 1 (`deny-production-deploy`) is unconditional. No production
deployment can happen without a prior approval from the staging
deployment workflow. The system is designed so the only path to
production passes through an approval receipt.

### 2. Secrets are never accessible

Rule 3 (`deny-secrets-access`) blocks any attempt to read `.env` files,
vault secrets, or private keys. The agent cannot know credentials —
it must use injected tokens or the platform's credential management.

### 3. Session-level escalation detection

The `forbiddenSequences` rules catch two classic attack patterns:
- `config read → shell exec`: An agent reading config and then running
  shell commands is a privilege escalation signal.
- `secrets access → HTTP call`: Accessing credential material followed
  by a network call is credential exfiltration.

These are detected even if the actions are separated by other operations
within the lookback window.

### 4. Package installs require sign-off

Every package installation requires tech lead approval. This creates an
audit trail for all new dependencies and provides a checkpoint against
supply chain attacks.

## Environment Detection

The policy checks three fields to identify the target environment:

```yaml
- field: action.parameters.environment   # explicit parameter
- field: action.resource                 # resource URI contains "production"
- field: context.targetEnvironment       # set by your SDK wrapper
```

Set `context.targetEnvironment` in your envelope builder so the policy
doesn't have to rely on parsing resource URIs:

```typescript
const envelope = {
  action: { type: "ci.deploy", resource: "k8s://cluster/prod/app" },
  context: {
    targetEnvironment: "production",  // explicit, unambiguous
  },
};
```

## Adjusting for a Smaller Team

If you don't have named roles yet, use a single `engineer` approver:

```yaml
approvalConfig:
  expiresIn: "1h"
  requiredApprovals: 1
  approvers:
    - type: role
      id: "engineer"
```

## Allowing Specific Shell Commands

If your agent needs to run specific shell commands (e.g., `git` operations),
add an allowlist rule above the catch-all:

```yaml
- id: allow-git-commands
  name: "Allow git read operations"
  effect: allow
  condition:
    all:
      - field: action.type
        operator: eq
        value: "shell.exec"
      - field: action.parameters.command
        operator: startsWith
        value: "git "
      - not:
          field: action.parameters.command
          operator: contains
          value: "git push"
```

## Risk Score Tuning

The `sessionRiskThreshold` is set at 80 by default. Tune it based on
your agent's typical workload:

- **Low-privilege agent** (read-mostly): lower maxScore (40–60)
- **High-privilege agent** (full dev cycle): higher maxScore (120–200)
- **Deployment agent**: increase `*.deploy` and `*.migrate` weights

## Session Action Limit

The 300 action limit per session is suitable for long-running coding
tasks. For quick PR review agents, lower this to 50–100.
