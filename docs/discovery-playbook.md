# Authensor Discovery & Distribution Playbook

Actionable roadmap for maximum discoverability across all channels. Generated from 15 parallel research agents analyzing the agent safety landscape (March 2026).

---

## Priority 1: GitHub SEO (Do Today — 5 minutes)

The repo currently has **0 topics** and a placeholder description. This is the single highest-ROI fix.

```bash
# Add 20 optimized topics
gh repo edit authensor/authensor --add-topic ai,security,llm,mcp,generative-ai,ai-agent,agentic-ai,guardrails,ai-safety,ai-security,llm-security,prompt-injection,model-context-protocol,middleware,observability,agent-framework,typescript,responsible-ai,ai-alignment,red-teaming

# Set optimized description
gh repo edit authensor/authensor --description "Open-source AI agent safety middleware. Policy engine, guardrails, and signed audit receipts for LLM agents. Drop-in SDK for MCP, OpenAI, LangChain. Prevent prompt injection, enforce action policies, log everything."

# Set homepage
gh repo edit authensor/authensor --homepage "https://authensor.dev"
```

### Social Preview Image
- 1280x640px PNG, dark background
- Authensor logo + "Safety middleware for AI agents"
- Show: Policy Engine | Guardrails | Audit Receipts

---

## Priority 2: Awesome Lists (This Week — Submit PRs)

### Tier 1: Highest Impact (10k+ stars)

| List | Stars | URL |
|------|-------|-----|
| awesome-llm-apps | 102k | github.com/Shubhamsaboo/awesome-llm-apps |
| awesome-mcp-servers (punkpeye) | 83k | github.com/punkpeye/awesome-mcp-servers |
| modelcontextprotocol/servers | 81k | github.com/modelcontextprotocol/servers |
| Awesome-LLM | 26k | github.com/Hannibal046/Awesome-LLM |
| awesome-langchain | 9k | github.com/kyrolabs/awesome-langchain |

### Tier 2: Strong Relevance (1k-10k stars)

| List | Stars | URL |
|------|-------|-----|
| MCP Registry (official) | 6.5k | github.com/modelcontextprotocol/registry |
| awesome-mcp-servers (appcypher) | 5.2k | github.com/appcypher/awesome-mcp-servers |
| awesome-mcp-servers (wong2) | 3.7k | github.com/wong2/awesome-mcp-servers |
| awesome-llm-powered-agent | 2.2k | github.com/hyp1231/awesome-llm-powered-agent |
| awesome-agents (kyrolabs) | 1.9k | github.com/kyrolabs/awesome-agents |
| awesome-llm-security | 1.5k | github.com/corca-ai/awesome-llm-security |

### Tier 3: Niche but On-Topic

| List | URL |
|------|-----|
| awesome-ai-security (ottosulin) | github.com/ottosulin/awesome-ai-security |
| awesome-ai-guardrails | github.com/enguard-ai/awesome-ai-guardrails |
| awesome-mcp-security | github.com/Puliczek/awesome-mcp-security |
| awesome-ai-agents-security | github.com/ProjectRecon/awesome-ai-agents-security |
| awesome-mcp-gateways | github.com/e2b-dev/awesome-mcp-gateways |
| awesome-LLMOps | github.com/tensorchord/Awesome-LLMOps |
| awesome-production-llm | github.com/jihoo-kim/awesome-production-llm |
| Awesome-LLMSecOps | github.com/wearetyomsmnv/Awesome-LLMSecOps |
| awesome-developer-first | github.com/agamm/awesome-developer-first |
| awesome-selfhosted | github.com/awesome-selfhosted/awesome-selfhosted |

### PR Template

```markdown
- [Authensor](https://github.com/authensor/authensor) - Open-source AI agent safety stack with action authorization, approval workflows, content safety scanning, and hash-chained audit receipts. MIT licensed.
```

---

## Priority 3: MCP Registry (This Week)

### Official MCP Registry

```bash
brew install mcp-publisher
mcp-publisher init          # Generates server.json
mcp-publisher login github
mcp-publisher publish --dry-run
mcp-publisher publish
```

### Also Submit To
- mcp.so — submit via web form
- PulseMCP (pulsemcp.com/submit) — 9k+ servers
- mcpservers.org — web form submission

---

## Priority 4: Interactive Playground (Next Sprint)

Authensor's engine and Aegis are **pure TypeScript with zero deps** — they run in the browser.

### Build Two Playgrounds

