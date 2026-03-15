# E-Commerce / Shopping Policy Template

Policy for shopping and purchasing agents. Enables autonomous product
discovery and routine purchases while requiring human confirmation for
larger transactions and account changes.

## What It Does

| Action | Decision |
|---|---|
| Purchase > $500 | deny |
| Payment method changes | deny |
| Purchase $50–$500 | require approval (user, 5min expiry) |
| Shipping address changes | require approval (user, 10min expiry) |
| Product search and browsing | allow (rate-limited 500/hr) |
| Cart management (add/remove/update) | allow |
| Order tracking and history | allow |
| Purchase < $50 | allow (within $500/day budget) |
| Price comparison and review reads | allow |
| 3+ orders in rapid succession | require approval |
| Everything else | deny |

## Budget Configuration

```
Daily spend limit:   $500 per user
Per-purchase cap:    $50 (for autonomous purchases)
Alert thresholds:    75%, 90%, 100% of daily limit
```

## Approval Flow for Purchases

The `require-approval-purchases` rule uses `type: principal, id: "owner"` as
the approver. This means the approval request goes to the user themselves,
not to a separate reviewer. For a shopping agent, this is the right model —
the user confirms purchases over $50 via a mobile notification, chatbot
reply, or confirmation email before the order is placed.

Update the approver to match your notification system:

```yaml
approvalConfig:
  approvers:
    - type: principal
      id: "owner"      # user confirms via your app's approval UI
```

## Adjusting Purchase Thresholds

Three parameters control the purchase flow:

```yaml
# Hard block threshold (no approval path above this)
deny-large-purchases → constraints.maxAmount > 500

# Approval required above this amount
require-approval-purchases → constraints.maxAmount >= 50

# Autonomous purchase ceiling
allow-small-purchases → constraints.maxAmount < 50

# Daily budget
costBudget.maxBudget: 500
```

To support a higher-budget user (e.g., a business buyer):

```yaml
# Raise hard block to $2,000
deny-large-purchases: gt 2000

# Approval threshold at $250
require-approval-purchases: gte 250 / lte 2000

# Autonomous up to $250
allow-small-purchases: lt 250

# Daily budget $5,000
costBudget.maxBudget: 5000
```

## Preventing Duplicate Orders

The `rapid-duplicate-orders` forbidden sequence detects three or more order
actions within a 5-action window. This catches:

- Bugs causing the agent to loop
- Double-tap issues in mobile UIs
- Runaway retry logic

Tune the `lookbackActions` if your workflow legitimately places multiple
orders at once:

```yaml
forbiddenSequences:
  - id: rapid-duplicate-orders
    sequence:
      - "*.order.*"
      - "*.order.*"
      - "*.order.*"
      - "*.order.*"     # require 4 instead of 3
    lookbackActions: 10  # wider window
```

## Subscription Purchases

For recurring/subscription purchases, add a dedicated rule with stricter
controls (subscriptions have ongoing financial impact):

```yaml
- id: require-approval-subscriptions
  name: "Require approval for subscription enrollment"
  effect: require_approval
  condition:
    any:
      - field: action.type
        operator: contains
        value: "subscription"
      - field: action.type
        operator: contains
        value: "recurring"
  approvalConfig:
    expiresIn: "10m"
    requiredApprovals: 1
    approvers:
      - type: principal
        id: "owner"
```

Place this rule above `allow-small-purchases` so it takes precedence even
for low-cost subscriptions.

## Multi-User / Marketplace Context

If the agent acts on behalf of multiple users, scope the budget to the
principal rather than globally. The `costBudget` period is already
per-rule, but ensure your control plane tracks spend by `principal.id` to
enforce per-user limits correctly.

## Return and Refund Actions

Return initiations are not explicitly covered here. Add a dedicated rule:

```yaml
- id: allow-return-initiation
  name: "Allow return and exchange initiation"
  effect: allow
  condition:
    any:
      - field: action.type
        operator: contains
        value: "return"
      - field: action.type
        operator: contains
        value: "exchange"
      - field: action.type
        operator: contains
        value: "rma"
```

For refunds issued by the agent (rather than requested), use the customer
service template which has explicit refund tiering.
