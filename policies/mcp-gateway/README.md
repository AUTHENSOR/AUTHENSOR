# MCP Gateway Policy Template

Policy for the Authensor MCP Server acting as a security gateway for AI
agent tool use. Controls which MCP tools an agent can call, at what
frequency, and which require human approval.

## What It Does

| Action | Decision |
|---|---|
| Shell / bash execution (`mcp.bash.*`, `mcp.shell.*`) | deny |
| File deletion (`mcp.filesystem.delete*`) | deny |
| Network administration tools | deny |
| Secrets / vault tools | deny |
| Write operations (`*.create`, `*.update`, `*.write`) | require approval |
| External API calls (Stripe, GitHub, Twilio, etc.) | require approval |
| Data exports / dumps / downloads | require approval |
| Read operations (`*.read`, `*.get`, `*.fetch`) | allow (500/hr) |
| Search operations (`*.search`, `*.find`, `*.query`) | allow (300/hr) |
| List operations (`*.list`, `*.enumerate`) | allow (200/hr) |
| Non-MCP actions | deny (out of scope) |
| List → read → export sequence | require approval (session rule) |
| Write file → execute sequence | deny (session rule) |
| Everything else | deny |

## How the MCP Server Uses This Policy

The Authensor MCP Server wraps every tool invocation in an action envelope
before the tool is actually called. The envelope looks like:

```typescript
{
  action: {
    type: "mcp.filesystem.read_file",   // mcp.<server>.<tool>
    resource: "file:///home/user/docs/README.md",
    parameters: { path: "/home/user/docs/README.md" },
  },
  context: {
    toolCategory: "read",    // set by the MCP server from tool manifest
    isExternalCall: false,
  },
}
```

The policy evaluates the envelope and returns a decision before the tool
runs. If the decision is `deny` or `require_approval`, the MCP server
returns an error to the model rather than executing the tool.

## The `toolCategory` Context Field

Rules 1–10 use `context.toolCategory` as a primary match signal. This field
is set by the MCP Server based on the tool's declared category in its
manifest. Supported values:

| Value | Description |
|---|---|
| `read` | Read-only operations |
| `write` | State mutations |
| `search` | Search/discovery |
| `list` | Enumeration |
| `shell_exec` | Shell/command execution |
| `file_delete` | File/directory deletion |
| `network_admin` | Network configuration |
| `secrets` | Credential/secret access |
| `external_api` | Outbound API calls |
| `export` | Bulk data export |

If your MCP server does not set `context.toolCategory`, the action.type
pattern matching in each rule is the fallback.

## MCP Action Type Naming Convention

This policy assumes action types follow the pattern:
```
mcp.<server-name>.<tool-name>
```

Examples:
- `mcp.filesystem.read_file`
- `mcp.github.create_issue`
- `mcp.postgres.query`
- `mcp.slack.post_message`
- `mcp.stripe.create_charge`

If your MCP server uses a different convention, update the `startsWith`
conditions in rules 5–10 accordingly.

## Adding a Specific Tool Allowlist

To allow a specific write tool without the general approval requirement,
add a rule before the write-operations rule:

```yaml
- id: allow-github-issue-create
  name: "Allow GitHub issue creation without approval"
  effect: allow
  condition:
    field: action.type
    operator: eq
    value: "mcp.github.create_issue"
  rateLimit:
    requests: 10
    window: "1h"
    scope: principal
```

Place this before the `require-approval-write-operations` rule.

## Allowing a Trusted MCP Server

To trust an entire server's tools (e.g., a read-only analytics server):

```yaml
- id: allow-analytics-server
  name: "Allow all analytics server tools"
  effect: allow
  condition:
    field: action.type
    operator: startsWith
    value: "mcp.analytics-readonly."
```

## Production vs Development Strictness

For development environments, you may want to relax write approvals:

```yaml
scope:
  environments:
    - production   # only apply to production

# Add a second policy for development:
id: mcp-gateway-dev
scope:
  environments:
    - development
rules:
  - id: allow-all-writes-in-dev
    effect: allow
    condition:
      field: action.type
      operator: startsWith
      value: "mcp."
```

## Session Risk Tuning

The session risk threshold is set at 60. For development agents doing
normal coding work, you may want to raise this:

```yaml
sessionRiskThreshold:
  maxScore: 150   # raise for development agents
  riskWeights:
    "mcp.*.write": 5    # lower weight for normal file operations
    "mcp.*.create": 5
```

For production agents with sensitive data access, lower the threshold:

```yaml
sessionRiskThreshold:
  maxScore: 30    # more aggressive
  riskWeights:
    "mcp.*.write": 15
    "mcp.*.export": 30
```

## Integrating with the Authensor MCP Server

This policy is designed to work directly with `@authensor/mcp-server`.
Deploy it by uploading it to the control plane and setting it as the active
policy for your MCP gateway:

```bash
npx authensor policies upload ./policies/mcp-gateway/policy.yaml
npx authensor policies activate mcp-gateway-v1
```
