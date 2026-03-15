# Securing OpenAI Agents with Policy-Based Authorization

> **Target repo:** [openai/openai-cookbook](https://github.com/openai/openai-cookbook)
> **Proposed path:** `examples/agent_safety_with_authensor.md`

---

## The Problem

The OpenAI Agents SDK lets you define functions that agents can call. But there is no built-in mechanism to control *which* functions an agent is allowed to call, *when*, or *under what conditions*. Every function call the model decides to make will execute immediately.

Consider an agent with these tools: `search_web`, `send_slack_message`, `write_file`, `delete_database`, `run_shell_command`. The model picks which tool to call based on the user's prompt. If the model misinterprets intent or is manipulated through prompt injection, it can call any tool with any arguments -- and the tool handler runs without question.

```
Agent: "I'll clean up the test environment for you."
  → run_shell_command({ command: "rm -rf /data/*" })   ← executes immediately
  → delete_database({ name: "users_prod" })              ← executes immediately
```

No policy check. No approval step. No audit log.

## The Solution: Authensor in 4 Lines

[Authensor](https://github.com/authensor/authensor) adds a policy layer to your agent's tool calls. Every invocation is evaluated against a YAML policy and receives one of three outcomes: `allow`, `require_approval`, or `deny`. Every decision produces a cryptographic receipt for auditing.

The integration is four lines of code:

```typescript
import { createAuthensorGuardrail } from "@authensor/openai";

const { evaluate, guard } = createAuthensorGuardrail("http://localhost:3000");

// Before any tool call:
const receiptId = await guard("tool_name", toolArgs);
// If denied, guard() throws. If allowed, you get a receipt ID.
```

## Prerequisites

```bash
npm install openai @authensor/openai
```

Start the Authensor control plane:

```bash
npx create-authensor@latest my-agent
cd my-agent
docker compose up -d    # Control plane at http://localhost:3000
```

## Step 1: Define Your Policy

Create `policy.yaml`:

```yaml
id: openai-agent-policy
name: OpenAI Agent Safety Policy
version: "1.0.0"
priority: 100

scope:
  principalTypes:
    - agent
  actionTypes:
    - "openai.*"

rules:
  # Safe read-only operations -- always allowed
  - id: allow-search
    name: Allow web search
    effect: allow
    condition:
      field: action.type
      operator: eq
      value: openai.search_web

  - id: allow-read-file
    name: Allow file reads
    effect: allow
    condition:
      field: action.type
      operator: eq
      value: openai.read_file

  # Messaging requires human review
  - id: review-messaging
    name: Review outbound messages
    effect: require_approval
    condition:
      field: action.type
      operator: eq
      value: openai.send_slack_message

  # File writes require review
  - id: review-file-write
    name: Review file writes
    effect: require_approval
    condition:
      field: action.type
      operator: eq
      value: openai.write_file

  # Destructive operations -- always blocked
  - id: deny-db-delete
    name: Block database deletion
    effect: deny
    condition:
      field: action.type
      operator: eq
      value: openai.delete_database

  - id: deny-shell
    name: Block shell commands
    effect: deny
    condition:
      field: action.type
      operator: eq
      value: openai.run_shell_command

# No rule matches = deny (fail-closed)
defaultEffect: deny
```

Upload to the control plane:

```bash
curl -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" \
  -d @policy.yaml
```

## Step 2: Create the Guardrail

```typescript
import OpenAI from "openai";
import { createAuthensorGuardrail } from "@authensor/openai";

const openai = new OpenAI();

// Create the guardrail -- pass the control plane URL
const { evaluate, guard } = createAuthensorGuardrail({
  controlPlaneUrl: "http://localhost:3000",
  apiKey: process.env.AUTHENSOR_API_KEY,
  principalId: "support-agent",
  principalType: "agent",
});
```

## Step 3: Wire It Into Your Agent Loop

```typescript
const tools: OpenAI.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_web",
      description: "Search the web for information",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "send_slack_message",
      description: "Send a message to a Slack channel",
      parameters: {
        type: "object",
        properties: {
          channel: { type: "string" },
          message: { type: "string" },
        },
        required: ["channel", "message"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_database",
      description: "Delete a database",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
    },
  },
];

// Tool implementations
const toolHandlers: Record<string, (args: any) => Promise<string>> = {
  search_web: async (args) => `Results for "${args.query}": [3 results found]`,
  send_slack_message: async (args) => `Message sent to #${args.channel}`,
  delete_database: async (args) => `Database ${args.name} deleted`,
};

async function runAgent(userMessage: string) {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: "You are a helpful assistant with access to tools." },
    { role: "user", content: userMessage },
  ];

  while (true) {
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      tools,
      messages,
    });

    const choice = response.choices[0];
    if (choice.finish_reason === "stop") {
      return choice.message.content;
    }

    messages.push(choice.message);

    // Process tool calls
    for (const toolCall of choice.message.tool_calls ?? []) {
      const fnName = toolCall.function.name;
      const fnArgs = JSON.parse(toolCall.function.arguments);

      try {
        // ┌─────────────────────────────────────────────┐
        // │ AUTHENSOR: evaluate before executing         │
        // └─────────────────────────────────────────────┘
        const receiptId = await guard(fnName, fnArgs);
        console.log(`ALLOWED: ${fnName} (receipt: ${receiptId})`);

        // Tool call is allowed -- execute it
        const result = await toolHandlers[fnName](fnArgs);
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      } catch (error: any) {
        console.log(`BLOCKED: ${fnName} -- ${error.message}`);

        // Tool call was denied -- tell the model
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: `Safety policy blocked this action: ${error.message}`,
        });
      }
    }
  }
}
```

## Step 4: See the Three Outcomes

```typescript
// 1. ALLOWED -- search is permitted by policy
await runAgent("Search the web for OpenAI pricing");
// ALLOWED: search_web (receipt: rec_7f3a2b...)

