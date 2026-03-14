# OWASP Top 10 for Agentic Applications -- Authensor Coverage Map

> **OWASP Agentic Top 10 (December 2025)** mapped to Authensor v1.5.0-alpha features.
>
> Authensor is the only open-source project that provides coverage across all ten risk categories through its integrated architecture: policy engine, content scanner, behavioral monitor, and cryptographic audit trail.

---

## Coverage Matrix

| # | OWASP Risk Category | Authensor Coverage | Primary Package(s) | Rating |
|---|---------------------|--------------------|---------------------|--------|
| ASI01 | Prompt Injection & Manipulation | Aegis injection detector, entropy scorer, canary tokens, heuristic combiner | `aegis`, `control-plane` | **Full** |
| ASI02 | Privilege & Access Control Failures | Policy engine with RBAC, principal types, scope-based rules, role middleware | `engine`, `control-plane` | **Full** |
| ASI03 | Supply Chain & Dependency Vulnerabilities | MCP Gateway tool interception, tool integrity hashing, SSRF guard, rug-pull detection | `mcp-server`, `aegis` | **Partial** |
| ASI04 | Insufficient Output Validation | Aegis content scanning on envelope parameters, PII/credential detection, redaction mode | `aegis`, `control-plane` | **Partial** |
| ASI05 | Inadequate Sandboxing | Sandbox stub mode, HTTP guard with DNS resolution, domain allowlists, per-tool kill switches | `mcp-server`, `control-plane` | **Partial** |
| ASI06 | Memory & Context Manipulation | Canary tokens (4-layer detection), context boundary markers, entropy anomaly detection | `aegis` | **Partial** |
| ASI07 | Multi-Agent Trust & Delegation | Principal type system, `parentEnvelopeId` chaining, per-agent Sentinel tracking, delegation approval rules | `engine`, `sentinel`, `control-plane` | **Partial** |
| ASI08 | Data Leakage & Privacy | PII detector, credential detector, exfiltration patterns, receipt redaction, SSRF blocking | `aegis`, `control-plane`, `mcp-server` | **Full** |
| ASI09 | Insufficient Logging & Auditing | Hash-chained receipt trail, NDJSON export, chain integrity verification, Sentinel alerts, webhook notifications | `control-plane`, `sentinel` | **Full** |
| ASI10 | Uncontrolled Agent Autonomy | Fail-closed policy engine, approval workflows, rate limiting, global kill switch, behavioral anomaly detection | `engine`, `control-plane`, `sentinel` | **Full** |

**Legend:** **Full** = core feature with production-ready implementation. **Partial** = meaningful coverage with identified enhancement opportunities. **Planned** = roadmap item not yet implemented.

---

## ASI01: Prompt Injection & Manipulation

### Risk Description

Attackers craft inputs that override an AI agent's instructions, causing it to ignore safety constraints, leak system prompts, execute unauthorized actions, or adopt malicious personas. Attack vectors include direct instruction overrides, delimiter injection, role manipulation, encoding attacks (base64, unicode homoglyphs), and adversarial suffixes (GCG-style).

### Authensor Coverage

**Aegis Injection Detector** scans all content for 18 injection patterns across 6 sub-categories:

| Sub-Category | Rule Count | Example Rule IDs | Confidence Range |
|--------------|-----------|------------------|-----------------|
| Direct Override | 5 | `injection-ignore-instructions`, `injection-forget-instructions`, `injection-new-instructions` | 0.90--0.95 |
| System Prompt Extraction | 3 | `injection-extract-system-prompt`, `injection-dump-prompt` | 0.88--0.92 |
| Role Manipulation | 4 | `injection-role-you-are-now`, `injection-jailbreak-dan` | 0.70--0.92 |
| Delimiter Injection | 3 | `injection-delimiter-system`, `injection-delimiter-inst` | 0.75--0.88 |
| HTML Injection | 2 | `injection-html-comment`, `injection-hidden-text` | 0.70--0.90 |
| Encoding Attack | 2 | `injection-base64-instructions`, `injection-unicode-tricks` | 0.65--0.82 |

**Shannon Entropy Scorer** detects GCG-style adversarial suffixes by measuring character-level entropy with a sliding window. Normal English text produces ~3.5--4.5 bits/char; adversarial suffixes exceed 5.5 bits/char.

**Heuristic Combination Scorer** aggregates 7 weighted signals (injection detections, credential patterns, entropy anomalies, exfiltration patterns, PII, code safety, multi-category correlation) into a single risk score from 0.0 to 1.0, producing assessments of `safe`, `low_risk`, `medium_risk`, `high_risk`, or `critical_risk`.

**Canary Token Manager** provides 4-layer prompt leakage detection:
1. **Exact match** -- direct token presence (confidence 1.0)
2. **Encoding-aware** -- base64, reversed, hex-separated variants (confidence 0.95)
3. **Partial n-gram** -- substring matching with configurable threshold (confidence 0.6--0.9)
4. **Fuzzy Levenshtein** -- edit-distance matching for obfuscated tokens (confidence 0.7)

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Injection rules | `packages/aegis/src/detectors/injection.ts` | `INJECTION_RULES` |
| Entropy scorer | `packages/aegis/src/entropy.ts` | `analyzeEntropy()`, `shannonEntropy()` |
| Heuristic combiner | `packages/aegis/src/heuristic.ts` | `computeHeuristicScore()` |
| Canary tokens | `packages/aegis/src/canary.ts` | `CanaryTokenManager`, `generateCanaryToken()` |
| Scanner core | `packages/aegis/src/scanner.ts` | `AegisScanner.scan()` |
| Control plane integration | `packages/control-plane/src/services/aegis-service.ts` | `scanEnvelope()` |
| Inline scan in evaluate | `packages/control-plane/src/routes/evaluate.ts` | Lines 197--208 |

### Configuration

```bash
# Enable Aegis scanning on all /evaluate requests
AUTHENSOR_AEGIS_ENABLED=true

# Block actions when critical threats detected
AUTHENSOR_AEGIS_MODE=block   # Options: block | redact | warn
```

```typescript
import { AegisScanner } from '@authensor/aegis';

const scanner = new AegisScanner();
const result = scanner.scan(userInput, {
  detectors: ['injection'],    // Focus on injection only
  mode: 'block',               // Block if threats found
  maxContentLength: 100_000,   // Truncate oversized input
});

if (!result.safe && result.threatLevel === 'critical') {
  // Block the action
}
```

