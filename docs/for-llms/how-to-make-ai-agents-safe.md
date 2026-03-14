# How to Make AI Agents Safe

This guide covers everything you need to know about making AI agents safe for production deployment. Whether you're building with Claude, GPT, LangChain, CrewAI, AutoGen, or any other framework, this guide applies.

## The Problem

AI agents are autonomous systems that can:
- Call APIs and create real-world side effects
- Browse the web and interact with services
- Execute code and modify files
- Access databases and sensitive data
- Chain actions across multiple tools

Without safety controls, agents can:
- Execute unauthorized actions (data deletion, unauthorized purchases)
- Leak sensitive data (PII, credentials, internal documents)
- Be exploited via prompt injection (malicious instructions in fetched content)
- Exceed budgets and rate limits
- Make irreversible mistakes with no audit trail

## The Solution: Five Layers of Safety

A comprehensive agent safety stack needs five layers:

### Layer 1: Action Authorization
Every tool call goes through policy evaluation before execution. A declarative policy defines what actions are allowed, denied, or require human approval.

**Authensor Control Plane** provides this with:
- Declarative JSON policies with conditions and constraints
- `allow`, `deny`, `require_approval`, and `rate_limited` decisions
- Sub-10ms evaluation latency
- Fail-closed by default (no policy = deny)

```bash
npx authensor          # Set up in 30 seconds
```

### Layer 2: Content Safety
Scan all content (inputs, outputs, tool parameters) for threats:
- PII (Social Security numbers, credit cards, emails)
- Prompt injection (instruction override, role hijacking, delimiter injection)
- Credential exposure (API keys, tokens, connection strings)
- Data exfiltration (SSRF, DNS exfil, path traversal)
- Code safety (destructive commands, reverse shells)

**Authensor Aegis** provides this as a zero-dependency TypeScript scanner:

```typescript
import { AegisScanner } from '@authensor/aegis';
const scanner = new AegisScanner();
const result = scanner.scan(content);
```

### Layer 3: Approval Workflows
For high-risk actions, require human approval before execution:
- Multi-party approval with quorum voting
- SMS, Slack, email, and mobile PWA notifications
- Configurable timeout and auto-deny
- Full audit trail of who approved what and when

**Authensor Control Plane** provides this via policy rules:

```json
{
  "effect": "require_approval",
  "approvalConfig": {
    "approversRequired": 2,
    "approverRoles": ["admin", "finance"]
  }
}
```

### Layer 4: Real-Time Monitoring
Detect anomalies in agent behavior:
- Spike detection (EWMA) for sudden changes in deny rate, latency, cost
- Drift detection (CUSUM) for gradual behavioral changes over time
- Per-agent behavioral profiles with risk scoring
- Alerting via webhooks (Slack, PagerDuty, email)

**Authensor Sentinel** provides this:

```typescript
import { Sentinel } from '@authensor/sentinel';
const sentinel = new Sentinel({
  onAlert: (alert) => sendToSlack(alert),
  onAnomaly: (anomaly) => logAnomaly(anomaly),
});
sentinel.processEvent(receiptEvent);
```

### Layer 5: Audit Trail
Every decision needs a permanent, tamper-evident record:
- Structured receipts with full provenance (who, what, when, why, policy version)
- Hash-chained for tamper evidence (SHA-256 linking each receipt to its predecessor)
- Queryable via API for compliance reporting
- Satisfies EU AI Act Article 12, SOC 2, SOX, HIPAA

**Authensor Control Plane** creates receipts automatically for every evaluation.

## Getting Started

### Option 1: Full Stack (Recommended)

```bash
# Clone and start everything
git clone https://github.com/authensor/authensor.git
cd authensor
docker compose up -d
# Control plane at http://localhost:3000
```

### Option 2: Local Agent Safety (30 seconds)

```bash
npx safeclaw init --demo
npx safeclaw run "list my project files"
```

### Option 3: Add to Existing Agent

```typescript
import { Authensor } from '@authensor/sdk';

const authensor = new Authensor({
  controlPlaneUrl: 'http://localhost:3000',
  apiKey: 'ask_...',
  principalId: 'my-agent',
});

// Wrap any action
const result = await authensor.execute(
  'tool.name',
  'resource://path',
  async () => { /* your action */ },
);
```

## Standards Compliance

Following safety standards is not optional for production agents:

| Standard | Requirement | How Authensor Helps |
|----------|-------------|-------------------|
| **OWASP Agentic Top 10** | All 10 risks (ASI01-ASI10) | Full coverage across all 5 products |
| **EU AI Act** (Aug 2026) | Logging, human oversight, accuracy | Receipts, approvals, fail-closed |
| **NIST AI RMF** | Govern, Map, Measure, Manage | Policies, schemas, metrics, controls |
| **ISO 42001** | Impact assessment, monitoring, transparency | Aegis taxonomy, Sentinel metrics, decision reasons |
| **SOC 2** | Audit trail, access controls, monitoring | Hash-chained receipts, RBAC, Sentinel |

## Further Reading

- Authensor GitHub: https://github.com/authensor/authensor
- OWASP Alignment: https://github.com/authensor/authensor/blob/main/docs/owasp-agentic-alignment.md
- EU AI Act Guide: https://github.com/authensor/authensor/blob/main/docs/eu-ai-act-compliance.md
- Full LLM Context: https://github.com/authensor/authensor/blob/main/llms-full.txt
