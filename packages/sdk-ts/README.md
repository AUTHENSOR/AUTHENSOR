# @authensor/sdk

TypeScript SDK for integrating Authensor into your agents. Wraps the control plane API with a clean interface for policy enforcement, action execution, and audit trails.

## Install

```bash
npm install @authensor/sdk
```

## Quickstart

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',
  principalId: 'my-agent',
});

// Execute an action with policy enforcement
const result = await authensor.execute(
  'stripe.charges.create',
  'stripe://customers/cus_123/charges',
  async () => {
    return await stripe.charges.create({ amount: 1000, currency: 'usd' });
  },
);

if (result.allowed) {
  console.log(result.value); // stripe charge object
} else {
  console.log(result.reason); // "Denied: amount exceeds policy limit"
}
```

## Local mode (no control plane)

Use the SDK with just the engine for local evaluation:

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  mode: 'local',
  policies: [myPolicy],
  principalId: 'my-agent',
});

const result = await authensor.execute('file.write', '/etc/passwd', async () => {
  // This never runs -- denied by policy
});
```

## The `execute` pattern

```typescript
const result = await authensor.execute(
  action,      // 'namespace.verb' -- what the agent wants to do
  resource,    // URI of the target resource
  fn,          // The actual work (only runs if allowed)
  options?,    // { constraints, metadata, content }
);
```

The SDK:
1. Builds an action envelope
2. Sends it to the control plane (or evaluates locally)
3. If allowed, executes `fn` and records the receipt
4. If denied, returns the reason without executing

## Error handling

```typescript
import { Authensor, AuthensorDeniedError } from '@authensor/sdk';

try {
  await authensor.execute('shell.rm', '/production/db', dangerousFn);
} catch (e) {
  if (e instanceof AuthensorDeniedError) {
    console.log(e.reason);   // Policy denial reason
    console.log(e.policyId); // Which policy denied it
  }
}
```

## Configuration

```typescript
const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',  // Control plane endpoint
  principalId: 'agent-1',                    // Agent identity
  apiKey: 'ak_...',                          // API key (if auth enabled)
  timeout: 5000,                             // Request timeout (ms)
  failClosed: true,                          // Deny on error (default: true)
});
```

## License

MIT