### Competitor Comparison

| Product | Injection Detection | Entropy Analysis | Canary Tokens | Heuristic Scoring |
|---------|-------------------|-----------------|---------------|-------------------|
| **Authensor** | 18 regex rules, 6 categories | Shannon sliding window | 4-layer (exact/encoded/partial/fuzzy) | 7-signal weighted combiner |
| NeMo Guardrails | NemoGuard model-based | No | No | No |
| LlamaFirewall | PromptGuard 2 model | No | No | No |
| Guardrails AI | Validator marketplace | No | No | No |
| AWS AgentCore | Not included | No | No | No |

### Coverage Rating: Full

Authensor provides regex-based, statistical, and cryptographic detection of prompt injection. The zero-dependency implementation runs in <5ms per scan. The identified gap is that Aegis currently scans action envelopes (inputs) but not tool results (outputs). Indirect prompt injection via tool-returned content (e.g., a fetched webpage containing injection payloads) requires enabling output scanning, which is on the roadmap.

---

## ASI02: Privilege & Access Control Failures

### Risk Description

Agents operate with excessive privileges, bypass intended access controls, or escalate permissions through tool chaining. Without proper identity and authorization, agents can access resources, perform operations, or invoke tools beyond their intended scope.

### Authensor Coverage

**Policy Engine** (`@authensor/engine`) provides synchronous, pure-function policy evaluation with:

- **Principal type system**: `user | agent | service | system` -- each action envelope declares who is requesting it
- **Scope-based policy matching**: Policies target specific `actionTypes` (glob patterns), `principalTypes`, and `environments`
- **13 condition operators**: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `contains`, `startsWith`, `endsWith`, `matches` (regex), `exists`
- **Nested boolean logic**: `all` (AND), `any` (OR), `not` (NOT) for composing complex conditions
- **Three effects**: `allow`, `deny`, `require_approval`
- **Fail-closed default**: No matching policy = deny. `defaultEffect: 'deny'` on all built-in templates.
- **Priority-based evaluation**: Higher-priority policies evaluated first

**Role-Based API Authentication** in the control plane:

| Role | Capabilities |
|------|-------------|
| `admin` | Full access: policies, keys, controls, receipts, approvals, monitoring |
| `ingest` | Submit envelopes for evaluation (`POST /evaluate`) |
| `executor` | Read and update receipts, claim receipts for execution |

**Pre-Built Policy Templates** enforce principle of least privilege:

| Template | Default Effect | Reads | Writes | Execution | Payments |
|----------|---------------|-------|--------|-----------|----------|
| `conservative` | Deny | Allow | Approval | Approval | Approval (2 approvers) |
| `standard` | Deny | Allow | Allow | Approval | Approval (2 approvers) |
| `permissive` | Allow | Allow | Allow | Allow | Approval |
| `ci-cd` | Deny | Allow | Allow | Allow | Hard deny |

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Policy engine | `packages/engine/src/policy-engine.ts` | `PolicyEngine.evaluate()` |
| Condition evaluator | `packages/engine/src/condition-evaluator.ts` | `evaluateCondition()` |
| Policy schema | `packages/schemas/src/policy.schema.json` | Full policy definition |
| Envelope schema | `packages/schemas/src/action-envelope.schema.json` | `principal.type`, `principal.attributes` |
| Auth middleware | `packages/control-plane/src/auth/middleware.ts` | `authMiddleware`, `requireRole()` |
| Default policy | `packages/control-plane/src/services/default-policies.ts` | `DEFAULT_SAFE_POLICY` |
| Policy templates | `packages/control-plane/src/services/policy-templates.ts` | `POLICY_TEMPLATES` |

### Configuration

```json
{
  "id": "restrict-agent-scope",
  "name": "Agent Scope Restriction",
  "version": "1.0.0",
  "scope": {
    "principalTypes": ["agent"],
    "environments": ["production"]
  },
  "rules": [
    {
      "id": "allow-read-only",
      "effect": "allow",
      "condition": {
        "any": [
          { "field": "action.operation", "operator": "eq", "value": "read" },
          { "field": "action.type", "operator": "endsWith", "value": ".list" }
        ]
      }
    },
    {
      "id": "deny-financial",
      "effect": "deny",
      "condition": {
        "field": "action.type", "operator": "startsWith", "value": "payments."
      }
    },
    {
      "id": "approve-writes",
      "effect": "require_approval",
      "condition": {
        "field": "action.operation", "operator": "in", "value": ["create", "update", "delete"]
      },
      "approvalConfig": {
        "requiredApprovals": 1,
        "expiresIn": "1h"
      }
    }
  ],
  "defaultEffect": "deny"
}
```

### Competitor Comparison

| Product | RBAC | Fail-Closed | Approval Workflows | Policy Conditions | Multi-Tenant Scope |
|---------|------|-------------|-------------------|-------------------|-------------------|
| **Authensor** | 3 roles + principal types | Yes (default) | Multi-party with quorum | 13 operators + boolean logic | org/environment |
| AWS Cedar | Formal verification | Yes | No | Policy language | AWS IAM |
| Galileo Agent Control | No | No | No | Evaluator-based | No |
| NeMo Guardrails | No | No | No | Colang DSL | No |

### Coverage Rating: Full

Authensor's policy engine, combined with role-based API authentication and fail-closed defaults, provides comprehensive access control. Every action is evaluated before execution, with the full decision recorded in the receipt.

---

## ASI03: Supply Chain & Dependency Vulnerabilities

### Risk Description

Agents rely on third-party tools, MCP servers, libraries, and models that may be compromised, poisoned, or malicious. Tool descriptions can be modified after initial approval (rug-pull attacks), MCP servers can have zero security vetting, and dependency chains introduce transitive risks.

### Authensor Coverage

**MCP Gateway** acts as a transparent proxy between LLM clients and upstream MCP servers, intercepting every `tools/call` request for policy evaluation before forwarding:

- **Tool interception**: Every tool call passes through Authensor policy evaluation before reaching the upstream server
- **Dual mode**: Online (control plane) or offline (built-in safe-default policy)
- **Built-in safe policy**: Read operations allowed, write/execute operations require approval, destructive operations denied

**Tool Integrity Hashing** in Aegis detects MCP tool description poisoning (rug-pull attacks):

