# @authensor/sentinel

Real-time behavioral monitoring for AI agents. EWMA and CUSUM anomaly detection, per-agent baselines, deny rate tracking, chain depth alerts.

Zero dependencies.

## Install

```bash
npm install @authensor/sentinel
```

## Quickstart

```typescript
import { Sentinel } from '@authensor/sentinel';

const sentinel = new Sentinel({
  onAlert: (alert) => console.log('ALERT:', alert.rule, alert.severity),
  onAnomaly: (anomaly) => console.log('ANOMALY:', anomaly.metric, anomaly.zscore),
});

// Feed receipt events from your policy engine
const { anomalies, alerts } = sentinel.processEvent({
  agentId: 'agent-1',
  action: 'shell.execute',
  outcome: 'deny',
  timestamp: Date.now(),
  latencyMs: 12,
});
```

## What it detects

- **Deny rate spikes** -- agent hitting guardrails more than baseline
- **Latency anomalies** -- unusual processing times (possible prompt injection probing)
- **Action frequency bursts** -- abnormal request rates
- **Chain depth violations** -- recursive tool calls exceeding safe depth
- **Budget anomalies** -- cost acceleration beyond expected patterns

## Alert rules

```typescript
import { Sentinel } from '@authensor/sentinel';
import type { AlertRule } from '@authensor/sentinel';

const rules: AlertRule[] = [
  {
    id: 'high-deny-rate',
    metric: 'deny_rate',
    condition: 'above',
    threshold: 0.5,
    window: 60_000,  // 1 minute
    severity: 'high',
  },
  {
    id: 'chain-depth',
    metric: 'chain_depth',
    condition: 'above',
    threshold: 10,
    severity: 'critical',
  },
];

const sentinel = new Sentinel({ alertRules: rules });
```

## Statistical detectors

### EWMA (Exponentially Weighted Moving Average)

Detects gradual drift in agent behavior:

```typescript
import { EWMA } from '@authensor/sentinel';

const ewma = new EWMA({ alpha: 0.3 });
ewma.update(10);
ewma.update(12);
ewma.update(100); // spike
console.log(ewma.value); // weighted average tracks the shift
```

### CUSUM (Cumulative Sum)

Detects sustained shifts in mean behavior:

```typescript
import { CUSUM } from '@authensor/sentinel';

const cusum = new CUSUM({ threshold: 5, drift: 0.5 });
const alarm = cusum.update(15); // returns true when cumulative shift exceeds threshold
```

## Per-agent tracking

```typescript
import { AgentTracker } from '@authensor/sentinel';

const tracker = new AgentTracker('agent-1');
const anomalies = tracker.processEvent(event);

// Get agent stats
const stats = tracker.getStats();
// { totalEvents, denyRate, avgLatency, lastSeen, ... }
```

## Chain tracking

Detect recursive or circular tool call chains:

```typescript
import { ChainTracker } from '@authensor/sentinel';

const chains = new ChainTracker();
chains.push('agent-1', 'tool-a');
chains.push('agent-1', 'tool-b');
chains.push('agent-1', 'tool-a'); // circular reference detected
console.log(chains.depth('agent-1')); // 3
```

## License

MIT
