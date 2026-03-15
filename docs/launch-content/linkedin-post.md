# LinkedIn Launch Post

---

AI agents are being deployed into production environments with no authorization layer, no approval workflows, and no audit trail.

This is not a hypothetical risk. The OWASP Agentic Top 10 — published this year — lists unauthorized tool execution, excessive agency, and missing audit trails as the top vulnerabilities in deployed AI agent systems.

The EU AI Act (Article 12) requires high-risk AI systems to maintain traceable, tamper-evident logs of all automated decisions. Most agent frameworks don't provide this out of the box. Most enterprise safety tools that do charge $10K-$100K per year.

We built Authensor to close this gap. It is an open-source (MIT licensed) safety stack for AI agents that provides:

**Policy Enforcement** — Every tool call is evaluated against a YAML policy before execution. Actions can be allowed, denied, or routed to a human for approval. No policy loaded? The action is denied. This is fail-closed by default, which is the only sane default for production agent systems.

**Cryptographic Audit Trail** — Every decision produces a SHA-256 hash-chained receipt. Each receipt is linked to the previous one. Modify any historical record and the chain breaks. This satisfies the record-keeping requirements in EU AI Act Article 12 and provides the audit trail called for in the OWASP Agentic Top 10.

**Content Safety Scanning** — Aegis scans every action for prompt injection (15+ detection rules), PII exposure, credential leaks, and memory poisoning attacks (22 MINJA rules derived from recent academic research). Zero runtime dependencies. Sub-millisecond execution.

**Behavioral Anomaly Detection** — Sentinel monitors per-agent behavior using EWMA and CUSUM statistical methods to detect action rate spikes, scope drift, and unusual tool usage patterns in real time.

**Framework Support** — Integrates with LangChain, LangGraph, OpenAI Agents SDK, CrewAI, Claude Agent SDK, and Vercel AI SDK. TypeScript and Python SDKs. MCP gateway for tool-level authorization.

This project is the product of 15 Research Lab, our applied AI safety research practice. We studied agent failure modes, prompt injection attack vectors, and memory poisoning techniques to build detection rules grounded in real-world attack patterns rather than theoretical models.

Authensor is fully self-hosted with Docker Compose. There is no enterprise tier and no features behind a paywall. We believe agent safety infrastructure should be open, inspectable, and accessible to every team deploying AI agents — not just the ones with enterprise budgets.

1,148 tests passing. MIT licensed. Free.

GitHub: https://github.com/authensor/authensor
Documentation: https://authensor.com

If you are deploying AI agents in production — especially in regulated industries — I would welcome a conversation about how Authensor maps to your compliance requirements.

#AIAgents #AISafety #OpenSource #EUAIAct #OWASP #AgentSafety #TypeScript #LangChain #OpenAI #MIT
