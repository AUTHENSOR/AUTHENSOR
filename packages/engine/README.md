# @authensor/engine

Policy evaluation engine for AI agents. Pure, synchronous, zero side effects.

Takes an action envelope + policies, returns a decision. That's it.

## Install

```bash
npm install @authensor/engine
```

## Quickstart

```typescript
import { PolicyEngine } from '@authensor/engine';
import type { ActionEnvelope, Policy } from '@authensor/engine';

const engine = new PolicyEngine();

const envelope: ActionEnvelope = {
  id: crypto.randomUUID(),
  action: 'shell.execute',
  resource: 'bash://localhost/rm',
  principalId: 'agent-1',
  timestamp: new Date().toISOString(),
};

const policies: Policy[] = [{
  id: 'block-destructive',
  version: 1,
  priority: 100,
  enabled: true,
  rules: [{
    effect: 'deny',
    conditions: {
      action: { pattern: 'shell.*' },
      resource: { pattern: '**/rm*' },
    },
    reason: 'Destructive shell commands blocked',
  }],
}];

const result = engine.evaluate(envelope, policies);
console.log(result.decision.outcome); // 'deny'
console.log(result.decision.reason);  // 'Destructive shell commands blocked'
```

## Design principles

- **Pure** -- no I/O, no network calls, no database. Evaluation is a function.
- **Synchronous** -- returns immediately. No async, no promises.
- **Fail-closed** -- no matching policy = deny. Unreachable = deny.
- **Deterministic** -- same input always produces same output.

## Policy structure

```typescript
const policy: Policy = {
  id: 'my-policy',
  version: 1,
  priority: 100,          // Higher priority evaluated first
  enabled: true,
  scope: {
    actions: ['file.*', 'shell.*'],     // Glob patterns
    principals: ['agent-*'],
  },
  rules: [
    {
      effect: 'allow',
      conditions: {
        action: { pattern: 'file.read' },
        resource: { pattern: '/tmp/**' },
      },
    },
    {
      effect: 'deny',
      conditions: {
        action: { pattern: 'shell.*' },
      },
      reason: 'Shell access denied',
    },
  ],
};
```

## Session rules

Track state across multiple actions in a session:

```typescript
const policy: Policy = {
  id: 'session-policy',
  version: 1,
  rules: [{ effect: 'allow', conditions: {} }],
  sessionRules: {
    forbiddenSequences: [
      { actions: ['file.read', 'network.send'], reason: 'Read then exfil pattern' },
    ],
    maxActions: 50,
    riskThreshold: 0.8,
  },
};

const sessionContext: SessionContext = {
  sessionId: 'session-1',
  actions: previousActions,
};

const result = engine.evaluate(envelope, [policy], sessionContext);
```

## Condition operators

| Operator | Example | Matches |
|----------|---------|---------|
| `pattern` | `'file.*'` | Glob matching on action/resource |
| `equals` | `'admin'` | Exact string match |
| `in` | `['read', 'write']` | Value in set |
| `notIn` | `['delete']` | Value not in set |
| `regex` | `'^/tmp/.*'` | Regular expression |

## Budget enforcement

```typescript
const policy: Policy = {
  id: 'budget-cap',
  version: 1,
  rules: [{
    effect: 'deny',
    conditions: {
      constraints: { maxCost: 10.00, currency: 'USD' },
    },
    reason: 'Budget exceeded',
  }],
};
```

## License

MIT
