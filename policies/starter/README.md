# Starter Policy — Safe by Default

The simplest possible Authensor policy. Use this as your first policy to
understand the schema, test your integration, and get comfortable with the
evaluation model before moving to a domain-specific template.

## What It Does

| Action type | Decision |
|---|---|
| `*.read`, `*.get`, `*.list` | allow |
| `*.search`, `*.view`, `*.query` | allow |
| `read.*`, `list.*` | allow |
| Everything else | deny |

## Use Case

- Learning the Authensor schema for the first time
- Quickly sandboxing a new agent to observe what it tries to do
- A safe default while you draft a more specific policy

## How It Works

Rules are evaluated top to bottom. The first matching rule wins.

1. **allow-reads** — Matches any action whose type uses a standard read verb
   (`endsWith ".read"`, `endsWith ".list"`, etc.). Allows it immediately.
2. **deny-all-writes** — An unconditional catch-all deny. Anything that
   did not match rule 1 is denied with an explicit audit entry.
3. **defaultEffect: deny** — Belt-and-suspenders. Even if rule 2 were
   removed, non-read actions would still be denied.

## How to Customize

### Allow a specific write action

Add a rule above `deny-all-writes`:

```yaml
- id: allow-ticket-create
  name: "Allow support ticket creation"
  effect: allow
  condition:
    field: action.type
    operator: eq
    value: "helpdesk.tickets.create"
```

### Add a rate limit to reads

```yaml
- id: allow-reads
  effect: allow
  condition:
    any:
      - field: action.type
        operator: endsWith
        value: ".read"
  rateLimit:
    requests: 100
    window: "1h"
    scope: principal
```

### Require human approval for sensitive reads

```yaml
- id: require-approval-sensitive-reads
  name: "Require approval for PII reads"
  effect: require_approval
  condition:
    field: action.resource
    operator: contains
    value: "patients"
  approvalConfig:
    expiresIn: "30m"
    requiredApprovals: 1
```

Place this rule **above** `allow-reads` so it takes precedence.

### Scope to a single environment

```yaml
scope:
  environments:
    - development
```

This limits the policy to development, so a separate production policy
can enforce stricter rules.

## Next Steps

Once you have observed your agent's behavior and understand what actions
it needs, pick the domain-specific template that matches your use case:

- `../healthcare-hipaa/` — Healthcare/HIPAA agents
- `../finance-trading/` — Financial trading agents
- `../customer-service/` — Customer support agents
- `../developer-tools/` — Code-writing/deploying agents
- `../e-commerce/` — Shopping/purchasing agents
- `../content-moderation/` — Content review agents
- `../mcp-gateway/` — MCP tool gateway policies
