# Authensor: Policy-Based Authorization for LangChain Agents

> **Target repo:** [langchain-ai/langchain](https://github.com/langchain-ai/langchain) (docs/docs/integrations/tools/)
> **Proposed path:** `docs/docs/integrations/tools/authensor.md`

---

## Overview

[Authensor](https://github.com/authensor/authensor) adds policy-based authorization to LangChain tool calls. Every tool invocation is evaluated against a YAML policy before execution. Decisions are `allow`, `require_approval`, or `deny`. Every decision produces a hash-chained cryptographic receipt for auditing.

## Installation

```bash
npm install @authensor/langchain
# or
pip install authensor   # Python SDK also available
```

You also need the Authensor control plane running:

```bash
npx create-authensor@latest my-agent
cd my-agent
docker compose up -d    # Starts on http://localhost:3000
```

## 3-Line Integration

```typescript
import { AuthensorGuard } from "@authensor/langchain";

const guard = new AuthensorGuard("http://localhost:3000");
const safeTool = guard.wrap(myTool);
```

That's it. `safeTool` works exactly like `myTool`, but every `.invoke()` call is evaluated against your Authensor policy first. If the policy says deny, the tool throws instead of executing.

## Full Example: Protecting a LangChain Agent

### Define Your Tools

```typescript
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const readFileTool = new DynamicStructuredTool({
  name: "read_file",
  description: "Read a file from disk",
  schema: z.object({ path: z.string() }),
  func: async ({ path }) => {
    const fs = await import("fs/promises");
    return fs.readFile(path, "utf-8");
  },
});

const writeFileTool = new DynamicStructuredTool({
  name: "write_file",
  description: "Write content to a file",
  schema: z.object({ path: z.string(), content: z.string() }),
  func: async ({ path, content }) => {
    const fs = await import("fs/promises");
    await fs.writeFile(path, content);
    return `Written to ${path}`;
  },
});

const sendEmailTool = new DynamicStructuredTool({
  name: "send_email",
  description: "Send an email",
  schema: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
  func: async ({ to, subject }) => {
    // Email sending logic here
    return `Email sent to ${to}: ${subject}`;
  },
});

const deleteFileTool = new DynamicStructuredTool({
  name: "delete_file",
  description: "Delete a file from disk",
  schema: z.object({ path: z.string() }),
  func: async ({ path }) => {
    const fs = await import("fs/promises");
    await fs.unlink(path);
    return `Deleted ${path}`;
  },
});
```

### Wrap With Authensor

```typescript
import { AuthensorGuard } from "@authensor/langchain";

const guard = new AuthensorGuard({
  controlPlaneUrl: "http://localhost:3000",
  apiKey: process.env.AUTHENSOR_API_KEY,
  principalId: "langchain-research-agent",
  principalType: "agent",
  environment: "production",
});

// Wrap each tool -- order doesn't matter
const safeTools = [
  guard.wrap(readFileTool),
  guard.wrap(writeFileTool),
  guard.wrap(sendEmailTool),
  guard.wrap(deleteFileTool),
];
```

### Use With an Agent

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { AgentExecutor, createToolCallingAgent } from "langchain/agents";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const llm = new ChatOpenAI({ model: "gpt-4o" });

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "You are a helpful assistant with access to file and email tools."],
  ["placeholder", "{chat_history}"],
  ["human", "{input}"],
  ["placeholder", "{agent_scratchpad}"],
]);

const agent = createToolCallingAgent({ llm, tools: safeTools, prompt });
const executor = new AgentExecutor({ agent, tools: safeTools });

// This works -- read_file is allowed
await executor.invoke({ input: "Read the file at ./output/report.txt" });

// This throws -- delete_file is denied by policy
await executor.invoke({ input: "Delete the file at /etc/passwd" });
// Error: Action denied by Authensor: Agents should not delete files without human oversight
```

## Policy Configuration

Here is the policy that controls the behavior above. Create this as `policy.yaml` and upload it to the control plane:

```yaml
id: langchain-agent-policy
name: LangChain Agent Safety Policy
version: "1.0.0"
priority: 100

scope:
  actionTypes:
    - "langchain.*"
  principalTypes:
    - agent