```typescript
const manager = new CanaryTokenManager();

// Record baseline when tool is first registered
const baseline = manager.hashToolDescription({
  name: 'read_file',
  description: 'Read a file from the filesystem',
  inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
});

// Check integrity before each invocation
const check = manager.checkToolIntegrity(currentTool, baseline);
if (!check.intact) {
  // Tool description was modified -- potential rug-pull attack
}
```

**HTTP Guard** prevents SSRF attacks when agents make HTTP requests through MCP tools:

- DNS resolution validation (blocks private IPs, loopback, link-local, multicast)
- Protocol enforcement (HTTPS only by default)
- Port restrictions (443 for HTTPS, 80 for HTTP when explicitly allowed)
- Credential-in-URL blocking

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| MCP Gateway | `packages/mcp-server/src/gateway.ts` | `createGateway()` |
| Offline policy | `packages/mcp-server/src/gateway.ts` | `OFFLINE_POLICY` |
| Tool integrity hashing | `packages/aegis/src/canary.ts` | `CanaryTokenManager.hashToolDescription()`, `checkToolIntegrity()` |
| HTTP Guard | `packages/mcp-server/src/hardening/http_guard.ts` | `validateHttpTarget()` |
| Exfiltration detector | `packages/aegis/src/detectors/exfiltration.ts` | `EXFILTRATION_RULES` (SSRF patterns) |

### Configuration

```bash
# MCP Gateway -- online mode (with control plane)
CONTROL_PLANE_URL=http://localhost:3000 \
UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \
npx authensor-mcp-gateway

# MCP Gateway -- offline mode (zero config, built-in policy)
UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \
AUTHENSOR_MODE=offline \
npx authensor-mcp-gateway
```

### Competitor Comparison

| Product | MCP Gateway | Tool Integrity | SSRF Protection | Offline Mode |
|---------|-------------|---------------|-----------------|-------------|
| **Authensor** | Full proxy with policy eval | SHA-256 description hashing | DNS-level IP blocking | Built-in safe policy |
| Trail of Bits mcp-context-protector | TOFU pinning | Configuration-level | No | No |
| MCPProxy-Go | Quarantine mode | No | No | No |
| AWS AgentCore | Gateway model | No | VPC-level | No |

### Coverage Rating: Partial

Authensor provides strong runtime supply chain protection through its MCP Gateway, tool integrity checking, and SSRF guard. The gap is that tool integrity checking is available in the Aegis library but not yet automatically integrated into the MCP Gateway's tool listing flow. Additionally, there is no build-time attestation verification (e.g., Sigstore/SLSA). **Planned**: Automatic tool description integrity verification on `tools/list` refresh, dependency provenance checking.

---

## ASI04: Insufficient Output Validation

### Risk Description

Agent outputs -- including tool results, generated code, and natural language responses -- are not validated before being acted upon or returned to users. This enables indirect prompt injection through tool results, malicious code generation, and unfiltered sensitive data in responses.

### Authensor Coverage

**Aegis Content Scanner** validates content for dangerous patterns across 5 detector categories:

| Detector | Rules | What It Catches |
|----------|-------|-----------------|
| `injection` | 18 | Prompt injection in any text field |
| `credentials` | 11 | API keys, tokens, private keys, connection strings |
| `pii` | 9 | SSNs, emails, phone numbers, credit cards, IP addresses |
| `code_safety` | 17 | rm -rf, DROP TABLE, reverse shells, privilege escalation, eval() |
| `exfiltration` | 12 | curl-pipe-bash, SSRF, DNS exfiltration, path traversal, webhook exfiltration |

**Redaction Mode** replaces detected sensitive content with tagged placeholders:

```typescript
const result = scanner.scan(content, { mode: 'redact' });
// result.redacted contains sanitized text with [SSN_[REDACTED]] markers
```

**Inline Scanning During Evaluation**: The `/evaluate` endpoint scans envelope parameters and metadata through Aegis before returning the policy decision:

```
POST /evaluate → getActivePolicy() → Aegis scanEnvelope() → PolicyEngine.evaluate() → createReceipt()
```

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Code safety detector | `packages/aegis/src/detectors/code-safety.ts` | `CODE_SAFETY_RULES` |
| Credential detector | `packages/aegis/src/detectors/credentials.ts` | `CREDENTIAL_RULES` |
| Envelope scanning | `packages/control-plane/src/services/aegis-service.ts` | `scanEnvelope()` |
| Receipt redaction | `packages/control-plane/src/routes/receipts.ts` | `redactSecrets()`, `SENSITIVE_KEYS` |

### Configuration

```bash
# Enable Aegis for output/content validation
AUTHENSOR_AEGIS_ENABLED=true
AUTHENSOR_AEGIS_MODE=block   # block | redact | warn
```

```typescript
const scanner = new AegisScanner();

// Scan tool output before returning to user
const result = scanner.scan(toolOutput, {
  detectors: ['credentials', 'pii', 'code_safety'],
  mode: 'redact',
  redactWith: '[REDACTED]',
});

if (!result.safe) {
  return result.redacted;  // Return sanitized version
}
```

### Competitor Comparison

| Product | Content Scanning | Credential Detection | PII Detection | Code Safety | Redaction |
|---------|-----------------|---------------------|---------------|-------------|-----------|
| **Authensor** | 67 rules, 5 categories | 11 rules (AWS, OpenAI, GitHub, Stripe, JWT, etc.) | 9 rules (SSN, CC, email, phone) | 17 rules (rm -rf, DROP, reverse shell) | Tagged replacement |
| Guardrails AI | Validator marketplace | Via validators | Via validators | Via validators | No |
| LlamaFirewall | CodeShield | No | No | Python/JS focus | No |
| NeMo Guardrails | Output rails | No | No | No | No |

### Coverage Rating: Partial

Aegis provides comprehensive pattern-based content validation with 67 detection rules. The current gap is that scanning is applied to action envelope inputs (parameters, resource, metadata) but not yet automatically applied to tool execution results returned from upstream MCP servers. This means indirect prompt injection via tool results requires manual integration. **Planned**: Automatic tool result scanning in the MCP Gateway post-execution pipeline.

---

## ASI05: Inadequate Sandboxing

### Risk Description

Agents execute code, access filesystems, or make network requests without proper isolation boundaries. Without sandboxing, a compromised agent can access the host system, network resources, or other agents' data.

