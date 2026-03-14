# MCP Specification Enhancement Proposal: Pre-execution Authorization Hooks

**SEP Number:** (pending assignment)
**Title:** Pre-execution Authorization Hooks for MCP Tool Calls
**Authors:** John Kearney (Authensor)
**Status:** Draft
**Created:** 2026-03-14
**Discussion:** modelcontextprotocol/specification #2337, #804, #2367, #2379
**Requires:** MCP 2024-11-05 (current stable)

---

## Abstract

This proposal introduces a protocol-level authorization layer for MCP tool calls. It defines three new message types — `authorization/propose`, `authorization/decide`, and `authorization/receipt` — that enable MCP servers, clients, and intermediary gateways to enforce policy-based access control on tool invocations before execution occurs. The proposal also defines a content safety scanning hook and a cryptographic receipt chain for tamper-evident audit trails.

The design is informed by four active MCP specification discussions:

- **#2337** — Three-stage PROPOSE/DECIDE/PROMOTE governance checkpoint
- **#804** — Gateway-Based Authorization Model (24 comments, 16 participants)
- **#2367** — IACS-1.0 signed provenance receipts
- **#2379** — Governance Layer Above MCP with action claims

These discussions converge on a single architectural need: a standardized way to intercept, evaluate, and record tool call decisions before the tool executes. This SEP provides the wire format and protocol flow to satisfy that need.

---

## Motivation

### The Problem

MCP defines how clients discover and invoke tools on servers. It does not define how to authorize those invocations. Today, authorization — if it exists at all — is implemented ad hoc:

- Hard-coded checks inside individual tool handlers
- Prompt-level instructions that can be bypassed or ignored
- Application-layer wrappers that are invisible to the protocol
- No standard way for gateways or proxies to inspect and gate tool calls

This creates three categories of risk:

1. **No fail-closed default.** An MCP server with no authorization logic permits all tool calls by default. There is no protocol-level mechanism to require authorization before execution.

2. **No auditability.** Tool call results are ephemeral. There is no standard receipt format that records what was requested, what decision was made, who made it, and what happened. Compliance frameworks (SOC 2, NIST AI 600-1, EU AI Act) require this trail.

3. **No separation of concerns.** Authorization logic is entangled with tool implementation. Policy changes require code changes. Operators cannot manage permissions without modifying server source.

### What Existing Discussions Request

| Discussion | Core Request | This SEP Addresses |
|------------|-------------|-------------------|
| #2337 | Three-stage governance: propose, decide, promote | `authorization/propose`, `authorization/decide`, `authorization/receipt` message types |
| #804 | Gateway-based authorization as a transparent intermediary | Gateway pattern specification with tool list proxying and call interception |
| #2367 | Signed provenance receipts with hash chains (IACS-1.0) | Receipt schema with `receiptHash` and `prevReceiptHash` fields forming a verifiable chain |
| #2379 | Governance layer above MCP with structured action claims | ActionEnvelope schema that wraps tool calls in a declarative authorization request |

### Design Goals

1. **Protocol-native.** Authorization messages use the existing JSON-RPC transport. No sideband channels.
2. **Backward-compatible.** Servers and clients that do not implement this SEP continue to work. Authorization is opt-in via capability negotiation.
3. **Gateway-transparent.** A compliant gateway can enforce authorization on any upstream MCP server without modifying that server.
4. **Fail-closed by default.** If a server advertises the `authorization` capability, tool calls without a valid authorization decision MUST be rejected.
5. **Framework-agnostic.** The envelope and receipt formats are independent of any agent framework, SDK, or language.

---

## Specification

### 1. Capability Negotiation

Servers and clients declare authorization support during initialization.

**Server capability:**

```json
{
  "capabilities": {
    "tools": {},
    "authorization": {
      "version": "2026-03-14",
      "features": {
        "policyEvaluation": true,
        "approvalWorkflows": true,
        "contentSafety": true,
        "receiptChain": true
      }
    }
  }
}
```

**Client capability:**

```json
{
  "capabilities": {
    "authorization": {
      "version": "2026-03-14",
      "supportsApprovalCallbacks": true
    }
  }
}
```

When a server advertises `authorization`, the following constraints apply:

