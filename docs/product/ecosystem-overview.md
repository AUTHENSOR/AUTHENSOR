# Authensor Safety Stack — Full Ecosystem

## The 5 Products

```
┌─────────────────────────────────────────────────────────────────────┐
│                    AUTHENSOR SAFETY STACK                            │
│              "Every agent action. Evaluated. Auditable."            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────┐  What CAN     ┌──────────────┐  What does it     │
│  │  AUTHENSOR   │  the agent    │   AEGIS       │  SEE / SAY?      │
│  │  Control     │  DO?          │   Content     │  PII, injection, │
│  │  Plane       │               │   Safety      │  credentials,    │
│  │              │  Policy eval, │               │  malicious code  │
│  │  MIT         │  receipts,    │  MIT          │                   │
│  └──────┬───────┘  approvals    └───────┬───────┘                   │
│         │                               │                           │
│         ▼                               ▼                           │
│  ┌─────────────┐  Local        ┌──────────────┐  What HAPPENED?   │
│  │  SAFECLAW    │  enforcement  │   SENTINEL    │  Anomalies,      │
│  │  Agent       │  for Claude,  │   Monitoring  │  cost spikes,    │
│  │  Gateway     │  OpenAI,      │   & Alerting  │  behavioral      │
│  │              │  any agent    │               │  drift, threats   │
│  │  MIT         │               │  MIT          │                   │
│  └─────────────┘               └──────────────┘                   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SITESITTER — Web governance for browsing agents          │   │
│  │  What can the agent SEE on the web? Dark patterns,         │   │
│  │  deceptive content, unsafe sites. Apache 2.0               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## How They Connect

```
 User → Agent (Claude, OpenAI, CrewAI, LangChain, etc.)
           │
           ▼
    ┌──────────────┐
    │   SafeClaw    │ ← intercepts every tool call
    │   Gateway     │
    └──────┬───────┘
           │
     ┌─────┴──────┐
     ▼            ▼
 ┌────────┐  ┌────────┐
 │ Aegis  │  │Authensor│
 │ scan   │  │evaluate │ ← policy check
 │content │  │ action  │
 └───┬────┘  └────┬───┘
     │            │
     ▼            ▼
 ┌─────────────────────┐
 │   Decision:          │
 │   allow / deny /     │
 │   require_approval   │
 │   + content warnings │
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │   Receipt            │ ← immutable, hash-chained
 │   (audit trail)      │
 └──────────┬──────────┘
            │
            ▼
 ┌─────────────────────┐
 │   Sentinel           │ ← watches receipt stream
 │   (monitoring)       │
 │   anomaly detection  │
 │   alerts             │
 └─────────────────────┘
```

## Pricing Tiers

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  FREE (Self-hosted)              HOSTED ($5/month)                  │
│  ─────────────────              ───────────────────                  │
│                                                                     │
│  ✓ All 5 products               ✓ Everything in Free               │
│  ✓ Full source code             ✓ No Docker/Postgres needed        │
│  ✓ Unlimited agents             ✓ Instant token (30sec setup)      │
│  ✓ All features                 ✓ Weekly Aegis rule updates        │
│  ✓ Community support            ✓ Managed infrastructure           │
│                                 ✓ Auto-scaling                      │
│  Requires:                      ✓ Dashboard at your-name.authensor │
│  • Docker + Postgres            ✓ Email/SMS alerts included        │
│  • Manual env var config        ✓ 14-day receipt retention          │
│  • Self-managed updates         ✓ Priority support                  │
│  • Manual Aegis rule updates                                        │
│  • Your own alert webhooks                                          │
│                                                                     │
│  Perfect for:                   Perfect for:                        │
│  • Technical teams              • Teams who want speed              │
│  • Air-gapped environments      • Non-technical users               │
│  • Custom deployments           • Startups building agents          │
│  • Learning/evaluation          • Anyone who values time > $5       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## Unified CLI

```bash
# Everything through one CLI
npx authensor                    # Interactive setup
npx authensor up                 # Start control plane
npx authensor status             # Check all services

# SafeClaw (agent gating)
npx authensor agent run "task"   # Run agent with safety
npx authensor agent approvals    # Manage approvals

# Aegis (content safety)
npx authensor aegis scan "text"  # Scan content
npx authensor aegis status       # Scanner status
npx authensor aegis rules list   # View detection rules

# Sentinel (monitoring)
npx authensor sentinel           # Start monitoring
npx authensor sentinel tail      # Live feed
npx authensor sentinel alerts    # View alerts
npx authensor sentinel report    # Agent behavioral report

# Policy management
npx authensor templates          # List policy templates
npx authensor apply standard     # Apply a template

# Everything has --help
npx authensor <command> --help
```

## Unified Dashboard

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◉ AUTHENSOR                                                            │
├──────┬───────┬──────────┬──────────┬─────────────┬──────────────────────┤
│ Home │Policy │ Receipts │  Aegis   │  Sentinel   │  Settings           │
├──────┴───────┴──────────┴──────────┴─────────────┴──────────────────────┤
│                                                                          │
│  Welcome to Authensor — Your AI Agent Safety Stack                      │
│                                                                          │
│  ┌─── Safety Score ──────┐  ┌─── Quick Stats (24h) ─────────────────┐  │
│  │                        │  │                                        │  │
│  │      ████████          │  │  Actions evaluated:    12,847          │  │
│  │    ██        ██        │  │  Allowed:              12,504  (97%)  │  │
│  │   █   92/100   █       │  │  Denied:                  320  ( 2%)  │  │
│  │   █  HEALTHY   █       │  │  Pending approval:         23  ( 1%)  │  │
│  │    ██        ██        │  │                                        │  │
│  │      ████████          │  │  Aegis threats blocked:    23          │  │
│  │                        │  │  Sentinel alerts:           2          │  │
│  │  Based on: deny rate,  │  │  Cost:                 $14.32          │  │
│  │  threats, anomalies    │  │  Active agents:              4          │  │
│  └────────────────────────┘  └────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Recent Activity ───────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  00:14  ✓ allow   http.request       agent-alpha                  │  │
│  │  00:14  🔴 blocked INJECTION detected agent-beta   [Aegis]       │  │
│  │  00:13  ✗ deny    shell.execute      agent-alpha   [Policy]      │  │
│  │  00:13  ⚠ alert   deny rate spike    agent-alpha   [Sentinel]    │  │
│  │  00:12  ⏳ pending network.http      agent-delta   [Approval]    │  │
│  │  00:12  ✓ allow   file.read          agent-gamma                  │  │
│  │                                                                    │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
