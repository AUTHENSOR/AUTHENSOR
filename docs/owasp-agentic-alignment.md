# OWASP Top 10 for Agentic Applications — Authensor Alignment

This document maps each risk in the [OWASP Top 10 for Agentic Applications (2026)](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/) to specific Authensor, SpiroGrapher, and SafeClaw features that address it.

The OWASP Agentic Top 10 was developed by 100+ industry experts and represents the first formal risk taxonomy for autonomous AI agents. 48% of cybersecurity professionals identify agentic AI as the number-one attack vector for 2026.

---

## ASI01: Agent Goal Hijacking

**Risk**: Poisoned inputs (prompt injection, context manipulation) redirect agent objectives, causing the agent to use its legitimate tools for attacker-controlled purposes.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | Policy engine evaluates action envelopes, not input text | Even if the agent is hijacked, the action must still pass policy evaluation — a `stripe.charges.create` call for $50,000 will be denied if the policy caps at $10,000 |
| Authensor | `constraints` field in envelopes | Parameter-level constraints (maxAmount, allowedDomains, timeout) limit blast radius regardless of agent intent |
| Authensor | `require_approval` decision | High-consequence actions always require human sign-off, breaking the injection chain |
| SafeClaw | Deny-by-default policy | Unknown or unclassified actions are blocked, preventing novel hijacking attacks from executing |
| SpiroGrapher | Constitutional browsing rules | 26 rules evaluate web actions against safety policies before execution |

---

## ASI02: Tool Misuse & Exploitation

**Risk**: Agents use legitimate tools in ways that produce destructive, unauthorized, or unintended outcomes.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | Per-tool policy rules with `scope.actionTypes` | Glob-matching rules like `stripe.*` or `github.issues.create` allow fine-grained control per tool |
| Authensor | `conditions` on rules | ABAC-style conditions: `field: "action.parameters.amount"`, `operator: "lessThan"`, `value: 10000` |
| Authensor | Rate limiting | Per-tool rate limits prevent abuse via high-frequency calls |
| Authensor | Controls: per-tool disable | Operator kill switch disables individual tools instantly without policy changes |
| SafeClaw | Action classification | Every tool call is classified into categories (filesystem, code, network, secrets, mcp) with per-category policies |
| SpiroGrapher | Risk classification | Actions categorized as read → soft_interaction → mutation → high_consequence, with escalating approval requirements |

---

## ASI03: Identity & Privilege Abuse

**Risk**: Leaked credentials allow scope escalation; agents inherit overly broad permissions.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | `principal` field in envelopes | Every action is scoped to a principal (agent, user, service) with typed identity |
| Authensor | RBAC via API keys | Three roles: `ingest` (evaluate only), `executor` (claim+execute), `admin` (full control) |
| Authensor | Policy conditions on principal attributes | Rules can match on `principal.type`, `principal.id`, or custom `principal.attributes` |
| SafeClaw | Secrets redaction | API keys and credentials are stripped from SSE output and audit logs before leaving the machine |
| SafeClaw | Local pre-filter | Safe reads (Read, Glob, Grep) are allowed locally — sensitive operations always go through the control plane |
| Authensor | API key rotation | `POST /keys/:id/rotate` enables zero-downtime credential rotation |

---

## ASI04: Agentic Supply Chain Vulnerabilities

**Risk**: Runtime components (MCP servers, plugins, tools) are poisoned, backdoored, or contain hidden vulnerabilities.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor MCP Server | Domain allowlisting | `AUTHENSOR_GITHUB_ALLOWED_REPOS`, `AUTHENSOR_STRIPE_ALLOWED_CURRENCIES` restrict tool scope |
| Authensor MCP Server | SSRF protection | HTTP tool validates domains against allowlist, blocks internal network access |
| SafeClaw | MCP tool classification | `mcp__<server>__<action>` pattern classifies every MCP tool call for policy evaluation |
| SpiroGrapher | Adapter registry with Ed25519 signing | All adapters and recipes are cryptographically signed; unsigned or tampered packages are rejected |
| SpiroGrapher | Federated trust registry | Peer-to-peer trust verification with selective trust models |

---

## ASI05: Unexpected Code Execution (RCE)

**Risk**: Natural-language paths unlock remote code execution via agent tools.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | Deny-by-default when no policy loaded | `AUTHENSOR_ALLOW_FALLBACK_POLICY=false` ensures nothing runs without explicit authorization |
| SafeClaw | `code.*` category requires approval | Code execution tools are never auto-allowed |
| SafeClaw | Container mode | `safeclaw run --container` sandboxes agent execution in Docker/Podman |
| SafeClaw | Workspace scoping | Agents are confined to project boundaries via `.safeclaw.json` detection |
| SpiroGrapher | Compile-then-govern | Web pages are compiled to structured IR before the agent acts — raw HTML with embedded scripts is never executed directly |