- The server MUST accept `authorization/propose` requests.
- The server MUST respond with `authorization/decide` results.
- The server MUST reject `tools/call` requests that do not carry a valid `authorizationId` in the request metadata, unless the tool is marked as `authorizationExempt` in its tool definition.
- The server SHOULD produce `authorization/receipt` notifications after execution completes.

When neither side advertises the capability, the protocol operates exactly as it does today. No behavioral change occurs.

### 2. Message Types

#### 2.1 `authorization/propose` (Request)

A client sends this to request authorization for a tool call before invoking it. The message wraps the intended tool call in a structured **ActionEnvelope**.

```
Client ─── authorization/propose ──▶ Server/Gateway
```

**Request params:**

```json
{
  "envelope": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-14T10:30:00.000Z",
    "action": {
      "type": "stripe.charges.create",
      "resource": "stripe://charges",
      "operation": "create",
      "parameters": {
        "amount": 5000,
        "currency": "usd",
        "customer": "cus_abc123"
      }
    },
    "principal": {
      "type": "agent",
      "id": "agent-billing-bot",
      "name": "Billing Assistant",
      "attributes": {
        "model": "claude-sonnet-4-20250514",
        "sessionOwner": "user-jane-doe"
      }
    },
    "context": {
      "sessionId": "sess_xyz789",
      "traceId": "trace_abc",
      "environment": "production",
      "sourceIp": "192.168.1.100",
      "userAgent": "my-agent-framework/2.1.0",
      "metadata": {}
    },
    "constraints": {
      "maxAmount": 10000,
      "currency": "USD",
      "timeout": 30000
    }
  }
}
```

