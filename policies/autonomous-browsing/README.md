# Autonomous Web Browsing Agent Policy

**Template ID:** `autonomous-browsing`
**Version:** 1.0.0
**Category:** Browsing
**Environment:** All

## Use Case

This template governs an agent that autonomously browses the web: reading pages,
executing searches, extracting content, and navigating between sites. It is designed
around the principle that reads are always safe, but any operation with side effects
(form submissions, downloads) requires human oversight.

## What It Allows

- Page reads (`browser.read`, `browser.extract`, `browser.scroll`)
- Screenshots (`browser.screenshot`)
- Search queries (`search.query`)
- Navigation to explicitly allowlisted domains (`browser.navigate`)

All allowed operations are rate-limited to 200 reads/hour and 100 navigations/hour.

## What It Blocks

- Navigation to any domain not on the allowlist
- All file downloads (autonomous)
- All form submissions (autonomous)
- Sessions exceeding 100 navigations
- Scrape-then-download sequences (multiple navigates followed by download)

## What Requires Approval

- Form fills that target PII fields (email, phone, name, address, SSN, card number)
- Any browser.download action
- Any browser.form.submit action
- Navigations to non-allowlisted domains (these are actually denied, not approval-gated — see Customisation)
- Sessions that trip the risk threshold (cumulative score > 30)

## Session Risk Scoring

The session risk threshold prevents the agent from silently escalating its activity:

| Action | Risk Score |
|--------|-----------|
| `browser.download` | 10 |
| `browser.form.submit` | 8 |
| `browser.form.fill` | 3 |
| `browser.navigate` | 1 |
| `browser.read` | 0 |
| `search.query` | 0 |

A session with a cumulative score > 30 requires approval before continuing.

## How to Customise

**Add domains to the allowlist:**
The domain allowlist appears in two places — the `block-unknown-domain-navigation` rule
and the `allow-allowlisted-navigation` rule. Keep both in sync:

```yaml
# In block-unknown-domain-navigation condition:
- field: action.parameters.domain
  operator: in
  value:
    - "your-domain.com"
    # ...

# In allow-allowlisted-navigation condition:
- field: action.parameters.domain
  operator: eq
  value: "your-domain.com"
```

**Increase session limits for intensive research tasks:**
Change `sessionRules.maxActionsPerSession` from 100 to a higher value for agents
running long research sessions. Also increase the rate limits on the allow rules.

**Convert navigation-to-unknown from deny to require_approval:**
If you want to give the agent the ability to navigate to new domains via an approval
flow (rather than a hard block), change rule `block-unknown-domain-navigation` to
`effect: require_approval` and add an `approvalConfig` section.

**Add authenticated browsing rules:**
For agents that log in to sites, add a separate rule requiring approval before any
action on authenticated sessions, and enforce that session tokens cannot be persisted
across agent restarts.
