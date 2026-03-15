# Research Agent Policy

**Template ID:** `research-agent`
**Version:** 1.0.0
**Category:** Research
**Environment:** All

## Use Case

This template governs an agent that searches the web and synthesises information
into reports, summaries, or analyses. Research agents are generally lower-risk than
transactional agents but have distinct concerns around terms-of-service compliance,
copyright, and credential misuse.

## What It Allows

- Web search queries (`search.query`, `browser.search`, `search.*`) — 200/hour
- Public page reads and text extraction (`browser.read`, `browser.navigate`, `http.get`, `text.extract`) — 300/hour
- Content summarisation and analysis (`summarise`, `report.generate`, `analysis.*`) — unlimited

## What It Blocks

- Access to paywalled/subscription-gated resources without authorised access
- Autonomous file downloads (PDF, ZIP, media files)
- High-rate HTTP scraping (> 60 requests/minute to any single endpoint)
- Sessions with 3 consecutive downloads (bulk download pattern)
- Sessions with 5 consecutive navigations in 5 actions (scraping pattern)
- Paywall bypass attempts (read → auth → read sequence)

## What Requires Approval

- File downloads (`file.download`, `browser.download`)
- Authenticated resource access (OAuth, API keys, stored credentials)
- Sessions exceeding cumulative risk score of 50
- High-frequency navigation sessions

## Session Risk Scoring

| Action | Risk Score |
|--------|-----------|
| `file.download` | 10 |
| `auth.*` | 8 |
| `browser.form.submit` | 6 |
| `http.post` | 5 |
| `browser.navigate` | 1 |
| `browser.read` | 0 |
| `search.query` | 0 |
| `summarise` | 0 |

## Rate Limits

| Action Type | Limit |
|-------------|-------|
| Search queries | 200/hour |
| Page reads | 300/hour |
| HTTP/browser requests | 60/minute (anti-scraping) |

## Activating the Download Approval Path

The template currently blocks all downloads unconditionally (Rule 2). To instead
route downloads through an approval workflow, remove Rule 2 and configure the agent
to set `action.parameters.approvalRequested: true` on download requests. Rule 7 will
then pick these up and route them to the research supervisor.

## Paywalled Content Detection

Rule 1 blocks paywalled content access when `action.parameters.requiresSubscription`
is `true`. This signal must be injected by the agent or a pre-processing layer that
detects paywall indicators (HTTP 402, 401 responses, presence of subscription-gate
HTML patterns). Without this signal, paywalled access cannot be blocked automatically.

## How to Customise

**Enable academic database access:**
Add an allow rule for specific authenticated academic APIs (JSTOR, PubMed, Semantic
Scholar) that the agent is authorised to use, placed before Rule 8.

**Allow PDFs from trusted sources:**
Add a rule before Rule 2 that allows downloads where `action.parameters.domain` is in
a trusted-source list, then let Rule 2 block all others.

**Increase rate limits for intensive research:**
Adjust the `rateLimit.requests` values in Rules 4 and 5 for agents running large
literature reviews. Also increase `sessionRules.maxActionsPerSession`.
