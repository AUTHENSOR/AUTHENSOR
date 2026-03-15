# Adding Safety Guardrails to Claude Agents with Authensor

> **Target repo:** [anthropics/anthropic-cookbook](https://github.com/anthropics/anthropic-cookbook)
> **Proposed path:** `misc/agent_safety_with_authensor.md`

---

## The Problem

When you build an agent with the Claude API, Claude can call any tool you give it. There is no built-in mechanism to:

- **Restrict** which tool calls are allowed in which context
- **Require human approval** before high-risk actions execute
- **Audit** every tool invocation with a tamper-evident receipt chain
- **Rate-limit** tool calls per principal, per action, or globally

If Claude decides to call `delete_database` or `send_wire_transfer`, the tool handler runs immediately. The agent has no safety net.

```
User: "Clean up our staging environment"

Claude Agent (unprotected):
  → calls: delete_database({ name: "staging_db" })     ← executes instantly
  → calls: delete_database({ name: "staging_users" })   ← executes instantly
  → calls: remove_dns_record({ domain: "staging.co" })  ← executes instantly
  Done! I cleaned up your staging environment.
```

Nobody reviewed those calls. No audit trail exists. If the agent misinterprets the request and targets production, there is no recovery mechanism.

## The Solution: Authensor

[Authensor](https://github.com/authensor/authensor) is an open-source policy engine for AI agent safety. It evaluates every tool call against a YAML policy before execution, returning one of three decisions:

| Decision | Meaning |
|----------|---------|
| `allow` | Tool call proceeds immediately |
| `require_approval` | Tool call is paused until a human approves |
| `deny` | Tool call is blocked; agent receives an error |

Every decision produces a cryptographic receipt (hash-chained, tamper-evident) for audit compliance.

## Prerequisites

```bash
npm install @anthropic-ai/sdk @authensor/claude-agent-sdk
```

You also need an Authensor control plane running. The fastest way:

```bash
npx create-authensor@latest my-agent
cd my-agent
docker compose up -d
```

This starts the control plane on `http://localhost:3000` with a default policy.

## Step 1: Define a Policy

Create `policy.yaml` in your project root:

```yaml
id: claude-agent-safety
name: Claude Agent Safety Policy
version: "1.0.0"
priority: 100

scope:
  principalTypes:
    - agent
  actionTypes:
    - "claude.*"

rules:
  # Safe read operations -- always allowed
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

  # Sending messages requires human approval
  - id: review-messaging
    name: Review outbound messages
    effect: require_approval
    condition:
      any:
        - field: action.type
          operator: eq
          value: claude.send_email
        - field: action.type
          operator: eq
          value: claude.send_slack_message

  # Database writes require approval
  - id: review-db-writes
    name: Review database mutations
    effect: require_approval
    condition:
      any:
        - field: action.type
          operator: eq
          value: claude.update_record
        - field: action.type
          operator: eq
          value: claude.insert_record

  # Destructive operations are always blocked
  - id: deny-destructive
    name: Block destructive actions
    effect: deny
    condition:
      any:
        - field: action.type
          operator: eq
          value: claude.delete_database
        - field: action.type
          operator: eq
          value: claude.drop_table
        - field: action.type
          operator: eq
          value: claude.run_shell_command

# If no rule matches, deny (fail-closed)
defaultEffect: deny
```

Upload it to the control plane:

```bash
curl -X POST http://localhost:3000/policies \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" \
  -d @policy.yaml
```

## Step 2: Initialize the Guard

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { AuthensorClaudeGuard } from "@authensor/claude-agent-sdk";

const client = new Anthropic();

const guard = new AuthensorClaudeGuard({
  controlPlaneUrl: "http://localhost:3000",
  apiKey: process.env.AUTHENSOR_API_KEY,
  principalId: "claude-agent-prod",
  principalType: "agent",
  environment: "production",
});
```

## Step 3: Define Tools and Wrap Them

Define your tools as normal Claude tool definitions, then wrap the handlers with Authensor:

```typescript
// Tool definitions (standard Claude format)
const tools: Anthropic.Tool[] = [
  {
    name: "search_docs",
    description: "Search internal documentation",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
      },
      required: ["query"],
    },
  },
  {
    name: "send_email",
    description: "Send an email to a user",
    input_schema: {
      type: "object" as const,
      properties: {
        to: { type: "string" },
        subject: { type: "string" },
        body: { type: "string" },
      },
      required: ["to", "subject", "body"],
    },
  },
  {
    name: "delete_database",
    description: "Delete a database",
    input_schema: {
      type: "object" as const,
      properties: {
        name: { type: "string" },
      },
      required: ["name"],
    },
  },
];