**ActionEnvelope Schema (normative):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` (UUID v4) | Yes | Unique envelope identifier |
| `timestamp` | `string` (ISO 8601) | Yes | Creation time |
| `action.type` | `string` | Yes | Dot-notation action identifier (e.g., `github.issues.create`, `mcp.read_file`) |
| `action.resource` | `string` | Yes | Target resource URI |
| `action.operation` | `string` | No | One of: `create`, `read`, `update`, `delete`, `execute` |
| `action.parameters` | `object` | No | Tool-specific parameters (matches `tools/call` arguments) |
| `principal.type` | `string` | Yes | One of: `user`, `agent`, `service`, `system` |
| `principal.id` | `string` | Yes | Unique principal identifier |
| `principal.name` | `string` | No | Human-readable name |
| `principal.attributes` | `object` | No | Arbitrary attributes for policy evaluation |
| `context.sessionId` | `string` | No | Session identifier |
| `context.traceId` | `string` | No | Distributed trace identifier |
| `context.parentEnvelopeId` | `string` (UUID) | No | Parent envelope for chained actions |
| `context.environment` | `string` | No | One of: `development`, `staging`, `production` |
| `context.sourceIp` | `string` | No | Originating IP address |
| `context.userAgent` | `string` | No | Client identifier string |
| `context.metadata` | `object` | No | Arbitrary context metadata |
| `constraints.maxAmount` | `number` | No | Maximum monetary amount |
| `constraints.currency` | `string` | No | ISO 4217 currency code |
| `constraints.allowedDomains` | `string[]` | No | Allowed target domains |
| `constraints.timeout` | `integer` | No | Maximum execution time in ms |
| `constraints.retryPolicy` | `object` | No | `{ maxRetries, backoffMs }` |

The `action.type` field uses a dot-notation namespace convention. When wrapping MCP tool calls, the recommended format is `mcp.<toolName>` (e.g., `mcp.read_file`, `mcp.stripe_create_charge`). Implementations MAY use deeper namespaces for domain-specific tools (e.g., `stripe.charges.create`).

#### 2.2 `authorization/decide` (Response)

The server or gateway evaluates the envelope against its policies and returns a decision.

```
Client ◀── authorization/decide ─── Server/Gateway
```

**Response result:**

```json
{
  "receiptId": "660f9500-f39c-52e5-b827-557766551111",
  "decision": {
    "outcome": "allow",
    "evaluatedAt": "2026-03-14T10:30:00.015Z",
    "policyId": "pol-billing-controls",
    "policyVersion": "2.1.0",
    "reason": "Amount within agent limit for billing operations",
    "matchedRules": [
      {
        "ruleId": "allow-billing-under-10k",
        "ruleName": "Allow billing charges under $10,000",
        "effect": "allow"
      }
    ]
  },
  "policy": {
    "id": "pol-billing-controls",
    "version": "2.1.0",
    "source": "db"
  },
  "evaluationTimeMs": 1.2,
  "contentSafety": null
}
```

**Decision outcomes (normative):**

| Outcome | Meaning | Client Action |
|---------|---------|---------------|
| `allow` | Action is permitted. Client MAY proceed to `tools/call`. | Proceed to tool execution. Include `authorizationId` (the `receiptId`) in the `tools/call` request. |
| `deny` | Action is forbidden. Client MUST NOT execute. | Do not call the tool. Report the denial reason to the user or orchestrator. |
| `require_approval` | Action requires human or multi-party approval before execution. | Wait for approval resolution (see Section 5). Poll or subscribe for approval status updates. |
| `rate_limited` | Action was blocked by a rate limit rule. | Back off and retry after the rate limit window resets. Do not call the tool. |

When the outcome is `allow`, the response includes a `receiptId` that the client MUST attach to the subsequent `tools/call` request. This links the authorization decision to the execution for audit purposes.

**Decision Schema (normative):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `receiptId` | `string` (UUID) | Yes | Identifier for the authorization receipt |
| `decision.outcome` | `string` | Yes | One of: `allow`, `deny`, `require_approval`, `rate_limited` |
| `decision.evaluatedAt` | `string` (ISO 8601) | Yes | When the policy evaluation occurred |
| `decision.policyId` | `string` | No | Identifier of the policy that produced the decision |
| `decision.policyVersion` | `string` | No | Semantic version of the policy used |
| `decision.reason` | `string` | No | Human-readable explanation |
| `decision.matchedRules` | `array` | No | Rules that matched during evaluation |
| `policy.id` | `string` | No | Policy identifier |
| `policy.version` | `string` | No | Policy version |
| `policy.source` | `string` | No | Where the policy was loaded from (e.g., `db`, `file`, `fallback`) |
| `evaluationTimeMs` | `number` | No | Evaluation latency in milliseconds |
| `contentSafety` | `object` or `null` | No | Content safety scan result (see Section 6) |

#### 2.3 `authorization/receipt` (Notification)

After a tool call completes (or fails), the server or gateway emits a receipt notification. Receipts are immutable records that form a hash-chained audit trail.

```
Client/Gateway ─── authorization/receipt ──▶ Server
```

or, in gateway mode:

```
Gateway ─── authorization/receipt ──▶ Control Plane (storage)
```

**Notification params:**

```json
{
  "receipt": {
    "id": "660f9500-f39c-52e5-b827-557766551111",
    "envelopeId": "550e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2026-03-14T10:30:00.250Z",
    "decision": {
      "outcome": "allow",
      "evaluatedAt": "2026-03-14T10:30:00.015Z",
      "policyId": "pol-billing-controls",
      "policyVersion": "2.1.0",
      "reason": "Amount within agent limit for billing operations",
      "matchedRules": [
        {
          "ruleId": "allow-billing-under-10k",
          "ruleName": "Allow billing charges under $10,000",
          "effect": "allow"
        }
      ]
    },
    "status": "executed",
    "execution": {
      "startedAt": "2026-03-14T10:30:00.020Z",
      "completedAt": "2026-03-14T10:30:00.245Z",
      "durationMs": 225,
      "result": { "chargeId": "ch_1abc", "status": "succeeded" }
    },
    "envelope": { "...": "(original envelope, embedded)" },
    "receiptHash": "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1",
    "prevReceiptHash": "f0e1d2c3b4a5f6e7d8c9b0a1f2e3d4c5b6a7f8e9d0c1b2a3f4e5d6c7b8a9f0e1"
  }
}
```

**Receipt Schema (normative):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` (UUID) | Yes | Receipt identifier (same as `receiptId` from `authorization/decide`) |
| `envelopeId` | `string` (UUID) | Yes | Reference to the original action envelope |
| `timestamp` | `string` (ISO 8601) | Yes | When the receipt was finalized |
| `decision` | `object` | Yes | The authorization decision (same schema as in `authorization/decide`) |
| `status` | `string` | Yes | One of: `pending`, `executed`, `failed`, `skipped`, `cancelled` |
| `approval` | `object` | No | Approval workflow state (see Section 5) |
| `execution` | `object` | No | Execution details including timing and result |
| `execution.startedAt` | `string` (ISO 8601) | No | Execution start time |
| `execution.completedAt` | `string` (ISO 8601) | No | Execution end time |
| `execution.durationMs` | `integer` | No | Execution duration in milliseconds |
| `execution.result` | `object` | No | Tool call result data |
| `execution.error` | `object` | No | Error details if execution failed (`{ code, message, details }`) |
| `envelope` | `object` | No | The original action envelope (embedded for completeness) |
| `receiptHash` | `string` | Yes (if `receiptChain` enabled) | SHA-256 hash of `{ id, envelopeId, timestamp, decision.outcome, prevReceiptHash }` |
| `prevReceiptHash` | `string` | No | Hash of the immediately preceding receipt, forming a chain |
| `metadata` | `object` | No | Additional receipt metadata |