rules:
  # File reads are always safe
  - id: allow-file-read
    name: Allow file reads
    effect: allow
    condition:
      field: action.type
      operator: eq
      value: langchain.read_file

  # Block writes to sensitive paths
  - id: deny-sensitive-write
    name: Deny writes to sensitive paths
    effect: deny
    condition:
      all:
        - field: action.type
          operator: eq
          value: langchain.write_file
        - any:
            - field: action.parameters.path
              operator: startsWith
              value: /etc/
            - field: action.parameters.path
              operator: startsWith
              value: /System/
            - field: action.parameters.path
              operator: contains
              value: .env
            - field: action.parameters.path
              operator: contains
              value: .ssh
            - field: action.parameters.path
              operator: contains
              value: credentials

  # Allow writes to safe directories
  - id: allow-safe-write
    name: Allow writes to project output
    effect: allow
    condition:
      all:
        - field: action.type
          operator: eq
          value: langchain.write_file
        - field: action.parameters.path
          operator: startsWith
          value: ./output/

  # Email requires human approval
  - id: approve-email
    name: Require approval for email
    effect: require_approval
    condition:
      field: action.type
      operator: eq
      value: langchain.send_email
    approvalConfig:
      approvers:
        - type: user
          id: security-team
      expiresIn: "1h"
      requiredApprovals: 1

  # Block all file deletions
  - id: deny-delete
    name: Block file deletion
    effect: deny
    condition:
      field: action.type
      operator: eq
      value: langchain.delete_file

  # Block command execution
  - id: deny-command
    name: Block shell commands
    effect: deny
    condition:
      field: action.type
      operator: eq
      value: langchain.execute_command

defaultEffect: deny
```

## Policy Examples for Common LangChain Tools

### Restricting by Parameter Values

Block web requests to internal networks:

```yaml
- id: deny-internal-requests
  name: Block requests to internal networks
  effect: deny
  condition:
    all:
      - field: action.type
        operator: eq
        value: langchain.requests_get
      - any:
          - field: action.parameters.url
            operator: startsWith
            value: "http://10."
          - field: action.parameters.url
            operator: startsWith
            value: "http://192.168."
          - field: action.parameters.url
            operator: contains
            value: "localhost"
```

### Rate Limiting

Limit an agent to 10 API calls per minute:

```yaml
- id: rate-limit-api
  name: Rate limit API calls
  effect: allow
  condition:
    field: action.type
    operator: eq
    value: langchain.api_call
  rateLimit:
    requests: 10
    window: "1m"
    scope: principal
```

### Environment-Specific Rules

Allow database writes only in development:

```yaml
scope:
  environments:
    - development

rules:
  - id: allow-db-write-dev
    name: Allow DB writes in dev only
    effect: allow
    condition:
      field: action.type
      operator: eq
      value: langchain.db_write
```

## Comparison: With vs Without Authensor

### Without Authensor

```typescript
const tools = [readFileTool, writeFileTool, sendEmailTool, deleteFileTool];
const executor = new AgentExecutor({ agent, tools });

// Agent can call ANY tool with ANY arguments:
await executor.invoke({ input: "Delete /etc/passwd" });
// Result: file deleted. No check. No log.
```

### With Authensor

```typescript
const guard = new AuthensorGuard("http://localhost:3000");
const tools = [readFileTool, writeFileTool, sendEmailTool, deleteFileTool].map(
  (t) => guard.wrap(t)
);
const executor = new AgentExecutor({ agent, tools });

// Agent tries to call delete_file:
await executor.invoke({ input: "Delete /etc/passwd" });
// Error: Action denied by Authensor: Agents should not delete files

// But read_file works fine:
await executor.invoke({ input: "Read ./output/report.txt" });
// Result: file contents returned

// And every decision has a cryptographic receipt in the audit trail
```

| Aspect | Without | With Authensor |
|--------|---------|----------------|
| Tool call control | None | YAML policy with allow/deny/approve |
| Audit trail | None | Hash-chained cryptographic receipts |
| Approval workflows | None | Built-in human-in-the-loop |
| Rate limiting | None | Per-principal, per-action, or global |
| Default behavior | Fail-open | Fail-closed |
| Parameter inspection | None | Conditions on any parameter value |
| Integration effort | N/A | 3 lines of code |

## Audit Trail

Every policy decision produces a tamper-evident receipt:

```bash
curl http://localhost:3000/receipts?limit=5 \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY"
```

Receipts are hash-chained (each includes the hash of the previous receipt). Tampering with any receipt breaks the chain. This satisfies audit requirements for SOC 2, HIPAA, and EU AI Act Article 12.

## Links

- [@authensor/langchain on npm](https://www.npmjs.com/package/@authensor/langchain)
- [Authensor GitHub](https://github.com/authensor/authensor) -- MIT licensed
- [Policy Template Library](https://github.com/authensor/authensor/tree/main/policies)
- [Full Documentation](https://authensor.dev)
