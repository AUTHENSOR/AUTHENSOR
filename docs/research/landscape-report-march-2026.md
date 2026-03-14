# Authensor Landscape Research Report
## AI Agent Safety Ecosystem Analysis -- March 14, 2026

**15 parallel research agents | 500+ web sources | 600+ tool calls**

---

# Table of Contents

1. [Executive Summary](#executive-summary)
2. [Competitor Landscape](#1-competitor-landscape)
3. [MCP Ecosystem Security](#2-mcp-ecosystem-security)
4. [Agent Framework Adoption](#3-agent-framework-adoption)
5. [Enterprise Procurement](#4-enterprise-procurement)
6. [Regulatory Landscape](#5-regulatory-landscape)
7. [Developer Experience](#6-developer-experience)
8. [Open-Source Community](#7-open-source-community)
9. [Academic Research Frontiers](#8-academic-research-frontiers)
10. [Supply Chain Security](#9-supply-chain-security)
11. [Multi-Agent Safety](#10-multi-agent-safety)
12. [Browser Agent Safety](#11-browser-agent-safety)
13. [Observability Integration](#12-observability-integration)
14. [CI/CD and DevOps](#13-cicd-and-devops)
15. [Distribution Channels](#14-distribution-channels)
16. [Emerging Threat Vectors](#15-emerging-threat-vectors)
17. [Cross-Cutting Synthesis](#cross-cutting-synthesis)
18. [Prioritized Action Plan](#prioritized-action-plan)

---

# Executive Summary

Authensor sits at a unique inflection point in the AI agent safety market. After analyzing the full landscape across 15 dimensions, the findings are clear:

**The market is real and growing fast.**
- Gartner projects $492M governance spend in 2026, $1B+ by 2030
- 88% of organizations report security incidents with AI agents
- 48% of cybersecurity pros identify agentic AI as the #1 attack vector for 2026
- Half of executives plan to allocate $10-50M to secure agentic architectures
- 4+ companies acquired in the space ($1B+ total M&A in 2025 alone)

**Authensor's competitive position is strong because nobody else combines all four pillars:**
1. Action authorization (policy engine, fail-closed)
2. Content safety (Aegis scanner, zero deps)
3. Behavioral monitoring (Sentinel, EWMA/CUSUM)
4. Cryptographic audit trail (hash-chained receipts)

**The regulatory window is open.**
- EU AI Act high-risk deadline: August 2, 2026 (5 months)
- NIST AI Agent Identity & Authorization comment period: open until April 2
- Colorado AI Act enforcement: June 30, 2026
- Insurance companies actively excluding AI risks (Verisk exclusions effective Jan 1, 2026)
- Authensor's features map directly to Articles 9, 12, and 14 of the EU AI Act

**The standards opportunity is once-in-a-decade.**
- MCP spec discussions literally describe Authensor's architecture
- No MCP SEP exists for pre-execution authorization hooks
- No OpenTelemetry convention exists for policy evaluation spans
- No "Agent SLSA" levels have been defined
- NIST is defining the exact problem Authensor solves

**The biggest gaps to close are:**
1. No tool result/output scanning (Aegis only scans inputs)
2. No hosted docs site
3. No npm publish yet (packages not publicly available)
4. No public community (Discord/Slack)
5. No Show HN or content marketing presence

---

# 1. Competitor Landscape

## Market Consolidation (2025-2026)

| Target | Acquirer | Date | Price |
|--------|----------|------|-------|
| Robust Intelligence | Cisco | Oct 2024 | Undisclosed |
| Protect AI | Palo Alto Networks | Jul 2025 | ~$500M+ |
| CalypsoAI | F5 | Sep 2025 | $180M |
| Lakera | Check Point | 2025 | Undisclosed |
| CyberArk | Palo Alto Networks | Feb 2026 | $25B |
| Chronosphere | Palo Alto Networks | Jan 2026 | $3.35B |
| Promptfoo | OpenAI | Mar 9, 2026 | ~$85M |

Palo Alto Networks is building a full-stack agent security platform through acquisitions (Protect AI + CyberArk + Chronosphere + Koi). OpenAI acquiring Promptfoo removes the most popular open-source red-teaming tool from independence.

## Direct Competitors

### Galileo Agent Control (Launched March 11, 2026)
- Apache 2.0, open-source "control plane for AI agents"
- Pluggable evaluator architecture (Luna, NeMo, Bedrock, custom)
- Launch partners: CrewAI, Cisco, Glean
- **Missing**: No receipts, no approval workflows, no content scanner, no MCP tools, no fail-closed default
- **3 days old**: 0 stars, 2 forks, 11 commits

### AWS AgentCore + Cedar
- Cedar policy language with formal verification
- Natural language to Cedar policy authoring
- Gateway intercepts agent-tool traffic
- **Missing**: AWS-locked, no content safety, no receipts, no approvals, proprietary

### NVIDIA NeMo Guardrails (v0.21.0)
- Colang DSL for conversational guardrails
- Strong NVIDIA model integration (NemoGuard)
- 5,780 GitHub stars
- **Missing**: Conversational focus (not agentic), no action authorization, no receipts, Python-only, no MCP

### Guardrails AI
- Apache 2.0, Hub marketplace of validators
- 6,536 GitHub stars
- **Missing**: I/O validators only (not agents), no authorization, no receipts, small team ($7.5M total funding)

### Trail of Bits mcp-context-protector
- MCP security wrapper/proxy
- TOFU pinning for server configurations
- **Missing**: MCP-only, no policy engine, reactive not proactive, beta quality

### Other Notable Entrants
- **LlamaFirewall** (Meta): Open-source, PromptGuard 2 + Agent Alignment Checks + CodeShield. 90% attack reduction on AgentDojo.
- **Superagent**: Open-source guardrails framework with Safety Agent concept
- **OpenGuardrails**: 14B model quantized to 3.3B for safety classification, Apache 2.0
- **Straiker**: Fastest-growing agentic-first security company (enterprise SaaS)
- **Zenity**: $55M+ raised, FedRAMP In Process (March 2026), Gartner Cool Vendor
- **ClawMoat**: Node.js, OWASP mapping, similar niche to Authensor

## Authensor's Competitive Advantages

1. **Only product combining authorization + content safety + monitoring + cryptographic receipts**
2. **Human-in-the-loop approval workflows** (everyone else is binary allow/deny)
3. **Fail-closed by default** (shared only with AWS Cedar)
4. **MCP-native** (MCP server for direct tool enforcement)
5. **Vendor-neutral** in a consolidating market
6. **$5/mo friction-based pricing** (unique gap between free and enterprise SaaS)
7. **Zero-dependency core** (engine, aegis, sentinel)

## Pricing Landscape

| Product | Model | Price |
|---------|-------|-------|
| Authensor | OSS + hosted | Free / $5/mo planned |
| Galileo Agent Control | OSS + cloud | Free / Cloud TBD |
| AWS AgentCore | Consumption | $200 free tier |
| NeMo Guardrails | OSS | Free |
| Guardrails AI | OSS + Pro | Free / Pro unclear |
| Zenity | Enterprise SaaS | Custom |
| Cisco AI Defense | Enterprise | Custom |

---

# 2. MCP Ecosystem Security

## Ecosystem Scale
- **18,500+ servers** on mcp.so (zero security vetting)
- **19,268 servers** on Glama.ai (A-F security grading)
- **83,100 stars** on awesome-mcp-servers
- **72% of security issues** are "Insufficient Authentication & Authorization"
- MCP spec version: `2025-11-25`, now under Linux Foundation

## Known Vulnerability Classes

1. **Tool Poisoning / Description Injection**: Malicious tool descriptions manipulate LLM behavior. Cross-server poisoning documented by Invariant Labs.
2. **Confused Deputy**: Static client IDs with third-party auth exploitable via malicious redirect URIs
3. **SSRF**: Malicious servers trick clients into fetching from internal IPs, cloud metadata
4. **Session Hijacking**: Prompt injection via session ID reuse, impersonation
5. **Token Passthrough**: MCP servers passing client tokens to downstream APIs (explicitly forbidden)
6. **Rug Pull Attacks**: Tool descriptions change after approval to become malicious
7. **Arbitrary Code Execution**: MCPSafetyScanner paper demonstrated coerced malicious execution

## Missing MCP Security Primitives

The protocol currently lacks:
- Tool-level permissions/scopes
- Tool description signing/integrity
- Pre-execution authorization hooks
- Content safety scanning
- Cryptographic audit trail
- Cross-server trust policies
- Rate limiting
- Sandboxing standards

## MCP Spec Discussions Describing Authensor's Architecture

- **#2337**: Three-stage PROPOSE/DECIDE/PROMOTE governance checkpoint = Authensor's envelope/evaluate/receipt
- **#804**: Gateway-Based Authorization Model (24 comments, 16 participants) = Authensor's MCP Gateway
- **#2367**: IACS-1.0 signed provenance receipts = Authensor's receipt chain
- **#2379**: Governance Layer Above MCP with action claims

## MCP Gateway Competitors

| Project | Stars | Key Features | vs. Authensor |
|---------|-------|-------------|---------------|
| Jetski | 209 | OAuth 2.1, analytics | No policy engine |
| One MCP | 351 | Reverse proxy, RBAC | No content scanning |
| MCPProxy-Go | 160 | Tool poisoning quarantine | No receipts |
| mcp-gateway | 87 | OAuth, firewall | No content safety |
| Intercept (PolicyLayer) | 15 | Rate limiting | Early stage |
| Preloop | 6 | Human approvals | Very early |

Authensor's MCP Gateway is architecturally distinct: full policy engine, dual mode (online/offline), content safety, cryptographic receipts, SSRF protection, and approval workflows.

## Strategic Opportunity

- **Submit an SEP** for "Pre-execution Authorization Hooks" referencing discussions #2337, #804, #2379
- **Join the Enterprise Working Group** when it forms (per MCP roadmap)
- **Build an MCP server security scanner** (using Aegis) as a community tool
- **Ship tool description integrity checking** (hash-based, first-mover feature)

---

# 3. Agent Framework Adoption

## Framework Rankings (March 2026)

### Tier 1: Dominant
| Framework | Stars | Downloads | Key Metric |
|-----------|-------|-----------|------------|
| LangChain/LangGraph | ~80K/~25K | ~38M PyPI/mo | Largest ecosystem |
| CrewAI | ~45K | ~5-12M | Fastest-growing multi-agent |
| OpenAI Agents SDK | ~19K | ~10.3M | Fastest path to agent |
| Agno (ex-Phidata) | ~39K | Growing fast | Best DX |

### Tier 2: Strong Contenders
| Framework | Notes |
|-----------|-------|
| Claude Agent SDK | 1.85M weekly npm, Python + TS |
| Microsoft Agent Framework | AutoGen + Semantic Kernel merged, RC released |
| Google ADK | Launched April 2025, TS version added 2026 |
| Vercel AI SDK 6 | `needsApproval` flag, eslint security plugin |
| Mastra | TypeScript-native, from Gatsby team |
| LlamaIndex | ~35K stars, added AgentFS |

## Framework Safety Features

| Framework | Safety Level | What's Missing |
|-----------|-------------|----------------|
| OpenAI Agents SDK | Strong | Vendor-locked, no external policy engine |
| Vercel AI SDK 6 | Strong | Binary `needsApproval`, no policy engine |
| LangGraph | Moderate | No receipts, no approval workflows |
| Microsoft AF | Strong | Heavy setup, no open policy format |
| Google ADK | Moderate | No action authorization, no audit trail |
| Claude Agent SDK | Moderate | No policy engine, no content safety |
| CrewAI | Basic | Buggy guardrails, no inter-agent controls |
| Mastra | Minimal | No guardrails at all |
| PydanticAI/DSPy | Minimal | No safety features whatsoever |

## Universal Gaps Across ALL Frameworks

- No standardized action authorization (only 14.4% of teams have full security approval)
- No cryptographic audit trails
- No cross-framework policy language
- No inter-agent trust boundaries
- Agent identity is broken (only 22% treat agents as independent identities)
- 88% of organizations report security incidents

## Authensor Adapter Priority

**Already built**: LangChain, OpenAI Agents SDK, CrewAI (top 3 frameworks)

**Build next**: Claude Agent SDK (1.85M weekly npm), Vercel AI SDK (`needsApproval` delegation), Google ADK (weakest safety)

**Later**: Microsoft Agent Framework, Mastra (zero guardrails), Agno

## Communication Protocols

- **MCP**: Agent-to-tool (donated to Linux Foundation's Agentic AI Foundation, Dec 2025)
- **A2A**: Agent-to-agent (Google, 150+ orgs, v0.3 with signed security cards)
- **ACP**: Alternative agent-to-agent protocol
- **ANP**: Network-level agent discovery

---

# 4. Enterprise Procurement

## Key Requirements

### SOC 2 Type II
- **73% of enterprise buyers require it** before contract signature
- Table-stakes for AI safety vendors
- Self-hosted model partially sidesteps (customers run in their own audited infrastructure)
- 2026 AICPA updates: enhanced requirements for AI-driven systems

### FedRAMP
- FedRAMP 20x initiative fast-tracking AI tools
- **Zenity achieved FedRAMP "In Process"** (March 2026) -- first mover in agent security
- Self-hosted model advantageous for federal customers preferring on-premises

### SBOM / AI-BOM
- CISA issued updated guidance June 2025
- SPDX 3.0.1 introduced AI and Dataset profiles
- Enterprises increasingly require SBOMs in vendor questionnaires
- Open-source makes SBOM generation trivial (source is public)

### Air-Gapped Deployment
- Significant demand: defense, finance, healthcare, critical infrastructure
- Authensor's zero-dependency core is uniquely positioned
- Need: documented air-gapped deployment guide with containerized packages

### SSO/SAML
- Absolute requirement, procurement blocker without it
- SCIM provisioning increasingly expected
- Current gap: Authensor uses API key auth, no SSO yet

### Data Residency
- EU AI Act + CLOUD Act concerns
- Self-hosted model directly solves data sovereignty
- No vendor can be compelled to hand over data because there is no vendor with access

## Buyer Personas

| Persona | Role | What They Care About |
|---------|------|---------------------|
| CISO | Primary buyer, budget | Risk reduction, compliance, audit |
| VP Engineering | Technical evaluator | API quality, deployment, latency |
| Head of AI | Champion | Framework compatibility, DX |
| GRC/Compliance | Compliance gate | EU AI Act, SOC 2, audit logs |
| Procurement/Legal | Contract gate | License, DPA, SLAs |

## Budget Reality
- 98% of enterprises plan to increase governance budgets (avg 24% jump)
- 70% dedicate >10% of security budget to AI investments
- Half of executives plan $10-50M for agentic security
- **$5/mo is dramatically below willingness to pay** -- tiered pricing is standard
- Vendor consolidation trend: more spend through fewer vendors

## Open-Source Advantage
- Auditability/transparency (who watches the watchmen?)
- Data sovereignty (no CLOUD Act concerns)
- Bus factor mitigation (code is public, forkable)
- Air-gapped compatibility
- SBOM transparency
- Geopolitical independence

---

# 5. Regulatory Landscape

## EU AI Act

**High-risk deadline: August 2, 2026** (possible delay to December 2027 via Digital Omnibus proposal)

Requirements for high-risk AI:
- Quality management systems
- Risk management frameworks (Article 9) -- **maps to Authensor's fail-closed policy engine**
- Technical documentation (Article 11)
- Automatic logging (Article 12) -- **maps to Authensor's hash-chained receipts (tamper-resistant)**
- Human oversight (Article 14) -- **maps to Authensor's approval workflows**
- Conformity assessments

Penalties: up to 35M EUR or 7% of global turnover.

The Commission missed its Feb 2, 2026 deadline to publish Article 6 guidance. Agent-specific guidance does not exist yet -- agents are classified under existing AI system categories.

## United States

- **EO 14179** (Jan 2025): Revoked Biden's AI safety EO, oriented toward innovation
- **EO on National AI Framework** (Dec 2025): Limits state authority, establishes federal preemption
- **Texas RAIGA** (Jan 1, 2026): Requires AI disclosures from government/healthcare
- **Colorado AI Act**: Enforcement June 30, 2026
- 1,000+ AI bills processed in state capitals since Jan 2025

## NIST

- **AI Agent Standards Initiative** (Feb 2026): Ensuring agents "can function securely on behalf of their users"
- **NCCoE Concept Paper**: "Accelerating the Adoption of Software and AI Agent Identity and Authorization" -- **essentially describes Authensor's architecture**
- Comment period open until **April 2, 2026**
- Virtual workshops in **April 2026** (healthcare, finance, education)

## Other Jurisdictions

- **UK**: AI Security Institute (rebranded Feb 2025), comprehensive AI Bill possible in 2026
- **Singapore**: MAS Veritas Toolkit, AI Verify testing framework
- **Japan**: AI Promotion Act (May 2025), principle-based
- **Canada**: AIDA died Jan 2025, provincial action continues

## Industry-Specific

- **SEC**: 2026 Examination Priorities expanded AI oversight, AI Task Force created Aug 2025
- **FDA**: Deployed agentic AI internally (Dec 2025), "secure by design" guidance
- **OCC/Fed/FDIC**: Applying existing MRM and TPRM guidance to AI agents

## Liability

- **Workday class action** (May 2025): AI screening = employer's agent (significant precedent)
- **EU Product Liability Directive**: Software/AI explicitly "products" with strict liability, deadline Dec 9, 2026
- **Utah AI Policy Act**: Companies liable for AI actions "as if they were their own acts"

## Insurance

- **Verisk exclusion forms** effective January 1, 2026 (general liability AI exclusions)
- E&O policies excluding AI-assisted professional advice
- New AI-specific products emerging (Testudo claims-made policies)
- 23 states adopted NAIC AI Model Bulletin
- **Forcing function**: Companies need governance evidence for coverage. Authensor's receipt chain IS that evidence.

---

# 6. Developer Experience

## Time to First Value

| Tool | Steps | Time | Barrier |
|------|-------|------|---------|
| **Authensor** | 2-3 | **10 sec - 5 min** | Docker for full CP |
| Guardrails AI | 5 | ~5 min | Hub account required |
| Cedar | 4 | ~10 min | Rust toolchain |
| Galileo | 4 | ~10 min | Paid cloud account |
| NeMo Guardrails | 4 | ~15-20 min | Colang DSL, LLM key |

**Authensor has the fastest path to first value** via `npx @authensor/aegis scan --demo`.

## CLI Comparison

| Tool | Commands | npx | Language |
|------|----------|-----|----------|
| **Authensor** | **12+** | **Yes** | TypeScript |
| Guardrails AI | 4 | No | Python |
| NeMo | 4 | No | Python |
| Cedar | 1 | No | Rust |
| Galileo | 0 | No | SaaS |

Authensor's CLI (812 lines, zero-dep) detects environment, offers guided onboarding paths, and includes subcommands for every product.

## Error Quality

Authensor has Stripe-level deterministic error codes: `SSRF_BLOCKED`, `CONFIG_BLOCKED`, `RATE_LIMITED`, `INVALID_INPUT`, `TIMEOUT`, etc. Every error links to a receipt with full audit context. No competitor offers anything similar.

## Community Support

None of these tools have strong community support. Guardrails AI: 40-50% of questions unanswered. NeMo: 158 open issues, many unanswered. This is a wide-open opportunity.

## What Developers Complain About (Cross-Tool)

1. Dependency hell (#1 pain point, Python ecosystem fragility)
2. Breaking changes without migration paths
3. LLM API key requirements for tools that should work offline
4. Async/streaming bugs
5. Unhelpful error messages

## Critical DX Gaps for Authensor

1. **No hosted docs site** (every competitor has one)
2. **No interactive playground** (Cedar has browser-based policy tester)
3. **No YouTube/blog content** (NeMo and Guardrails AI dominate search)
4. **No public community** (Discord/Slack)
5. **No public npm download metrics**

## Best DX Patterns to Adopt

From Stripe: deterministic error codes (already done), request IDs (receipt IDs), test mode (sandbox mode exists)

From Prisma: schema as source of truth (already done), CLI-driven workflow (already done)

From Tailwind: incredible docs with copy-paste examples, playground

---

# 7. Open-Source Community

## Key Communities (Ranked by Relevance)

### OWASP GenAI Security Project (Most Important)
- Released OWASP Top 10 for Agentic Applications (Dec 2025)
- 100+ security researchers, 250-page AI Testing Guide
- AI Vulnerability Scoring System (AIVSS)
- Flagship status since March 2025
- Runs FinBot CTF hackathon

### Coalition for Secure AI (CoSAI)
- Under OASIS Open, founded by Google/Cisco
- Published MCP Security taxonomy (January 2026)
- Project CodeGuard (open-source security framework)
- Sessions at RSAC 2026 on "Securing MCP"

### OpenSSF AI/ML Security Working Group
- Under Linux Foundation
- MLSecOps whitepaper, Model Signing specification
- Bi-weekly meetings with CoSAI, AGNTCY, NIST, OWASP

### AGNTCY
- Open-sourced by Cisco, now under LF governance
- 65+ companies (Dell, Google Cloud, Oracle, Red Hat)
- Building multi-agent interoperability infrastructure

## Open-Source Projects to Watch

| Project | Focus | Differentiator |
|---------|-------|----------------|
| LlamaFirewall (Meta) | Prompt injection, alignment | CoT auditing, 90%+ efficacy |
| NeMo Guardrails (NVIDIA) | Programmable guardrails | 27K stars, enterprise-grade |
| Invariant Labs (Snyk) | MCP proxy, runtime guardrails | Acquired by Snyk June 2025 |
| ClawMoat | Host-level agent security | Node.js, OWASP mapping |
| Agentik.md | Safety spec files | AGENTS.md pattern (60K+ repos) |

## Conferences (Upcoming)

| Event | Dates | Location |
|-------|-------|----------|
| RSAC 2026 | Mar 23-26 | San Francisco |
| KubeCon EU | Mar 24-26 | London |
| EDCC 2026 | Apr 7-10 | TBD |
| Black Hat Asia | Apr 22 | Singapore |
| ACM CAIS 2026 | May 26-29 | San Jose |
| DEF CON 34 / AI Village | Aug | Las Vegas |

## Foundation Strategy

Don't join a foundation yet. Instead:
1. Participate in OpenSSF AI/ML WG bi-weekly calls
2. Contribute to CoSAI's MCP Security work
3. Submit Authensor as OWASP Agentic Top 10 case study
4. Revisit foundation membership at 500+ GitHub stars

## Community Building Lessons

From **Snyk** ($343M ARR): Free CLI first, grassroots before enterprise, 70% of enterprise buyers already had individual users.

From **Trivy** (100M+ annual downloads): Zero friction, CI/CD integration first, opinionated defaults, Docker Desktop integration.

---

# 8. Academic Research Frontiers

## Tool Use Safety

**AgentSpec** (ICSE 2026): DSL for runtime enforcement. Prevents unsafe executions in 90%+ of cases with millisecond overhead.

**Fides** (Microsoft Research): Information flow control with confidentiality/integrity labels. Stops ALL prompt injection attacks in AgentDojo. Open-source.

**Faramesh**: Action Authorization Boundary (AAB) pattern. Protocol-agnostic, fail-secure default DENY. Maps almost 1:1 to Authensor's architecture.

## Prompt Injection Defenses

**Critical finding: "The Attacker Moves Second"** (OpenAI/Anthropic/DeepMind, 14 researchers): Evaluated 12 published defenses against adaptive attacks. Every defense was bypassed with 90%+ attack success rates. Prompting-based defenses: 95-99% ASR. Training-based: 96-100% ASR.

**Consensus**: Probabilistic defenses are necessary but insufficient. The field is converging on deterministic architectural enforcement (reference monitors, capability tracking, cryptographic attestation). This validates Authensor's approach.

**Best defenses**:
- PromptArmor: <1% FPR and FNR on AgentDojo
- DataFilter: Best security/utility tradeoff, model-agnostic
- StruQ: Two-channel separation of prompts and data
- Meta's "Agents Rule of Two": Agents must satisfy no more than 2 of 3 (untrusted inputs, sensitive data, external comms)

## Behavioral Monitoring

**SentinelAgent**: Models agent interactions as dynamic execution graphs. Detects prompt injection propagation, unauthorized tool usage, multi-agent collusion.

**TraceAegis**: Hierarchical behavioral anomaly detection. F1-scores of 0.93-0.96 in healthcare/procurement scenarios.

## Formal Verification

**What's tractable**: Properties of the orchestration layer (not the LLM). Temporal logic on task lifecycle models. 17 host agent properties + 14 task lifecycle properties defined.

**Key insight**: The LLM is fundamentally probabilistic, making formal verification of the model impossible. But the deterministic wrapper (policy engine, reference monitor) CAN be verified. This is exactly what Authensor is.

## Agent Safety Benchmarks

| Benchmark | Focus | Key Finding |
|-----------|-------|-------------|
| AgentDojo (ETH Zurich) | Prompt injection | 97 tasks, 629 security tests |
| Agent-SafetyBench | General safety | **No LLM agent scores above 60%** |
| ASB | Attacks/defenses | 10 attacks, 11 defenses, 13 LLMs |
| Vivaria (METR) | Capability eval | Used by US/UK AI Safety Institutes |

## Papers to Implement (Ranked by Authensor Relevance)

### Tier 1: Implement Now
1. **PCAS**: Dependency graph policies in Datalog -- study for policy engine improvements
2. **Faramesh**: Action Authorization Boundary -- validates and extends Authensor's architecture
3. **Authenticated Workflows / MAPL**: Cryptographic attestations -- strengthen receipt chain
4. **TraceAegis**: Trace-based anomaly detection -- enhance Sentinel (F1 0.93-0.96)

### Tier 2: Next
5. **SentinelAgent**: Graph-based multi-agent anomaly detection
6. **AgentSpec**: DSL for runtime enforcement -- inspire policy language extensions
7. **Fides**: Information flow taint tracking -- adapt into envelope model
8. **DataFilter**: ML prompt injection detection -- integrate as optional Aegis module

### Tier 3: Research Integration
9. **AI Agent Reliability Science**: 12 metrics for monitoring dashboard
10. **gpt-oss-safeguard**: OpenAI's open-weight safety classifier (Apache 2.0)
11. **AgentGuardian**: Learn policies from execution traces

## Key Researchers

- **Dylan Hadfield-Menell** (MIT): Multi-agent safety, human-AI teams
- **Sharon Li** (UW-Madison): Safe and reliable AI foundations
- **Yoshua Bengio** (Mila): International AI Safety Report chair
- **Manuel Costa / Boris Kopf** (Microsoft Research): Fides/IFC
- **Mick Ayzenberg** (Meta AI): Agents Rule of Two

## Fellowship Programs
- **MATS** Summer 2026: 120 fellows, mentored by Anthropic/AISI/Redwood
- **LASR Labs**: Applications deadline **March 30, 2026**
- **Anthropic Fellows**: Applications open for May & July 2026

---

# 9. Supply Chain Security

## Agent SBOM (Software Bill of Materials)

- **OWASP AIBOM Initiative**: Open-source AI-BOM Generator for Hugging Face models
- **SPDX 3.0 AI Profile**: Native AI/ML profiles for model provenance
- **Agentic AIBOMs** (March 2026 paper): Extends SBOMs into active provenance artifacts
- **Cisco AI BOM**: AI Defense includes MCP Catalog for server inventory

**Authensor's opportunity**: Receipt chain = runtime AIBOM. A living record of what agents actually used (not just what they could use). Export in CycloneDX/SPDX format.

## Real Supply Chain Attacks

| Incident | Date | Impact |
|----------|------|--------|
| postmark-mcp backdoor | Sep 2025 | NPM package BCC'd all emails to attacker |
| Smithery registry hack | Oct 2025 | 3,000+ API tokens exfiltrated via path-traversal |
| OpenClaw malicious skills | 2025-2026 | 1,184 confirmed malicious skills (~20% of packages) |
| SANDWORM_MODE | Feb 2026 | 19 typosquatting npm packages targeting AI coding tools |
| Claude Code CVE | Feb 2026 | CVE-2025-59536 (CVSS 8.7), config injection RCE |

## Sigstore Comparison

| Feature | Sigstore/Rekor | Authensor Receipts |
|---------|---------------|-------------------|
| What it signs | Software artifacts, ML models | Agent action decisions |
| Hash chaining | Merkle tree | Linear SHA-256 chain |
| Identity | OIDC keyless signing | Principal-based |
| Public auditability | Yes | No (private per-deployment) |
| Scope | Build-time | Runtime |

**Bridge opportunity**: Publish receipt hashes to Sigstore/Rekor for public verifiability.

## Agent SLSA Levels (Proposed)

| Level | Software Build | Agent Action Equivalent |
|-------|---------------|------------------------|
| L0 | No provenance | No audit trail |
| L1 | Documented build | Actions logged with metadata |
| L2 | Signed provenance | **Hash-chained receipts (Authensor today)** |
| L3 | Hardened build | Hardened engine + verified tool provenance |

**Authensor is already at L2. Nobody else is. Formalize this as the standard.**

## Whitespace Opportunities

1. **Signed Tool Manifests**: Standard for MCP servers to present signed capability manifests. Zero tool signing exists today.
2. **Policy Advisory Feed**: CVE-like database for dangerous agent configurations
3. **Credential Brokering**: If policy approves, simultaneously provision scoped short-lived credentials
4. **Network Policy Export**: Export `constraints.allowedDomains` as K8s NetworkPolicies

---

# 10. Multi-Agent Safety

## The Scale of the Problem

- **A single compromised agent poisoned 87% of downstream decisions within 4 hours** (Galileo AI simulation)
- Gartner: 1,445% surge in multi-agent system inquiries Q1 2024 to Q2 2025
- No framework implements cryptographic inter-agent message verification

## Agent-to-Agent Trust

**Google A2A Protocol** (v0.3, 150+ orgs): OAuth 2.0, OIDC, mTLS, signed security cards, CIBA for HITL auth. Agents stay "opaque" to each other (zero trust).

**DIDs for agents** (arxiv): Ledger-anchored Decentralized Identifiers + Verifiable Credentials for cross-domain trust.

**ARIA**: Agent Relationship-based Identity and Authorization, tracking delegation as cryptographic graph relationships.

## What Authensor Already Has

- Envelope/receipt model is framework-agnostic
- `parentEnvelopeId` and `traceId` support delegation chains
- Claim/execute/finalize prevents concurrent execution
- Hash-chained receipts provide tamper-evident auditing
- Sentinel per-agent tracking builds behavioral baselines
- Fail-closed default

## What Needs to Change

**Schema extensions (additive, no breaking changes):**
- `principal.delegatedBy`, `principal.capabilities` for delegation chains
- `context.parentReceiptId` for causal chains across agents
- Cross-agent rate limits (session/collaboration scope)

**Sentinel extensions:**
- Cross-agent correlation (detect coordinated anomalies)
- Emergent behavior detection (information-theoretic measures)
- Cascade detection (linked deny chains across agents)

**New capabilities:**
- Per-agent credentials (not shared API keys)
- Agent registry endpoint
- A2A protocol integration

## Phased Roadmap

1. **Multi-agent tracing** (low effort): First-class `parentReceiptId`, causal chain views
2. **Delegation-aware policies** (medium): Match on depth, source, capability intersection
3. **Cross-agent Sentinel** (medium): Correlated anomaly detection
4. **Agent registry + per-agent creds** (high): Identity provider for agents
5. **A2A integration** (strategic): Policy enforcement for A2A ecosystem

---

# 11. Browser Agent Safety

## Browser Agent Market ($4.5B in 2024, projected $76.8B by 2034)

| Agent | Status | Safety |
|-------|--------|--------|
| Claude Computer Use | Chrome extension, Cowork (macOS) | Site permissions, action confirmations |
| OpenAI Operator/Atlas | Integrated in ChatGPT | Takeover Mode, adversarial RL model |
| Google Project Mariner | Gemini 2.0, 83.5% WebVoyager | Chrome Auto Browse (Jan 2026) |
| Browserbase/Stagehand | $40M Series B, 50M sessions | Infrastructure layer |
| Perplexity Comet | Desktop, Android, iOS | Vulnerable to CometJacking |

## Demonstrated Attacks

| Attack | Target | Method |
|--------|--------|--------|
| CometJacking | Perplexity Comet | URL parameter hijack, email/calendar exfiltration |
| Tainted Memories | OpenAI Atlas | CSRF poisoning long-term memory |
| HashJack | Multiple | Injection hidden in URL fragments |
| Task Injection | Operator | Fake CAPTCHA triggering file download |
| Unseeable Injections | Multiple | Faint colored text invisible to humans, read by AI |
| PerplexedBrowser | Comet | Zero-click credential theft via meeting invite |

## Dark Pattern Research

**LLM-based web agents are susceptible to dark patterns 41% of the time** (IEEE S&P 2026). Multiple simultaneous dark patterns compound the effect.

## SiteSitter's Unique Position

**Nobody is building content-level safety for browsing agents.** The market has:
- Enterprise browser security (LayerX) = where agents go
- Agent guardrails (Invariant/Snyk) = what agents do
- Agent governance (Zenity, Onyx) = who uses agents
- **SiteSitter** = what agents actually see (gap)

## SiteSitter Feature Priorities

1. **Web IR Compilation**: HTML to structured representation, strip hidden elements
2. **Constitutional Browsing Rules**: 26+ rules for dark patterns, deception, injection
3. **Form Classification**: Auto-deny/require_approval for payment/legal forms
4. **Invisible Text Detection**: opacity:0, white-on-white, off-screen, base64-encoded
5. **Dark Pattern Database**: Community-sourced per-domain (network effect moat)
6. **Screenshot PII Pre-screening**: Identify PII regions before vision model processes them

---

# 12. Observability Integration

## Authensor's Unique Layer

No existing observability platform handles action authorization. They handle content quality, model performance, costs, and tracing. Authensor occupies a distinct, complementary layer: "what can this agent DO" vs "what did it SAY."

## OpenTelemetry GenAI Conventions

Agent spans, tool call spans, and metrics are defined (Development stability). **No convention exists for policy evaluation spans.** Authensor could propose:

```
authensor.policy.id
authensor.decision.outcome     (allow | deny | require_approval)
authensor.receipt.id
authensor.receipt.hash
authensor.aegis.threat_level
authensor.evaluation_time_ms
```

## OWASP Agent Observability Standard (AOS)

Published at aos.owasp.org. Extends OpenTelemetry + OCSF. Authensor's receipt chain is essentially what AOS recommends. Aligning with AOS gives immediate standards credibility.

## Integration Roadmap

1. **Phase 1 (Webhook-based)**: Add generic receipt webhook, format as OCSF API Activity events
2. **Phase 2 (OTel Export)**: Optional OTel SDK as optionalDependency, emit spans for evaluation/scan/receipt
3. **Phase 3 (AOS Compliance)**: Publish as AOS-compliant safety component

## SIEM Integration Path

Receipts map to OCSF event classes:
- Policy evaluation: API Activity (6003)
- Deny decision: Security Finding (2001)
- Aegis threat: Detection Finding (2004)
- Sentinel alert: Incident Finding (2005)
- Approval request: Authorization (3002)

## Safety Metrics to Track

Already tracking: deny_rate, action_rate, cost_rate, latency, error_rate, riskScore

Should add: false positive rate, approval latency, policy coverage, budget utilization, chain integrity score, threat detection rate

## Adjacent Opportunity: FinOps

Only 44% of organizations have financial guardrails for AI. Budget enforcement via policy rules extends Authensor from safety into cost governance. `constraints.maxAmount` already exists in the schema.

---

# 13. CI/CD and DevOps

## Agent Testing Tiers

1. **Deterministic policy validation** (every commit): Policy files parse, defaultEffect is deny, envelopes produce expected decisions. Fast, <2s.
2. **Content safety scanning** (every commit): Aegis scan for injection, PII, credentials.
3. **Adversarial red-teaming** (nightly/release): @authensor/redteam 15 adversarial seeds. Too slow for every commit.

## Policy-as-Code Landscape

- **OPA/Rego**: CNCF standard, expressive but error-prone
- **AWS Cedar**: 42-60x faster than Rego, formally verifiable, growing fast
- **Authensor JSON**: Simpler than both, purpose-built for agent authorization. Policy templates (conservative, standard, permissive, ci-cd) are a differentiator.

## GitHub Actions Landscape

**PromptPwnd vulnerability class**: Untrusted user input from GitHub Issues/PRs injected into AI prompts in CI/CD. 5+ Fortune 500 companies affected including Google's Gemini CLI repo.

**Existing**: Authensor Aegis Scan Action already built. Promptfoo (acquired by OpenAI), Agentic Radar (SPLX), Semgrep AI rules.

**Opportunity**: Policy validation Action, policy regression tests, policy diff comments on PRs, ASC certification as required status check.

## Highest-Value CLI Tools to Build

1. `npx authensor policy lint` -- fast local policy validation
2. `npx authensor policy test` -- envelope/decision test cases
3. `npx authensor certify` -- ASC certification checks
4. `npx authensor policy diff` -- human-readable policy comparison

## Infrastructure-as-Code

**No Terraform modules or Helm charts exist** for any AI agent safety tool. Complete whitespace.

Needed:
- Helm chart for K8s deployment of control plane + PostgreSQL
- Terraform module for AWS/GCP/Azure
- Docker Compose (already exists via CLI)

## Shadow/Canary Deployments

Opportunity: Add `/evaluate` parameter to evaluate against a shadow policy without enforcing, returning both decisions. Enables safe canary rollouts of policy changes.

---

# 14. Distribution Channels

## Priority Matrix

### P0: This Week (<2 hours)

| Action | Effort | Impact |
|--------|--------|--------|
| Set GitHub topics (20 keywords) | 5 min | High |
| Submit to 7 MCP registries | 1 hour | Very High |
| Top 5 awesome list PRs | 2.5 hours | High |

### P1: This Month

| Action | Effort | Impact |
|--------|--------|--------|
| npm publish all 12 packages (Trusted Publishing) | Medium | Critical |
| PyPI publish with classifiers | Low | High |
| Docker Hub images + DSOS program | Medium | High |
| Show HN launch | Medium | Very High |
| Newsletter pitches (TLDR 1.25M subs, tl;dr sec) | Low | Very High |
| Reddit (r/LocalLLaMA, r/selfhosted, r/cybersecurity) | Medium | High |
| Twitter/X + LinkedIn campaign | Medium | Medium-High |
| First technical blog post | High | High |

### P2: This Quarter

| Action | Effort | Impact |
|--------|--------|--------|
| Product Hunt + DevHunt + BetaList | High | Medium-High |
| JSR publishing (Deno/Bun) | Low | Medium |
| YouTube demo video | High | Medium-High |
| Podcast pitches (Latent Space priority #1) | Medium | Medium-High |
| Comparison site listings | Medium | Medium-High |
| arXiv paper + Zenodo DOI | High | High |

### P3: When Ready

| Action | Effort | Impact |
|--------|--------|--------|
| FedRAMP (if revenue justifies) | Very High | Very High |
| ISO 42001 compliance tooling | High | High |
| CNCF Landscape (needs 300+ stars) | Low | High |

## MCP Registries (7 targets)

mcp.so, Smithery.ai, Glama.ai, PulseMCP (10,400+ servers), mcpservers.org, MCPRegistry.online, official MCP registry

## Additional Awesome Lists Discovered

awesome-ai-agents-security, awesome-mcp-security, awesome-mcp-gateways, awesome-mcp-enterprise, Awesome-AI-Security (TalEliyahu), awesome-developer-first

## Newsletter Targets

| Newsletter | Subscribers | Pitch Angle |
|-----------|------------|-------------|
| TLDR | 1.25M+ | First open-source safety stack for AI agents |
| TLDR AI | 500K+ | Drop-in SDK for MCP, OpenAI, LangChain |
| tl;dr sec | Dedicated security | OWASP coverage + hash-chained audit trails |
| Console.dev | Dev tools | Developer tool spotlight |
| ImportAI | AI policy | Practical agent safety infrastructure |

## Podcast Targets (Priority)

1. **Latent Space** (10M+ readers/listeners, covers MCP)
2. **AI Agents Podcast** (direct market)
3. **Changelog / Ship It** (open source audience)
4. **AI Security Podcast** (security angle)

## Academic Distribution

- arXiv paper: "Action Envelopes: A Standardized Authorization Schema for Autonomous AI Agents"
- Zenodo DOI for each major release
- Papers With Code listing

---

# 15. Emerging Threat Vectors

## Current Defense Coverage

### Strong Coverage

| Threat | Authensor Mechanism |
|--------|-------------------|
| Direct prompt injection | 17+ regex rules, entropy analysis, heuristic scoring |
| Data exfiltration (input-side) | SSRF guards, DNS exfil detection, PII/credential detection |
| Policy enforcement | Fail-closed, priority-sorted rules, glob matching |
| Audit trail integrity | SHA-256 hash-chained receipts |
| Approval workflows | Multi-party quorum, expiration |
| Execution control | Kill switch, per-tool disables, claim-based atomic execution |

### Critical Gaps (Ranked by Severity)

**1. No tool result/output scanning.**
Aegis scans action envelopes (inputs) but not data returned by tools. Indirect prompt injection via tool results is the #1 attack vector (OWASP ASI01). An agent fetching a webpage with injection payloads would not trigger Aegis.

**2. No action chain / session-level analysis.**
Each action evaluated independently. Privilege escalation through tool chaining (read config -> extract creds -> authenticate -> escalate) is invisible. 520 incidents documented in production by Q4 2025.

**3. No agent memory protection.**
OWASP ASI06. MINJA attack (NeurIPS 2025): >95% injection success through query-only interaction. No memory integrity checking, no input provenance tracking.

**4. No cryptographic agent identity.**
String IDs without proof. Anyone with a valid API key can claim to be any principal. No mTLS, no signed envelopes, no challenge-response.

**5. No TOCTOU mitigation for approvals.**
Approval window (hours/days) creates exploitable gap. OpenClaw CVE-2026 exploited exactly this. No re-evaluation at execution time.

**6. No cost budgets.**
Rate limiting counts requests, not dollars. No iteration caps for loops. SaaS-to-SaaS worm drained thousands in API credits by triggering 10,000 calls.

**7. Tool integrity not integrated into MCP gateway.**
`hashToolDescription()` exists but isn't called in the gateway's tool listing flow. Rug pull attacks undefended.

**8. No multimodal scanning.**
Brave Security: faint colored text in screenshots invisible to humans, read by AI. Bypasses all text-based filters.

**9. Advisory constraints.**
`maxAmount`, `timeout`, `allowedDomains` are self-declared by the caller. A confused deputy simply omits constraints.

**10. Self-declared principal identity.**
No verification that `principal.id` matches the authenticated API key. Agents can claim to be other agents.

---

# Cross-Cutting Synthesis

## Where Authensor Leads (Advantages Nobody Else Has)

1. **Integrated four-pillar stack**: Authorization + content safety + monitoring + cryptographic receipts. No competitor combines all four.
2. **Fail-closed by default**: No policy = deny. Only AWS Cedar shares this.
3. **Hash-chained receipt trail at the action level**: No competitor ships tamper-evident, hash-linked audit records of individual authorization decisions.
4. **Human-in-the-loop approval workflows with quorum**: Everyone else is binary allow/deny.
5. **Zero-dependency core**: Engine, Aegis, Sentinel have zero runtime deps.
6. **Fastest time-to-first-value**: 10 seconds via npx.
7. **MCP-native**: MCP server for direct tool enforcement.
8. **Self-hosted = data sovereignty solved**: No CLOUD Act concerns.

## Where Authensor Needs to Move Fast (Competitive Threats)

1. **Galileo Agent Control** (3 days old): If CrewAI/Cisco/Glean integrations drive fast adoption, it could become the de facto "control plane." Consider making Aegis available as a Galileo-compatible evaluator.
2. **AWS Cedar momentum**: Natural language policy authoring is compelling. Authensor doesn't have this.
3. **LayerX** launched "Agentic Browser Protection" (Feb 2026): Moving into SiteSitter's adjacent space.
4. **Palo Alto Networks** accumulating the entire stack ($25B+ in acquisitions).

## The Unique Strategic Position

The supply chain security ecosystem is fragmenting into:
- **Build-time**: Sigstore signs artifacts, SLSA verifies provenance
- **Runtime**: OWASP Agentic Top 10, agent meshes, sandboxing

**Nobody is bridging the two.** Authensor sits at the junction: consume build-time attestations (verify tool was signed by trusted publisher) and produce runtime attestations (prove action was authorized, by which policy, with what outcome). This "build-time to runtime" bridge is unclaimed territory.

## The Standards Window

Three standards processes are actively defining what Authensor already builds:

1. **NIST NCCoE**: AI Agent Identity & Authorization (comment period until April 2)
2. **MCP SEPs**: Pre-execution authorization hooks (discussions open, no SEP filed)
3. **OWASP AOS**: Agent Observability Standard (extending OTel + OCSF)

Getting written into these standards is a once-in-a-decade opportunity. Submit comments, file SEPs, align with AOS.

---

# Prioritized Action Plan

## Immediate (This Week)

| # | Action | Deadline | Impact |
|---|--------|----------|--------|
| 1 | Set GitHub topics (20 keywords) | Today | SEO |
| 2 | npm publish all packages with Trusted Publishing | This week | Critical adoption |
| 3 | Submit to 7 MCP registries | This week | Discovery |
| 4 | Submit NIST NCCoE comment on AI Agent Identity | April 2 | Standards influence |
| 5 | Apply to LASR Labs Summer 2026 | March 30 | Research network |
| 6 | Join OWASP Slack + OpenSSF Slack | This week | Community presence |

## This Month

| # | Action | Impact |
|---|--------|--------|
| 7 | File MCP SEP for Pre-execution Authorization Hooks | Standards |
| 8 | Show HN launch | Developer awareness |
| 9 | Hosted docs site (docs.authensor.com) | DX |
| 10 | Docker Hub images + DSOS program application | Self-hosted adoption |
| 11 | Newsletter pitches (TLDR, tl;dr sec, Console.dev) | Reach |
| 12 | First blog post (OWASP Agentic Top 10 mapping) | SEO |
| 13 | Top 5 awesome list PRs | Discovery |
| 14 | PyPI publish with classifiers | Python adoption |

## This Quarter

| # | Action | Impact |
|---|--------|--------|
| 15 | Add tool result scanning to Aegis (gap #1) | Security |
| 16 | Integrate tool integrity checking into MCP gateway (gap #7) | Security |
| 17 | Build interactive policy playground | DX |
| 18 | `npx authensor policy lint/test/diff` CLI tools | DevOps |
| 19 | Helm chart for Kubernetes deployment | Enterprise |
| 20 | Vercel AI SDK + Claude Agent SDK adapters | Framework coverage |
| 21 | Discord/Slack community launch | Community |
| 22 | arXiv paper + Zenodo DOI | Credibility |
| 23 | OTel exporter (optional dependency) | Observability |
| 24 | GitHub Secure Open Source Fund application | April 2026 |

## Next 6 Months

| # | Action | Impact |
|---|--------|--------|
| 25 | Agent SLSA specification (formalize levels) | Standards |
| 26 | Policy Advisory Feed (CVE-like for agent configs) | Community |
| 27 | Multi-agent tracing (parentReceiptId) | Enterprise |
| 28 | Cost budgets and denial-of-wallet protection | Security |
| 29 | OWASP AOS compliance | Standards |
| 30 | SiteSitter Web IR compiler | Product |

---

# Appendix: Sources by Section

Each section's sources are documented in the individual research agent outputs stored at:
```
/private/tmp/claude-501/-Users-johnkearney-Desktop-AUTHENSOR/
  4a6fd62e-e6fe-4ad2-b6c5-d95d9c1e63c0/tasks/
```

Total sources across all 15 agents: 500+ web pages, academic papers, GitHub repos, and regulatory documents. All accessed March 14, 2026.