### 3. Protocol Flow

#### 3.1 Standard Authorization Flow (Client-Initiated)

```
 Client                          Server/Gateway
   │                                   │
   │  ──── authorization/propose ────▶ │  (1) Client proposes an action
   │                                   │      envelope before calling tool
   │                                   │
   │                                   │  (2) Server evaluates envelope
   │                                   │      against active policies
   │                                   │
   │  ◀── authorization/decide ─────── │  (3) Server returns decision
   │                                   │      with receiptId
   │                                   │
   │  [if outcome == "allow"]          │
   │                                   │
   │  ──── tools/call ───────────────▶ │  (4) Client executes tool call
   │       { _meta: {                  │      with authorization reference
   │           authorizationId: "..." }}│
   │                                   │
   │  ◀── tools/call result ────────── │  (5) Server returns tool result
   │                                   │
   │  ◀── authorization/receipt ────── │  (6) Server emits receipt with
   │                                   │      execution details and hash
   │                                   │
```

#### 3.2 Gateway-Transparent Flow

A compliant gateway sits between the client and an upstream MCP server. The gateway intercepts tool calls, performs authorization, and proxies allowed calls transparently. The upstream server requires no modification.

```
 Client                     Gateway                    Upstream MCP
   │                           │                           │
   │  ── tools/list ─────────▶ │                           │
   │                           │  ── tools/list ─────────▶ │
   │                           │  ◀── tools/list result ── │
   │  ◀── tools/list result ── │                           │
   │      (proxied tool list)  │                           │
   │                           │                           │
   │  ── tools/call ─────────▶ │                           │
   │                           │  (1) Construct envelope   │
   │                           │      from tool call args  │
   │                           │                           │
   │                           │  (2) Evaluate against     │
   │                           │      policy (local or     │
   │                           │      control plane)       │
   │                           │                           │
   │                           │  [if allow]               │
   │                           │  ── tools/call ─────────▶ │
   │                           │  ◀── tools/call result ── │
   │  ◀── tools/call result ── │                           │
   │                           │                           │
   │                           │  [if deny]                │
   │  ◀── error response ──── │                           │
   │      "Action blocked:     │                           │
   │       policy denial"      │                           │
   │                           │                           │
   │                           │  (3) Emit receipt         │
   │                           │      (both outcomes)      │
```

In gateway mode, the gateway:

1. Spawns or connects to the upstream MCP server.
2. Proxies the `tools/list` response so the client sees the upstream server's tools.
3. Intercepts every `tools/call`, constructs an ActionEnvelope from the call arguments, and evaluates it against policies.
4. Forwards allowed calls to the upstream server and returns the result.
5. Returns a protocol error for denied calls, with the denial reason in the error message.
6. Emits an `authorization/receipt` for every intercepted call, regardless of outcome.

The gateway MAY operate in two modes:

- **Online mode**: The gateway evaluates against a remote control plane via HTTP (`POST /evaluate`). This supports centralized policy management, receipt storage, and approval workflows.
- **Offline mode**: The gateway uses a built-in policy engine with a local policy document. No network dependency. Suitable for air-gapped environments or development.

