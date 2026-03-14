# Authensor + Claude Code / Cursor IDE

Policy enforcement, approval workflows, and a tamper-proof audit trail for every action your AI coding assistant takes.

## Overview

Authensor sits between your AI agent (Claude Code, Cursor, or any MCP-compatible client) and the tools it calls. Every tool invocation is:

1. **Evaluated** against your policy (allow / deny / require_approval)
2. **Recorded** as an immutable receipt with full parameters and result
3. **Gated** by optional multi-party approval before execution

The control plane exposes a standard REST API. The MCP gateway speaks the Model Context Protocol so it drops into Claude Code and Cursor as a transparent proxy.

```
┌──────────────┐     MCP (stdio)     ┌──────────────────┐     HTTP     ┌─────────────────┐
│  Claude Code │ ──────────────────>  │  Authensor MCP   │ ──────────> │  Control Plane   │
│  / Cursor    │                      │  Gateway         │             │  (policy engine) │
└──────────────┘                      └────────┬─────────┘             └─────────────────┘
                                               │ MCP (stdio)
                                      ┌────────▼─────────┐
                                      │  Upstream MCP    │
                                      │  Server (any)    │
                                      └──────────────────┘
```

---

## 1. Quick Setup with SafeClaw

SafeClaw is the fastest way to try Authensor locally. It bundles a policy-gated AI agent that evaluates every action before executing it.

```bash
# Install and initialize with demo credentials
npx safeclaw init --demo

# Run a task — every tool call goes through policy evaluation
npx safeclaw run "list my files"
```

Check what happened:

```bash
# View receipts (every action the agent attempted)
safeclaw receipts

# View pending approvals
safeclaw approvals

# Approve a pending action
safeclaw approvals approve <receipt-id>
```

SafeClaw supports both Anthropic and OpenAI providers:

```bash
# OpenAI
safeclaw init --provider openai --auth-token <token>
export OPENAI_API_KEY=sk-...
safeclaw run "refactor the utils module"
```

### Dry Run

Preview what a policy would do without starting the agent:

```bash
safeclaw run --dry-run "deploy to production"
```

This prints the policy simulation for common action types (`filesystem.write`, `safe.read.file`, `network.http`, `code.exec`) and exits.

---

## 2. MCP Server Integration

The Authensor MCP Gateway is a transparent proxy. It sits in front of any upstream MCP server, intercepts every `tools/call`, evaluates it against your policies, and forwards allowed calls to the upstream.

### Claude Code