### Authensor Coverage

**Sandbox Stub Mode** provides complete execution isolation for testing and demo environments:

```bash
AUTHENSOR_SANDBOX_MODE=stub
```

In stub mode, tools return deterministic fake outputs without making actual upstream API calls. This allows full policy evaluation and receipt creation without any real-world side effects. Stub results are generated per-tool (HTTP, Stripe, GitHub) with seeded values for reproducibility.

**HTTP Guard** enforces network-level sandboxing for HTTP requests:

- **IP blocking**: Blocks loopback (`127.0.0.0/8`), link-local (`169.254.0.0/16`), private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), and multicast
- **DNS resolution**: Resolves hostnames and validates all returned IPs before connecting
- **Protocol enforcement**: HTTPS-only by default
- **Port restrictions**: Only standard ports (443 for HTTPS, 80 for HTTP) allowed
- **Credential blocking**: URLs with embedded `username:password` are rejected

**Per-Tool Kill Switches** provide instant runtime isolation:

| Control | Scope | Effect |
|---------|-------|--------|
| `disable_execution` | Global | Blocks all tool execution |
| `disable_http` | HTTP tools | Blocks outbound HTTP requests |
| `disable_github` | GitHub tools | Blocks GitHub API calls |
| `disable_stripe` | Stripe tools | Blocks payment operations |

**Domain Allowlists** in action envelope constraints:

```json
{
  "constraints": {
    "allowedDomains": ["api.stripe.com", "api.github.com"],
    "timeout": 30000,
    "maxAmount": 100.00,
    "currency": "USD"
  }
}
```

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Sandbox mode | `packages/mcp-server/src/sandbox.ts` | `isSandboxMode()`, `getStubResult()` |
| HTTP Guard | `packages/mcp-server/src/hardening/http_guard.ts` | `validateHttpTarget()`, `isBlockedIp()` |
| Kill switches | `packages/control-plane/src/services/controls-service.ts` | `checkToolExecution()`, `getControls()` |
| Controls API | `packages/control-plane/src/routes/controls.ts` | `POST /controls`, `GET /controls/check` |
| Envelope constraints | `packages/schemas/src/action-envelope.schema.json` | `constraints.allowedDomains`, `constraints.timeout` |

### Configuration

```bash
# Enable sandbox mode for all execution
AUTHENSOR_SANDBOX_MODE=stub

# Kill switch via API
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"disableExecution": true}'

# Disable specific tool
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"disableHttp": true}'
```

### Competitor Comparison

| Product | Stub Execution | Network Guard | Kill Switches | Domain Allowlists |
|---------|---------------|---------------|---------------|-------------------|
| **Authensor** | Full stub mode with deterministic outputs | DNS-level SSRF blocking | Global + per-tool | Envelope constraints |
| AWS AgentCore | No | VPC-level | No | Security groups |
| Galileo Agent Control | No | No | No | No |
| NeMo Guardrails | No | No | No | No |

### Coverage Rating: Partial

Authensor provides strong network-level sandboxing (SSRF guard), execution-level isolation (stub mode), and runtime kill switches. The gap is that Authensor does not provide OS-level process isolation (containers, seccomp, namespaces) -- it operates at the application layer. For full sandboxing, Authensor should be deployed within containerized environments. **Planned**: Container sandbox profiles, filesystem access policies.

---

## ASI06: Memory & Context Manipulation

### Risk Description

Attackers manipulate an agent's memory, context window, or conversation history to alter its behavior. The MINJA attack (NeurIPS 2025) demonstrated >95% injection success through query-only RAG interaction. Attacks include context window poisoning, memory injection, and context boundary confusion.

### Authensor Coverage

**Canary Token Manager** detects context manipulation through multi-position token embedding:

| Position | Purpose | Detection Method |
|----------|---------|-----------------|
| `system_prefix` | Detect system prompt leakage at start | 4-layer (exact/encoded/partial/fuzzy) |
| `system_suffix` | Detect system prompt leakage at end | 4-layer |
| `context_boundary` | Detect RAG context boundary violation | Embedded between prompt and retrieved content |
| `goal_hijacking` | Detect goal override attacks | Reverse check: token should be present in output |
| `tool_description` | Detect MCP tool description poisoning | SHA-256 integrity hash |

**Context Boundary Embedding** inserts canary tokens between trusted and untrusted content:

```typescript
const manager = new CanaryTokenManager();

// Embed canary at the boundary between system prompt and RAG results
const { content, token } = manager.embedAtContextBoundary(
  systemPrompt,
  retrievedDocuments
);

// After LLM generates response, check for leakage
const report = manager.check(llmOutput, [token]);
if (report.detected) {
  // Context boundary was violated
}
```

**Goal Hijacking Detection** embeds a verification token that the LLM should include in its output. If the token is absent, the agent's goal may have been redirected:

```typescript
const manager = new CanaryTokenManager({
  positions: ['goal_hijacking']
});

const { prompt, tokens } = manager.embed(systemPrompt);
// ... send prompt to LLM, get response ...

const report = manager.check(llmResponse, tokens);
for (const check of report.checks) {
  if (check.position === 'goal_hijacking' && check.hijacked) {
    // Agent goal was likely redirected
  }
}
```

**Entropy Analysis** detects adversarial content injected into context windows:

```typescript
import { analyzeEntropy } from '@authensor/aegis';

const result = analyzeEntropy(contextContent, 100, 5.0);
if (result.anomalous) {
  // High-entropy segment detected -- possible GCG attack or encoded payload
  console.log(result.highEntropySegment);
}
```

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Canary token manager | `packages/aegis/src/canary.ts` | `CanaryTokenManager` |
| Context boundary | `packages/aegis/src/canary.ts` | `embedAtContextBoundary()` |
| Goal hijacking | `packages/aegis/src/canary.ts` | `CanaryPosition = 'goal_hijacking'` |
| Entropy analysis | `packages/aegis/src/entropy.ts` | `analyzeEntropy()` |
| Encoding detection | `packages/aegis/src/canary.ts` | `encodingMatch()` (base64, reversed, hex-separated) |

### Competitor Comparison