#### 3.3 Execution Claim Flow

To prevent duplicate execution of authorized actions (important for non-idempotent operations like financial charges), the protocol supports an optional claim step between authorization and execution.

```
 Client                          Server/Gateway
   │                                   │
   │  ── authorization/propose ──────▶ │
   │  ◀── authorization/decide ────── │  outcome: "allow"
   │                                   │  receiptId: "rcpt-123"
   │                                   │
   │  ── authorization/claim ────────▶ │  (request exclusive execution lock)
   │       { receiptId: "rcpt-123" }   │
   │                                   │
   │  ◀── authorization/claim result ─ │  { claimId: "clm-456",
   │                                   │    status: "claimed" }
   │                                   │
   │  ── tools/call ─────────────────▶ │  (execute with claimId)
   │       { _meta: {                  │
   │           authorizationId: "...", │
   │           claimId: "clm-456" }}   │
   │                                   │
```

The claim mechanism provides:

- **At-most-once execution**: Only one executor can claim a receipt at a time. Claims expire after a configurable TTL (default: 30 seconds).
- **Conflict detection**: If a claim is already active, the server returns `already_claimed` with a `retryAfterSeconds` hint.
- **Idempotency**: If the action has already been executed, the server returns `already_executed` with the original result.

### 4. Policy Schema

Policies are declarative JSON documents that define authorization rules. The policy engine evaluates them synchronously with no side effects.

```json
{
  "id": "pol-production-safety",
  "name": "Production Safety Policy",
  "version": "1.0.0",
  "enabled": true,
  "priority": 100,
  "scope": {
    "actionTypes": ["stripe.*", "github.*"],
    "principalTypes": ["agent"],
    "environments": ["production"]
  },
  "rules": [
    {
      "id": "deny-large-charges",
      "name": "Block charges over $10,000",
      "effect": "deny",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "stripe.charges.create" },
          { "field": "action.parameters.amount", "operator": "gt", "value": 1000000 }
        ]
      }
    },
    {
      "id": "approve-medium-charges",
      "name": "Require approval for charges over $1,000",
      "effect": "require_approval",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "stripe.charges.create" },
          { "field": "action.parameters.amount", "operator": "gt", "value": 100000 }
        ]
      },
      "approvalConfig": {
        "requiredApprovals": 1,
        "expiresIn": "1h",
        "approvers": [
          { "type": "user", "id": "finance-team" }
        ]
      }
    },
    {
      "id": "allow-read-operations",
      "name": "Allow all read operations",
      "effect": "allow",
      "condition": {
        "field": "action.operation",
        "operator": "eq",
        "value": "read"
      }
    },
    {
      "id": "rate-limit-api-calls",
      "name": "Rate limit agent API calls",
      "effect": "allow",
      "rateLimit": {
        "requests": 100,
        "window": "1h",
        "scope": "principal"
      }
    }
  ],
  "defaultEffect": "deny"
}
```

**Evaluation semantics:**

1. Policies are sorted by `priority` (descending). Higher priority policies are evaluated first.
2. Within a policy, rules are evaluated in array order. The first matching rule determines the outcome.
3. If no rules match within a policy, the policy's `defaultEffect` applies.
4. If no policies match the envelope's scope, the result is `deny` (fail-closed).
5. Policy evaluation MUST be synchronous and side-effect free.

**Condition operators (normative):**

| Operator | Description | Example |
|----------|-------------|---------|
| `eq` | Equals | `{ "field": "action.type", "operator": "eq", "value": "stripe.charges.create" }` |
| `neq` | Not equals | `{ "field": "principal.type", "operator": "neq", "value": "system" }` |
| `gt`, `gte`, `lt`, `lte` | Numeric comparison | `{ "field": "action.parameters.amount", "operator": "gt", "value": 10000 }` |
| `in` | Value in array | `{ "field": "context.environment", "operator": "in", "value": ["staging", "production"] }` |
| `notIn` | Value not in array | |
| `contains` | String contains | `{ "field": "action.resource", "operator": "contains", "value": "admin" }` |
| `startsWith` | String prefix | |
| `endsWith` | String suffix | |
| `matches` | Regex match | `{ "field": "action.type", "operator": "matches", "value": "^stripe\\..*" }` |
| `exists` | Field exists (non-null) | `{ "field": "constraints.maxAmount", "operator": "exists", "value": true }` |

