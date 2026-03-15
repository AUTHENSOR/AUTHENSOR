# SaaS Integration Agent Policy

**Template ID:** `saas-integration`
**Version:** 1.0.0
**Category:** SaaS Integration
**Environment:** Production

## Use Case

This template governs an agent that integrates with three common SaaS platforms:
**Stripe** (payments), **GitHub** (code/issues), and **Slack** (messaging). Each
provider has its own risk profile and its own section within the policy.

## Provider Breakdown

### Stripe

| Action | Effect |
|--------|--------|
| Charge creation > $500 | Deny |
| Refund creation (any amount) | Require approval (finance-approver) |
| Subscription cancellation | Require approval (finance + CS lead) |
| Read operations (retrieve, list) | Allow — 500/hour |
| Standard writes (create, update, attach) | Allow — 50/hour, daily API budget |

The `costBudget` on the write rule tracks Stripe **API call cost** (not transaction
value). Set `maxBudget` based on your Stripe API billing tier. A $500 per-charge
limit is enforced via the `block-large-stripe-charges` deny rule.

### GitHub

| Action | Effect |
|--------|--------|
| Repository deletion | Deny (unconditional, no approval path) |
| Force push | Deny (unconditional) |
| Secrets access | Require approval (security-reviewer) |
| Read operations (get, list, search) | Allow — 1000/hour |
| Issues, PRs, labels, comments | Allow — 100/hour |
| PR merge to main/master | Deny (protected branch rule) |

### Slack

| Action | Effect |
|--------|--------|
| Message to non-allowlisted channel | Deny |
| Channel creation | Deny |
| Read operations (history, info, list) | Allow — 200/hour |
| Message to approved channels | Allow — 60/hour |

Replace the placeholder channel IDs (`C_GENERAL`, `C_ALERTS`, etc.) with your
actual Slack channel IDs before deploying.

## Session Controls

- Maximum 300 actions per session
- GitHub secrets followed by outbound HTTP POST: denied (exfiltration pattern)
- Three consecutive Stripe charge creations: require approval (billing loop detection)
- Cumulative risk score > 80: require approval

## How to Customise

**Add a new SaaS provider:**
Add rules before `deny-all-other` following the same pattern: block destructive ops
first, require approval for sensitive ops, allow reads and bounded writes.

**Increase Stripe charge limit:**
Change the `50000` threshold in `block-large-stripe-charges` to your desired
limit in cents (e.g., `100000` for $1,000).

**Add Slack channels:**
Add channel IDs to the `value` list in both `block-slack-external-channels`
(rule 11) and `allow-slack-messages-approved-channels` (rule 14). Keep both
lists in sync.

**Adjust daily Stripe API budget:**
Edit `costBudget.maxBudget` in `allow-stripe-standard-writes`. Set alert
thresholds at 70%, 90%, 100% to get warnings before the budget is exhausted.
