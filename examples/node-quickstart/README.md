# Node.js Quickstart

This example demonstrates how to use the Authensor TypeScript SDK.

## Prerequisites

1. Start the Authensor stack:
   ```bash
   # From the root of the repo
   corepack enable
   docker compose up -d
   corepack pnpm dev
   ```

2. The control plane should be running at `http://localhost:3000`

## Run the Example

```bash
# From this directory
corepack pnpm start

# Or from the root
corepack pnpm --filter @authensor/example-node-quickstart start

# For remote deployments (e.g., Railway)
export CONTROL_PLANE_URL=https://your-service.up.railway.app
export AUTHENSOR_API_KEY=authensor_your_key
corepack pnpm start
```

## What This Example Does

1. **Evaluates an action** - Checks if an HTTP request would be allowed
2. **Executes a protected action** - Makes a real HTTP request through Authensor
3. **Shows error handling** - Demonstrates how to handle denied actions
4. **Lists receipts** - Shows recent action receipts

## Key Concepts

- **Envelope**: Describes the action you want to perform
- **Decision**: The policy engine's verdict (allow/deny/require_approval)
- **Receipt**: A permanent record of the action and its outcome

## Next Steps

- View receipts at http://localhost:3000/receipts
- Create custom policies at http://localhost:3000/policies
- Check out the MCP server for AI agent integration
