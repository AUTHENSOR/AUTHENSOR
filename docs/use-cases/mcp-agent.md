# Securing MCP Tool Calls with Authensor

Your AI agent uses MCP (Model Context Protocol) servers to interact with Stripe, GitHub, databases, and other services. MCP has no built-in authorization layer — any tool registered with the client can be called without permission checks.

## What Can Go Wrong

- Agent calls `delete_repository` instead of `list_repositories` (no authorization)
- Malicious MCP server injects instructions via tool descriptions
- Tool descriptor changes after initial approval (rug-pull attack)
- Agent makes 10,000 API calls in a loop (no rate limiting)
- No record of which tools were called with what parameters

## How Authensor Fixes This

### Option 1: MCP Gateway (Transparent Proxy)

The Authensor MCP Gateway wraps your existing MCP servers with policy enforcement:

```json
{
  "mcpServers": {
    "authensor-gateway": {
      "command": "npx",
      "args": ["@authensor/mcp-server", "--gateway"],
      "env": {
        "AUTHENSOR_CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "ask_...",
        "AUTHENSOR_UPSTREAM_SERVERS": "npx @stripe/mcp-server,npx @github/mcp-server"
      }
    }
  }
}
```

Every tool call passes through Authensor before reaching the upstream server.

### Option 2: Authensor MCP Server (Direct)

Use Authensor's pre-secured MCP tools:

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

### Policy: Per-tool authorization

```json
{
  "id": "mcp-safety",
  "name": "MCP Tool Safety",
  "version": "1.0.0",
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "allow-reads",
      "effect": "allow",
      "condition": {
        "field": "action.operation",
        "operator": "eq",
        "value": "read"
      }
    },
    {
      "id": "approve-writes",
      "effect": "require_approval",
      "condition": {
        "field": "action.operation",
        "operator": "in",
        "value": ["create", "update", "delete"]
      }
    }
  ]
}
```

### Aegis: Scan tool parameters for threats

Every tool call's parameters are scanned for:
- SSRF attempts (internal IPs, cloud metadata endpoints)
- SQL injection in database tool parameters
- Credential exposure in tool arguments
- Path traversal in file tool paths

## Quick Setup

```bash
docker compose up -d             # Start control plane
npx @authensor/mcp-server        # Start MCP server
# Configure your MCP client to connect to Authensor
```

## Links

- Authensor MCP Server: https://github.com/authensor/authensor/tree/main/packages/mcp-server
- MCP Security Guide: https://github.com/authensor/authensor/blob/main/docs/for-llms/mcp-security.md