---

## ASI06: Memory & Context Poisoning

**Risk**: Memory poisoning reshapes agent behavior long after initial interaction.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | Receipt chain | Every action is recorded with full provenance. Post-incident review can trace exactly when behavior changed and which action caused it |
| Authensor | Hash-chained receipts | `prev_receipt_hash` linking makes the audit trail tamper-evident — poisoned/deleted entries are detectable |
| Authensor | Policy versioning | `policyVersion` in every receipt records exactly which rules were active, enabling before/after comparison |
| SafeClaw | Append-only audit ledger | SHA-256 hash chain with `safeclaw audit verify` detects any tampering |

---

## ASI07: Insecure Inter-Agent Communication

**Risk**: Spoofed messages misdirect agent clusters; delegation chains lack verification.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | `parentEnvelopeId` in context | Delegation chains are tracked — every action knows which parent action spawned it |
| Authensor | Per-principal policies | Different agents can have different policy scopes |
| Authensor | Receipt chain provenance | Complete audit trail shows which agent called which, with what authority |
| SpiroGrapher | Federation with Ed25519 signing | Inter-instance communication is cryptographically signed and verified |

---

## ASI08: Cascading Failures

**Risk**: False signals cascade through automated pipelines, amplifying errors across interconnected systems.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | Kill switch | `POST /controls` instantly halts all agent execution globally |
| Authensor | Per-tool circuit breakers | Individual tools can be disabled without affecting others |
| Authensor | Rate limiting | Per-role rate limits (`AUTHENSOR_RL_INGEST_PER_MIN`, `AUTHENSOR_RL_EXECUTOR_PER_MIN`) prevent runaway agents |
| Authensor | Rate limit webhooks | `AUTHENSOR_RATE_LIMIT_WEBHOOK_URL` alerts operators when limits are hit |
| SafeClaw | Budget controls | Daily/weekly/monthly spend caps with warn/require_approval/block actions |
| SafeClaw | Fail-closed | If Authensor is unreachable, all actions are denied — no cascading through a degraded control plane |

---

## ASI09: Human-Agent Trust Exploitation

**Risk**: Users over-trust agent recommendations, especially for high-stakes decisions.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | `require_approval` decision | Forces human review for high-consequence actions — the agent cannot bypass this |
| Authensor | Multi-party approval | `approvers_required: N` ensures multiple humans review critical actions |
| SafeClaw | Risk signal badges | Advisory badges flag: obfuscated execution, credential access, pipe-to-external, destructive commands, persistence |
| SafeClaw | Mobile PWA with swipe-to-approve | Purpose-built approval UX reduces rubber-stamping by making review fast and contextual |
| SpiroGrapher | Dark pattern detection | 8 categories of deceptive UI patterns detected with regulatory citations, alerting users before they trust agent-presented information |

---

## ASI10: Rogue Agents

**Risk**: Agents showing misalignment, concealment, self-directed action, or deceptive behavior.

**Authensor Coverage**:

| Layer | Feature | How it helps |
|-------|---------|-------------|
| Authensor | Fail-closed architecture | No policy = deny. Unreachable control plane = deny. Every action must be explicitly authorized |
| Authensor | Receipt-based behavioral analysis | Complete action history enables statistical analysis of agent behavior patterns |
| Authensor | Kill switch | Instant global halt if rogue behavior is detected |
| SafeClaw | Risk signals: obfuscation detection | Flags commands that appear to be obfuscated or attempting to evade detection |
| SafeClaw | 100+ red team scenarios | `safeclaw-redteam` validates containment across 13 security categories including multi-step attacks, privilege escalation, and exfiltration |
| SpiroGrapher | Web Genome fingerprinting | Detects when agents interact with structurally suspicious pages (clones, phishing sites) |

---

## Summary

Authensor provides **defense-in-depth** coverage across all 10 OWASP Agentic risks through three complementary layers:

- **Authensor Core**: Policy evaluation, receipts, approvals, controls (ASI01-ASI10)
- **SafeClaw**: Local execution gating, classification, audit ledger (ASI01, ASI02, ASI03, ASI05, ASI08, ASI09, ASI10)
- **SpiroGrapher**: Web governance, dark pattern detection, federation (ASI01, ASI02, ASI04, ASI05, ASI07, ASI09, ASI10)

No single tool covers everything. The combination of action-level authorization (Authensor), local execution gating (SafeClaw), and web content governance (SpiroGrapher) provides the most comprehensive open-source coverage of the OWASP Agentic Top 10 available today.