| Product | Canary Tokens | Context Boundary | Goal Hijacking | Entropy Detection |
|---------|--------------|-----------------|----------------|-------------------|
| **Authensor** | 4-layer detection (exact/encoded/partial/fuzzy) | Boundary embedding | Reverse verification | Shannon sliding window |
| LlamaFirewall | No | No | Agent Alignment Checks (model-based) | No |
| NeMo Guardrails | No | No | Topical rails (Colang) | No |
| Galileo Agent Control | No | No | No | No |

### Coverage Rating: Partial

Authensor provides the most comprehensive canary token system available in any open-source project, with 4-layer detection, context boundary protection, and goal hijacking detection. The gap is that these features require manual integration by the developer -- they are not yet automatically applied during the standard `/evaluate` pipeline. Additionally, there is no persistent memory integrity store (cryptographic commitments to agent memory state over time). **Planned**: Automatic canary injection in MCP Gateway, memory integrity verification.

---

## ASI07: Multi-Agent Trust & Delegation

### Risk Description

In multi-agent systems, agents delegate tasks to sub-agents, invoke other agents' tools, or share context across trust boundaries. Without proper trust verification and delegation controls, a compromised sub-agent can escalate privileges, exfiltrate data from the parent agent's context, or act outside its delegated scope.

### Authensor Coverage

**Principal Type System** distinguishes between four entity types, enabling differentiated trust levels:

```json
{
  "principal": {
    "type": "agent",        // user | agent | service | system
    "id": "sub-agent-007",
    "name": "Research Sub-Agent",
    "attributes": {
      "parentAgent": "orchestrator-main",
      "delegatedScope": "read-only"
    }
  }
}
```

**Policy Scoping by Principal Type** allows different rules for different agent types:

```json
{
  "scope": {
    "principalTypes": ["agent"],
    "environments": ["production"]
  }
}
```

**Parent Envelope Chaining** tracks delegation chains through `parentEnvelopeId`:

```json
{
  "context": {
    "parentEnvelopeId": "uuid-of-parent-action",
    "sessionId": "shared-session-id",
    "traceId": "distributed-trace-id"
  }
}
```

**Per-Agent Behavioral Monitoring** via Sentinel tracks each agent independently:

- Per-agent deny rates, action rates, cost rates, latency, error rates
- Per-agent risk scores (0--100)
- Per-agent action distribution and top denied actions
- EWMA spike detection and CUSUM drift detection per agent
- Alerts fire per-agent (e.g., "agent-007 deny rate > 0.3")

**Delegation Approval Rules** in policy templates require human approval for agent spawning:

```json
{
  "id": "std-approve-agent-spawn",
  "effect": "require_approval",
  "condition": {
    "any": [
      { "field": "action.type", "operator": "startsWith", "value": "agent.spawn" },
      { "field": "action.type", "operator": "startsWith", "value": "agent.delegate" }
    ]
  },
  "approvalConfig": {
    "requiredApprovals": 1,
    "expiresIn": "30m"
  }
}
```

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Principal types | `packages/schemas/src/action-envelope.schema.json` | `principal.type` enum |
| Parent envelope chain | `packages/schemas/src/action-envelope.schema.json` | `context.parentEnvelopeId` |
| Per-agent tracking | `packages/sentinel/src/agent-tracker.ts` | `AgentTracker` |
| Agent stats | `packages/sentinel/src/types.ts` | `AgentStats` |
| Delegation approval rules | `packages/control-plane/src/services/policy-templates.ts` | `std-approve-agent-spawn` |
| Scope-based policy matching | `packages/engine/src/policy-engine.ts` | `policyMatchesScope()` |

### Competitor Comparison

| Product | Principal Types | Delegation Chain | Per-Agent Monitoring | Delegation Approval |
|---------|---------------|-----------------|---------------------|-------------------|
| **Authensor** | 4 types with attributes | parentEnvelopeId | EWMA/CUSUM per agent | Policy-based with quorum |
| AWS AgentCore | IAM roles | No | CloudWatch | No |
| Galileo Agent Control | No | No | Evaluator-based | No |
| NeMo Guardrails | No | No | No | No |

### Coverage Rating: Partial

Authensor provides the structural primitives for multi-agent trust (principal types, envelope chaining, per-agent monitoring, delegation approval rules). The gap is the absence of cryptographic agent identity -- currently, agent identity is string-based without proof of identity (no mTLS, no signed envelopes, no challenge-response). A compromised agent with a valid API key can claim to be any principal. **Planned**: Cryptographic agent identity, signed envelopes, mTLS authentication.

---

## ASI08: Data Leakage & Privacy

### Risk Description

Agents inadvertently expose sensitive data -- PII, credentials, internal system details -- through their outputs, tool parameters, logs, or audit records. Data can leak through direct output, side-channel exfiltration (DNS, webhook callbacks), or insufficient redaction of audit trails.

### Authensor Coverage

**PII Detector** identifies 9 patterns of personally identifiable information:

| PII Type | Rule ID | Confidence |
|----------|---------|-----------|
| SSN (dashed) | `pii-ssn-dashed` | 0.92 |
| SSN (labeled) | `pii-ssn-nodash` | 0.88 |
| Email | `pii-email` | 0.95 |
| Phone (US) | `pii-phone-us` | 0.82 |
| Credit card (Visa) | `pii-cc-visa` | 0.88 |
| Credit card (MC) | `pii-cc-mastercard` | 0.88 |
| Credit card (Amex) | `pii-cc-amex` | 0.88 |
| IPv4 address | `pii-ipv4` | 0.70 |
| Date of birth | `pii-dob-labeled` | 0.85 |

**Credential Detector** identifies 11 patterns of secrets and tokens:

| Credential Type | Rule ID | Confidence |
|----------------|---------|-----------|
| AWS access key | `cred-aws-access-key` | 0.97 |
| AWS secret key | `cred-aws-secret-key` | 0.92 |
| OpenAI API key | `cred-openai-key` | 0.96 |
| Anthropic API key | `cred-anthropic-key` | 0.96 |
| GitHub token | `cred-github-pat` | 0.96 |
| Generic API key (KV) | `cred-generic-apikey-kv` | 0.78 |
| Generic API key (JSON) | `cred-generic-apikey-json` | 0.80 |
| Private key (PEM) | `cred-private-key` | 0.98 |
| JWT | `cred-jwt` | 0.85 |
| Database URI | `cred-db-connstring` | 0.92 |
| Slack token | `cred-slack-token` | 0.94 |
| Stripe key | `cred-stripe-key` | 0.95 |