Add to `~/.claude/settings.json` (or your project's `.claude/settings.json`):

```json
{
  "mcpServers": {
    "authensor": {
      "command": "npx",
      "args": ["authensor-mcp-gateway"],
      "env": {
        "CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "your-api-key",
        "UPSTREAM_COMMAND": "npx @modelcontextprotocol/server-filesystem /home/user/projects"
      }
    }
  }
}
```

### Cursor IDE

Open **Settings > MCP** and add a new server with the same configuration:

```json
{
  "mcpServers": {
    "authensor-filesystem": {
      "command": "npx",
      "args": ["authensor-mcp-gateway"],
      "env": {
        "CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "your-api-key",
        "UPSTREAM_COMMAND": "npx @modelcontextprotocol/server-filesystem /home/user/projects"
      }
    }
  }
}
```

### How It Works

1. The gateway spawns the upstream MCP server as a child process
2. It lists the upstream's tools and re-exposes them as its own
3. On every `tools/call`, it creates an action envelope and sends it to `POST /evaluate`
4. If the decision is `allow`, the call is forwarded to the upstream server
5. If the decision is `deny`, the agent receives an error with the reason
6. If the decision is `require_approval`, the call blocks until approved via the dashboard or CLI
7. A receipt is recorded for every call (allowed, denied, or pending)

### Environment Variables

| Variable | Required | Description |
|---|---|---|
| `CONTROL_PLANE_URL` | Yes | URL of the Authensor control plane |
| `UPSTREAM_COMMAND` | Yes | Command to spawn the upstream MCP server |
| `AUTHENSOR_API_KEY` | No | API key for control plane authentication |
| `AUTHENSOR_PRINCIPAL_ID` | No | Principal ID for policy evaluation (default: `mcp-gateway`) |

### Multiple Upstream Servers

Register one gateway per upstream server. Each gets its own policy namespace:

```json
{
  "mcpServers": {
    "authensor-fs": {
      "command": "npx",
      "args": ["authensor-mcp-gateway"],
      "env": {
        "CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "your-api-key",
        "UPSTREAM_COMMAND": "npx @modelcontextprotocol/server-filesystem /home/user/projects"
      }
    },
    "authensor-github": {
      "command": "npx",
      "args": ["authensor-mcp-gateway"],
      "env": {
        "CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "your-api-key",
        "UPSTREAM_COMMAND": "npx @modelcontextprotocol/server-github"
      }
    }
  }
}
```

Tool calls are namespaced as `mcp.<tool_name>` in the policy engine, so you can write rules that target specific tools across servers.

---

## 3. Policy Examples

Policies are JSON documents with ordered rules. First match wins. If no rule matches, `defaultEffect` applies.

### Coding Assistant: Read-Freely, Gate Writes

```json
{
  "id": "coding-assistant",
  "name": "Coding Assistant Policy",
  "version": "v1",
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "allow-reads",
      "effect": "allow",
      "description": "Allow all read-only operations",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "safe.read" },
          { "field": "action.type", "operator": "startsWith", "value": "mcp.read" },
          { "field": "action.type", "operator": "startsWith", "value": "mcp.list" },
          { "field": "action.type", "operator": "startsWith", "value": "mcp.search" },
          { "field": "action.type", "operator": "startsWith", "value": "mcp.get" }
        ]
      }
    },
    {
      "id": "approve-writes",
      "effect": "require_approval",
      "description": "Require approval for file writes",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "mcp.write" },
          { "field": "action.type", "operator": "startsWith", "value": "mcp.create" },
          { "field": "action.type", "operator": "startsWith", "value": "mcp.edit" },
          { "field": "action.type", "operator": "startsWith", "value": "filesystem." }
        ]
      }
    },
    {
      "id": "block-destructive",
      "effect": "deny",
      "description": "Block destructive shell commands",
      "condition": {
        "any": [
          { "field": "action.resource", "operator": "contains", "value": "rm -rf" },
          { "field": "action.resource", "operator": "contains", "value": "DROP TABLE" },
          { "field": "action.resource", "operator": "contains", "value": "DROP DATABASE" },
          { "field": "action.resource", "operator": "contains", "value": "chmod 777" },
          { "field": "action.resource", "operator": "contains", "value": "> /dev/" },
          { "field": "action.resource", "operator": "contains", "value": "mkfs" }
        ]
      }
    }
  ]
}
```

### Rate Limiting API Calls

Rules can include a `rateLimit` field to cap how many times an action can be invoked per time window:

```json
{
  "id": "rate-limited-api",
  "name": "Rate Limited API Access",
  "version": "v1",
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "allow-api-with-limit",
      "effect": "allow",
      "description": "Allow API calls, max 30 per minute",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "mcp.http" },
          { "field": "action.type", "operator": "startsWith", "value": "network." }
        ]
      },
      "rateLimit": {
        "requests": 30,
        "window": "1m",
        "scope": "principal"
      }
    }
  ]
}
```

Rate limit scopes:
- `principal` -- per-agent/user
- `action` -- per-action-type
- `global` -- across all principals

### Multi-Party Approval for High-Risk Actions

Require multiple approvers before a sensitive action executes:

```json
{
  "id": "approve-production-deploys",
  "effect": "require_approval",
  "description": "Two approvals required for production deployments",
  "condition": {
    "any": [
      { "field": "action.type", "operator": "eq", "value": "mcp.deploy" },
      { "field": "action.type", "operator": "startsWith", "value": "payments." }
    ]
  },
  "approvalConfig": {
    "requiredApprovals": 2,
    "expiresIn": "30m",
    "approvers": [
      { "type": "role", "id": "tech-lead" },
      { "type": "role", "id": "sre" }
    ]
  }
}
```

### Applying a Policy

Via SafeClaw CLI:

```bash
# Edit the policy file (created during init)
vim ~/.safeclaw/policies/default.json

# Push to control plane and activate
safeclaw policy apply
```

Via the REST API directly:

```bash
# Create the policy
curl -X POST http://localhost:3000/policies \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d @policy.json

# Activate it
curl -X POST http://localhost:3000/policies/active \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"policy_id": "coding-assistant", "version": "v1"}'
```

---

## 4. Approval Workflows

When a policy rule returns `require_approval`, the action is parked until a human signs off.

### Dashboard

The control plane serves an HTMX-powered admin dashboard at `/dashboard`. Open `http://localhost:3000/dashboard` to:

- View all pending approval requests
- Inspect the full action envelope (what the agent wants to do, with all parameters)
- Approve or reject with one click
- Review the full receipt history and audit trail

### CLI

```bash
# List pending approvals
safeclaw approvals

# Approve
safeclaw approvals approve <receipt-id>

# Reject
safeclaw approvals reject <receipt-id>
```

### REST API

```bash
# Get approval status (includes all responses for multi-party)
curl http://localhost:3000/approvals/<receipt-id> \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY"

# Submit an approval response (multi-party)
curl -X POST http://localhost:3000/approvals/<receipt-id>/respond \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "responderId": "alice@company.com",
    "responderName": "Alice",
    "decision": "approve",
    "comment": "Looks good"
  }'
```

For multi-party approval, the action executes only after the required number of `approve` responses are collected (quorum). If any responder rejects, the action is cancelled.

### SMS Notifications (Optional)

Set these environment variables to get texted when approval is needed:

```bash
export TWILIO_ACCOUNT_SID=AC...
export TWILIO_AUTH_TOKEN=...
export TWILIO_FROM_NUMBER=+1...
export SAFECLAW_NOTIFY_PHONE=+1...
```

---

## 5. Self-Hosted Setup

Run the full control plane locally with Docker Compose:

```bash
git clone https://github.com/authensor/authensor.git
cd authensor

# Start PostgreSQL + Control Plane + MCP Server
docker compose up -d
```

This starts:

| Service | Port | Description |
|---|---|---|
| `authensor-postgres` | 5432 | PostgreSQL 16 for receipts and policy storage |
| `authensor-control-plane` | 3000 | Policy evaluation API + admin dashboard |
| `authensor-mcp-server` | 3001 | MCP server with Stripe, GitHub, and HTTP tools |

### Bootstrap an API Key

On first run, set `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` to auto-create an admin key:

```bash
AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN=my-bootstrap-secret docker compose up -d
```

The admin API key is printed to the control plane's stdout. Retrieve it with:

```bash
docker logs authensor-control-plane 2>&1 | grep "API key"
```

Then use it for all subsequent API calls and MCP gateway configuration.

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `POSTGRES_USER` | `authensor` | Database user |
| `POSTGRES_PASSWORD` | `authensor_dev` | Database password |
| `POSTGRES_DB` | `authensor` | Database name |
| `AUTHENSOR_BOOTSTRAP_ADMIN_TOKEN` | (none) | Set on first run to create admin key |
| `AUTHENSOR_ALLOW_FALLBACK_POLICY` | `false` | If `true`, allow-all when no policy is configured. **Keep `false` in production** (fail-closed). |
| `AUTHENSOR_SANDBOX_MODE` | `real` | Set to `stub` for dry-run testing without real API calls |
| `AUTHENSOR_RL_INGEST_PER_MIN` | `120` | Rate limit for ingest (evaluate) requests |
| `AUTHENSOR_RL_ADMIN_PER_MIN` | `120` | Rate limit for admin requests |

### Point the MCP Gateway at Your Self-Hosted Instance

```json
{
  "mcpServers": {
    "authensor": {
      "command": "npx",
      "args": ["authensor-mcp-gateway"],
      "env": {
        "CONTROL_PLANE_URL": "http://localhost:3000",
        "AUTHENSOR_API_KEY": "your-admin-key-from-bootstrap",
        "UPSTREAM_COMMAND": "npx @modelcontextprotocol/server-filesystem /home/user/projects"
      }
    }
  }
}
```

---

## 6. Verifying It Works

### Check Connectivity

```bash
curl http://localhost:3000/health
# {"status":"ok"}

# Verify your API key
curl http://localhost:3000/whoami \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY"
# {"keyId":"...","role":"admin","name":"..."}
```

### Inspect Receipts

Every tool call creates a receipt, whether it was allowed, denied, or pending approval:

```bash
# List recent receipts
curl http://localhost:3000/receipts \
  -H "Authorization: Bearer $AUTHENSOR_API_KEY"
```

Each receipt includes:
- The full action envelope (type, resource, parameters, principal)
- The policy decision and which rule matched
- Execution status, duration, and result (if allowed and executed)
- Approval responses (if multi-party)

### Audit Trail with SafeClaw

SafeClaw maintains a local hash-chained audit log. Verify its integrity:

```bash
safeclaw audit             # View recent entries
safeclaw audit verify      # Verify hash chain integrity
```

---

## API Quick Reference

| Endpoint | Method | Role | Description |
|---|---|---|---|
| `/health` | GET | public | Health check |
| `/evaluate` | POST | ingest, admin | Evaluate an action against policies |
| `/receipts` | GET | admin | List receipts |
| `/receipts/:id` | GET | admin | Get receipt detail |
| `/receipts/:id/claim` | POST | executor, admin | Claim a receipt for execution |
| `/receipts/:id` | PATCH | executor, admin | Update receipt after execution |
| `/policies` | GET | admin | List policies |
| `/policies` | POST | admin | Create a policy |
| `/policies/active` | GET | admin | Get active policy |
| `/policies/active` | POST | admin | Set active policy |
| `/approvals/:id` | GET | admin | Get approval status |
| `/approvals/:id/respond` | POST | admin | Submit approval response |
| `/keys` | * | admin | Manage API keys |
| `/metrics` | GET | admin | Prometheus-compatible metrics |
| `/dashboard` | GET | admin | Admin UI |
| `/whoami` | GET | any | Debug auth context |
