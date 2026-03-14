# @authensor/claude-agent-sdk

Authensor guardrail adapter for the [Claude Agent SDK](https://github.com/anthropics/anthropic-sdk-python). Evaluates every tool call against Authensor policies before execution.

## Installation

```bash
npm install @authensor/claude-agent-sdk @anthropic-ai/sdk
```

## Quick Start

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { AuthensorClaudeGuard } from '@authensor/claude-agent-sdk';

const client = new Anthropic();
const guard = new AuthensorClaudeGuard({
  controlPlaneUrl: 'http://localhost:3000',
  apiKey: process.env.AUTHENSOR_API_KEY,
});

// Define your tools
const tools = [
  {
    name: 'send_email',
    description: 'Send an email',
    input_schema: {
      type: 'object',
      properties: {
        to: { type: 'string' },
        subject: { type: 'string' },
        body: { type: 'string' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
];

// Handle tool calls with Authensor evaluation
async function handleToolCall(name: string, input: Record<string, unknown>) {
  // Evaluate before executing — throws if denied
  await guard.guard(name, input);

  // If we get here, the action is allowed
  switch (name) {
    case 'send_email':
      return await sendEmail(input);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

## Wrapping Tool Handlers

For a cleaner pattern, wrap your handlers directly:

```typescript
import { AuthensorClaudeGuard } from '@authensor/claude-agent-sdk';

const guard = new AuthensorClaudeGuard('http://localhost:3000');

// Wrap individual handlers
const safeSendEmail = guard.wrapHandler('send_email', async (input) => {
  return await emailService.send(input);
});

// Or wrap tool/handler pairs
const { tool, handler } = guard.wrapTool(
  { name: 'send_email', description: 'Send an email' },
  async (input) => emailService.send(input),
);

// Or wrap all tools at once
const safeTools = guard.wrapTools([
  { tool: sendEmailTool, handler: sendEmailHandler },
  { tool: readFileTool, handler: readFileHandler },
]);
```

## Approval Flow

Handle `require_approval` decisions with a callback:

```typescript
const guard = new AuthensorClaudeGuard({
  controlPlaneUrl: 'http://localhost:3000',
  onApprovalRequired: async (toolName, args, reason) => {
    console.log(`Tool "${toolName}" requires approval: ${reason}`);
    // Implement your approval logic (Slack notification, human-in-the-loop, etc.)
    const approved = await askHumanForApproval(toolName, args);
    return approved;
  },
});
```

## Manual Evaluation

For full control over the evaluation result:

```typescript
const result = await guard.evaluate('send_email', { to: 'admin@company.com' });

if (result.allowed) {
  await sendEmail({ to: 'admin@company.com' });
} else if (result.requiresApproval) {
  // Queue for human review
  await queueForApproval(result.receiptId);
} else {
  console.error(`Denied: ${result.reason}`);
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `controlPlaneUrl` | `string` | (required) | Authensor control plane URL |
| `apiKey` | `string` | `AUTHENSOR_API_KEY` env | API key for authentication |
| `principalId` | `string` | `'claude-agent'` | Identifier for this agent |
| `principalType` | `string` | `'agent'` | One of: user, agent, service, system |
| `environment` | `string` | `NODE_ENV` | One of: development, staging, production |
| `onApprovalRequired` | `function` | `undefined` | Async callback for approval decisions |

## Error Handling

```typescript
import { AuthensorDeniedError } from '@authensor/claude-agent-sdk';

try {
  await guard.guard('dangerous_action', { target: 'production' });
} catch (err) {
  if (err instanceof AuthensorDeniedError) {
    console.log(err.toolName);   // 'dangerous_action'
    console.log(err.outcome);    // 'deny'
    console.log(err.receiptId);  // 'receipt-...'
  }
}
```

## License

MIT