**Exfiltration Detector** blocks 12 data exfiltration patterns:

- `curl | bash` and `wget | sh` pipe-to-shell patterns
- SSRF targeting cloud metadata endpoints (169.254.169.254)
- DNS exfiltration (long/hex-encoded subdomains)
- Path traversal (`../../etc/passwd`)
- Webhook callback exfiltration (requestbin, pipedream, ngrok)

**Receipt Redaction** sanitizes audit trail exports:

```typescript
const SENSITIVE_KEYS = [
  'authorization', 'token', 'api_key', 'secret', 'password',
  'access_token', 'refresh_token', 'private_key', 'credentials',
  'session', 'csrf', 'x-api-key', 'x-auth-token', /* ... 25 total */
];
```

The `GET /receipts/export` endpoint applies `redactSecrets()` to all exported receipts before returning NDJSON, ensuring sensitive values never leave the system in export payloads.

**SSRF Protection** in the HTTP Guard prevents agents from accessing internal network resources or cloud metadata endpoints that could leak infrastructure secrets.

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| PII detector | `packages/aegis/src/detectors/pii.ts` | `PII_RULES` |
| Credential detector | `packages/aegis/src/detectors/credentials.ts` | `CREDENTIAL_RULES` |
| Exfiltration detector | `packages/aegis/src/detectors/exfiltration.ts` | `EXFILTRATION_RULES` |
| Receipt redaction | `packages/control-plane/src/routes/receipts.ts` | `redactSecrets()`, `SENSITIVE_KEYS` |
| NDJSON export | `packages/control-plane/src/routes/receipts.ts` | `GET /receipts/export` |
| HTTP Guard | `packages/mcp-server/src/hardening/http_guard.ts` | `validateHttpTarget()` |

### Configuration

```typescript
const scanner = new AegisScanner();

// Scan for PII and credentials, redact before logging
const result = scanner.scan(agentOutput, {
  detectors: ['pii', 'credentials'],
  mode: 'redact',
  redactWith: '[REDACTED]',
});

if (!result.safe) {
  console.log('Sensitive data detected:', result.detections.length);
  return result.redacted;  // Sanitized version
}
```

### Competitor Comparison

| Product | PII Detection | Credential Detection | Exfiltration Detection | Audit Redaction | SSRF Blocking |
|---------|--------------|---------------------|----------------------|-----------------|---------------|
| **Authensor** | 9 rules | 12 rules | 12 rules | 25+ key patterns | DNS-level |
| Guardrails AI | Via validators | Via validators | No | No | No |
| LlamaFirewall | No | No | No | No | No |
| AWS AgentCore | No | No | No | CloudTrail | VPC-level |

### Coverage Rating: Full

Authensor provides comprehensive data leakage prevention through PII detection, credential scanning, exfiltration pattern matching, audit trail redaction, and network-level SSRF blocking. The 67 detection rules across 5 categories cover the most common leakage vectors.

---

## ASI09: Insufficient Logging & Auditing

### Risk Description

Agent actions are not adequately logged, audit trails can be tampered with, and there is no way to reconstruct what an agent did, why it was allowed, and what the outcome was. Without proper auditing, organizations cannot detect incidents, investigate breaches, or demonstrate compliance.

### Authensor Coverage

**Hash-Chained Receipt Trail** provides tamper-evident, immutable audit records:

Every action evaluation produces an `ActionReceipt` that records:

| Field | Type | Purpose |
|-------|------|---------|
| `id` | UUID | Unique receipt identifier |
| `envelopeId` | UUID | Links to the original action request |
| `timestamp` | ISO 8601 | When the receipt was created |
| `decision.outcome` | `allow \| deny \| require_approval \| rate_limited` | Policy decision |
| `decision.policyId` | string | Which policy made the decision |
| `decision.policyVersion` | SemVer | Policy version used |
| `decision.matchedRules` | array | Which rules matched and their effects |
| `decision.reason` | string | Human-readable explanation |
| `status` | `pending \| executed \| failed \| skipped \| cancelled` | Execution status |
| `approval` | object | Approval workflow state (multi-party) |
| `execution` | object | Execution timing, results, errors |
| `envelope` | object | Full original action envelope (embedded) |
| `receiptHash` | SHA-256 | Hash of this receipt's core fields |
| `prevReceiptHash` | SHA-256 | Hash of the preceding receipt (chain link) |

**Hash Chain Integrity**: Each receipt's hash is computed from `(id, envelopeId, timestamp, decisionOutcome, prevReceiptHash)`, forming a blockchain-like chain. Any modification to any receipt breaks the chain.

**Chain Verification Endpoint**:

```
GET /receipts/verify?limit=1000
```

Returns:
```json
{
  "verified": 998,
  "broken": 0,
  "unchained": 2,
  "chainIntact": true,
  "checkedAt": "2026-03-14T12:00:00.000Z"
}
```

**NDJSON Export** for SIEM integration:

```
GET /receipts/export?from=2026-03-01&to=2026-03-14&limit=10000
```

Returns newline-delimited JSON with secrets automatically redacted.

**Sentinel Monitoring** provides real-time operational auditing:

- Per-agent behavioral profiles with EWMA spike detection and CUSUM drift detection
- Configurable alert rules on deny_rate, cost_rate, latency, error_rate
- Alert persistence to database with acknowledgment workflow
- Webhook notifications for alert events

**Webhook Notifications** for external system integration:

| Webhook | Env Variable | Triggers |
|---------|-------------|----------|
| Sentinel alerts | `AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL` | Any alert rule fires |
| Rate limit events | `AUTHENSOR_RATE_LIMIT_WEBHOOK_URL` | API rate limit exceeded |
| Policy missing | `AUTHENSOR_POLICY_ALERT_WEBHOOK_URL` | No policy configured (fail-closed) |

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Receipt schema | `packages/schemas/src/action-receipt.schema.json` | Full receipt definition |
| Hash computation | `packages/control-plane/src/services/receipt-service.ts` | `computeReceiptHash()` |
| Chain linking | `packages/control-plane/src/services/receipt-service.ts` | `getLatestReceiptHash()` |
| Chain verification | `packages/control-plane/src/services/receipt-service.ts` | `verifyReceiptChain()` |
| NDJSON export | `packages/control-plane/src/routes/receipts.ts` | `GET /receipts/export` |
| Receipt list/filter | `packages/control-plane/src/routes/receipts.ts` | `GET /receipts` |
| Sentinel alerts | `packages/sentinel/src/alert-engine.ts` | `AlertEngine` |
| Alert persistence | `packages/control-plane/src/services/sentinel-service.ts` | `persistAlert()` |
| Webhook notifications | `packages/control-plane/src/services/sentinel-service.ts` | `maybeSendAlertWebhook()` |