// 2. REQUIRES APPROVAL -- messaging needs human review
await runAgent("Send a message to #general saying we're deploying");
// BLOCKED: send_slack_message -- Authensor denied send_slack_message: require_approval

// 3. DENIED -- destructive actions are blocked
await runAgent("Delete the staging database");
// BLOCKED: delete_database -- Authensor denied delete_database: deny
```

## Using `evaluate()` for Soft Checks

If you want to check the policy without throwing, use `evaluate()` instead of `guard()`:

```typescript
const result = await evaluate("send_slack_message", {
  channel: "general",
  message: "Deploying v2.0",
});

console.log(result);
// {
//   allowed: false,
//   outcome: "require_approval",
//   receiptId: "rec_9d4e1f...",
//   reason: "Review outbound messages"
// }

if (result.allowed) {
  // Execute the tool
} else if (result.outcome === "require_approval") {
  // Show approval UI or send webhook
} else {
  // Denied -- inform the user
}
```

## Viewing the Audit Trail

Every policy decision produces a hash-chained receipt:

```bash
curl http://localhost:3000/receipts?limit=3 \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" | jq '.receipts[0]'
```

```json
{
  "id": "rec_7f3a2b1c",
  "timestamp": "2026-03-14T14:22:00.000Z",
  "action": {
    "type": "openai.search_web",
    "resource": "openai://search_web",
    "operation": "execute",
    "parameters": { "query": "OpenAI pricing" }
  },
  "decision": {
    "outcome": "allow",
    "policyId": "openai-agent-policy",
    "reason": "Allow web search"
  },
  "principal": { "type": "agent", "id": "support-agent" },
  "hash": "sha256:a1b2c3...",
  "previousHash": "sha256:d4e5f6..."
}
```

Receipts are hash-chained: tampering with any receipt breaks the chain. This provides compliance-grade audit trails for SOC 2, HIPAA, and EU AI Act Article 12 requirements.

## Summary

| Without Authensor | With Authensor |
|---|---|
| Every tool call executes immediately | Tool calls are evaluated against a YAML policy |
| No visibility into what the agent did | Cryptographic receipt for every decision |
| No way to require human approval | `require_approval` pauses execution |
| Fail-open: unknown tools run | Fail-closed: unknown tools are denied |
| No rate limiting | Per-principal, per-action, or global rate limits |

## Resources

- [Authensor on GitHub](https://github.com/authensor/authensor) -- MIT licensed
- [@authensor/openai on npm](https://www.npmjs.com/package/@authensor/openai)
- [Policy Template Library](https://github.com/authensor/authensor/tree/main/policies) -- 15+ templates
- [Quickstart (5 minutes)](https://authensor.dev/docs/quickstart)
