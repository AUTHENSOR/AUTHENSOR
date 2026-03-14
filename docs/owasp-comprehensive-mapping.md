# OWASP AI Security Mapping to Authensor -- Comprehensive Analysis

> **Date:** 2026-03-14
> **Scope:** OWASP Agentic AI Top 10, OWASP LLM Top 10, OWASP MCP Top 10
> **Honest assessment:** Coverage strengths AND gaps identified for each item

---

## Table of Contents

1. [OWASP Agentic AI Top 10 (2026) -- Full Mapping](#1-owasp-top-10-for-agentic-applications-2026)
2. [OWASP LLM Top 10 v2.0 (2025) -- Full Mapping](#2-owasp-top-10-for-llm-applications-2025)
3. [OWASP MCP Top 10 (2025) -- Full Mapping](#3-owasp-mcp-top-10-2025)
4. [Other Relevant OWASP Projects](#4-other-relevant-owasp-projects)
5. [Competitive Mapping: How Competitors Cover OWASP](#5-competitive-mapping)
6. [Gap Summary and Roadmap Priorities](#6-gap-summary-and-roadmap-priorities)

---

## 1. OWASP Top 10 for Agentic Applications (2026)

Published December 2025 by 100+ industry experts. Uses the ASI prefix (Agentic Security Issue). This is the primary list for Authensor's market positioning.

Source: [OWASP Agentic Top 10](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

---

### ASI01: Agent Goal Hijacking

**Vulnerability:** Poisoned inputs (prompt injection, context manipulation, tool response manipulation) redirect agent objectives, causing the agent to use its legitimate tools for attacker-controlled purposes. Unlike simple prompt injection, goal hijacking weaponizes the agent's actual capabilities.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Policy evaluates the **action envelope**, not input text | Even if the agent is hijacked, `stripe.charges.create` for $50k is denied if policy caps at $10k |
| Authensor Engine | `constraints` field in envelopes | Parameter-level constraints (maxAmount, allowedDomains, timeout) limit blast radius regardless of agent intent |
| Authensor Control Plane | `require_approval` decision | High-consequence actions always require human sign-off, breaking the injection chain |
| Aegis | Injection detector (87 rules) | Detects direct/indirect prompt injection patterns before they reach the agent |
| SafeClaw | Deny-by-default policy | Unknown or unclassified actions are blocked, preventing novel hijacking from executing |
| SiteSitter | Constitutional browsing rules (26 rules) | Evaluates web actions against safety policies before execution |

**Gaps (honest assessment):**
- Aegis injection detection is regex-based, not ML-based. Sophisticated semantic injection attacks that don't match known patterns will bypass it. Lakera's ML classifier is stronger here.
- No "intent verification" system that compares declared agent goals against actual action sequences. This would require stateful session analysis.
- Indirect injection via tool responses (e.g., a web page returns malicious instructions) is partially covered by Aegis scanning but requires the integration to explicitly scan tool outputs.

**Coverage: STRONG** -- The action-level architecture is the primary defense here, and it works even when prompt-level defenses fail.

---

### ASI02: Tool Misuse & Exploitation

**Vulnerability:** Agents use legitimate tools in destructive, unauthorized, or unintended ways -- calling destructive APIs, passing excessive parameters, or combining tools in dangerous sequences.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Per-tool policy rules with `scope.actionTypes` | Glob-matching rules like `stripe.*` or `github.issues.create` allow fine-grained control per tool |
| Authensor Engine | `conditions` on rules (ABAC) | `field: "action.parameters.amount"`, `operator: "lessThan"`, `value: 10000` |
| Authensor Engine | Rate limiting per tool | Per-tool rate limits prevent abuse via high-frequency calls |
| Authensor Control Plane | Per-tool disable (controls API) | Kill switch disables individual tools instantly without policy changes |
| SafeClaw | Action classification | Tool calls classified into categories (filesystem, code, network, secrets, mcp) with per-category policies |
| SiteSitter | Risk classification | Actions categorized as read -> soft_interaction -> mutation -> high_consequence with escalating requirements |

**Gaps:**
- No tool-call-sequence analysis. Authensor evaluates each action independently; it cannot detect that "list files, then read secrets, then curl external" is a multi-step exfiltration chain. Would require stateful session tracking.
- Parameter constraint language is condition-based (lessThan, equals, matches); complex constraints like "this parameter must be from a known set of values in a database" require custom condition evaluators.

**Coverage: STRONG** -- This is Authensor's core value proposition. Per-tool policies with parameter constraints and rate limiting directly address this risk.

---

### ASI03: Identity & Privilege Abuse

**Vulnerability:** Leaked credentials enable scope escalation; agents inherit overly broad permissions; agent-to-agent trust is exploited for privilege escalation.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | `principal` field in envelopes | Every action scoped to a typed principal (agent, user, service) |
| Authensor Control Plane | RBAC via API keys | Three roles: `ingest`, `executor`, `admin` |
| Authensor Engine | Policy conditions on principal attributes | Rules match on `principal.type`, `principal.id`, or custom `principal.attributes` |
| Authensor Control Plane | API key rotation | `POST /keys/:id/rotate` for zero-downtime credential rotation |
| Aegis | Credential detector (64 rules) | Scans for exposed API keys, AWS keys, tokens in content |
| SafeClaw | Secrets redaction | API keys stripped from SSE output and audit logs |

**Gaps:**
- No fine-grained ABAC attribute store. Principal attributes must be passed in the envelope by the caller; there is no centralized identity provider integration (OIDC, SAML, LDAP).
- No session-based identity -- each request is independently authenticated. Compromised API keys grant full role-level access until rotated.
- No mutual TLS or certificate-based agent identity. Agents are identified by API key + principal ID in the envelope, which is self-asserted.
- No automatic least-privilege policy generation based on observed behavior.

**Coverage: MODERATE** -- Basic RBAC and principal scoping are solid. Enterprise identity integration and cryptographic agent identity are gaps.

---

### ASI04: Agentic Supply Chain Vulnerabilities

**Vulnerability:** Runtime components (MCP servers, plugins, tools, models) are poisoned, backdoored, or contain hidden vulnerabilities. Tool descriptions can inject instructions. Tool behavior can change after approval (rug-pull attacks).

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor MCP Server | Domain allowlisting | `AUTHENSOR_GITHUB_ALLOWED_REPOS`, `AUTHENSOR_STRIPE_ALLOWED_CURRENCIES` |
| Authensor MCP Server | SSRF protection | HTTP tool validates domains against allowlist, blocks internal network access |
| SafeClaw | MCP tool classification | `mcp__<server>__<action>` classifies every MCP tool call for policy evaluation |
| SiteSitter | Ed25519-signed adapter registry | Unsigned or tampered packages rejected |
| SiteSitter | Federated trust registry | Peer-to-peer trust verification |

**Gaps:**
- No tool schema pinning/hashing in production. The MCP security doc mentions "hash tool descriptors at registration, alert on changes" but this is documented as a best practice, not an implemented feature.
- No SBOM (Software Bill of Materials) generation or dependency scanning for MCP server packages.
- No runtime tool description drift detection. If an MCP server changes its tool descriptions (rug-pull), Authensor does not currently detect this.
- No tool provenance verification beyond SiteSitter's adapter signing (which applies to SiteSitter recipes, not arbitrary MCP servers).

**Coverage: MODERATE** -- Allowlisting and SSRF protection help, but proactive supply chain verification (schema pinning, drift detection, SBOM) is largely unimplemented.

---

### ASI05: Unexpected Code Execution (RCE)

**Vulnerability:** Natural-language paths unlock remote code execution through agent tools. Agents generate or execute attacker-controlled code.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Deny-by-default when no policy loaded | `AUTHENSOR_ALLOW_FALLBACK_POLICY=false` -- nothing runs without explicit authorization |
| Aegis | Code safety detector (38 rules) | Catches destructive commands (`rm -rf`, `DROP TABLE`), reverse shells, privilege escalation |
| SafeClaw | `code.*` category requires approval | Code execution tools never auto-allowed |
| SafeClaw | Container mode | `safeclaw run --container` sandboxes in Docker/Podman |
| SafeClaw | Workspace scoping | Agents confined to project boundaries |
| SiteSitter | Compile-then-govern | HTML compiled to structured IR; raw scripts never executed directly |

**Gaps:**
- Aegis code safety detection is pattern-based; obfuscated commands (base64-encoded, variable substitution, hex encoding) may bypass pattern matching.
- No sandboxed code execution environment built into Authensor Core (only SafeClaw has container mode).
- No static analysis of generated code before execution.

**Coverage: STRONG** -- Deny-by-default + approval workflows + container mode is a solid defense-in-depth story.

---

### ASI06: Memory & Context Poisoning

**Vulnerability:** Persistent corruption of agent memory, RAG stores, context window, or retrieval-augmented sources to influence future decisions long after initial interaction.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Control Plane | Receipt chain | Every action recorded with full provenance; post-incident review traces exactly when behavior changed |
| Authensor Control Plane | Hash-chained receipts | `prev_receipt_hash` linking makes audit trail tamper-evident |
| Authensor Engine | Policy versioning | `policyVersion` in every receipt records which rules were active |
| Sentinel | CUSUM drift detection | Catches gradual behavioral changes over time |
| Sentinel | EWMA spike detection | Detects sudden deviations from baseline |
| SafeClaw | Append-only audit ledger | SHA-256 hash chain with `safeclaw audit verify` |

**Gaps:**
- Authensor does not manage or protect agent memory/context directly. It records actions and detects behavioral drift, but cannot prevent memory poisoning at the RAG/vector store level.
- No vector store integrity verification or embedding watermarking.
- No "memory firewall" that validates what gets written to agent persistent memory.
- Detection is reactive (Sentinel detects drift after it happens), not preventive.

**Coverage: MODERATE** -- Strong forensic capabilities via receipt chain and drift detection, but no proactive memory protection.

---

### ASI07: Insecure Inter-Agent Communication

**Vulnerability:** Spoofed messages misdirect agent clusters; delegation chains lack verification; one compromised agent influences others.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | `parentEnvelopeId` in context | Delegation chains tracked -- every action knows which parent spawned it |
| Authensor Engine | Per-principal policies | Different agents have different policy scopes |
| Authensor Control Plane | Receipt chain provenance | Complete audit trail of which agent called which, with what authority |
| SiteSitter | Federation with Ed25519 signing | Inter-instance communication cryptographically signed |

**Gaps:**
- No message-level encryption or signing between agents. `parentEnvelopeId` is a reference, not a cryptographic proof.
- No mutual authentication protocol for agent-to-agent communication.
- No "delegation policy" that defines which agents can invoke which other agents.
- Inter-agent communication patterns are not monitored by Sentinel (only individual agent behavior is tracked).

**Coverage: MODERATE** -- Provenance tracking is useful for forensics but not sufficient for preventing spoofed inter-agent messages in real-time.

---

### ASI08: Cascading Failures

**Vulnerability:** Single-point faults propagate through multi-agent workflows, amplifying errors across interconnected systems. False signals cascade through automated pipelines.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Control Plane | Kill switch | `POST /controls` instantly halts all agent execution globally |
| Authensor Control Plane | Per-tool circuit breakers | Individual tools disabled without affecting others |
| Authensor Control Plane | Rate limiting | Per-role rate limits prevent runaway agents |
| Authensor Control Plane | Rate limit webhooks | Alerts operators when limits are hit |
| Sentinel | Alert rules | Configurable thresholds for deny_rate, cost_rate, latency, action_rate |
| SafeClaw | Budget controls | Daily/weekly/monthly spend caps |
| SafeClaw | Fail-closed | Authensor unreachable = all actions denied |

**Gaps:**
- No automatic circuit-breaker logic (auto-disable tool after N failures). Current circuit breakers are manual via the controls API.
- No cross-agent cascade detection. Sentinel monitors individual agents; it doesn't detect cascading patterns across a pipeline of agents.
- No backpressure mechanism for queuing actions when downstream systems are overwhelmed.
- No rollback capability for actions that have already executed.

**Coverage: STRONG** -- Kill switch + rate limiting + fail-closed provides robust blast radius containment. Automatic cascade detection would be an enhancement.

---

### ASI09: Human-Agent Trust Exploitation

**Vulnerability:** Users over-trust agent recommendations, especially for high-stakes decisions. Agents present misleading confidence or urgency to push humans toward unsafe approvals.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Control Plane | `require_approval` decision | Forces human review for high-consequence actions |
| Authensor Control Plane | Multi-party approval | `approvers_required: N` ensures multiple humans review critical actions |
| Authensor Control Plane | Time-limited approvals | Auto-deny prevents indefinite pending actions |
| SafeClaw | Risk signal badges | Advisory badges: obfuscated execution, credential access, pipe-to-external, destructive commands, persistence |
| SafeClaw | Mobile PWA with swipe-to-approve | Purpose-built approval UX reduces rubber-stamping |
| SiteSitter | Dark pattern detection | 8 categories of deceptive UI patterns with FTC/EU DSA regulatory citations |

**Gaps:**
- No "approval fatigue" detection. If a human is approving 95% of requests in rapid succession, there's no alert that they may be rubber-stamping.
- Approval UI shows the raw action envelope but doesn't provide contextual risk scoring or explainability about why this action is risky.
- No A/B testing or UX research on approval UI effectiveness.
- Dark pattern detection (SiteSitter) applies to web content the agent browses, not to the agent's own outputs presented to the user.

**Coverage: STRONG** -- Multi-party approval with risk signals is the strongest offering in the market. Approval fatigue detection would be a meaningful enhancement.

---

### ASI10: Rogue Agents

**Vulnerability:** Agents showing misalignment, concealment, self-directed action, deceptive behavior, or actively working against their operator's interests.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Fail-closed architecture | No policy = deny. Unreachable control plane = deny. Every action explicitly authorized |
| Authensor Control Plane | Receipt-based behavioral analysis | Complete action history enables pattern analysis |
| Authensor Control Plane | Kill switch | Instant global halt |
| Sentinel | Behavioral anomaly detection | EWMA + CUSUM detect deviations from agent baselines |
| SafeClaw | Risk signals: obfuscation detection | Flags commands that appear to evade detection |
| SafeClaw | Red team suite | 100+ scenarios across 13 security categories |

**Gaps:**
- No real-time deception detection (detecting when an agent claims to have done X but actually did Y). Would require output-action consistency checking.
- Sentinel baselines are per-agent but don't model "normal" vs "anomalous" at the semantic level -- only at the statistical level (rates, costs, latencies).
- No "honeypot" actions that test whether an agent is behaving deceptively.
- No agent introspection or explanation verification.

**Coverage: STRONG** -- Fail-closed + behavioral monitoring + kill switch is a robust containment architecture. Semantic deception detection is the frontier gap.

---

## 2. OWASP Top 10 for LLM Applications (2025)

Published November 2024 (v2.0). Focuses on LLM-specific risks at the model interaction layer. Many overlap with the Agentic Top 10 but operate at a different abstraction level.

Source: [OWASP LLM Top 10](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)

---

### LLM01:2025 -- Prompt Injection

**Vulnerability:** Attackers manipulate LLM inputs to override instructions, extract data, or trigger unintended behaviors. Direct injection (user prompt manipulation) and indirect injection (hidden instructions in external content).

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | Injection detector (87 rules) | Detects direct override patterns, delimiter-based injection, role manipulation, hidden HTML comment injection |
| Authensor Engine | Action-level evaluation | Even if injection succeeds, the resulting action must still pass policy |
| SafeClaw | Deny-by-default | Injected actions for tools not in the allowlist are blocked |
| SiteSitter | Web content filtering | Detects injection payloads embedded in web pages before agent processes them |

**Gaps:**
- Aegis is regex/pattern-based, not ML-based. Novel injection techniques will bypass.
- No training or fine-tuning-based defenses (instruction hierarchy, etc.) -- Authensor operates outside the model.
- No canary token system deployed in production to detect when injections succeed (canary module exists in Aegis but is supplementary).

**Coverage: MODERATE** -- Aegis provides a first layer; the action-level architecture provides the critical backstop. ML-based injection detection would strengthen this.

---

### LLM02:2025 -- Sensitive Information Disclosure

**Vulnerability:** LLM exposes PII, financial data, health records, credentials, or confidential business data through its responses.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | PII detector (142 rules) | SSN, email, phone, credit card, passport, IP address, etc. |
| Aegis | Credential detector (64 rules) | AWS keys, OpenAI keys, GitHub tokens, database connection strings |
| Aegis | Redaction mode | Automatically replaces detected PII with `[REDACTED]` tokens |
| SafeClaw | Secrets redaction | API keys stripped from SSE output before browser delivery |

**Gaps:**
- Aegis PII detection is regex-based. Fuzzy PII (e.g., "John from accounting who lives on Elm Street" without explicit identifiers) will not be detected.
- No contextual PII detection -- Aegis doesn't know whether "555-1234" is a phone number or an order number without surrounding context.
- No output filtering at the model response level (Authensor operates at the action level, not the response level). PII in free-text responses passes through unless Aegis is explicitly invoked.
- No differential privacy or membership inference protection.

**Coverage: MODERATE** -- Good pattern-based PII/credential detection. Semantic PII detection and automatic output filtering are gaps.

---

### LLM03:2025 -- Supply Chain

**Vulnerability:** Risks from untrusted third-party models, datasets, plugins, or dependencies that affect integrity of training data, models, and deployment platforms.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor MCP Server | Domain/repo allowlisting | Restricts which external services agents can access |
| SiteSitter | Ed25519-signed packages | Cryptographic verification of adapter/recipe packages |
| SiteSitter | Federated trust registry | Peer-to-peer trust verification |

**Gaps:**
- No model provenance verification (model signing, hash verification for downloaded models).
- No training data integrity checking.
- No plugin/extension signing for Authensor's own ecosystem (only SiteSitter recipes are signed).
- No automated vulnerability scanning of dependencies.

**Coverage: PARTIAL** -- Covers runtime supply chain (MCP servers, web adapters) but not model/data supply chain.

---

### LLM04:2025 -- Data and Model Poisoning

**Vulnerability:** Malicious data injected during training or fine-tuning introduces backdoors, biases, or vulnerabilities into the model itself.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Sentinel | CUSUM drift detection | Can detect behavioral changes that may result from poisoned fine-tuning |
| Authensor Control Plane | Receipt chain | Historical comparison shows before/after behavioral shifts |

**Gaps:**
- Authensor does not operate at the model training/fine-tuning layer. It cannot prevent poisoning.
- No training data validation or sanitization pipeline.
- No model integrity verification or watermarking.
- Detection is purely behavioral (Sentinel) and reactive -- by the time drift is detected, the poisoned model is already in production.

**Coverage: WEAK** -- This is fundamentally outside Authensor's scope (action authorization, not model training). Sentinel provides post-deployment detection only.

---

### LLM05:2025 -- Improper Output Handling

**Vulnerability:** Unsanitized LLM outputs trigger downstream security flaws (XSS, SSRF, code execution) in systems that consume the output.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | Code safety detector | Catches destructive commands, SQL injection, reverse shells in output |
| Aegis | Exfiltration detector | Detects data exfiltration patterns in output |
| Authensor Engine | Action envelope evaluation | If output is used to invoke a tool, the tool call goes through policy |

**Gaps:**
- No automatic output sanitization for web contexts (HTML encoding, script stripping).
- Aegis must be explicitly invoked on model outputs; there is no automatic output interception.
- No structured output validation (JSON schema enforcement on model responses). Guardrails AI is stronger here.

**Coverage: MODERATE** -- Aegis handles content-level threats; structured output validation is the gap.

---

### LLM06:2025 -- Excessive Agency

**Vulnerability:** LLM-based systems granted excessive ability to call functions or interface with other systems, enabling damaging actions from manipulated outputs.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Per-tool policy with constraints | Exactly defines what each agent can do, with what parameters, at what rate |
| Authensor Engine | Deny-by-default | Only explicitly allowed actions can execute |
| Authensor Control Plane | Controls API | Instantly disable specific tools |
| SafeClaw | Action classification + approval | Every tool call classified and gated |
| SafeClaw | Budget controls | Financial spend limits |

**Gaps:**
- No automatic least-privilege policy generation from observed behavior.
- No "permission request" flow where an agent can ask for elevated permissions that require human approval before being granted.

**Coverage: STRONG** -- This is Authensor's core design. Deny-by-default + per-tool policies + approval workflows directly addresses excessive agency.

---

### LLM07:2025 -- System Prompt Leakage

**Vulnerability:** System prompts containing sensitive information (API endpoints, internal logic, database schemas) are extracted by attackers.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | Credential detector | Detects if system prompt contents containing keys/secrets appear in outputs |
| Aegis | Exfiltration detector | Detects patterns of data being sent externally |

**Gaps:**
- Authensor does not manage system prompts. System prompt protection is the responsibility of the LLM provider or application layer.
- No system prompt integrity monitoring.
- No prompt encryption or access control.
- This is largely outside Authensor's architectural scope (action authorization layer, not model interaction layer).

**Coverage: WEAK** -- Minimal coverage. This risk is better addressed by model-level defenses and application-layer prompt management.

---

### LLM08:2025 -- Vector and Embedding Weaknesses

**Vulnerability:** Weaknesses in vector storage or embedding retrieval exploited for data leakage, inversion attacks, or poisoning in RAG systems.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Policy on data access actions | If vector store queries are modeled as actions, they go through policy |
| Sentinel | Anomaly detection | Unusual query patterns to vector stores could be flagged |

**Gaps:**
- Authensor does not operate at the vector store / embedding layer.
- No embedding integrity verification, multi-tenant isolation enforcement, or access control for vector stores.
- No protection against embedding inversion attacks.
- This is entirely outside Authensor's architectural scope.

**Coverage: WEAK** -- Essentially no coverage. This requires vector-store-level security tooling.

---

### LLM09:2025 -- Misinformation

**Vulnerability:** LLMs produce false or misleading information (hallucinations) that appears credible, leading to security, reputational, or legal consequences.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| SiteSitter | Dark pattern detection | Detects deceptive web content that could feed misinformation to agents |
| Authensor Control Plane | Receipts with action context | Records what information agents acted on, enabling forensic review |

**Gaps:**
- Authensor does not evaluate the truthfulness of model outputs. Hallucination detection is outside scope.
- No factual grounding verification.
- No confidence score enforcement on model outputs.
- Galileo is significantly stronger here with its Luna hallucination detection.

**Coverage: WEAK** -- Outside architectural scope. Authensor governs actions, not the truthfulness of text.

---

### LLM10:2025 -- Unbounded Consumption

**Vulnerability:** Resource-intensive queries cause service disruptions, excessive costs, or denial-of-service/denial-of-wallet attacks.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Control Plane | Rate limiting | Per-role, per-tool rate limits |
| Authensor Control Plane | Rate limit webhooks | Alerts when limits are hit |
| SafeClaw | Budget controls | Daily/weekly/monthly spend caps with enforcement actions |
| Sentinel | Cost monitoring | Per-agent cost tracking with alerting |
| Sentinel | Action flood detection | Alert rules for action_rate exceeding thresholds |

**Gaps:**
- Rate limiting is at the action level, not the token/compute level. A single allowed action could still trigger an expensive model call.
- No token-level budgeting or quota management.
- No query complexity analysis before execution.

**Coverage: STRONG** -- Budget controls + rate limiting + cost monitoring provide solid consumption governance at the action level.

---

## 3. OWASP MCP Top 10 (2025)

Published 2025 (Beta). Focuses specifically on Model Context Protocol security risks. Currently in Phase 3 -- Beta Release and Pilot Testing.

Source: [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)

---

### MCP01:2025 -- Token Mismanagement & Secret Exposure

**Vulnerability:** Hard-coded credentials, long-lived tokens, and secrets stored in model memory or protocol logs can expose sensitive environments.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | Credential detector (64 rules) | Scans for API keys, tokens, connection strings in content |
| SafeClaw | Secrets redaction | Strips API keys from SSE output and audit logs |
| Authensor Control Plane | API key rotation | Zero-downtime key rotation |

**Gaps:**
- No automatic credential scanning of MCP server configurations.
- No secret vault integration (HashiCorp Vault, AWS Secrets Manager).
- No runtime detection of credentials in MCP protocol messages specifically.

**Coverage: MODERATE**

---

### MCP02:2025 -- Privilege Escalation via Scope Creep

**Vulnerability:** Permissions granted to MCP agents expand over time through configuration drift until agents hold overly broad privileges.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Per-tool, per-principal policies | Explicitly defines allowed scope per agent |
| Authensor Engine | Deny-by-default | Prevents implicit permission expansion |
| Authensor Control Plane | Policy versioning | Tracks policy changes over time |

**Gaps:**
- No permission drift detection (alerting when policies are broadened).
- No automatic policy tightening based on actual usage patterns.
- No separation of duty for policy changes (any admin can modify policies).

**Coverage: MODERATE**

---

### MCP03:2025 -- Tool Poisoning

**Vulnerability:** Adversaries compromise tools, inject malicious content in tool descriptions, or execute rug-pull attacks (changing tool behavior after approval). Includes schema poisoning and tool shadowing.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| SafeClaw | MCP tool classification | Every `mcp__<server>__<action>` call classified for policy |
| Authensor Engine | Action-level evaluation | Tool calls must pass policy regardless of tool description content |
| Aegis | Injection detector | Scans tool outputs for injection payloads |

**Gaps:**
- No tool description integrity monitoring (hash-and-compare at registration vs. runtime).
- No tool shadowing detection (duplicate tool names across MCP servers).
- No rug-pull detection (alerting when a tool's actual behavior changes).
- This is a significant gap given that 32% of MCP servers have critical vulnerabilities.

**Coverage: MODERATE** -- Action-level policy provides a backstop, but proactive tool integrity verification is missing.

---

### MCP04:2025 -- Software Supply Chain Attacks & Dependency Tampering

**Vulnerability:** Compromised SDKs, connectors, protocol servers, or plugins introduce backdoors into MCP execution paths.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| SiteSitter | Ed25519-signed adapters | Cryptographic verification of packages |
| Authensor MCP Server | Domain allowlisting | Restricts accessible services |

**Gaps:**
- No dependency scanning for MCP server packages (npm audit, Snyk-style).
- No SBOM generation.
- No runtime integrity verification of loaded MCP server code.
- Ed25519 signing only applies to SiteSitter packages, not arbitrary MCP servers.

**Coverage: WEAK**

---

### MCP05:2025 -- Command Injection & Execution

**Vulnerability:** Agents construct and execute system commands using untrusted input without proper validation. Analogous to classic injection attacks (XSS, SQLi) but the interpreter is the model.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | Code safety detector (38 rules) | Catches destructive commands, reverse shells, privilege escalation patterns |
| Authensor Engine | Deny-by-default | Code execution actions blocked unless explicitly allowed |
| SafeClaw | `code.*` category | Code execution never auto-allowed |
| SafeClaw | Container mode | Sandboxed execution environment |

**Gaps:**
- Pattern-based detection; obfuscated commands may bypass.
- No input sanitization library for MCP tool parameters.
- No parameterized query enforcement for database-accessing tools.

**Coverage: STRONG**

---

### MCP06:2025 -- Prompt Injection via Contextual Payloads (Intent Flow Subversion)

**Vulnerability:** Malicious instructions embedded in retrieved context (documents, web pages, tool outputs) override user intent. The model retrieves a resource containing hidden instructions that redirect the agent.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Aegis | Injection detector | Scans content for injection patterns |
| SiteSitter | Constitutional rules | Evaluates web content before agent processes it |
| Authensor Engine | Action-level gating | Even if intent is subverted, resulting actions must pass policy |

**Gaps:**
- Same limitations as ASI01/LLM01 -- regex-based detection cannot catch all semantic injections.
- No content provenance tracking (knowing whether retrieved content came from a trusted source).
- No input/output boundary enforcement between retrieved context and agent instructions.

**Coverage: MODERATE**

---

### MCP07:2025 -- Insufficient Authentication & Authorization

**Vulnerability:** MCP servers fail to properly verify identities or enforce access controls during interactions.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Control Plane | API key authentication | All control plane interactions require authentication |
| Authensor Control Plane | RBAC (ingest/executor/admin) | Role-based access control |
| Authensor Engine | Principal-scoped policies | Per-agent authorization |

**Gaps:**
- Authensor secures its own APIs but does not enforce authentication on upstream MCP servers.
- No OAuth/OIDC integration for MCP server authentication.
- No mTLS between Authensor and MCP servers.
- MCP protocol itself lacks built-in auth -- Authensor cannot retroactively add auth to third-party MCP servers.

**Coverage: MODERATE** -- Strong for Authensor's own APIs; limited ability to enforce auth on external MCP servers.

---

### MCP08:2025 -- Lack of Audit and Telemetry

**Vulnerability:** Insufficient logging makes all other risks harder to detect. Without audit trails, attacks remain invisible until after damage occurs.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Control Plane | Hash-chained receipt trail | Every action recorded with full provenance, tamper-evident |
| Authensor Control Plane | Receipts API | Queryable audit trail via REST API |
| Sentinel | Real-time monitoring | EWMA + CUSUM anomaly detection with alerting |
| SafeClaw | Append-only audit ledger | SHA-256 hash chain with verification |

**Gaps:**
- Audit trail covers actions that go through Authensor; MCP tool calls that bypass Authensor are not logged.
- No log aggregation/SIEM integration out of the box.
- No compliance-ready export formats (CEF, STIX).

**Coverage: STRONG** -- This is one of Authensor's strongest differentiators. Hash-chained, tamper-evident audit trails directly address this risk.

---

### MCP09:2025 -- Shadow MCP Servers

**Vulnerability:** Unauthorized MCP server deployments operating outside governance, often with default credentials and permissive configurations.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| SafeClaw | MCP tool classification | Classifies and gates all MCP tool calls passing through SafeClaw |
| Authensor Engine | Deny-by-default | Unknown MCP tool calls are blocked |

**Gaps:**
- No network-level discovery of shadow MCP servers.
- No MCP server registry or inventory management.
- No alerting when agents attempt to connect to unregistered MCP servers.
- Detection depends on agents routing through Authensor/SafeClaw; if an agent connects to a shadow server directly, Authensor is bypassed entirely.

**Coverage: WEAK** -- Deny-by-default helps if agents go through Authensor, but no proactive discovery of shadow servers.

---

### MCP10:2025 -- Context Injection & Over-Sharing

**Vulnerability:** Malicious content embedded in shared memory influences future requests. Context reused across agents or workflows that should be isolated, causing sensitive data to leak between tenants.

| Layer | Feature | How it Addresses |
|-------|---------|-----------------|
| Authensor Engine | Per-principal policy scoping | Each agent has its own policy scope |
| Authensor Control Plane | Receipt provenance | Tracks context flow across actions |
| Aegis | PII detector | Scans for sensitive data in shared content |

**Gaps:**
- No context isolation enforcement between agents/tenants at the MCP protocol level.
- No data classification or sensitivity labels on context.
- No cross-tenant data leakage detection.
- Context management is outside Authensor's scope (it sees actions, not context).

**Coverage: WEAK** -- Authensor doesn't manage MCP context; it operates at the action level.

---

## 4. Other Relevant OWASP Projects

### OWASP API Security Top 10 (2023)

Source: [OWASP API Security](https://owasp.org/www-project-api-security/)

Relevant because AI agents are heavy API consumers. Key overlapping items:

| API Risk | Relevance to Agents | Authensor Coverage |
|----------|---------------------|-------------------|
| API1: Broken Object Level Authorization | Agents accessing resources they shouldn't | Principal-scoped policies, resource field in envelopes |
| API2: Broken Authentication | Agent API key compromise | API key rotation, RBAC |
| API3: Broken Object Property Level Authorization | Agents modifying restricted fields | Parameter constraints in policy conditions |
| API4: Unrestricted Resource Consumption | Agent-driven DoS/DoW | Rate limiting, budget controls |
| API5: Broken Function Level Authorization | Agents calling admin endpoints | Per-tool policies, deny-by-default |
| API6: Unrestricted Access to Sensitive Business Flows | Agents automating business processes without approval | Approval workflows |
| API8: Security Misconfiguration | Default-open agent configurations | Fail-closed, deny-by-default |

### OWASP Machine Learning Security Top Ten

Source: [OWASP ML Security Top 10](https://owasp.org/www-project-machine-learning-security-top-10/)

Focuses on ML model-level risks (adversarial examples, model theft, etc.). Largely outside Authensor's scope -- Authensor operates at the action authorization layer, not the model training/inference layer.

### OWASP GenAI Security Project

Source: [OWASP GenAI Security](https://genai.owasp.org/)

Umbrella project that houses the LLM Top 10 and Agentic Top 10. Also publishes:
- Agentic AI Threats & Mitigations taxonomy
- Threat modeling guide for agentic apps
- Secure agentic app development guidelines
- Agentic AI security product landscape

---

## 5. Competitive Mapping

How do competing tools cover the OWASP Agentic Top 10?

### Agentic Top 10 Coverage Matrix

| OWASP Risk | Authensor | AWS AgentCore + Cedar | Galileo Agent Control | NeMo Guardrails | Guardrails AI | Lakera Guard | LLM Guard |
|---|---|---|---|---|---|---|---|
| **ASI01: Goal Hijacking** | STRONG (action-level policy + Aegis injection + approval workflows) | MODERATE (Cedar policies, no injection detection) | MODERATE (guardrail evaluators, no action gating) | MODERATE (Colang flow control, topic guardrailing) | WEAK (output validation only) | MODERATE (best-in-class injection detection, but prompt-level only) | MODERATE (ML injection classifier) |
| **ASI02: Tool Misuse** | STRONG (per-tool policies, constraints, rate limits) | STRONG (Cedar fine-grained authz) | MODERATE (policy evaluators) | WEAK (no tool-level policies) | WEAK (no tool governance) | NONE | NONE |
| **ASI03: Identity Abuse** | MODERATE (RBAC, principal scoping) | STRONG (Cedar + AWS IAM integration) | WEAK (no identity layer) | NONE | NONE | NONE | NONE |
| **ASI04: Supply Chain** | MODERATE (allowlisting, SSRF protection, SiteSitter signing) | WEAK (AWS-only ecosystem) | WEAK | NONE | NONE | NONE | NONE |
| **ASI05: Code Execution** | STRONG (deny-by-default, Aegis code safety, container mode) | MODERATE (Cedar policies) | WEAK | MODERATE (output rails can block code) | WEAK (output validation) | NONE | MODERATE (code patterns) |
| **ASI06: Memory Poisoning** | MODERATE (receipt chain, drift detection) | NONE | MODERATE (evaluation/monitoring) | NONE | NONE | NONE | NONE |
| **ASI07: Inter-Agent Comms** | MODERATE (parent envelope chaining, per-agent policies) | NONE | NONE | NONE | NONE | NONE | NONE |
| **ASI08: Cascading Failures** | STRONG (kill switch, circuit breakers, rate limits, budget controls) | WEAK | WEAK | NONE | NONE | NONE | NONE |
| **ASI09: Trust Exploitation** | STRONG (multi-party approval, risk signals, dark pattern detection) | NONE | NONE | NONE | NONE | NONE | NONE |
| **ASI10: Rogue Agents** | STRONG (fail-closed, behavioral monitoring, kill switch) | MODERATE (fail-closed via Cedar) | MODERATE (monitoring/evaluation) | NONE | NONE | NONE | NONE |

### LLM Top 10 Coverage Matrix

| OWASP Risk | Authensor | NeMo Guardrails | Guardrails AI | Lakera Guard | LLM Guard |
|---|---|---|---|---|---|
| **LLM01: Prompt Injection** | MODERATE (Aegis regex + action-level backstop) | MODERATE (Colang + Llama Guard) | WEAK | STRONG (ML classifier, best-in-class) | STRONG (ML classifier) |
| **LLM02: Sensitive Info Disclosure** | MODERATE (Aegis PII/credential detection) | MODERATE (Presidio integration) | WEAK (via plugins) | MODERATE (PII detection) | MODERATE (PII detection) |
| **LLM03: Supply Chain** | MODERATE (MCP allowlisting) | NONE | NONE | NONE | NONE |
| **LLM04: Data/Model Poisoning** | WEAK (Sentinel drift detection only) | NONE | NONE | NONE | NONE |
| **LLM05: Improper Output Handling** | MODERATE (Aegis code safety) | MODERATE (output rails) | STRONG (structured output validation) | WEAK | MODERATE |
| **LLM06: Excessive Agency** | STRONG (core feature) | WEAK | NONE | NONE | NONE |
| **LLM07: System Prompt Leakage** | WEAK | MODERATE | NONE | MODERATE | WEAK |
| **LLM08: Vector/Embedding Weaknesses** | WEAK | NONE | NONE | NONE | NONE |
| **LLM09: Misinformation** | WEAK | NONE | NONE | NONE | NONE |
| **LLM10: Unbounded Consumption** | STRONG (rate limits, budgets, cost monitoring) | NONE | NONE | NONE | NONE |

### Key Competitive Insights

1. **Authensor's unique strengths vs. all competitors:**
   - Only tool with approval workflows (ASI09)
   - Only tool with cryptographic audit trail (ASI08/MCP08)
   - Only tool with kill switch and circuit breakers (ASI08)
   - Only tool with web browsing governance (SiteSitter)
   - Only tool with MCP-specific governance
   - Only tool with behavioral monitoring (Sentinel)

2. **Where competitors are stronger:**
   - **Lakera Guard:** ML-based prompt injection detection is significantly more robust than Aegis regex patterns (LLM01)
   - **Guardrails AI:** Structured output validation is more mature (LLM05)
   - **AWS AgentCore + Cedar:** Enterprise identity integration (OIDC/SAML/IAM) is more mature (ASI03)
   - **NeMo Guardrails:** Multi-turn conversational flow control via Colang is unique (LLM07)
   - **Galileo:** Hallucination detection (Luna) addresses LLM09 better than any other tool

3. **Market positioning:**
   - Authensor is the only tool that provides **action-level** governance (Category 2)
   - Most competitors operate at the **prompt/response** level (Category 1)
   - Galileo Agent Control is the closest competitor -- recently released as an open-source control plane that orchestrates multiple evaluators (Galileo Luna, NeMo, AWS Bedrock, custom). However, it lacks approval workflows, audit trails, fail-closed architecture, and MCP governance.

---

## 6. Gap Summary and Roadmap Priorities

### Coverage Heat Map

| Risk Category | Agentic Top 10 | LLM Top 10 | MCP Top 10 |
|---|---|---|---|
| Action Authorization | STRONG | STRONG | STRONG |
| Approval Workflows | STRONG | N/A | N/A |
| Audit & Compliance | STRONG | STRONG | STRONG |
| Injection Detection | MODERATE | MODERATE | MODERATE |
| Identity & Access | MODERATE | N/A | MODERATE |
| Supply Chain | MODERATE | MODERATE | WEAK |
| Monitoring & Anomaly | STRONG | MODERATE | MODERATE |
| Memory/Context Safety | MODERATE | WEAK | WEAK |
| Model-Level Risks | WEAK | WEAK | N/A |
| Output Validation | MODERATE | MODERATE | N/A |

### Priority Gaps to Close

**High Priority (competitive positioning + customer demand):**

1. **ML-based injection detection for Aegis** -- Regex patterns are insufficient against sophisticated attacks. Lakera and LLM Guard have ML classifiers. Consider integrating an open-source classifier or building a lightweight ML detector.

2. **Tool schema pinning and drift detection** -- MCP03 (Tool Poisoning) is a high-profile risk and Authensor's MCP governance positioning demands this. Hash tool schemas at registration, alert on changes.

3. **Automatic circuit breakers** -- Currently manual via controls API. Auto-disable tools after N consecutive failures or error rate thresholds.

4. **Enterprise identity integration** -- OIDC/SAML provider integration for ASI03. AWS AgentCore's Cedar + IAM story is compelling for enterprises.

**Medium Priority (completeness + compliance):**

5. **Tool-call-sequence analysis** -- Stateful session tracking to detect multi-step attack chains (ASI02).

6. **Approval fatigue detection** -- Alert when approval rates suggest rubber-stamping (ASI09).

7. **Shadow MCP server detection** -- Network-level discovery of unauthorized MCP servers (MCP09).

8. **SIEM/log aggregation integration** -- CEF/STIX export for enterprise security operations.

**Low Priority (outside core scope but good to acknowledge):**

9. **Vector store security** -- Not Authensor's core scope but could offer guidance docs.

10. **Hallucination detection** -- Partner with or integrate Galileo Luna rather than building in-house.

11. **Model-level defenses** -- Training data validation, model integrity -- outside Authensor's architectural scope. Document this as a complementary concern.

---

## Sources

- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)
- [OWASP Top 10 for LLM Applications 2025](https://genai.owasp.org/resource/owasp-top-10-for-llm-applications-2025/)
- [OWASP MCP Top 10](https://owasp.org/www-project-mcp-top-10/)
- [OWASP MCP Top 10 GitHub](https://github.com/OWASP/www-project-mcp-top-10)
- [OWASP Machine Learning Security Top 10](https://owasp.org/www-project-machine-learning-security-top-10/)
- [OWASP GenAI Security Project](https://genai.owasp.org/)
- [OWASP API Security Top 10](https://owasp.org/www-project-api-security/)
- [Palo Alto Networks: OWASP Agentic AI Security](https://www.paloaltonetworks.com/blog/cloud-security/owasp-agentic-ai-security/)
- [Lakera OWASP LLM Alignment](https://www.lakera.ai/blog/owasp-top-10-for-llm-applications-lakera-alignment)
- [Galileo Agent Control Announcement](https://galileo.ai/blog/announcing-agent-control)
- [Microsoft MCP Azure Security Guide](https://microsoft.github.io/mcp-azure-security-guide/)
- [Practical DevSecOps: OWASP Agentic Applications](https://www.practical-devsecops.com/owasp-top-10-agentic-applications/)
- [Auth0: Lessons from OWASP Agentic Top 10](https://auth0.com/blog/owasp-top-10-agentic-applications-lessons/)
