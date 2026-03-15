# Customer Service Policy Template

Policy for customer-facing AI support agents. Designed so agents can
resolve the majority of support requests autonomously while routing
high-risk operations (large refunds, account changes) to human review.

## What It Does

| Action | Decision |
|---|---|
| Refund > $500 | deny |
| Account deletion | deny |
| PII disclosure (`context.piiDisclosure = true`) | deny |
| Refund $100–$500 | require approval (billing team lead) |
| Account modification (email, address, plan) | require approval (supervisor) |
| Ticket lookup / search | allow (rate-limited 200/hr) |
| FAQ / knowledge base reads | allow |
| Order status and tracking lookups | allow |
| Refund < $100 | allow (within $5,000/day budget) |
| Ticket create / update / close | allow |
| Everything else | deny |

## Session Limits

- Max 50 actions per conversation
- Rapid account-lookup then account-modification triggers approval

## Design Philosophy

The policy is tiered to automate the most common support workflows:

1. **Tier 0 (autonomous)**: Reading tickets, orders, FAQs — no approval needed
2. **Tier 1 (small refunds)**: Under $100, issued immediately
3. **Tier 2 (approval required)**: $100–$500 refunds, account changes
4. **Hard blocked**: Anything destructive, large refunds, PII disclosure

This lets the agent handle around 80% of conversations without human
intervention, while protecting against the highest-risk actions.

## Customizing Refund Limits

The thresholds are the key parameters to adjust:

```yaml
# Change the hard block from $500 to $1,000
- id: deny-large-refunds
  condition:
    ...
    - field: constraints.maxAmount
      operator: gt
      value: 1000   # was 500

# Change the approval threshold from $100 to $200
- id: require-approval-medium-refunds
  condition:
    ...
    - field: constraints.maxAmount
      operator: gte
      value: 200    # was 100
    - field: constraints.maxAmount
      operator: lte
      value: 1000   # was 500
```

## Adding Product-Specific Actions

To allow shipping label reprints:

```yaml
- id: allow-shipping-label-reprint
  name: "Allow shipping label reprints"
  effect: allow
  condition:
    field: action.type
    operator: eq
    value: "shipping.label.reprint"
```

Place this rule before the `deny-all-other` catch-all.

## Handling the PII Block

The `deny-pii-disclosure` rule blocks actions where your SDK sets
`context.piiDisclosure = true`. You control this flag in your agent wrapper:

```typescript
// In your SDK envelope builder
const envelope = {
  action: { type: "payment.card.read", resource: "billing://cards/card_123" },
  context: {
    piiDisclosure: false,  // reading a masked view — OK
    // piiDisclosure: true would be blocked
  },
};
```

For displaying masked card numbers (e.g., `**** **** **** 4242`), use a
separate masked-view action type and omit `piiDisclosure`.

## Social Engineering Defense

The `account-takeover-pattern` forbidden sequence catches a common
social engineering attack where a caller reads account details then
immediately requests an account change. When detected, the action
goes to a supervisor for approval rather than being auto-processed.

To tighten this further, reduce `lookbackActions`:

```yaml
forbiddenSequences:
  - id: account-takeover-pattern
    lookbackActions: 3   # was 5 — stricter window
```

## Routing to Human Agents

When an action is denied or requires approval, your agent should
surface a handoff message. The Authensor receipt contains the
`decision.outcome` field your agent can check to trigger escalation:

```typescript
if (receipt.decision.outcome === "require_approval") {
  await escalateToHumanAgent(receipt.id);
}
```
