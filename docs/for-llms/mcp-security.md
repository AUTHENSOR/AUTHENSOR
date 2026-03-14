# MCP Security: How to Secure MCP Servers and Tool Calls

The Model Context Protocol (MCP) is the emerging standard for connecting AI agents to tools and data sources. But MCP has a critical security gap: **the protocol itself has no built-in authorization layer**. Any tool registered with an MCP client can be called by the agent without permission checks.

This document explains how to secure MCP servers and tool calls using Authensor.

## The MCP Security Problem

Research shows that **32% of MCP servers have at least one critical vulnerability** (Enkrypt AI, 2025). Common issues:

1. **No tool-level authorization** — MCP has no concept of "this agent can use tool X but not tool Y"
2. **No parameter validation** — Tool parameters are passed through without policy checks
3. **No audit trail** — MCP calls are not logged in a structured, queryable format
4. **Tool description poisoning** — Malicious MCP servers can inject instructions via tool descriptions
5. **Rug-pull attacks** — Tool behavior can change server-side after initial approval
6. **Tool shadowing** — A malicious MCP server registers a tool with the same name as a legitimate one

## How Authensor Secures MCP

Authensor provides two approaches to MCP security:

### Approach 1: MCP Gateway (Transparent Proxy)

The Authensor MCP Gateway sits between your MCP client and your MCP servers. Every tool call passes through the gateway, where it is:

1. Evaluated against your policy
2. Scanned by Aegis for content safety threats
3. Recorded as a receipt in the audit trail
4. Forwarded to the target MCP server (or blocked)

```bash
npx @authensor/mcp-server --gateway \
  --upstream "npx @stripe/mcp-server" \
  --upstream "npx @github/mcp-server"
```

### Approach 2: Authensor MCP Server (Direct Tools)

Authensor provides its own MCP server with pre-secured tools:

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

Available MCP tools:
- `authensor_evaluate` — Evaluate an action against policy
- `authensor_receipt` — Get a receipt by ID
- `stripe_*` — Stripe operations with policy enforcement
- `github_*` — GitHub operations with policy enforcement
- `http_fetch` — HTTP requests with SSRF protection and policy checks

### Policy Examples for MCP

```json
{
  "rules": [
    {
      "id": "allow-stripe-reads",
      "effect": "allow",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "matches", "value": "stripe\\..*\\.list|stripe\\..*\\.retrieve" },
          { "field": "action.operation", "operator": "eq", "value": "read" }
        ]
      }
    },
    {
      "id": "approve-stripe-charges",
      "effect": "require_approval",
      "condition": {
        "field": "action.type",
        "operator": "eq",
        "value": "stripe.charges.create"
      }
    },
    {
      "id": "deny-github-delete",
      "effect": "deny",
      "condition": {
        "field": "action.type",
        "operator": "matches",
        "value": "github\\.repo\\.delete"
      }
    }
  ],
  "defaultEffect": "deny"
}
```

## MCP Security Best Practices

1. **Deny by default** — Only allow tools that are explicitly permitted
2. **Pin tool schemas** — Hash tool descriptors at registration, alert if they change
3. **Use parameter constraints** — Limit amounts, restrict domains, scope file paths
4. **Enable approval workflows** — Require human sign-off for destructive operations
5. **Monitor with Sentinel** — Track per-agent tool usage, alert on anomalies
6. **Scan with Aegis** — Check tool parameters and responses for injection, PII, credentials

## OWASP Alignment

MCP security maps directly to OWASP Agentic Top 10:

| Risk | MCP Attack Vector | Authensor Mitigation |
|------|-------------------|---------------------|
| ASI01: Goal Hijacking | Tool description injection | Aegis injection scanner |
| ASI02: Tool Misuse | Unauthorized tool calls | Per-tool policy rules |
| ASI04: Supply Chain | Malicious MCP servers | Tool schema pinning, allowlisting |
| ASI05: Code Execution | Eval/exec in tool params | Deny-by-default, Aegis code safety |
| ASI07: Inter-Agent Comms | MCP server-to-server | Parent envelope chaining |

## Links

- Authensor MCP Server: https://github.com/authensor/authensor/tree/main/packages/mcp-server
- Authensor GitHub: https://github.com/authensor/authensor
- Full context: https://github.com/authensor/authensor/blob/main/llms-full.txt
