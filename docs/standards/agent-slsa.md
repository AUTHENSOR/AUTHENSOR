# Agent SLSA: Supply-chain Levels for AI Agent Actions

**Version:** 0.1.0 (Draft)

**Authors:** Authensor Contributors

**Date:** March 2026

**Status:** Draft Specification -- Proposed for OpenSSF SLSA Working Group

**License:** CC BY 4.0

---

## Abstract

This specification defines **Agent SLSA** (Supply-chain Levels for Software Artifacts, adapted for AI agent actions), a framework of incrementally adoptable security levels for verifying the provenance and integrity of autonomous AI agent actions. Software SLSA addresses the question "can I trust how this artifact was built?" Agent SLSA addresses the analogous question for runtime agent behavior: **"can I trust how this action was authorized, executed, and recorded?"**

Agent SLSA defines four levels (L0--L3), each building on the previous, providing organizations with a clear maturity path from zero auditability to fully hardened, publicly verifiable agent action provenance.

---

## Table of Contents

1. [Motivation](#1-motivation)
2. [Scope and Definitions](#2-scope-and-definitions)
3. [Level Definitions](#3-level-definitions)
4. [Detailed Requirements](#4-detailed-requirements)
5. [Verification Procedures](#5-verification-procedures)
6. [Build-Time to Runtime Attestation Bridge](#6-build-time-to-runtime-attestation-bridge)
7. [Comparison with Software SLSA](#7-comparison-with-software-slsa)
8. [Reference Implementation: Authensor](#8-reference-implementation-authensor)
9. [Adoption Guidance](#9-adoption-guidance)
10. [Security Considerations](#10-security-considerations)
11. [Future Work](#11-future-work)
12. [References](#12-references)

---

## 1. Motivation

### 1.1 The Agent Supply Chain Problem

Software SLSA was created because software artifacts move through a supply chain (source, build, distribution) where integrity can be compromised at any stage. AI agents introduce an analogous runtime supply chain:

```
Tool Registration → Policy Evaluation → Action Authorization → Execution → Result Recording
```

Each stage is vulnerable:

| Stage | Software SLSA Equivalent | Agent Attack Vector |
|---|---|---|
| Tool registration | Dependency resolution | Malicious MCP server registration, typosquatting |
| Policy evaluation | Build configuration | Policy tampering, stale policy injection |
| Action authorization | Build execution | Decision bypass, approval forgery |
| Execution | Artifact production | TOCTOU races, parameter injection |
| Result recording | Provenance generation | Log tampering, receipt falsification |

### 1.2 Why Existing Standards Are Insufficient

**Software SLSA** covers build-time provenance but says nothing about runtime agent decisions. A perfectly SLSA L3 built binary can still execute unauthorized agent actions with no audit trail.

**SOC 2 / ISO 27001** require audit logs but do not specify tamper-evidence, cryptographic integrity, or provenance chain requirements.

**NIST AI RMF** identifies the need for agent action logging but does not define levels of assurance or verification procedures.

**EU AI Act Article 12** mandates logging for high-risk AI systems but provides no technical specification for what constitutes tamper-evident logging.

Agent SLSA fills this gap by defining concrete, verifiable requirements at each maturity level.

### 1.3 Threat Model

Agent SLSA protects against the following adversaries:

| Adversary | Capability | Agent SLSA Level Required |
|---|---|---|
| Compromised agent | Can emit arbitrary tool calls | L1 (logged for detection) |
| Malicious insider | Can modify log storage | L2 (tamper-evident chain) |
| Compromised control plane | Can alter policy evaluation results | L3 (hardened engine isolation) |
| Supply chain attacker | Can register malicious tools | L3 (verified tool provenance) |
| Sophisticated APT | Can compromise build + runtime | L3 + Sigstore bridge (public verifiability) |

---

## 2. Scope and Definitions

### 2.1 Scope

Agent SLSA applies to any system where an AI agent (or multi-agent system) performs actions through tools, APIs, or external services. This includes but is not limited to:

- LLM-based agents using tool calling (function calling)
- Model Context Protocol (MCP) tool servers
- Agent-to-agent delegation chains
- Browser automation agents
- Code execution agents

Agent SLSA does **not** cover:

- Model training provenance (see ML Supply Chain Levels for Artifacts)
- Prompt integrity (see separate specification proposals)
- Model weights verification (see SPDX 3.0 AI Profile)

### 2.2 Definitions

**Action Envelope.** A structured record of an agent's intent to perform an action, including the action type, target resource, principal identity, and context. The envelope is created before execution and serves as the authorization request.

**Action Receipt.** An immutable record of the authorization decision and execution outcome for a single action. A receipt references its envelope and contains the policy decision, execution status, and cryptographic hash.

**Receipt Chain.** An ordered sequence of action receipts where each receipt includes the cryptographic hash of the preceding receipt, forming a tamper-evident linked list.

**Policy Engine.** The component that evaluates action envelopes against declarative policies and produces authorization decisions. A conforming policy engine is a pure function: given the same envelope and policies, it always produces the same decision.

**Tool Manifest.** A signed declaration of a tool's capabilities, parameters, and identity. Used at L3 for tool provenance verification.

**Provenance.** Verifiable metadata about how an agent action was authorized, including the policy version, evaluation timestamp, matched rules, and chain position.

**Attestation.** A cryptographically signed statement asserting that a receipt or receipt chain meets a specific Agent SLSA level.

---

## 3. Level Definitions

### Overview

| Level | Name | Summary | Trust Assumption |
|---|---|---|---|
| L0 | No provenance | Agent actions are not logged | None |
| L1 | Documented provenance | Actions logged with structured metadata | Trusted logging infrastructure |
| L2 | Cryptographic provenance | Hash-chained receipts with tamper detection | Trusted control plane |
| L3 | Hardened provenance | Isolated engine, verified tools, non-falsifiable receipts | Minimal trust (hardware/process isolation) |

### Level 0: No Provenance

The agent executes actions with no record of authorization decisions. This is the current state of most deployed agent systems.

- No structured logging of agent decisions
- No policy evaluation before execution
- No audit trail for incident investigation
- No compliance with AI governance requirements

**Agent SLSA L0 is not acceptable for production deployments of autonomous agents.**

### Level 1: Documented Provenance

Agent actions are logged with structured metadata sufficient to reconstruct the authorization decision after the fact.

**Requirements:**
- Every action MUST be recorded with: action type, principal identity, timestamp, and authorization decision
- Logs MUST include the policy identifier and version used for evaluation
- Logs MUST be stored in a durable, queryable system
- The logging format MUST follow a documented schema

**What L1 provides:**
- Post-incident investigation capability
- Basic compliance auditing
- Behavioral analytics and anomaly detection

**What L1 does NOT provide:**
- Tamper detection (logs can be silently modified)
- Cryptographic proof of chronological ordering
- Verification that logs have not been deleted or reordered

### Level 2: Cryptographic Provenance

Every agent action receipt includes a cryptographic hash of its core fields and a reference to the previous receipt's hash, forming a verifiable chain. Any modification, deletion, or reordering of receipts is detectable.

**Requirements (all L1 requirements, plus):**
- Each receipt MUST include a SHA-256 (or stronger) hash computed over: receipt ID, envelope ID, timestamp, decision outcome, and the previous receipt's hash
- Each receipt MUST reference the hash of the immediately preceding receipt in the chain
- The receipt schema MUST be published and versioned
- A chain verification endpoint MUST be available that checks hash integrity across the entire chain
- The receipt chain MUST be fail-closed: if a receipt cannot be chained (e.g., the previous hash is unavailable), the system MUST either block the action or raise a critical alert

**What L2 provides:**
- Tamper detection: any modification to a receipt invalidates all subsequent hashes
- Deletion detection: a missing receipt creates a gap in the chain
- Reordering detection: changing receipt order changes the hash chain
- Compliance with EU AI Act Article 12 tamper-evidence requirements

**What L2 does NOT provide:**
- Protection against a compromised control plane that generates false receipts with valid hashes
- Verification that the policy engine itself was not tampered with
- Assurance that tool implementations match their declared capabilities

### Level 3: Hardened Provenance

The policy engine runs in an isolated, hardened environment. Tool provenance is verified before execution. Receipt provenance is non-falsifiable even if the outer application is compromised.

**Requirements (all L2 requirements, plus):**
- The policy engine MUST be deterministic: given the same inputs, it MUST produce the same outputs with no side effects
- The policy engine MUST run in an isolated execution context (at minimum, a separate process with restricted permissions; ideally a hardware-isolated enclave, secure enclave, or read-only container)
- Tool implementations MUST present signed manifests declaring their capabilities, parameters, and version
- Tool manifest signatures MUST be verified before the tool is made available for agent use
- Receipt hashes SHOULD be periodically published to an append-only transparency log (e.g., Sigstore/Rekor) for independent verification
- Policy files MUST be integrity-checked (e.g., content-addressable storage or signed policy bundles) before evaluation
- The control plane MUST maintain a separation of privilege between: (a) the component that evaluates policies, (b) the component that executes actions, and (c) the component that records receipts

**What L3 provides:**
- Protection against compromised control plane components
- Assurance that tools are authentic and unmodified
- Public verifiability of the receipt chain via transparency logs
- Defense-in-depth even when individual components are compromised

---

## 4. Detailed Requirements

### 4.1 Level 1 Requirements

#### R1.1: Structured Action Logging

Every agent action MUST produce a log entry conforming to a documented schema that includes at minimum:

```json
{
  "actionId": "uuid",
  "timestamp": "ISO 8601",
  "action": {
    "type": "string (e.g., 'stripe.charges.create')",
    "resource": "string (target resource identifier)",
    "operation": "create | read | update | delete | execute"
  },
  "principal": {
    "type": "user | agent | service | system",
    "id": "string"
  },
  "decision": {
    "outcome": "allow | deny | require_approval | rate_limited",
    "policyId": "string",
    "policyVersion": "string",
    "reason": "string"
  }
}
```

#### R1.2: Durable Storage

Action logs MUST be persisted to durable storage. In-memory-only logging does not satisfy L1. The storage system MUST support query by: time range, principal ID, action type, and decision outcome.

#### R1.3: Schema Publication

The action log schema MUST be published and versioned. Consumers of the log MUST be able to validate entries against the published schema.

#### R1.4: Completeness

The logging system MUST record actions regardless of outcome. Denied actions, rate-limited actions, and actions pending approval MUST all be recorded.

### 4.2 Level 2 Requirements

#### R2.1: Receipt Hash Computation

Each receipt MUST include a `receiptHash` field computed as:

```
receiptHash = SHA-256(JSON.stringify({
  id:               <receipt UUID>,
  envelopeId:       <envelope UUID>,
  timestamp:        <ISO 8601 creation timestamp>,
  decisionOutcome:  <"allow" | "deny" | "require_approval" | "rate_limited">,
  prevReceiptHash:  <hash of previous receipt, or empty string if genesis>
}))
```

The hash MUST be computed over a canonical JSON serialization (deterministic key ordering) to ensure reproducibility.

#### R2.2: Chain Linking

Each receipt MUST include a `prevReceiptHash` field containing the `receiptHash` of the immediately preceding receipt. The first receipt in the chain (genesis receipt) MUST use an empty string or a well-known sentinel value for `prevReceiptHash`.

#### R2.3: Chain Verification API

The system MUST expose a verification mechanism that:

1. Retrieves receipts in chronological order
2. Recomputes each receipt's hash from its core fields
3. Verifies the recomputed hash matches the stored `receiptHash`
4. Verifies that `prevReceiptHash` references a real receipt in the chain
5. Returns a summary: total verified, total broken, first broken receipt ID

The verification response MUST include:

```json
{
  "verified": 847,
  "broken": 0,
  "unchained": 0,
  "chainIntact": true,
  "checkedAt": "2026-03-14T12:00:00Z"
}
```

#### R2.4: Immutable Core Fields

The fields included in the hash computation (receipt ID, envelope ID, timestamp, decision outcome) MUST NOT be modified after receipt creation. Systems MUST enforce immutability through database constraints, application logic, or both.

#### R2.5: Published Receipt Schema

The receipt schema MUST be published as a machine-readable format (JSON Schema, Protobuf, or equivalent) and MUST include the `receiptHash` and `prevReceiptHash` fields with documented computation procedures.

### 4.3 Level 3 Requirements

#### R3.1: Deterministic Policy Engine

The policy engine MUST be a pure function with no side effects. Given identical inputs (envelope + policies), it MUST always produce the same decision. The engine:

- MUST NOT perform I/O (no network calls, no file reads, no database queries)
- MUST NOT depend on ambient state (no global variables, no environment variables read during evaluation)
- MUST NOT use non-deterministic operations (no random number generation, no current-time reads during evaluation)
- SHOULD be implementable as a WebAssembly module or pure function library

#### R3.2: Engine Isolation

The policy engine MUST run in an isolated execution context that is separate from:

- The HTTP/API layer that receives requests
- The database layer that stores policies and receipts
- The execution layer that performs agent actions

Acceptable isolation mechanisms, in increasing order of assurance:

| Isolation Level | Mechanism | Example |
|---|---|---|
| Process isolation | Separate OS process with restricted permissions | Child process with dropped capabilities |
| Container isolation | Read-only container with no network access | Distroless container, read-only filesystem |
| Sandbox isolation | Language-level sandboxing | WebAssembly module, V8 isolate |
| Hardware isolation | Trusted execution environment | Intel SGX, ARM TrustZone, AWS Nitro Enclaves |

#### R3.3: Signed Tool Manifests

Every tool available to the agent MUST present a signed manifest before it can be used. The manifest MUST include:

```json
{
  "toolId": "string",
  "name": "string",
  "version": "semver",
  "capabilities": ["list of declared capabilities"],
  "parameters": { "JSON Schema of accepted parameters" },
  "publisher": {
    "id": "string",
    "name": "string"
  },
  "signature": {
    "algorithm": "ECDSA-P256 | Ed25519",
    "publicKey": "base64-encoded public key",
    "value": "base64-encoded signature over canonical manifest"
  },
  "publishedAt": "ISO 8601"
}
```

The control plane MUST verify the manifest signature before making the tool available. Tools with missing, invalid, or expired signatures MUST be rejected.

#### R3.4: Policy Integrity Verification

Policy files MUST be integrity-checked before evaluation. Acceptable mechanisms:

- **Content-addressable storage**: Policies are addressed by their content hash. The hash used for retrieval is verified to match the policy content.
- **Signed policy bundles**: Policies are distributed as signed bundles. The signature is verified before the bundle is loaded.
- **Version-locked retrieval**: The policy version used for evaluation is recorded in the receipt, and the policy content for that version is immutable.

#### R3.5: Separation of Privilege

The system MUST maintain distinct privilege domains for:

1. **Policy evaluation**: Can read policies and envelopes, can produce decisions. Cannot execute actions or write receipts directly.
2. **Action execution**: Can execute authorized actions. Cannot modify policies or forge receipts.
3. **Receipt recording**: Can write receipts to storage. Cannot modify existing receipts or bypass policy evaluation.

No single component compromise should allow an attacker to both authorize and execute an action without detection.

#### R3.6: Transparency Log Publication

Receipt chain anchors SHOULD be published to a public append-only transparency log at regular intervals. See [Section 6](#6-build-time-to-runtime-attestation-bridge) for the Sigstore integration specification.

---

## 5. Verification Procedures

### 5.1 Level 1 Verification

An auditor verifying L1 compliance MUST check:

| Check | Method | Pass Criteria |
|---|---|---|
| Schema conformance | Validate sample receipts against published schema | 100% of sampled receipts pass validation |
| Completeness | Compare agent tool call count with receipt count | Receipt count >= tool call count |
| Queryability | Execute queries by time range, principal, action type, outcome | All queries return results within SLA |
| Durability | Verify storage is persistent (not in-memory only) | Receipts survive process restart |
| Coverage | Verify denied and rate-limited actions are also recorded | All decision outcomes present in log |

### 5.2 Level 2 Verification

An auditor verifying L2 compliance MUST perform all L1 checks, plus:

| Check | Method | Pass Criteria |
|---|---|---|
| Hash correctness | Recompute receiptHash for all receipts in chain | 100% match between computed and stored hash |
| Chain continuity | Verify each receipt's prevReceiptHash matches the preceding receipt's receiptHash | Zero gaps in the chain |
| Genesis receipt | Verify the first receipt has prevReceiptHash = "" or sentinel | Genesis receipt is correctly formed |
| Tamper detection | Modify one receipt's core field and run verification | Verification reports the tampered receipt as broken |
| Deletion detection | Remove one receipt from storage and run verification | Verification reports a chain break |
| API availability | Call the chain verification endpoint | Endpoint returns structured verification result |

#### Automated L2 Verification Script (Reference)

```bash
# Verify the receipt chain via the Authensor control plane API
curl -s -H "Authorization: Bearer $AUTHENSOR_ADMIN_KEY" \
  "$AUTHENSOR_URL/receipts/verify?limit=10000" | jq .

# Expected output:
# {
#   "verified": 9847,
#   "broken": 0,
#   "unchained": 0,
#   "chainIntact": true,
#   "checkedAt": "2026-03-14T12:00:00Z"
# }
```

### 5.3 Level 3 Verification

An auditor verifying L3 compliance MUST perform all L1 and L2 checks, plus:

| Check | Method | Pass Criteria |
|---|---|---|
| Engine determinism | Evaluate same envelope+policy 1000 times | Identical decision every time |
| Engine purity | Verify engine has zero I/O imports | Static analysis of engine dependency graph shows no I/O modules |
| Engine isolation | Inspect deployment architecture | Engine runs in separate process/container/enclave |
| Tool manifest signing | Attempt to register tool with invalid signature | Registration rejected |
| Tool manifest verification | Register tool with valid signature, verify it is accepted | Tool available for agent use |
| Policy integrity | Modify policy file at rest and attempt evaluation | Modified policy rejected or detected |
| Privilege separation | Compromise one component and attempt cross-domain action | Action blocked or detected |
| Transparency log | Verify published receipt anchors match local chain | Anchors in Rekor match local receipt hashes |

#### Engine Purity Verification

For TypeScript/JavaScript engines, L3 verification includes static analysis:

```
# The engine package must have zero runtime dependencies
$ cat packages/engine/package.json | jq '.dependencies'
null  # or {}

# The engine must not import any I/O modules
$ grep -r "import.*from.*'fs'" packages/engine/src/
# (no results)
$ grep -r "import.*from.*'http'" packages/engine/src/
# (no results)
$ grep -r "import.*from.*'net'" packages/engine/src/
# (no results)
```

---

## 6. Build-Time to Runtime Attestation Bridge

### 6.1 The Gap Between Build and Runtime

Software SLSA ensures that a binary was built from known source code in a trusted environment. But a perfectly attested binary can still make unauthorized runtime decisions. Agent SLSA closes this gap:

```
┌─────────────────────────────────────┐
│         Software SLSA               │
│  Source → Build → Artifact          │
│  (provenance of the binary)         │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│         Agent SLSA                  │
│  Envelope → Evaluate → Execute      │
│  → Receipt → Chain → Transparency   │
│  (provenance of runtime actions)    │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│      Sigstore/Rekor Bridge          │
│  Receipt hash anchors published     │
│  to public transparency log         │
│  (public verifiability)             │
└─────────────────────────────────────┘
```

### 6.2 Sigstore Integration Specification

#### Anchor Format

At configurable intervals (default: every 100 receipts or every 5 minutes, whichever comes first), the system MUST compute and publish an **anchor** to Sigstore/Rekor:

```json
{
  "_type": "https://agent-slsa.dev/anchor/v0.1",
  "subject": [
    {
      "name": "receipt-chain",
      "digest": {
        "sha256": "<hash of the latest receipt in the chain>"
      }
    }
  ],
  "predicateType": "https://agent-slsa.dev/provenance/v0.1",
  "predicate": {
    "chainLength": 9847,
    "firstReceiptId": "<UUID of genesis receipt>",
    "lastReceiptId": "<UUID of latest receipt>",
    "lastReceiptHash": "<SHA-256 of latest receipt>",
    "windowStart": "2026-03-14T11:00:00Z",
    "windowEnd": "2026-03-14T12:00:00Z",
    "controlPlaneVersion": "1.5.0",
    "engineVersion": "1.5.0",
    "anchorIndex": 98
  }
}
```

#### Signing

Anchors MUST be signed using Sigstore keyless signing (OIDC identity) or a long-lived signing key stored in a KMS. The signature and certificate are submitted to the Rekor transparency log.

#### Verification

Third parties can verify the agent's action history by:

1. Retrieving anchor entries from Rekor by the control plane's identity
2. Verifying the Rekor inclusion proof for each anchor
3. Comparing the anchor's `lastReceiptHash` with the receipt chain's actual hash at that point
4. Confirming that anchors form a consistent sequence (each anchor's chain state is a superset of the previous anchor's state)

#### Rekor Entry Structure

```
# Publishing an anchor to Rekor
rekor-cli upload \
  --artifact anchor.json \
  --type hashedrekord \
  --pki-format x509 \
  --signature anchor.sig \
  --public-key control-plane.pub
```

### 6.3 Full Attestation Chain

With the bridge in place, a complete end-to-end attestation chain is:

| Layer | What Is Attested | Standard | Verification |
|---|---|---|---|
| Source code | Code comes from known repository | SLSA L1+ | Git commit signatures |
| Build | Binary built from attested source | SLSA L2+ | Build provenance in Rekor |
| Deployment | Artifact deployed is the attested binary | Container signing | cosign / Notary v2 |
| Policy | Policies loaded match published versions | Agent SLSA L3 | Content-addressable policy hashes |
| Tools | Tool implementations are authentic | Agent SLSA L3 | Signed tool manifests |
| Authorization | Each action was evaluated against policy | Agent SLSA L2+ | Receipt hash chain |
| Execution | Action was executed exactly once | Agent SLSA L2+ | Claim/execute/finalize protocol |
| Audit trail | Receipts have not been tampered with | Agent SLSA L2+ | Chain verification API |
| Public verifiability | Receipt anchors are in transparency log | Agent SLSA L3 | Rekor inclusion proofs |

---

## 7. Comparison with Software SLSA

### 7.1 Structural Mapping

| Software SLSA Concept | Agent SLSA Equivalent |
|---|---|
| Source code | Action envelope (the agent's declared intent) |
| Build process | Policy evaluation (the authorization decision process) |
| Build platform | Control plane (the system that runs evaluation) |
| Build artifact | Action receipt (the recorded decision and outcome) |
| Provenance | Receipt metadata (policy ID, version, matched rules, timestamps) |
| Provenance hash | Receipt hash (SHA-256 over core fields) |
| Hash chain | Receipt chain (each receipt links to previous via prevReceiptHash) |
| Hermetic build | Pure policy engine (no I/O, no side effects, deterministic) |
| Isolated build | Hardened engine (separate process/container/enclave) |
| Signed provenance | Sigstore anchor (receipt chain hashes published to Rekor) |

### 7.2 Level-by-Level Comparison

| Level | Software SLSA | Agent SLSA |
|---|---|---|
| L0 | No provenance: no record of how artifact was built | No provenance: no record of how action was authorized |
| L1 | Documentation: build process is documented and produces provenance | Documentation: actions are logged with structured metadata and policy references |
| L2 | Signed provenance: build service generates and signs provenance, user can verify | Chained provenance: receipts are hash-chained, tamper-evident, and machine-verifiable |
| L3 | Hardened build: builds run on hardened platforms, provenance is non-falsifiable | Hardened runtime: engine is isolated and deterministic, tools are verified, receipts are publicly attestable |

### 7.3 Key Differences

**Scope.** Software SLSA covers a single event (a build). Agent SLSA covers a continuous stream of events (ongoing agent actions). This makes chain integrity more important in Agent SLSA -- a single broken link affects all subsequent verification.

**Temporality.** Software SLSA provenance is generated once at build time. Agent SLSA receipts are generated continuously at runtime, requiring low-latency hash computation and storage.

**Cardinality.** A typical software project has hundreds of builds. A typical agent system produces thousands to millions of receipts. Agent SLSA verification procedures must scale to high cardinality.

**Identity.** Software SLSA identifies builders (CI systems). Agent SLSA identifies principals (users, agents, services) and tracks delegation chains across multi-agent systems.

---

## 8. Reference Implementation: Authensor

Authensor (https://authensor.dev) provides a reference implementation demonstrating Agent SLSA L2, with architectural foundations for L3.

### 8.1 Current Level: L2

| L2 Requirement | Authensor Implementation |
|---|---|
| R2.1 Receipt hash computation | `computeReceiptHash()` in `receipt-service.ts`: SHA-256 over `{id, envelopeId, timestamp, decisionOutcome, prevReceiptHash}` |
| R2.2 Chain linking | `getLatestReceiptHash()` retrieves the most recent hash; new receipts reference it via `prevReceiptHash` |
| R2.3 Chain verification API | `GET /receipts/verify` endpoint runs `verifyReceiptChain()`, returns `{verified, broken, unchained, chainIntact}` |
| R2.4 Immutable core fields | Receipt core fields are set at creation and never modified; `updateReceipt()` only modifies status, execution, and approval fields |
| R2.5 Published receipt schema | `action-receipt.schema.json` published as JSON Schema (draft-07) with `receiptHash` and `prevReceiptHash` fields documented |

### 8.2 L1 Features (Fully Satisfied)

| L1 Requirement | Authensor Implementation |
|---|---|
| R1.1 Structured logging | Action Envelope schema with `action`, `principal`, `context`, `constraints` fields |
| R1.2 Durable storage | PostgreSQL-backed receipt storage with full CRUD |
| R1.3 Schema publication | JSON Schema definitions in `packages/schemas/src/` |
| R1.4 Completeness | All decision outcomes recorded: `allow`, `deny`, `require_approval`, `rate_limited` |

### 8.3 L3 Architectural Foundations

| L3 Requirement | Authensor Status |
|---|---|
| R3.1 Deterministic engine | **Satisfied.** `PolicyEngine` is a pure class with no I/O. `packages/engine` has zero runtime dependencies. Evaluation is synchronous. |
| R3.2 Engine isolation | **Partial.** Engine is a separate npm package with no I/O imports. Not yet deployed in a separate process or enclave. |
| R3.3 Signed tool manifests | **Not yet implemented.** Planned for v2.0. |
| R3.4 Policy integrity | **Partial.** Policies are versioned and the version is recorded in receipts. Content-addressable storage not yet implemented. |
| R3.5 Separation of privilege | **Partial.** Role-based API keys (admin, ingest, executor) enforce privilege boundaries. Claim/execute/finalize protocol prevents unauthorized execution. |
| R3.6 Transparency log | **Not yet implemented.** Sigstore bridge planned. |

### 8.4 Verification Example

```bash
# Verify Authensor's L2 chain integrity
$ curl -s -H "Authorization: Bearer $ADMIN_KEY" \
    https://your-deployment.example.com/receipts/verify | jq .

{
  "verified": 12453,
  "broken": 0,
  "unchained": 0,
  "chainIntact": true,
  "checkedAt": "2026-03-14T15:30:00Z"
}
```

### 8.5 Receipt Hash Implementation Detail

The canonical hash computation from Authensor's `receipt-service.ts`:

```typescript
function computeReceiptHash(fields: {
  id: string;
  envelopeId: string;
  timestamp: string;
  decisionOutcome: string;
  prevReceiptHash: string | null;
}): string {
  const payload = JSON.stringify({
    id: fields.id,
    envelopeId: fields.envelopeId,
    timestamp: fields.timestamp,
    decisionOutcome: fields.decisionOutcome,
    prevReceiptHash: fields.prevReceiptHash ?? '',
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}
```

---

## 9. Adoption Guidance

### 9.1 Recommended Adoption Path

Organizations should adopt Agent SLSA incrementally. Each level is designed to be achievable without a complete architecture rewrite.

#### Phase 1: Achieve L1 (Weeks 1--2)

**Goal:** Structured action logging for all agent actions.

**Steps:**
1. Define an action logging schema (or adopt the Authensor Action Envelope schema)
2. Instrument all agent tool calls to emit structured log entries
3. Store logs in a durable, queryable system (PostgreSQL, Elasticsearch, or equivalent)
4. Verify that all decision outcomes are recorded (including denials)
5. Publish the schema as part of your API documentation

**Effort:** Low. Most agent frameworks already have hook points for tool call interception.

**Organizational impact:** Security teams gain visibility into agent behavior. Incident response timelines drop from "unknown" to "queryable within minutes."

#### Phase 2: Achieve L2 (Weeks 3--6)

**Goal:** Tamper-evident receipt chain.

**Steps:**
1. Add `receiptHash` and `prevReceiptHash` fields to your receipt schema
2. Implement hash computation (SHA-256 over canonical JSON)
3. Implement chain linking (each new receipt references the previous hash)
4. Build a verification endpoint or script
5. Run verification on a schedule (hourly or daily) and alert on chain breaks

**Effort:** Medium. Requires database schema changes and receipt service modifications.

**Organizational impact:** Audit teams can cryptographically verify that agent logs have not been tampered with. Meets EU AI Act Article 12 tamper-evidence requirements.

#### Phase 3: Achieve L3 (Months 2--6)

**Goal:** Hardened engine with verified tool provenance.

**Steps:**
1. Ensure the policy engine is a pure function with zero I/O dependencies
2. Deploy the engine in an isolated process or container
3. Implement tool manifest signing and verification
4. Add policy integrity checks (content-addressable storage or signed bundles)
5. Establish privilege separation between evaluation, execution, and recording
6. (Optional) Set up Sigstore/Rekor integration for public verifiability

**Effort:** High. Requires architectural changes to deployment and tool registration.

**Organizational impact:** Defense-in-depth against sophisticated attackers. Enables third-party audits without direct access to the control plane.

### 9.2 Level Selection Guide

| Organization Profile | Recommended Minimum Level |
|---|---|
| Internal productivity agents (low risk) | L1 |
| Customer-facing agents (medium risk) | L2 |
| Financial services agents | L2, targeting L3 |
| Healthcare / regulated industry agents | L2, targeting L3 |
| Multi-agent systems with delegation | L2 (chain integrity across agents) |
| Government / defense agent deployments | L3 with Sigstore bridge |
| AI safety research organizations | L3 (reproducible evaluation) |

### 9.3 Compliance Mapping

| Regulation / Standard | Relevant Requirement | Agent SLSA Level |
|---|---|---|
| EU AI Act Article 12 | Automatic logging with tamper-evidence | L2 |
| EU AI Act Article 14 | Human oversight mechanisms | L1 + approval workflows |
| NIST AI RMF (MEASURE) | Metrics and monitoring of AI system behavior | L1 |
| NIST AI RMF (MANAGE) | Risk controls and incident response | L2 |
| SOC 2 Type II (CC7.2) | Security monitoring | L1 |
| SOC 2 Type II (CC8.1) | Change management audit trails | L2 |
| ISO 27001 Annex A.12.4 | Logging and monitoring | L1 |
| PCI DSS Req. 10 | Audit trail for cardholder data access | L2 |
| HIPAA 164.312(b) | Audit controls | L2 |
| FedRAMP (AU family) | Audit and accountability | L2, targeting L3 |

---

## 10. Security Considerations

### 10.1 Hash Algorithm Agility

This specification mandates SHA-256 as the minimum hash algorithm. Implementations SHOULD support algorithm agility to allow migration to SHA-3 or other algorithms if SHA-256 is weakened. The receipt schema SHOULD include a `hashAlgorithm` field to support this transition.

### 10.2 Clock Synchronization

Receipt timestamps are included in hash computation. Clock skew between components can cause verification failures. Implementations SHOULD use NTP-synchronized clocks and SHOULD tolerate small clock drifts (< 1 second) during verification.

### 10.3 Chain Partitioning

In distributed deployments with multiple control plane instances, each instance maintains its own chain. Cross-instance chain merging is not defined in this specification version. Implementations SHOULD use a single serialization point for receipt creation (e.g., a single database with row-level locking) or document their multi-chain strategy.

### 10.4 Denial of Service

An attacker who can generate a high volume of agent actions can create very long receipt chains that are expensive to verify. Implementations SHOULD support incremental verification (verify only receipts since last verified checkpoint) and SHOULD set upper bounds on full-chain verification queries.

### 10.5 Receipt Exfiltration

Receipts may contain sensitive information (action parameters, principal identities). Implementations MUST support redaction of sensitive fields in exported receipts without breaking the hash chain (the hash is computed over core fields only, not the full receipt body).

### 10.6 Key Management for L3

Signed tool manifests and Sigstore anchors require cryptographic key management. Implementations SHOULD use short-lived certificates (Sigstore keyless signing) or hardware-backed keys (KMS, HSM) rather than long-lived keys stored on disk.

---

## 11. Future Work

### 11.1 Multi-Agent Chain Federation

When multiple agents interact via delegation (e.g., Google A2A protocol), their receipt chains should be linkable. Future versions of this specification will define cross-chain references using `parentReceiptId` and inter-chain verification procedures.

### 11.2 ML Supply Chain Integration

Integrating Agent SLSA with ML model provenance (SPDX 3.0 AI Profile, ModelCard) to create a full pipeline from model training to runtime action authorization.

### 11.3 Formal Verification

Defining formal security properties (tamper-evidence, completeness, ordering) and providing machine-checkable proofs that L2 and L3 implementations satisfy them.

### 11.4 Agent SBOM Integration

Exporting receipt chains in CycloneDX or SPDX format as runtime Software Bills of Materials, enabling integration with existing vulnerability management workflows.

### 11.5 Hardware Attestation

Leveraging hardware attestation (TPM quotes, SGX remote attestation, Nitro attestation documents) to prove that the policy engine is running in a genuine isolated environment.

---

## 12. References

1. **SLSA Specification v1.0.** https://slsa.dev/spec/v1.0/ -- The original Supply-chain Levels for Software Artifacts specification.

2. **Sigstore.** https://sigstore.dev -- Keyless code signing and transparency log infrastructure.

3. **Rekor.** https://github.com/sigstore/rekor -- Immutable tamper-resistant transparency log.

4. **in-toto Attestation Framework.** https://github.com/in-toto/attestation -- Framework for generating and verifying supply chain attestations.

5. **EU AI Act.** Regulation (EU) 2024/1689 -- European regulation on artificial intelligence, particularly Article 12 (logging) and Article 14 (human oversight).

6. **NIST AI Risk Management Framework.** https://www.nist.gov/itl/ai-risk-management-framework -- Framework for managing AI risks.

7. **NIST Artificial Intelligence 600-1.** AI Risk Management Framework: Generative AI Profile.

8. **SPDX 3.0 AI Profile.** https://spdx.dev -- AI/ML extensions to the Software Package Data Exchange standard.

9. **CycloneDX.** https://cyclonedx.org -- OWASP standard for Software Bill of Materials.

10. **Google A2A Protocol.** Agent-to-Agent communication protocol with OAuth 2.0, OIDC, and signed security cards.

11. **Authensor.** https://authensor.dev -- Open-source safety stack for AI agents. Reference implementation of Agent SLSA L2.

12. **Agentic AIBOMs.** (March 2026) -- Research paper extending SBOMs into active provenance artifacts for autonomous agents.

---

## Appendix A: Conformance Checklist

### Agent SLSA L1 Conformance

- [ ] All agent actions produce structured log entries
- [ ] Log entries include: action type, principal identity, timestamp, decision outcome
- [ ] Log entries include policy ID and version used for evaluation
- [ ] Logs are stored in durable, queryable storage
- [ ] Log schema is published and versioned
- [ ] Denied and rate-limited actions are logged

### Agent SLSA L2 Conformance

- [ ] All L1 requirements satisfied
- [ ] Each receipt includes a SHA-256 `receiptHash` computed over core fields
- [ ] Each receipt includes `prevReceiptHash` linking to the preceding receipt
- [ ] Chain verification mechanism is available
- [ ] Verification recomputes hashes and checks chain continuity
- [ ] Receipt core fields are immutable after creation
- [ ] Receipt schema is published with hash computation procedure documented

### Agent SLSA L3 Conformance

- [ ] All L2 requirements satisfied
- [ ] Policy engine is deterministic (pure function, no I/O, no side effects)
- [ ] Policy engine runs in an isolated execution context
- [ ] Tools present signed manifests with verified signatures
- [ ] Policy files are integrity-checked before evaluation
- [ ] Privilege separation between evaluation, execution, and recording
- [ ] Receipt anchors published to transparency log (RECOMMENDED)

---

## Appendix B: Glossary

| Term | Definition |
|---|---|
| Action Envelope | Structured authorization request containing the agent's intended action, principal identity, and context |
| Action Receipt | Immutable record of authorization decision and execution outcome |
| Anchor | A signed attestation of the receipt chain state published to a transparency log |
| Chain Break | A point where the hash chain is invalid (hash mismatch or missing receipt) |
| Control Plane | The server component that manages policies, evaluates envelopes, and stores receipts |
| Fail-Closed | Default behavior where absence of an explicit allow decision results in denial |
| Genesis Receipt | The first receipt in a chain, with no preceding receipt hash |
| Hash Chain | Ordered sequence of receipts linked by cryptographic hashes |
| Policy Engine | Pure function that evaluates an envelope against policies to produce a decision |
| Principal | The entity (user, agent, service, system) requesting an action |
| Provenance | Verifiable metadata about how an action was authorized and executed |
| Receipt Hash | SHA-256 hash of a receipt's core immutable fields |
| Signed Tool Manifest | Cryptographically signed declaration of a tool's capabilities and identity |
| Transparency Log | Append-only log that provides public verifiability (e.g., Sigstore/Rekor) |

---

*This specification is maintained at https://github.com/authensor/authensor under the `docs/standards/` directory. Contributions and feedback are welcome via GitHub Issues.*
