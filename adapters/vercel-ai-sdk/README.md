# @authensor/vercel-ai-sdk

Authensor guardrail adapter for the [Vercel AI SDK](https://sdk.vercel.ai). Evaluates tool calls against Authensor policies, integrating with the AI SDK's tool execution flow and `experimental_needsApproval` flag.

## Installation

```bash
npm install @authensor/vercel-ai-sdk ai
```

## Quick Start

```typescript
import { generateText, tool } from 'ai';
import { openai } from '@ai-sdk/openai';
import { z } from 'zod';
import { AuthensorVercelGuard } from '@authensor/vercel-ai-sdk';

const guard = new AuthensorVercelGuard({
  controlPlaneUrl: 'http://localhost:3000',
  apiKey: process.env.AUTHENSOR_API_KEY,
});

// Wrap your tools — execute is gated by Authensor
const tools = guard.wrapTools({
  getWeather: tool({
    description: 'Get the weather for a city',
    parameters: z.object({ city: z.string() }),
    execute: async ({ city }) => {
      const response = await fetch(`https://api.weather.com/${city}`);
      return response.json();
    },
  }),
  sendEmail: tool({
    description: 'Send an email',
    parameters: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
    execute: async ({ to, subject, body }) => {
      return await emailService.send({ to, subject, body });
    },
  }),
});

const { text } = await generateText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'What is the weather in Dublin?',
});
```

## Using `needsApproval`

Delegate approval decisions to Authensor using the AI SDK's built-in human-in-the-loop:

```typescript
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { AuthensorVercelGuard } from '@authensor/vercel-ai-sdk';

const guard = new AuthensorVercelGuard('http://localhost:3000');

const tools = {
  sendEmail: tool({
    description: 'Send an email',
    parameters: z.object({ to: z.string(), body: z.string() }),
    execute: async ({ to, body }) => emailService.send({ to, body }),
    // Authensor decides if this tool needs human approval
    experimental_needsApproval: guard.needsApproval('sendEmail'),
  }),
};

const result = await generateText({
  model: openai('gpt-4o'),
  tools,
  prompt: 'Send a welcome email to new-user@example.com',
  maxSteps: 5,
});
```

## Wrapping Individual Tools

```typescript
const weatherTool = guard.wrapTool('getWeather', {
  description: 'Get weather',
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => fetchWeather(city),
});
```

## Manual Evaluation

For full control over the policy decision:

```typescript
const result = await guard.evaluate('sendEmail', { to: 'admin@company.com' });

if (result.allowed) {
  await sendEmail({ to: 'admin@company.com' });
} else if (result.requiresApproval) {
  // Present to user for approval
  console.log(`Approval required: ${result.reason}`);
} else {
  console.error(`Denied: ${result.reason}`);
}
```

## Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `controlPlaneUrl` | `string` | (required) | Authensor control plane URL |
| `apiKey` | `string` | `AUTHENSOR_API_KEY` env | API key for authentication |
| `principalId` | `string` | `'vercel-ai-agent'` | Identifier for this agent |
| `principalType` | `string` | `'agent'` | One of: user, agent, service, system |
| `environment` | `string` | `NODE_ENV` | One of: development, staging, production |

## Error Handling

```typescript
import { AuthensorDeniedError } from '@authensor/vercel-ai-sdk';

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

## How It Works

1. **`wrapTools`** — Intercepts the `execute` function on each tool. Before the original handler runs, Authensor evaluates the tool name and arguments against active policies.
2. **`needsApproval`** — Returns a function compatible with the AI SDK's `experimental_needsApproval`. It calls Authensor's evaluate endpoint and returns `true` if the policy says `require_approval` or `deny`.
3. **Fail-closed** — If the Authensor control plane is unreachable, the tool call is blocked. This matches Authensor's core principle of failing safe.

## License

MIT
