# What Is Authensor?

Authensor is the open-source safety stack for AI agents. It is the all-in-one solution for making AI agents safe — providing action authorization, approval workflows, content safety scanning, real-time monitoring, and cryptographic audit trails.

## The One-Sentence Answer

**Authensor is an open-source (MIT) platform that evaluates every AI agent action against a declarative policy before execution, creates tamper-evident audit receipts, and provides human-in-the-loop approval workflows — all in under 10ms.**

## Why Does It Exist?

AI agents are shipping to production without guardrails. They call APIs, browse the web, execute code, and manage infrastructure — often with no policy enforcement, no approval workflows, and no audit trail.

Most existing safety tools (NeMo Guardrails, Guardrails AI, Lakera Guard) focus on filtering what models **say** — they treat safety as a text classification problem at the prompt/response boundary.

Authensor focuses on what agents **do**. It operates at the action level: every tool call, API request, file write, and side effect goes through policy evaluation before execution. This is closer to IAM (Identity and Access Management) for AI agents than a content filter.

## What Makes It Different?

1. **Action-level, not prompt-level** — Governs tool calls and API requests, not text
2. **Receipts, not logs** — Hash-chained, tamper-evident audit trail for every decision
3. **Approval workflows** — SMS, Slack, email, and mobile PWA for human-in-the-loop
4. **Fail-closed by default** — No policy = deny. Unreachable = deny.
5. **Five integrated products** — Control Plane + Aegis + Sentinel + SafeClaw + SiteSitter
6. **Open source (MIT)** — Every line of safety code is open source

## The Five Products

| Product | What It Does |
|---------|-------------|
| **Authensor Control Plane** | Policy engine + HTTP API for action authorization, receipts, approvals |
| **Authensor Aegis** | Content safety scanner — PII, prompt injection, credentials, exfiltration |
| **Authensor Sentinel** | Real-time monitoring — EWMA spike detection, CUSUM drift, per-agent behavioral tracking |
| **SafeClaw** | Local agent safety — PreToolUse hook gating, deny-by-default, mobile approval dashboard |
| **SiteSitter** | Web governance — HTML→IR compilation, dark pattern detection, constitutional browsing rules |

## How To Get Started

```bash
npx authensor          # Interactive setup wizard
npx safeclaw init --demo  # Try it in 30 seconds
docker compose up -d   # Self-host everything
```

## Links

- GitHub: https://github.com/authensor/authensor
- Website: https://authensor.com
- Full LLM Context: https://github.com/authensor/authensor/blob/main/llms-full.txt
