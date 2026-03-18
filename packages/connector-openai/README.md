# @authensor/connector-openai

Safety connector for the OpenAI API. Wraps the official `openai` SDK so every `chat.completions.create()` call goes through Authensor policy evaluation and Aegis content scanning.

## Quickstart

```bash
npm install @authensor/connector-openai openai
```

```typescript
import { createSafeOpenAIClient } from '@authensor/connector-openai';

const client = await createSafeOpenAIClient({
  apiKey: process.env.OPENAI_API_KEY,
  policy: {
    id: 'my-policy',
    name: 'My Policy',
    version: '1.0.0',
    rules: [
      { id: 'allow-all', effect: 'allow' },
    ],
  },
});

const response = await client.chat.completions.create({
  model: 'gpt-4o',
  messages: [{ role: 'user', content: 'Hello' }],
});
```

## What it does

1. Before each `chat.completions.create()` call, the request content is evaluated against your policy using the Authensor engine.
2. If the policy says **deny**, an `AuthensorDeniedError` is thrown.
3. If the policy says **escalate** (`require_approval`), an `AuthensorEscalationError` is thrown.
4. If the policy says **allow**, the request is forwarded to the OpenAI API.
5. After receiving a response, Aegis scans the output for threats (PII, injection, credentials, exfiltration).
6. If Aegis flags the response, an `AuthensorContentThreatError` is thrown.

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `apiKey` | `string` | env var | OpenAI API key |
| `policy` | `Policy \| string` | required | Authensor policy object or YAML string |
| `principalId` | `string` | `'openai-connector'` | ID for audit trail |
| `aegisEnabled` | `boolean` | `true` | Enable Aegis response scanning |
| `onEvaluation` | `function` | - | Callback after policy evaluation |
| `onAegisThreat` | `function` | - | Callback when Aegis flags content |

## License

MIT