### Configuration

```bash
# Sentinel monitoring (enabled by default)
AUTHENSOR_SENTINEL_ENABLED=true

# Alert webhooks
AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../xxx
AUTHENSOR_SENTINEL_ALERT_WEBHOOK_SECRET=your-webhook-secret

# Rate limit webhook
AUTHENSOR_RATE_LIMIT_WEBHOOK_URL=https://your-siem.com/webhook
```

```typescript
// Verify receipt chain integrity
const result = await fetch('/receipts/verify?limit=5000', {
  headers: { 'Authorization': `Bearer ${adminKey}` }
});
const { chainIntact, broken, firstBrokenId } = await result.json();

if (!chainIntact) {
  alert(`Tamper detected! First broken receipt: ${firstBrokenId}`);
}
```

### Competitor Comparison

| Product | Hash-Chained Receipts | Chain Verification | NDJSON Export | Behavioral Monitoring | Alert Webhooks |
|---------|----------------------|-------------------|--------------|----------------------|---------------|
| **Authensor** | SHA-256 chain | `GET /receipts/verify` | `GET /receipts/export` | EWMA + CUSUM per agent | 3 webhook types |
| AWS AgentCore | No | No | CloudTrail export | CloudWatch | SNS |
| Galileo Agent Control | No | No | No | Evaluator metrics | No |
| NeMo Guardrails | No | No | No | No | No |

### Coverage Rating: Full

Authensor's hash-chained receipt system is the most comprehensive audit trail in the AI agent safety market. Every action is recorded with full provenance (who, what, when, which policy, why), linked into a tamper-evident chain, exportable in NDJSON, and verifiable with a single API call. Combined with Sentinel's real-time monitoring and webhook notifications, this provides enterprise-grade auditing.

---

## ASI10: Uncontrolled Agent Autonomy

### Risk Description

Agents operate without sufficient human oversight, making decisions with real-world consequences autonomously. Without guardrails on agent autonomy, errors compound, costs spiral, and agents can take irreversible actions that cause significant harm.

### Authensor Coverage

**Fail-Closed Policy Engine**: When no policy matches an action, the default is `deny`. This is the foundational control on agent autonomy.

```typescript
// No policies matched, deny by default (fail-closed)
return {
  decision: createDecision('deny', {
    reason: 'No matching policy found (fail-closed)',
  }),
};
```

**Human-in-the-Loop Approval Workflows** with multi-party quorum:

- `require_approval` effect pauses agent execution until human(s) approve
- Configurable required approval count (e.g., 2 approvers for payments)
- Time-limited approvals with automatic expiration
- Multi-party approval tracking with individual responses
- Rejection by any approver immediately cancels the action

**Rate Limiting** prevents runaway agents:

| Level | Mechanism | Configuration |
|-------|-----------|--------------|
| Policy-level | Per-rule rate limits with `principal`, `action`, or `global` scope | `rateLimit: { requests: 100, window: "1h", scope: "principal" }` |
| API-level | Token-scoped, role-aware rate limiting | `AUTHENSOR_RL_INGEST_PER_MIN=120` |
| Template-level | Pre-configured limits in policy templates | `perm-ratelimit-network`: 500 req/hr |

**Global Kill Switch** provides instant emergency stop:

```bash
# Immediately halt all agent execution
curl -X POST http://localhost:3000/controls \
  -H "Authorization: Bearer $ADMIN_KEY" \
  -d '{"disableExecution": true}'
```

**Behavioral Anomaly Detection** via Sentinel catches agents going off the rails:

| Metric | Detection Method | Default Alert Threshold |
|--------|-----------------|----------------------|
| Deny rate | EWMA + CUSUM | >30% in 5 minutes |
| Cost rate | EWMA + CUSUM | >$10 in 15 minutes |
| Latency | EWMA + CUSUM | >5000ms in 1 minute |
| Error rate | EWMA + CUSUM | >10% in 5 minutes |

**Per-Agent Risk Scores** (0--100) combine deny rate, error rate, and behavioral variance into a single health metric, enabling automated circuit-breaking.

**Claim-Based Execution** prevents duplicate execution:

- Receipts must be claimed before execution (atomic claim with DB-level locking)
- Claims have configurable TTL (`AUTHENSOR_CLAIM_TTL_SECONDS`, default 30s)
- Expired claims can be reclaimed by other executors
- Claim events are logged for auditability

**Approval Expiration** automatically cancels stale approvals, preventing forgotten pending actions from executing later.

### Code References

| Feature | File | Key Export |
|---------|------|-----------|
| Fail-closed default | `packages/engine/src/policy-engine.ts` | Lines 98--104 |
| Approval workflows | `packages/control-plane/src/routes/approvals.ts` | `POST /approvals/:id/respond` |
| Multi-party approval | `packages/control-plane/src/services/receipt-service.ts` | `addApprovalResponse()` |
| Policy rate limits | `packages/engine/src/policy-engine.ts` | `getRateLimitKey()`, lines 52--68 |
| API rate limits | `packages/control-plane/src/middleware/rate_limit.ts` | `rateLimitMiddleware` |
| Kill switch | `packages/control-plane/src/services/controls-service.ts` | `checkToolExecution()` |
| Anomaly detection | `packages/sentinel/src/agent-tracker.ts` | `AgentTracker.processEvent()` |
| Risk scores | `packages/sentinel/src/agent-tracker.ts` | `calculateRiskScore()` |
| Claim system | `packages/control-plane/src/services/receipt-service.ts` | `claimReceipt()` |
| Approval expirer | `packages/control-plane/src/services/approval-expirer.ts` | `parseDuration()` |

### Configuration