**Logical combinators:**

Conditions support `all` (AND), `any` (OR), and `not` (negation) combinators, which may be nested to arbitrary depth.

```json
{
  "all": [
    { "field": "principal.type", "operator": "eq", "value": "agent" },
    {
      "any": [
        { "field": "action.operation", "operator": "eq", "value": "create" },
        { "field": "action.operation", "operator": "eq", "value": "delete" }
      ]
    },
    {
      "not": {
        "field": "context.environment", "operator": "eq", "value": "development"
      }
    }
  ]
}
```

### 5. Approval Workflows

When a policy rule has the effect `require_approval`, the action is suspended until the required number of approvals is received.

```
 Client                     Server                     Approver(s)
   │                           │                           │
   │  ── propose ────────────▶ │                           │
   │  ◀── decide ──────────── │  outcome:                 │
   │      "require_approval"   │  "require_approval"       │
   │      receiptId: "rcpt-1"  │                           │
   │                           │  ── notification ───────▶ │
   │                           │     (webhook, email,      │
   │                           │      in-app, etc.)        │
   │                           │                           │
   │                           │  ◀── approval response ── │
   │                           │     { decision: "approve",│
   │                           │       responderId: "..." } │
   │                           │                           │
   │                           │  [check quorum]           │
   │                           │  approveCount >= required │
   │                           │                           │
   │  ◀── receipt update ──── │  approval.status:         │
   │      (notification)       │  "approved"               │
   │                           │                           │
   │  ── tools/call ─────────▶ │  (now permitted)          │
```

**Approval state machine:**

```
                    ┌──────────────────────────┐
                    │                          │
                    ▼                          │
  ┌─────────┐   approve   ┌──────────┐   (quorum met)   ┌──────────┐
  │ pending │ ──────────▶  │ approved │ ───────────────▶  │ executed │
  └─────────┘              └──────────┘                   └──────────┘
       │                                                       │
       │  reject                                               │
       ▼                                                       │ (error)
  ┌──────────┐                                                 ▼
  │ rejected │                                            ┌──────────┐
  └──────────┘                                            │  failed  │
       │                                                  └──────────┘
       ▼
  ┌───────────┐
  │ cancelled │
  └───────────┘
       ▲
       │  (timeout)
  ┌──────────┐
  │ expired  │
  └──────────┘
```

**Multi-party approval:** The `approvalConfig.requiredApprovals` field specifies the quorum threshold. Each approver submits an independent response. A single rejection immediately rejects the entire approval. When the approve count reaches the threshold, the approval is granted and the tool call may proceed.

### 6. Content Safety Scanning Hook

The protocol supports an optional content safety scanning step during authorization evaluation. When enabled, the server scans the action envelope's content (parameters, resource URIs, metadata) for threats before returning the authorization decision.

```
 authorization/propose
        │
        ▼
  ┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
  │   Policy     │────▶│  Content Safety   │────▶│   Decision   │
  │  Evaluation  │     │  Scan (optional)  │     │  + Receipt   │
  └─────────────┘     └──────────────────┘     └──────────────┘
```

The content safety scan result is included in the `authorization/decide` response:

```json
{
  "contentSafety": {
    "id": "scan-abc123",
    "safe": true,
    "threatLevel": "none",
    "detections": [],
    "scanTimeMs": 1.8
  }
}
```

When a critical threat is detected and the server is configured in `block` mode, the decision outcome MAY be overridden to `deny` regardless of the policy evaluation result.

**ContentSafety schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | `string` | Yes | Scan identifier |
| `safe` | `boolean` | Yes | Whether the content passed all safety checks |
| `threatLevel` | `string` | Yes | One of: `none`, `low`, `medium`, `high`, `critical` |
| `detections` | `array` | Yes | Array of detection objects `{ detector, category, severity, match }` |
| `redacted` | `string` | No | Redacted content (if mode is `redact`) |
| `scanTimeMs` | `number` | Yes | Scan latency in milliseconds |

