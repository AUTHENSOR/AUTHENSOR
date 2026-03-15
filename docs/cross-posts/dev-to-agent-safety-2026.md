---
title: "Your AI Agent Has No Safety Net. Here's How to Fix That in 5 Minutes."
published: true
description: "88% of organizations deploying AI agents have no comprehensive safety framework. Over half operate without logging. Here's what that looks like -- and a 5-minute fix."
tags: ai, security, opensource, typescript
cover_image: # Add cover image URL before publishing
canonical_url: # Set this if cross-posting from your own blog
---

## The Numbers Are Bad

Let's start with the research:

- **88%** of organizations deploying AI agents have no comprehensive safety framework
- **45.6%** share API keys across agents with no scoping or rotation
- **Only 14.4%** have full human approval workflows for high-risk actions
- **Over half** operate without structured logging of agent actions

These numbers come from enterprise surveys and security audits of production agent deployments. They are not hypothetical.

## What "No Safety Net" Looks Like

Here is a typical agent setup. You give an LLM some tools and let it call them:

```typescript
const agent = new Agent({
  model: "gpt-4o",
  tools: [searchWeb, sendEmail, writeFile, deleteDatabase, runShellCommand],
});

await agent.run("Clean up the staging environment");
```

The agent decides which tools to call. If it interprets "clean up" as "delete everything," here is what happens:

```
Agent: "I'll clean up the staging environment for you."
  -> deleteDatabase({ name: "staging_users" })       EXECUTED
  -> deleteDatabase({ name: "staging_orders" })      EXECUTED
  -> runShellCommand({ cmd: "rm -rf /data/staging" }) EXECUTED
  -> sendEmail({ to: "team@co.com", subject: "Staging cleaned up" }) EXECUTED
  Done! Staging environment has been cleaned up.
```

Every tool call executed instantly. No human saw the plan. No policy was checked. No audit log exists. If the agent targeted production by mistake, there is no rollback, no evidence, and no way to understand what happened.

This is the default behavior of every major agent framework today.

## The 5-Minute Fix

