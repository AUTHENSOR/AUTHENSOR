<!-- Moved out of the top-level README so it stays readable.     The README renders as the AUTHENSOR account profile. -->## Quickstart

### Self-hosted (recommended)

```bash
git clone https://github.com/authensor/authensor.git
cd authensor
docker compose up -d
# Control plane running at http://localhost:3000
# Admin token printed to logs: docker compose logs control-plane
```

That's it. Postgres starts, migrations run, a bootstrap admin key is created, and a default-safe policy (deny-by-default) is provisioned. Aegis content safety and Sentinel monitoring are enabled out of the box.

### Add to any agent (TypeScript)

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',
  principalId: 'my-agent',
});

const result = await authensor.execute(
  'stripe.charges.create',
  'stripe://customers/cus_123/charges',
  async () => stripe.charges.create({ amount: 1000, currency: 'usd' }),
  { constraints: { maxAmount: 10000 } }
);
// Receipt created, policy enforced, action audited
```

### Add to any agent (Python)

```python
from authensor import Authensor

async with Authensor(
    control_plane_url="http://localhost:3000",
    principal_id="my-agent",
) as authensor:
    result = await authensor.execute(
        action_type="stripe.charges.create",
        resource="stripe://customers/cus_123/charges",
        executor=lambda: create_charge(),
        constraints={"max_amount": 10000},
    )
```

### Framework adapters

Drop-in integration for popular agent frameworks:

```typescript
// LangChain / LangGraph
import { AuthensorGuard } from '@authensor/langchain';
const guard = new AuthensorGuard({ controlPlaneUrl: '...' });

// OpenAI Agents SDK (factory, not a class)
import { createAuthensorGuardrail } from '@authensor/openai';
const guardrail = createAuthensorGuardrail({ controlPlaneUrl: '...' });

// Vercel AI SDK
import { AuthensorVercelGuard } from '@authensor/vercel-ai-sdk';

// Claude Agent SDK
import { AuthensorClaudeGuard } from '@authensor/claude-agent-sdk';

// Claude Code (hooks-based integration)
// See docs/integrations/claude-code.md
```

CrewAI ships as a Python package, `authensor-crewai`:

```python
from authensor_crewai import AuthensorGuard
```

## CLI

```bash
# Lint a policy for common issues
authensor policy lint policy.json

# Test a policy against scenarios
authensor policy test policy.json scenarios.json

# Diff two policy versions
authensor policy diff v1.json v2.json
```
