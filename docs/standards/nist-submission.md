# NIST AI Agent Standards Initiative — Authensor Response

**Subject:** Response to NIST RFI on "Security Considerations for AI Agents"

**Submitted by:** Authensor (authensor.dev)

**Date:** March 2026

---

## Executive Summary

Authensor is an open-source (MIT-licensed) safety stack for AI agents that addresses the core security challenges identified in the NIST RFI. We provide a production-ready implementation of the **evaluate → decide → execute → audit** loop that we believe should form the foundation of any AI agent security standard.

This response maps Authensor's architecture to the security considerations raised in the RFI and proposes specific requirements for standardization.

---

## 1. Action Authorization Model

### Problem
AI agents make autonomous decisions about tool use, API calls, and resource access. No standardized authorization model exists for evaluating these decisions before execution.

### Authensor's Approach: The Action Envelope

Every action an agent attempts is wrapped in a structured **Action Envelope** — a JSON document that captures:

- **What**: Action type, target resource, operation (CRUD+Execute), parameters
- **Who**: Principal type (user/agent/service/system), identity, attributes
- **Where**: Environment (dev/staging/prod), session ID, trace ID
- **When**: Timestamp, constraints (timeouts, monetary limits, allowed domains)

This envelope is evaluated against declarative policies **before** execution. The envelope schema is published as a JSON Schema and is framework-agnostic.

### Proposed Standard Requirement
> Every AI agent action SHOULD be representable as a structured authorization request that can be evaluated against policies independently of the agent framework.

---

## 2. Policy-Based Access Control

### Problem
Agent permissions are typically hard-coded in application logic or controlled only by prompt engineering, which is insufficient for production safety.

### Authensor's Approach: Declarative Policies

Policies are JSON documents with:
- **Scoping**: Which action types, principal types, and environments the policy applies to
- **Rules**: Ordered list of conditions and effects (`allow`, `deny`, `require_approval`)
- **Rate limits**: Per-principal, per-action, or global rate limiting
- **Approval workflows**: Multi-party approval with configurable quorum
- **Default effect**: Fail-closed (`deny` by default)

Policy evaluation is a pure function with no side effects — the engine takes an envelope and policies as input and returns a decision.

### Proposed Standard Requirement
> Agent authorization policies SHOULD be declarative, versioned, and evaluable independently of the agent runtime. The default posture SHOULD be deny (fail-closed).

---

## 3. Tamper-Evident Audit Trail

### Problem
Agent actions must be auditable for compliance (EU AI Act Article 12), incident investigation, and trust verification. Raw logs are insufficient because they can be silently modified.

### Authensor's Approach: Hash-Chained Receipts

Every policy evaluation produces an **Action Receipt** containing:
- The original envelope
- The policy decision (allow/deny/require_approval/rate_limited)
- Execution status and results
- A SHA-256 hash of the receipt's core fields
- A reference to the previous receipt's hash (forming a chain)

This creates a tamper-evident audit trail similar to a blockchain but without the consensus overhead. Chain integrity can be verified at any time via a single API call.

### Proposed Standard Requirement
> Agent action logs SHOULD be tamper-evident. Each log entry SHOULD include a cryptographic hash that incorporates the previous entry's hash, forming a verifiable chain.

---

## 4. Human Oversight Mechanisms

### Problem
High-risk agent actions require human review before execution. No standardized approval workflow exists across agent frameworks.

### Authensor's Approach: Approval Workflows

When a policy rule specifies `require_approval`:
1. A receipt is created with status `pending`
2. The agent is blocked from executing until approval is granted
3. Approvers can approve, reject, or let the request expire
4. Multi-party approval supports configurable quorum (`requiredApprovals: N`)
5. Any rejection immediately cancels the action

The claim mechanism ensures exactly-once execution even with multiple executors.

### Proposed Standard Requirement
> Agent frameworks SHOULD support human-in-the-loop approval for high-risk actions, with configurable approval policies, timeout-based expiration, and exactly-once execution guarantees.

---

## 5. Cross-Framework Safety

### Problem
Organizations use multiple agent frameworks (LangChain, OpenAI Agents SDK, CrewAI, custom). Safety controls are fragmented per framework.

### Authensor's Approach: Framework Adapters

Authensor provides a single control plane with lightweight adapters for each framework. All frameworks share:
- The same policy engine
- The same receipt chain
- The same approval workflows
- The same audit trail

Adapters are <100 lines of code each — they wrap the framework's tool execution with a call to the Authensor evaluate endpoint.

For MCP (Model Context Protocol) servers, Authensor provides a **Gateway mode** — a transparent proxy that intercepts all tool calls and evaluates them against policies.

### Proposed Standard Requirement
> Agent safety controls SHOULD be framework-agnostic and implementable as a separate authorization layer rather than tightly coupled to specific agent frameworks.

---

## 6. Rate Limiting and Abuse Prevention

### Problem
Agents can execute thousands of actions per minute. Without rate limiting, a compromised or malfunctioning agent can cause significant damage.

### Authensor's Approach

Policy rules support rate limiting with configurable:
- **Scope**: Per-principal, per-action-type, or global
- **Window**: Time-based windows (e.g., `10/1h`, `100/24h`)
- **Interaction with authorization**: Rate-limited actions receive a `rate_limited` decision and are recorded but not executed

A global kill switch and per-tool disable controls provide defense-in-depth independent of policies.

---

## 7. Web Content Safety (for Browsing Agents)

### Problem
Browsing agents interact with web content that may contain dark patterns, phishing, or manipulative UI elements. 32% of MCP servers have critical vulnerabilities (Trail of Bits, 2025).

### Our Approach: SpiroGrapher

SpiroGrapher compiles raw HTML into a structured **Web IR** (Intermediate Representation) and evaluates it against 26 constitutional rules covering:
- Deceptive link text
- Hidden form fields
- Misleading button placement
- Phishing indicators
- Data exfiltration patterns

Research shows agents fall for dark patterns 41% of the time — SpiroGrapher reduces this to near-zero by evaluating content before the agent sees it.

---

## Alignment with NIST AI RMF

| NIST AI RMF Function | Authensor Feature |
|---|---|
| GOVERN | Declarative policies, version control, org/env scoping |
| MAP | Action envelope schema maps all agent capabilities |
| MEASURE | Receipt chain, approval response tracking, execution metrics |
| MANAGE | Kill switches, per-tool controls, rate limiting |

---

## Contact

- **Website**: authensor.dev
- **GitHub**: github.com/authensor/authensor (MIT License)
- **Schemas**: Published as JSON Schema (draft-07) for interoperability