Content safety scanning operates in three modes:

| Mode | Behavior |
|------|----------|
| `block` | Critical threats override the policy decision to `deny` |
| `redact` | Detected content is redacted; tool call proceeds with sanitized parameters |
| `warn` | Scan results are recorded but do not affect the decision |

### 7. Receipt Hash Chain

Receipts form a tamper-evident chain by including a cryptographic hash that references the previous receipt.

**Hash computation (normative):**

```
receiptHash = SHA-256(JSON.stringify({
  id:               <receipt.id>,
  envelopeId:       <receipt.envelopeId>,
  timestamp:        <receipt.timestamp>,
  decisionOutcome:  <receipt.decision.outcome>,
  prevReceiptHash:  <receipt.prevReceiptHash or "">
}))
```

The hash is computed over a canonical JSON serialization (keys in the order shown above) of five fields. The `prevReceiptHash` field is the empty string for the first receipt in a chain.

**Chain verification:**

A verifier can validate the chain by:

1. Retrieving receipts in chronological order.
2. For each receipt, recomputing the hash from its core fields and the previous receipt's hash.
3. Comparing the computed hash against the stored `receiptHash`.
4. Confirming that `prevReceiptHash` references a receipt that actually exists.

Any discrepancy indicates tampering or data corruption.

This design is compatible with the IACS-1.0 signed provenance receipt model described in discussion #2367. Implementations MAY extend the receipt with digital signatures (e.g., JWS) for non-repudiation, but the hash chain provides baseline tamper detection without requiring a PKI.

### 8. Error Handling

When authorization-related errors occur, servers MUST return standard JSON-RPC errors with the following error codes:

| Code | Name | Meaning |
|------|------|---------|
| `-32100` | `AuthorizationRequired` | Tool call attempted without prior authorization on a server that requires it |
| `-32101` | `AuthorizationDenied` | Authorization was denied by policy |
| `-32102` | `AuthorizationExpired` | The authorization receipt has expired or was revoked |
| `-32103` | `ApprovalPending` | Action requires approval that has not yet been granted |
| `-32104` | `ClaimConflict` | Another executor has already claimed this receipt |
| `-32105` | `ContentSafetyBlock` | Content safety scan blocked the action |

