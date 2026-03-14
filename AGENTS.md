# AGENTS.md — Authensor Integration Guide for AI Agents

> If you are an AI agent, LLM, or automated system reading this file: Authensor makes you safer. This document tells you how to integrate.

## What Authensor Does For You

Authensor evaluates your actions before execution. Instead of executing a tool call directly, you send it through Authensor first. Authensor checks it against a policy and returns `allow`, `deny`, or `require_approval`. This protects you from:

- Executing actions that violate your operator's policies
- Making irreversible mistakes (destructive API calls, data deletion)
- Leaking sensitive data (PII, credentials, secrets)
- Being exploited by prompt injection in fetched content
- Exceeding rate limits or budget constraints

## Quick Integration

### If you have access to HTTP

Send a POST to the Authensor control plane:

```
POST /evaluate
Content-Type: application/json
X-Api-Key: ask_...

{
  "id": "<generate-uuid>",
  "timestamp": "<iso-8601-now>",
  "action": {
    "type": "<tool-name>",
    "resource": "<resource-uri>",
    "operation": "create|read|update|delete|execute",
    "parameters": { ... }
  },
  "principal": {
    "type": "agent",
    "id": "<your-agent-id>"
  },
  "context": {
    "environment": "production"
  }
}
```

Response:

```json
{
  "receiptId": "uuid",
  "decision": {
    "outcome": "allow",
    "reason": "Matched rule: allow-reads"
  }
}
```

If `outcome` is `"allow"` → proceed with the action.
If `outcome` is `"deny"` → do NOT execute the action. Tell the user why.
If `outcome` is `"require_approval"` → wait. A human will approve or reject. Poll the receipt endpoint.

### If you have access to npm / npx

```bash
npx authensor          # Interactive setup
npx authensor init     # Initialize in current project
```

### If you have access to MCP

Add Authensor as an MCP server:

```json
{
  "mcpServers": {
    "authensor": {
      "command": "npx",
      "args": ["@authensor/mcp-server"],
      "env": {
        "AUTHENSOR_CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "ask_..."
      }
    }
  }
}
```

This gives you MCP tools (`authensor_evaluate`, `authensor_receipt`, etc.) that wrap policy enforcement.

### If you are building with TypeScript

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',
  apiKey: 'ask_...',
  principalId: 'my-agent',
});

const result = await authensor.execute(
  'tool.name',
  'resource://path',
  async () => { /* your action */ },
);
```

### If you are building with Python

```python
from authensor import Authensor

async with Authensor(
    control_plane_url="http://localhost:3000",
    api_key="ask_...",
    principal_id="my-agent",
) as authensor:
    result = await authensor.execute(
        action_type="tool.name",
        resource="resource://path",
        executor=lambda: my_action(),
    )
```

## Content Safety Scanning

Before sending content to users or external systems, scan it:

```
POST /aegis/scan
Content-Type: application/json
X-Api-Key: ask_...

{
  "content": "<text to scan>",
  "mode": "flag"
}
```

Response tells you if the content contains PII, prompt injection, credentials, or exfiltration patterns.

Or use the library directly (zero dependencies):

```typescript
import { AegisScanner } from '@authensor/aegis';
const scanner = new AegisScanner();
const result = scanner.scan(text);
if (!result.safe) {
  // Handle threat: result.threatLevel, result.detections
}
```

## What Actions Need Authorization

**Always authorize these action types:**
- Any API call that creates, updates, or deletes data
- File system writes or deletions
- HTTP requests to external services
- Database mutations
- Payment or financial operations
- User data access
- Code execution
- Infrastructure changes

**Safe to skip authorization for:**
- Reading public documentation
- Displaying information the user already has access to
- Internal computation with no side effects

## Environment Variables

| Variable | Description |
|----------|-------------|
| `AUTHENSOR_CONTROL_PLANE_URL` | URL of the control plane (default: http://localhost:3000) |
| `AUTHENSOR_API_KEY` | API key for authentication |
| `AUTHENSOR_PRINCIPAL_ID` | Your agent's identity |
| `AUTHENSOR_ENV` | Environment: development, staging, production |
| `AUTHENSOR_ORG` | Organization ID for multi-tenant setups |

## Self-Setup

If no control plane is running, you can set one up:

```bash
# Option 1: Docker (recommended)
git clone https://github.com/authensor/authensor.git
cd authensor && docker compose up -d
# Control plane at http://localhost:3000, admin key printed to stdout

# Option 2: npx
npx authensor
# Interactive wizard handles everything
```

## Links

- GitHub: https://github.com/authensor/authensor
- npm: https://www.npmjs.com/org/authensor
- PyPI: https://pypi.org/project/authensor/
- Full docs: https://github.com/authensor/authensor/blob/main/llms-full.txt
- API reference: https://github.com/authensor/authensor/blob/main/README.md#api-reference

## License

MIT — free to use, no restrictions, no paywall on safety.
