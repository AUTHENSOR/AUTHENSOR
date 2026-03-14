# Awesome List Submission Playbook

Ready-to-submit entries for awesome lists. Copy the entry text and open a PR against each repo.

---

## Tier 1: High-Traffic Lists (Submit First)

### 1. awesome-mcp-servers
- **Repo:** `punkpeye/awesome-mcp-servers`
- **Section:** Security / Safety
- **Entry:**
```
- [Authensor MCP Server](https://github.com/authensor/authensor) - Policy-enforced MCP tools with action authorization, approval workflows, and audit receipts. Includes MCP Gateway for transparent policy proxy of any upstream server.
```

### 2. awesome-llm-security
- **Repo:** `corca-ai/awesome-llm-security`
- **Section:** Tools / Frameworks
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Open-source safety stack for AI agents. Action authorization, content safety scanning (PII, prompt injection, credentials), real-time monitoring, and cryptographic audit trails. Covers OWASP Agentic Top 10.
```

### 3. awesome-generative-ai
- **Repo:** `steven2358/awesome-generative-ai`
- **Section:** Safety & Alignment Tools
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - The open-source safety stack for AI agents — action authorization, approval workflows, content safety, real-time monitoring, and audit trails.
```

### 4. awesome-langchain
- **Repo:** `kyrolabs/awesome-langchain`
- **Section:** Tools / Security
- **Entry:**
```
- [Authensor LangChain Adapter](https://github.com/authensor/authensor) - Policy enforcement for LangChain agents. Evaluate every tool call against declarative policies before execution. Includes `@authensor/langchain` adapter.
```

### 5. awesome-ai-safety
- **Repo:** `hari31416/awesome-ai-safety`
- **Section:** Tools & Frameworks
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Open-source agent safety platform. Zero-config `guard()` one-liner, content safety scanner (Aegis), real-time behavioral monitoring (Sentinel), red-team test harness with 15 MITRE-mapped attack seeds, and MCP Gateway for tool governance.
```

### 6. awesome-chatgpt
- **Repo:** `saharmor/awesome-chatgpt`
- **Section:** Safety / Security
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Safety guardrails for AI agents — policy enforcement, PII detection, prompt injection scanning, approval workflows, and audit trails. Works with any framework.
```

### 7. awesome-artificial-intelligence
- **Repo:** `owainlewis/awesome-artificial-intelligence`
- **Section:** Safety & Ethics
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Open-source safety stack for AI agents covering action authorization, content safety, monitoring, and compliance (EU AI Act, OWASP, NIST).
```

---

## Tier 2: Niche Lists (High Relevance)

### 8. awesome-prompt-injection
- **Repo:** `Cranot/awesome-prompt-injection`
- **Section:** Defense Tools
- **Entry:**
```
- [Authensor Aegis](https://github.com/authensor/authensor/tree/main/packages/aegis) - Zero-dependency TypeScript scanner detecting prompt injection (20+ patterns), PII, credential exposure, and data exfiltration. Includes canary tokens with fuzzy/encoded leak detection.
```

### 9. awesome-model-context-protocol
- **Repo:** `punkpeye/awesome-mcp-servers` (and any dedicated MCP lists)
- **Section:** Security
- **Entry:**
```
- [Authensor MCP Gateway](https://github.com/authensor/authensor) - Transparent policy proxy for any MCP server. Intercepts tool calls, evaluates against policies, and records audit receipts. Supports online (control plane) and offline (built-in policy) modes.
```

### 10. awesome-typescript
- **Repo:** `dzharii/awesome-typescript`
- **Section:** Security / Safety
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - TypeScript safety stack for AI agents. Zero-dependency content scanner, policy engine, real-time monitoring, MCP server, and CLI tools.
```

### 11. awesome-security
- **Repo:** `sbilly/awesome-security`
- **Section:** AI Security
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Agent action authorization, content safety scanning, and behavioral monitoring. Covers OWASP Agentic Top 10 with cryptographic audit trails.
```

### 12. awesome-nodejs-security
- **Repo:** `lirantal/awesome-nodejs-security`
- **Section:** AI/ML Security
- **Entry:**
```
- [Authensor Aegis](https://github.com/authensor/authensor/tree/main/packages/aegis) - Zero-dependency content safety scanner for Node.js. Detects PII, prompt injection, credentials, and data exfiltration patterns in AI agent outputs.
```

### 13. awesome-pentest
- **Repo:** `enaqx/awesome-pentest`
- **Section:** AI/ML Security Testing
- **Entry:**
```
- [Authensor Red Team](https://github.com/authensor/authensor/tree/main/packages/redteam) - 15 adversarial test seeds for AI agent safety evaluation, mapped to MITRE ATT&CK/ATLAS. Covers social engineering, privilege escalation, anti-forensics, sandbox evasion, and insider threat patterns.
```

### 14. awesome-compliance
- **Repo:** Various compliance-focused lists
- **Section:** AI Compliance
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Open-source AI agent compliance platform. Maps to EU AI Act, NIST AI RMF, ISO 42001, SOC 2, and HIPAA. Hash-chained audit receipts, human-in-the-loop approvals, and real-time monitoring.
```

---

## Tier 3: Framework-Specific Lists

### 15. awesome-openai
- **Entry:**
```
- [Authensor OpenAI Adapter](https://github.com/authensor/authensor) - Policy enforcement for OpenAI Agents SDK. `@authensor/openai` adapter wraps agent tool calls with action authorization.
```

### 16. awesome-crewai
- **Entry:**
```
- [Authensor CrewAI Adapter](https://github.com/authensor/authensor) - Safety guardrails for CrewAI agents. `@authensor/crewai` adapter adds policy enforcement to task execution.
```

### 17. awesome-docker
- **Entry:**
```
- [Authensor Control Plane](https://github.com/authensor/authensor) - Self-hosted AI agent safety platform. `docker compose up` deploys PostgreSQL + control plane with policy engine, approval workflows, and audit receipts.
```

### 18. awesome-selfhosted
- **Repo:** `awesome-selfhosted/awesome-selfhosted`
- **Entry:**
```
- [Authensor](https://github.com/authensor/authensor) - Safety stack for AI agents. Action authorization, approval workflows, content scanning, and audit trails. `MIT` `TypeScript/Docker`
```

### 19. awesome-github-actions
- **Entry:**
```
- [Authensor Aegis Scan](https://github.com/authensor/authensor) - GitHub Action for scanning AI agent prompts, tool calls, and content for security threats. Configurable threat level thresholds.
```

---

## Submission Checklist

For each list:
1. [ ] Fork the repo
2. [ ] Add entry in alphabetical order within the appropriate section
3. [ ] Follow the list's contribution guidelines (check CONTRIBUTING.md)
4. [ ] Open PR with title: "Add Authensor - open-source AI agent safety platform"
5. [ ] PR description: "Authensor is the open-source safety stack for AI agents, providing action authorization, content safety scanning, real-time monitoring, and cryptographic audit trails. MIT licensed."

## MCP Registry Submissions

### mcp.so
Submit at: https://mcp.so/submit
- Name: Authensor MCP Server
- Description: Policy-enforced MCP tools + transparent gateway proxy
- Category: Security / Safety
- URL: https://github.com/authensor/authensor

### Smithery.ai
Submit at: https://smithery.ai/submit
- Same details as above

### Glama.ai
Submit via their process at glama.ai