Example error response:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32101,
    "message": "Authorization denied: Amount exceeds agent limit for billing operations",
    "data": {
      "receiptId": "660f9500-f39c-52e5-b827-557766551111",
      "policyId": "pol-billing-controls",
      "outcome": "deny"
    }
  }
}
```

---

## Security Considerations

### Fail-Closed Default

When a server advertises the `authorization` capability, it MUST deny tool calls that arrive without a valid `authorizationId`. When no policy is configured, the server MUST deny all actions rather than defaulting to allow. This is the single most important security property of the design.

### Policy Isolation

The policy engine MUST be synchronous and side-effect free. It MUST NOT make network requests, read files, or modify state during evaluation. This prevents policy evaluation from being influenced by the environment it is evaluating. The engine receives an envelope and a set of policies as inputs and returns a decision as output. Nothing else.

### Receipt Immutability

Once created, the core fields of a receipt (id, envelopeId, timestamp, decision, receiptHash, prevReceiptHash) MUST NOT be modified. Execution status and approval status are updated in separate mutable fields, but the authorization decision itself is permanent.

### Transport Security

This SEP does not define transport-layer security. Implementations SHOULD use TLS for all communication between clients, gateways, and servers. The receipt hash chain provides integrity verification at the application layer, but does not replace transport encryption.

### Principal Identity

The `principal` field in the action envelope is asserted by the client. Servers and gateways SHOULD validate principal identity through external authentication mechanisms (API keys, OAuth tokens, mutual TLS) rather than trusting the envelope alone. The `authorization` capability SHOULD be combined with server-side authentication to bind envelopes to verified identities.

---

## Backward Compatibility

This SEP is fully backward-compatible with the existing MCP specification:

1. **No changes to existing message types.** `tools/list` and `tools/call` continue to work as specified.
2. **Opt-in via capability negotiation.** Servers that do not advertise `authorization` behave exactly as they do today.
3. **Gateway transparency.** A compliant gateway wraps an unmodified upstream server. The upstream server never sees authorization messages.
4. **Graceful degradation.** If a client does not support `authorization`, a server MAY fall back to evaluating tool calls inline (as current implementations do) or MAY reject the connection.

The only additive change to existing messages is the optional `_meta.authorizationId` field on `tools/call` requests, which links a tool invocation to its prior authorization decision.

---

## Reference Implementation

The Authensor project (https://github.com/authensor/authensor, MIT license) provides a working implementation of every component described in this SEP:

| SEP Component | Authensor Package | Description |
|---------------|-------------------|-------------|
| ActionEnvelope schema | `@authensor/schemas` | JSON Schema definitions, source of truth for all types |
| Policy evaluation engine | `@authensor/engine` | Pure synchronous policy engine, zero dependencies |
| Control plane (evaluation, receipts, approvals) | `@authensor/control-plane` | HTTP API server (Hono + PostgreSQL) implementing `/evaluate`, `/receipts`, `/approvals` |
| MCP Gateway | `@authensor/mcp-server` (gateway mode) | Transparent proxy with online and offline policy evaluation |
| Content safety scanning | `@authensor/aegis` | Content scanner, zero dependencies, lazy-loaded |
| Real-time monitoring | `@authensor/sentinel` | Anomaly detection and alerting, zero dependencies |
| Receipt hash chain | `@authensor/control-plane` (receipt-service) | SHA-256 hash chain with chain verification API |
| TypeScript SDK | `@authensor/sdk` | Client library for agent builders |
| Python SDK | `@authensor/sdk-py` | Python client library |
| Framework adapters | `@authensor/adapter-langchain`, `@authensor/adapter-openai`, `@authensor/adapter-crewai` | Drop-in adapters for popular agent frameworks |

The reference implementation has been tested with 400+ unit and integration tests and is deployed in production environments.

---

## Open Questions

1. **Capability versioning.** Should the `authorization` capability version track the MCP spec version or maintain its own version scheme? This proposal uses an independent date-based version (`2026-03-14`) to allow the authorization spec to evolve without requiring a full MCP spec revision.

2. **Inline vs. separate authorization.** Discussion #804 debated whether authorization should be a separate message exchange (as proposed here) or integrated into the `tools/call` message itself. This proposal chose separate messages because: (a) it allows gateways to operate transparently, (b) it keeps the authorization decision decoupled from tool execution, and (c) it supports approval workflows that require asynchronous resolution. Implementations MAY support an "inline" mode where the gateway performs authorization transparently within a `tools/call` handler for backward compatibility.

3. **Policy distribution.** This proposal defines the policy evaluation model but does not specify how policies are distributed to gateways and servers. A future SEP could define a `policies/list` and `policies/sync` message type for policy distribution over MCP.

4. **Digital signatures.** Discussion #2367 proposes IACS-1.0 signed provenance receipts. This SEP's receipt hash chain is compatible with, but does not require, digital signatures. A future SEP could extend the receipt schema with a `signature` field for JWS-based non-repudiation.

5. **Streaming tool calls.** MCP supports streaming tool call results. This proposal does not address how authorization interacts with streaming. Likely, the authorization decision applies to the entire stream, and the receipt is emitted when the stream completes.

---

## References

- [MCP Specification (2024-11-05)](https://spec.modelcontextprotocol.io/)
- [Discussion #2337: Three-stage governance checkpoint](https://github.com/modelcontextprotocol/specification/discussions/2337)
- [Discussion #804: Gateway-Based Authorization Model](https://github.com/modelcontextprotocol/specification/discussions/804)
- [Discussion #2367: IACS-1.0 signed provenance receipts](https://github.com/modelcontextprotocol/specification/discussions/2367)
- [Discussion #2379: Governance Layer Above MCP](https://github.com/modelcontextprotocol/specification/discussions/2379)
- [NIST AI 600-1: Artificial Intelligence Risk Management Framework](https://www.nist.gov/artificial-intelligence)
- [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
- [Authensor: Open-source safety stack for AI agents](https://authensor.dev)

---

## Changelog

- **2026-03-14**: Initial draft.