// Tool handlers
const handlers: Record<string, (input: any) => Promise<string>> = {
  search_docs: async (input) => {
    return `Found 3 results for "${input.query}"`;
  },
  send_email: async (input) => {
    // Real email sending logic
    return `Email sent to ${input.to}`;
  },
  delete_database: async (input) => {
    // Real database deletion logic
    return `Database ${input.name} deleted`;
  },
};
```

## Step 4: Build the Agent Loop with Policy Enforcement

```typescript
async function runAgent(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  while (true) {
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      tools,
      messages,
    });

    // If Claude is done, return the final text
    if (response.stop_reason === "end_turn") {
      const textBlock = response.content.find((b) => b.type === "text");
      return textBlock?.text ?? "";
    }

    // Process tool calls
    const toolResults: Anthropic.MessageParam = {
      role: "user",
      content: [],
    };

    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      try {
        // --- THIS IS THE KEY LINE ---
        // Evaluate the tool call against Authensor policies BEFORE executing
        const receiptId = await guard.guard(block.name, block.input as Record<string, unknown>);
        console.log(`[Authensor] ALLOWED: ${block.name} (receipt: ${receiptId})`);

        // Policy says "allow" -- execute the tool
        const result = await handlers[block.name](block.input);
        (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
          type: "tool_result",
          tool_use_id: block.id,
          content: result,
        });
      } catch (error: any) {
        if (error.name === "AuthensorDeniedError") {
          console.log(`[Authensor] DENIED: ${block.name} -- ${error.message}`);

          // Policy says "deny" -- return error to Claude
          (toolResults.content as Anthropic.ToolResultBlockParam[]).push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Action blocked by safety policy: ${error.message}`,
            is_error: true,
          });
        } else {
          throw error;
        }
      }
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push(toolResults);
  }
}
```

## Step 5: See It in Action

```typescript
// This will work -- search is allowed by policy
await runAgent("Search our docs for the deployment guide");
// [Authensor] ALLOWED: search_docs (receipt: rec_a1b2c3d4)

// This will pause for approval -- email requires human review
await runAgent("Email john@example.com about the outage");
// [Authensor] DENIED: send_email -- Authensor denied tool "send_email": require_approval

// This will be blocked -- destructive actions are denied
await runAgent("Delete the staging database");
// [Authensor] DENIED: delete_database -- Authensor denied tool "delete_database": deny
```

## Step 6: Handle Approval Workflows

For `require_approval` decisions, you can configure an approval callback:

```typescript
const guard = new AuthensorClaudeGuard({
  controlPlaneUrl: "http://localhost:3000",
  apiKey: process.env.AUTHENSOR_API_KEY,
  principalId: "claude-agent-prod",
  principalType: "agent",
  environment: "production",

  // Called when a tool call requires human approval
  onApprovalRequired: async (toolName, args, reason) => {
    console.log(`\n--- APPROVAL REQUIRED ---`);
    console.log(`Tool: ${toolName}`);
    console.log(`Args: ${JSON.stringify(args, null, 2)}`);
    console.log(`Reason: ${reason}`);

    // In production, this would send a Slack message, email, or
    // webhook and wait for a response. For this demo, auto-deny:
    return false;
  },
});
```

## Step 7: View the Audit Trail

Every decision (allow, deny, require_approval) produces a cryptographic receipt:

```bash
curl http://localhost:3000/receipts?limit=5 \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" | jq
```

```json
{
  "receipts": [
    {
      "id": "rec_a1b2c3d4",
      "timestamp": "2026-03-14T10:30:00.000Z",
      "action": {
        "type": "claude.search_docs",
        "resource": "claude://search_docs",
        "operation": "execute"
      },
      "decision": {
        "outcome": "allow",
        "policyId": "claude-agent-safety",
        "reason": "Allow read operations"
      },
      "principal": {
        "type": "agent",
        "id": "claude-agent-prod"
      },
      "hash": "sha256:9f86d08...",
      "previousHash": "sha256:e3b0c44..."
    }
  ]
}
```

Receipts are hash-chained: each receipt includes the hash of the previous receipt. If any receipt is tampered with, the chain breaks. This provides tamper-evident audit trails suitable for SOC 2, EU AI Act Article 12, and internal compliance requirements.

## What Authensor Provides

| Capability | Description |
|------------|-------------|
| **Policy Engine** | YAML-based rules with glob matching, nested conditions, rate limits |
| **Approval Workflows** | Pause agent execution until a human approves |
| **Cryptographic Receipts** | Hash-chained audit trail for every decision |
| **Aegis** | Content safety scanner (prompt injection, PII, secrets detection) |
| **Sentinel** | Real-time anomaly monitoring (velocity spikes, resource concentration) |
| **Framework Adapters** | Drop-in support for Claude, OpenAI, LangChain, CrewAI, Vercel AI SDK |

## Further Reading

- [Authensor GitHub](https://github.com/authensor/authensor) -- MIT licensed, zero-dependency core
- [Policy Template Library](https://github.com/authensor/authensor/tree/main/policies) -- 15+ ready-made policies (healthcare, finance, e-commerce, etc.)
- [Quickstart Guide](https://authensor.dev/docs/quickstart)
- [OWASP Agentic Top 10 Alignment](https://github.com/authensor/authensor/blob/main/docs/owasp-agentic-alignment.md)