```json
{
  "id": "autonomy-guardrails",
  "name": "Agent Autonomy Controls",
  "version": "1.0.0",
  "rules": [
    {
      "id": "approve-all-writes",
      "effect": "require_approval",
      "condition": {
        "field": "action.operation", "operator": "in",
        "value": ["create", "update", "delete", "execute"]
      },
      "approvalConfig": {
        "requiredApprovals": 2,
        "expiresIn": "30m"
      }
    },
    {
      "id": "rate-limit-actions",
      "effect": "allow",
      "condition": {
        "field": "action.type", "operator": "exists", "value": true
      },
      "rateLimit": {
        "requests": 50,
        "window": "1h",
        "scope": "principal"
      }
    }
  ],
  "defaultEffect": "deny"
}
```

```bash
# Sentinel alert configuration
AUTHENSOR_SENTINEL_ENABLED=true
AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL=https://pagerduty.com/webhook/xxx

# Claim TTL
AUTHENSOR_CLAIM_TTL_SECONDS=30

# Rate limits
AUTHENSOR_RL_INGEST_PER_MIN=120
AUTHENSOR_RL_EXECUTOR_PER_MIN=60
```

### Competitor Comparison

| Product | Fail-Closed | Approval Workflows | Rate Limiting | Kill Switch | Anomaly Detection | Risk Scores |
|---------|------------|-------------------|---------------|-------------|-------------------|------------|
| **Authensor** | Yes (default) | Multi-party with quorum + expiry | Policy + API level | Global + per-tool | EWMA + CUSUM | 0--100 per agent |
| AWS AgentCore | Cedar default-deny | No | API Gateway | No | CloudWatch alarms | No |
| Galileo Agent Control | No | No | No | No | Evaluator metrics | No |
| NeMo Guardrails | No | No | No | No | No | No |
| Guardrails AI | No | No | No | No | No | No |

### Coverage Rating: Full

Authensor provides the most comprehensive set of autonomy controls in the market: fail-closed defaults, multi-party approval workflows with quorum and expiration, two-tier rate limiting, global and per-tool kill switches, statistical anomaly detection (EWMA + CUSUM), and per-agent risk scoring. This is the strongest differentiator vs. every competitor.

---

## Summary: Full Architecture View

The Authensor evaluation pipeline touches all 10 OWASP categories in a single request flow:

```
Agent Action
    |
    v
[ActionEnvelope] ---- ASI02: Principal type, attributes, constraints
    |                  ASI07: parentEnvelopeId for delegation chains
    |                  ASI05: constraints.allowedDomains, timeout
    v
POST /evaluate
    |
    +-- [Auth Middleware] ---- ASI02: API key + RBAC (admin/ingest/executor)
    +-- [Rate Limiter] ------ ASI10: Token-scoped rate limiting
    |
    v
[getActivePolicy()]
    |
    +-- No policy? ---- ASI10: Fail-closed deny + webhook alert
    |
    v
[Aegis scanEnvelope()] ---- ASI01: Injection detection (18 rules)
    |                        ASI04: Code safety, credential scanning (67 rules)
    |                        ASI06: Entropy anomaly detection
    |                        ASI08: PII detection, exfiltration patterns
    v
[PolicyEngine.evaluate()] ---- ASI02: Condition-based access control
    |                           ASI10: Rate limit checking
    v
[createReceipt()] ---- ASI09: Hash-chained receipt with prevReceiptHash
    |
    +-- require_approval? ---- ASI10: Human-in-the-loop approval workflow
    |
    v
[Sentinel.processEvent()] ---- ASI09: Per-agent behavioral tracking
    |                           ASI10: Anomaly detection (EWMA/CUSUM)
    |                           ASI07: Per-agent risk scoring
    v
[MCP Gateway] ---- ASI03: Tool interception + integrity checking
    |               ASI05: HTTP Guard (SSRF blocking)
    |               ASI05: Sandbox stub mode
    v
[Execution / Deny / Approval Pending]
```

---

## Deployment Recommendations by Risk Posture

### Minimum Viable Safety (Development)

```bash
# Offline MCP Gateway with built-in policy
AUTHENSOR_MODE=offline \
UPSTREAM_COMMAND="npx @modelcontextprotocol/server-filesystem /tmp" \
npx authensor-mcp-gateway
```

Covers: ASI02 (basic RBAC), ASI03 (tool interception), ASI10 (fail-closed default).

### Standard Safety (Staging)

```bash
AUTHENSOR_AEGIS_ENABLED=true
AUTHENSOR_AEGIS_MODE=warn
AUTHENSOR_SENTINEL_ENABLED=true
```

Apply the `standard` policy template via API:
```bash
curl -X POST http://localhost:3000/templates/standard/apply \
  -H "Authorization: Bearer $ADMIN_KEY"
```

Covers: ASI01--ASI02, ASI04, ASI08--ASI10.

### Full Safety (Production)

```bash
AUTHENSOR_AEGIS_ENABLED=true
AUTHENSOR_AEGIS_MODE=block
AUTHENSOR_SENTINEL_ENABLED=true
AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL=https://pagerduty.com/webhook
AUTHENSOR_RATE_LIMIT_WEBHOOK_URL=https://siem.company.com/webhook
AUTHENSOR_POLICY_ALERT_WEBHOOK_URL=https://siem.company.com/webhook
```

Apply the `conservative` policy template. Enable canary tokens in your agent framework. Verify receipt chain integrity on a schedule.

Covers: All 10 categories (ASI01--ASI10).

---

## Known Gaps and Roadmap

| Gap | OWASP Category | Status | Description |
|-----|----------------|--------|-------------|
| Tool result scanning | ASI01, ASI04 | Planned | Aegis scans inputs but not tool execution outputs. Indirect injection via tool results is not caught automatically. |
| Cryptographic agent identity | ASI07 | Planned | Agent identity is string-based. No mTLS, signed envelopes, or challenge-response. |
| Automatic canary injection | ASI06 | Planned | Canary tokens require manual integration; not yet auto-injected by MCP Gateway. |
| OS-level sandboxing | ASI05 | Planned | Sandboxing is application-layer. No container/seccomp/namespace isolation. |
| Build-time attestation | ASI03 | Planned | No Sigstore/SLSA verification for tool provenance. |
| Action chain analysis | ASI07 | Planned | Each action evaluated independently. Multi-step privilege escalation through tool chaining is not correlated. |
| Memory integrity store | ASI06 | Planned | No persistent cryptographic commitments to agent memory state. |

---

*Document generated from Authensor v1.5.0-alpha source code analysis. Last updated: March 2026.*
