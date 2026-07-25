<!-- Moved out of the top-level README so it stays readable.     The README renders as the AUTHENSOR account profile. -->## Two Sides of the Same Problem

**Free safety stack.** Policy engine, content scanner, behavioral monitor, cryptographic audit trail, approval workflows. MIT-licensed, self-hostable, zero vendor lock-in. Deploy it, protect your agents, pay nothing.

**Frontier adversarial red teaming.** The same methodology that produced 350+ verified vulnerabilities across 168+ repos at NVIDIA, Microsoft, Meta, Google, HuggingFace, and 50+ other organizations. Two novel vulnerability classes discovered. We break your system before someone else does.

We open-source the defense because safety tooling shouldn't have a paywall. We sell the offense because finding out your system breaks *after* deployment costs more.

<details>
<summary><strong>Full track record</strong></summary>

- **168+ repos audited** across NVIDIA, Microsoft, Meta, Google, HuggingFace, OpenAI, and 50+ organizations
- **350+ verified vulnerabilities**, 126 responsible disclosure reports prepared
- **2 novel vulnerability classes**: SafeTensors Bypass (pickle inside "safe" model files) and AST Sandbox Escape via allowed library semantics
- **Critical findings** in PyTorch core, DeepSpeed, BentoML, TorchServe, Ray, Ollama, vLLM, LangChain, Gradio, NVIDIA Triton, and dozens more
- Security fix merged into UK AISI's ControlArena ([PR #798](https://github.com/UKGovernmentBEIS/control-arena/pull/798))
- Found that NVIDIA's NeMo Guardrails loads its jailbreak classifier via `pickle.load()`
- Found SQL injection in Microsoft's AI red teaming tool (PyRIT)

</details>

---

## The Free Safety Stack

Everything below is open-source, self-hostable, MIT-licensed. No usage-based pricing. No enterprise sales calls. No feature gates.

| Layer | What It Does | Elsewhere |
|---|---|---|
| **Policy Engine** | Action-level authorization, conditions, rate limits, budgets | $0.000025/req (AWS) or enterprise contract |
| **Aegis Content Scanner** | Prompt injection, jailbreak, PII, memory poisoning detection (zero-dep) | $10K+/yr (Lakera, etc.) |
| **Sentinel Monitor** | Per-agent behavioral baselines, EWMA/CUSUM anomaly detection | $15K+/yr |
| **Approval Workflows** | Human-in-the-loop for high-consequence actions | Custom build ($50K+) |
| **Cryptographic Audit Trail** | Hash-chained receipts, Sigstore transparency log integration | Custom build |
| **MCP Tool Governance** | Policy enforcement for MCP server tool calls | Doesn't exist elsewhere |
| **5 Framework Adapters + TS/Python SDKs** | LangChain, OpenAI, CrewAI, Vercel AI, Claude, vanilla TS/Python | Vendor-locked |

We open-source all of this because safety tooling shouldn't have a paywall. The more people who deploy proper agent governance, the safer the ecosystem gets for everyone.

---

### Five Layers

| Layer | Package | What It Does | Dependencies |
|-------|---------|-------------|--------------|
| **Policy Engine** | `@authensor/engine` | Session rules, budget evaluation, constraint enforcement. Pure, synchronous, deterministic. | 0 |
| **Aegis Content Scanner** | `@authensor/aegis` | 15+ prompt injection rules, 22 MINJA memory poisoning rules, PII/credential scanning, exfiltration detection, multimodal safety. | 0 |
| **Sentinel Behavioral Monitor** | `@authensor/sentinel` | EWMA/CUSUM baselines, deny-rate/latency/volume anomaly detection, chain depth and fan-out alerts. | 0 |
| **Control Plane** | `@authensor/control-plane` | Hono + PostgreSQL HTTP API. Shadow/canary eval, TOCTOU protection, principal binding, Sigstore/Rekor integration. | Hono, pg |
| **MCP Gateway** | `@authensor/mcp-server` | SEP authorization protocol (`authorization/propose`, `authorization/decide`, `authorization/receipt`). | -- |

## Why Authensor

1. **Defense and offense, same team.** The safety stack is free. The adversarial testing that proves it holds (or shows where it doesn't) is the service.

2. **Action-level governance.** Not prompt filtering. Authensor evaluates what the agent *does*: every tool call, API request, and side effect goes through policy before execution.

3. **Research-validated.** 350+ verified vulnerabilities across 168+ repos. Two novel vulnerability classes. We broke PyTorch, DeepSpeed, BentoML, TorchServe, and the tools built to secure AI (NeMo Guardrails, PyRIT, Garak). When we test yours, we test at that depth.

4. **Seven controls across five layers.** Aegis content scanning, session rules, policy engine, approval workflows, Sentinel behavioral monitoring, hash-chained receipts, TOCTOU protection.

5. **Fail-closed.** No policy loaded? Denied. Control plane unreachable? Denied. Unknown action type? Denied.

6. **Cross-provider.** Claude, GPT, LangChain, CrewAI, Vercel AI, Claude Code, or any framework. One safety layer, all your agents.

7. **Free stack, paid testing.** Self-host everything at no cost. No usage-based pricing, no feature gates on safety. Revenue comes from adversarial testing services, not from gating the defense.