[Authensor](https://github.com/authensor/authensor) is an open-source safety stack for AI agents. It adds a policy layer between the agent's decision to call a tool and the actual execution of that tool.

### Install

```bash
npx create-authensor@latest my-safe-agent
cd my-safe-agent
docker compose up -d
```

This starts the Authensor control plane on `http://localhost:3000`. It takes about 30 seconds.

### Write a Policy

Create `policy.yaml`:

```yaml
id: my-agent-policy
name: Agent Safety Policy
version: "1.0.0"
priority: 100

scope:
  principalTypes:
    - agent

rules:
  # Read operations are always safe
  - id: allow-reads
    name: Allow read operations
    effect: allow
    condition:
      any:
        - field: action.type
          operator: endsWith
          value: ".read"
        - field: action.type
          operator: endsWith
          value: ".search"
        - field: action.type
          operator: endsWith
          value: ".list"

  # Outbound messages need human approval
  - id: review-messages
    name: Review outbound messages
    effect: require_approval
    condition:
      any:
        - field: action.type
          operator: contains
          value: "send_email"
        - field: action.type
          operator: contains
          value: "send_slack"

  # File writes need approval
  - id: review-writes
    name: Review file writes
    effect: require_approval
    condition:
      field: action.type
      operator: contains
      value: "write_file"

  # Destructive operations are always blocked
  - id: deny-destructive
    name: Block destructive actions
    effect: deny
    condition:
      any:
        - field: action.type
          operator: contains
          value: "delete"
        - field: action.type
          operator: contains
          value: "drop"
        - field: action.type
          operator: contains
          value: "shell_command"

# If nothing matches, deny (fail-closed)
defaultEffect: deny
```

### Add the Guard

Pick your framework:

**OpenAI Agents SDK:**

```typescript
import { createAuthensorGuardrail } from "@authensor/openai";
const { guard } = createAuthensorGuardrail("http://localhost:3000");

// Before executing any tool call:
await guard(toolName, toolArgs);
```

**Claude / Anthropic:**

```typescript
import { AuthensorClaudeGuard } from "@authensor/claude-agent-sdk";
const guard = new AuthensorClaudeGuard("http://localhost:3000");

// Before executing any tool call:
await guard.guard(toolName, toolArgs);
```

**LangChain:**

```typescript
import { AuthensorGuard } from "@authensor/langchain";
const guard = new AuthensorGuard("http://localhost:3000");

// Wrap any tool -- 1 line per tool:
const safeTool = guard.wrap(myTool);
```

### See the Difference

Now the same "clean up staging" request produces a completely different outcome:

```
Agent: "I'll clean up the staging environment for you."
  -> deleteDatabase({ name: "staging_users" })
     [DENIED] Action blocked by safety policy: Block destructive actions

  -> runShellCommand({ cmd: "rm -rf /data/staging" })
     [DENIED] Action blocked by safety policy: Block destructive actions

Agent: "I wasn't able to delete the databases or run shell commands
because those actions are blocked by the safety policy. Would you
like me to help with a different approach to cleaning up staging?"
```

The destructive tools were blocked. The agent received error feedback and adapted. A human can review the audit trail and see exactly what was attempted, what was blocked, and why.

## What Authensor Actually Does

Authensor is not a prompt filter or an output classifier. It is a policy engine that sits between the LLM's tool call decision and the tool's actual execution. Here are the components:

### Policy Engine

- YAML-based rules with glob matching, nested boolean conditions, and parameter inspection
- First-match-wins evaluation order
- Fail-closed by default: if no rule matches, the action is denied
- Zero dependencies, synchronous evaluation, no network calls in the hot path

### Three Outcomes

| Outcome | What Happens |
|---------|-------------|
| `allow` | Tool call executes immediately |
| `require_approval` | Execution pauses until a human approves (via webhook, email, or UI) |
| `deny` | Tool call is blocked; agent receives an error message |

### Cryptographic Receipts

Every decision (allow, deny, or approval) produces a receipt that is:

- **Hash-chained**: each receipt includes the hash of the previous receipt
- **Tamper-evident**: modifying any receipt breaks the chain
- **Queryable**: search by action type, principal, outcome, or time range

This gives you a compliance-grade audit trail suitable for SOC 2, HIPAA, and EU AI Act Article 12.

### Aegis: Content Safety Scanner

Optional module that scans tool call parameters for:

- Prompt injection patterns
- PII (personal identifiable information)
- Secrets and API keys
- SQL injection
- Path traversal attacks

Zero dependencies. Runs before policy evaluation.

### Sentinel: Real-Time Monitoring

Optional module that watches for anomalies:

- Velocity spikes (sudden increase in tool calls)
- Resource concentration (one agent hitting the same resource repeatedly)
- Off-hours activity
- Budget exhaustion

Zero dependencies. Runs after policy evaluation.

## The Integration Is Small

Here's a complete before/after for an OpenAI agent:

**Before (no safety):**

```typescript
for (const toolCall of message.tool_calls) {
  const result = await handlers[toolCall.function.name](
    JSON.parse(toolCall.function.arguments)
  );
  // ... send result back to the model
}
```

**After (with Authensor):**

```typescript
import { createAuthensorGuardrail } from "@authensor/openai";
const { guard } = createAuthensorGuardrail("http://localhost:3000");

for (const toolCall of message.tool_calls) {
  const args = JSON.parse(toolCall.function.arguments);
  try {
    await guard(toolCall.function.name, args);             // <-- added
    const result = await handlers[toolCall.function.name](args);
    // ... send result back to the model
  } catch (e) {
    // ... send error back to the model
  }
}
```

One import. One initialization. One `await guard()` before each tool call. That's the entire integration.

## It's Free and Open Source

Authensor is MIT licensed. The entire stack -- policy engine, control plane, receipt system, Aegis scanner, Sentinel monitor, and all framework adapters -- is open source.

- **GitHub**: [github.com/authensor/authensor](https://github.com/authensor/authensor)
- **npm**: `@authensor/openai`, `@authensor/langchain`, `@authensor/claude-agent-sdk`
- **PyPI**: `authensor`
- **Policy templates**: 15+ ready-made policies for healthcare (HIPAA), finance, e-commerce, developer tools, and more

Self-hosted mode is fully functional with no feature gates. The hosted tier exists for teams who want managed infrastructure, but every feature works locally.

## Quick Links

- [5-Minute Quickstart](https://authensor.dev/docs/quickstart)
- [Policy Template Library](https://github.com/authensor/authensor/tree/main/policies)
- [OWASP Agentic Top 10 Alignment](https://github.com/authensor/authensor/blob/main/docs/owasp-agentic-alignment.md)
- [EU AI Act Compliance Guide](https://github.com/authensor/authensor/blob/main/docs/eu-ai-act-compliance.md)

---

If you're running AI agents in production without a policy layer, the question is not whether something will go wrong -- it's when, and whether you'll have the audit trail to understand what happened.

Five minutes. `npx create-authensor`. Ship it.