**1. Aegis Scanner Playground** — "Paste text, see threats detected"
- Client-side only, deploy on Vercel
- Pre-canned attack examples dropdown
- Real-time threat detection visualization
- Gamification: "Can you craft a prompt that gets past Aegis?" (Lakera's Gandalf went viral)

**2. Policy Evaluator** — "Paste envelope + policy, see decision" (like play.openpolicyagent.org)
- Policy JSON editor on left, envelope JSON on right
- Click "Evaluate" to see decision + matched rules
- Shareable URLs for every policy+envelope combination

### Reference Implementations
- OPA Rego Playground (play.openpolicyagent.org) — closest analog
- Lakera Gandalf (gandalf.lakera.ai) — viral gamification
- Lakera Guard Playground — side-by-side before/after
- Invariant Labs Explorer — MCP guardrails testing

---

## Priority 5: `npx create-authensor` (Next Sprint)

PostHog-style wizard CLI:

```bash
npx create-authensor@latest
```

Flow:
1. Detect framework (Next.js, Express, FastAPI, etc.)
2. Ask: Self-hosted or hosted?
3. If self-hosted: auto-spin Docker Compose
4. Inject SDK, wrap first agent call
5. Print: "Your first receipt: http://localhost:3000/receipts/<id>"

**Target: 2 minutes from npx to live receipt.**

Also create:
- `npx @authensor/cli doctor` — health check
- `npx @authensor/cli smoke` — smoke test against any control plane

---

## Priority 6: Content Marketing (Ongoing)

### Blog Posts (ranked by SEO impact)

1. "OWASP Top 10 for Agentic Applications (2026): What Every Developer Needs to Know"
2. "EU AI Act Compliance for AI Agents: A Developer's Guide to the August 2026 Deadline"
3. "How to Secure MCP Servers in Production: A Practical Guide"
4. "AI Agent Guardrails: Action-Level vs. Prompt-Level — Why the Distinction Matters"
5. "Building a Tamper-Evident Audit Trail for AI Agents with Hash-Chained Receipts"
6. "Authensor vs. NeMo Guardrails vs. Guardrails AI: Comparing AI Safety Approaches in 2026"
7. "Human-in-the-Loop for AI Agents: Implementing Approval Workflows That Actually Work"

### Channels (priority order)
1. GitHub (trending, Explore)
2. Hacker News (Show HN)
3. Reddit (r/LocalLLaMA 650K, r/MachineLearning)
4. Twitter/X + Bluesky
5. Dev.to / Hashnode (SEO)
6. YouTube (tutorials, demos)
7. Newsletters (TLDR AI 1.25M readers, The Batch)

### Launch Strategy
- **Show HN post**: "Show HN: Authensor — open-source policy engine for AI agent safety"
- **Product Hunt**: Tuesday-Thursday, AI Infrastructure category
- **Reddit**: Separate posts for r/LocalLLaMA, r/MachineLearning, r/selfhosted

---

## Priority 7: Package Registries

### npm
- Enable provenance: `npm publish --provenance`
- Reserve typosquat packages: `authensor`, `authenssor`, `autensor`
- Cross-link packages in README for SEO

### PyPI
- Add classifiers: `Topic :: Security` + `Topic :: Scientific/Engineering :: Artificial Intelligence`
- Keywords: ai-safety, llm-guardrails, agent-safety, mcp, authorization

### JSR (Deno)
- Publish to JSR for wider reach

---

## Priority 8: Directories & Listings

### Free Directories
- DevHunt (devhunt.org)
- AI Tools Directory (aitoolsdirectory.com/submit-tool)
- ListMyAI (listmyai.net)
- OpenAlternative (openalternative.co/submit)
- 200+ AI directories master list: github.com/best-of-ai/ai-directories

### Paid Directories (worth it)
- There's An AI For That ($varies, largest AI directory)
- Futurepedia ($497 verified, strong SEO)
- Toolify.ai ($49-99, permanent listing)

### Standards Bodies
- OWASP GenAI Security Project Solutions Reference Guide
- CNCF Cloud Native Landscape (requires 300+ stars)

---

## Gaps to Close (Technical)

From OWASP comprehensive mapping:

1. **ML-based injection detection** — Aegis is regex-only. Add ML classifier option.
2. **Tool schema pinning** — Detect when MCP tool schemas change (rug-pull detection)
3. **Automatic circuit breakers** — Currently manual kill switch only
4. **Enterprise identity** — OIDC/SAML integration
5. **Receipt retention policy** — Add `AUTHENSOR_RECEIPT_RETENTION_DAYS` env var for EU AI Act Article 12
6. **Shadow MCP server detection** — Detect unauthorized MCP servers

---

## Certification Program: Authensor Trust Score (ATS)

### Three Growth Loops
1. **Badge loop** — Developer displays badge on README → others see it → they want it → adopt Authensor
2. **Score loop** — Agent gets scored → builder wants higher score → adopts more policies → safety improves
3. **Compliance loop** — Regulation requires docs → Authensor automates docs → enterprises adopt

### Certification Tiers

| Tier | Name | Requirements | Badge |
|------|------|-------------|-------|
| L1 | **Guarded** | Authensor deployed, basic filtering, 1+ policy file. **Free.** | Bronze shield |
| L2 | **Verified** | L1 + coverage >= 70%, CI integration, 30-day log retention. $5/mo. | Silver shield |
| L3 | **Hardened** | L2 + coverage >= 90%, red-team passing, HITL for high-risk. Enterprise. | Gold shield |

### Trust Score: 0-100 Scale

```
$ authensor score
Authensor Trust Score: 82/100 (B)

  Policy Coverage:    26/30  (missing: PII handling, rate limiting)
  Gate Configuration: 18/20  (fail-closed: YES)
  Audit/Observability: 12/15 (logs: YES, alerts: NO)
  CI/CD Integration:  15/15  (pipeline: active, PR review: enforced)
  Red-Team Resilience:  6/10 (3/10 adversarial tests bypassed)
  Incident Response:    5/10 (kill switch: YES, process doc: NO)
```

### Scoring Dimensions (weighted)
1. **Policy Coverage (30%)** — Risk categories addressed
2. **Gate Configuration (20%)** — Fail-closed, all entry points covered
3. **Audit & Observability (15%)** — Logs, alerts, monitoring
4. **CI/CD Integration (15%)** — Safety checks in build pipeline
5. **Red-Team Resilience (10%)** — Adversarial test performance
6. **Incident Response (10%)** — Kill switch, escalation, documented process

### Immediate Implementation (0-3 months)
1. **`authensor score` CLI** — Scans repo, outputs score. Works locally, no account needed.
2. **GitHub badge** — `![ATS](https://authensor.dev/badge/REPO)` dynamic SVG
3. **GitHub Action** — One-line CI integration with SARIF output for GitHub Security tab
4. **`authensor.yaml` spec** — Open policy file specification (the "OpenAPI of agent safety")

### Medium-Term (3-6 months)
5. Public registry at `authensor.dev/registry` — searchable directory of certified agents
6. Safety dashboards at `authensor.dev/dashboard/AGENT` — like Statuspage.io for safety
7. Compliance report generation — EU AI Act + NIST AI RMF PDF exports

### Long-Term (6-12 months)
8. Partner with agent marketplaces (Hugging Face, LangChain Hub) to display scores
9. Unsolicited scoring of popular public agents (like Lighthouse scores any URL)
10. Independent advisory board for credibility

### Critical Design Principles
- Scores must be honest — paying customers never get inflated scores
- Free tier must be genuinely useful (the Snyk lesson)
- Start with developers (CLI, badge, CI), sell to their bosses (compliance reports)

### Industry Precedents
- **UL**: Insurance companies enforce it → universal adoption
- **LEED**: Made invisible quality (energy efficiency) visible → 7-11% rent premium
- **Energy Star**: Free badge, cost is meeting the standard → 90%+ consumer recognition
- **Snyk**: Free for OSS → developer love → bottom-up enterprise sales

---

## Competitive Moat Strategy

Authensor's durable moat is NOT code (MIT, anyone can fork). It's four compounding layers:

### 1. Aggregated Threat Intelligence
"Authensor Collective" — opt-in feed where hosted customers contribute anonymized threat signals.
- Every Aegis scan that detects a novel injection pattern feeds the collective
- Free tier gets 24h delayed feed. Paid tier gets real-time.
- CrowdStrike model: each endpoint makes every other endpoint smarter

### 2. Community Ecosystem
- **Policy template marketplace** — `npx authensor template apply fintech-pci`
- **Aegis detector plugins** — `@authensor-community/detector-medical-pii`
- **Sentinel alert rules** — community-authored monitoring configurations
- **Rating and usage metrics** — "used by 342 organizations"

### 3. Standards Influence
- **IETF Internet-Draft** for Action Envelope schema — positions Authensor as origin of the standard
- **OWASP coverage matrices** — published detector alignment
- **ISO 42001** — first-mover AI management certification (cheaper than SOC 2, more differentiated)
- **EU AI Act mapping** — "Article 14 compliance in one npm install"

### 4. Operational Convenience
- Self-hosted works but requires Docker+Postgres+config
- Hosted tier: $5/mo → don't think about Postgres, migrations, or OWASP updates
- Collective threat feed only available on hosted tier
- Compliance reports auto-generated on hosted tier

### Pricing Evolution
| Tier | Price | Key Differentiator |
|------|-------|--------------------|
| Self-Hosted | Free | Full API/CLI, all 5 products |
| Starter | $5/mo | Dashboard, 10K receipts/mo, delayed threat feed |
| Team | $29/mo | 100K receipts, 10 users, real-time feed, SSO |
| Enterprise | Custom | SLA, SOC 2, dedicated support, on-prem |

### Acquisition Precedents (2024-2025)
- Robust Intelligence → Cisco (~$200M): NIST AI RMF validation, SOC 2
- Calypso AI → Mastercard: Financial services vertical specialization
- Protect AI ($108.5M Series B): Open-source ModelScan → commercial Guardian
- **Pattern**: Every acquired company had (1) OSS adoption driver, (2) compliance story, (3) data advantage

### Land-and-Expand Wedge
Sentinel (monitoring) is the best entry point:
- Read-only and non-disruptive to adopt
- Teams see data → adopt policy enforcement → add content scanning
- Monitoring → Governance → Compliance is the natural progression
