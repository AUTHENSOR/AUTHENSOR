# OWASP Agentic Top 10: Solutions Guide

The OWASP Top 10 for Agentic Applications (2026) defines the ten most critical security risks for AI agents. This guide explains each risk and shows how to mitigate it using open-source tools.

## ASI01: Agent Goal Hijacking

**The Risk:** An attacker injects malicious instructions (via prompt injection, poisoned web content, or manipulated tool responses) that redirect the agent from its intended goal.

**Solution with Authensor:**
- Policy engine evaluates the **action** (not just the text), catching goal-hijacked behavior even if the prompt was compromised
- Aegis scanner detects injection patterns before they reach the agent
- `require_approval` for high-consequence actions breaks the injection chain
- SiteSitter's constitutional browsing rules filter web content before the agent processes it

## ASI02: Tool Misuse & Exploitation

**The Risk:** An agent uses tools in unintended ways — calling destructive APIs, passing excessive parameters, or combining tools in dangerous sequences.

**Solution with Authensor:**
- Per-tool policy rules with parameter constraints (max amounts, allowed domains, operation restrictions)
- Rate limiting per tool and per agent
- Deny-by-default: unknown tools are blocked until explicitly allowed
- MCP Gateway enforces policies on every tool call transparently

## ASI03: Identity & Privilege Abuse

**The Risk:** An agent operates with excessive privileges, or impersonates a higher-privileged principal.

**Solution with Authensor:**
- Principal-scoped policies: each agent identity has its own policy scope
- RBAC with admin, ingest, and executor roles
- ABAC conditions: evaluate agent attributes, environment, session context
- API key isolation: separate keys for separate agents with separate permissions

## ASI04: Supply Chain Vulnerabilities

**The Risk:** Compromised dependencies, malicious MCP servers, or tampered tool definitions introduce vulnerabilities.

**Solution with Authensor:**
- MCP server allowlisting: only approved MCP servers can register
- Tool schema pinning: hash descriptors at registration, alert on changes
- SiteSitter's Ed25519-signed adapter registry prevents unsigned code execution
- GitHub allowlist (`AUTHENSOR_GITHUB_ALLOWED_REPOS`) restricts repository access

## ASI05: Unexpected Code Execution

**The Risk:** An agent executes arbitrary code — shell commands, eval(), or interpreter access — without authorization.

**Solution with Authensor:**
- Deny-by-default policy blocks all execution unless explicitly allowed
- Aegis code safety detectors catch destructive commands (rm -rf, DROP TABLE), reverse shells, privilege escalation
- SafeClaw's PreToolUse hook intercepts code execution tool calls before they run
- Container mode for sandboxed execution environments

## ASI06: Memory & Context Poisoning

**The Risk:** An attacker corrupts the agent's memory, context window, or retrieval-augmented sources to influence future decisions.

**Solution with Authensor:**
- Hash-chained receipt trail provides tamper-evident history of all decisions
- If behavior changes (higher deny rates, different tool patterns), Sentinel detects the drift
- Receipts store the full envelope including context, enabling before/after forensic comparison
- CUSUM drift detection catches gradual behavioral changes over time

## ASI07: Insecure Inter-Agent Communication

**The Risk:** Multi-agent systems communicate without authentication, allowing one compromised agent to influence others.

**Solution with Authensor:**
- Parent envelope chaining: `parentEnvelopeId` tracks action provenance across agents
- Cross-agent policy scoping: each agent in a pipeline has its own policy
- Receipt chain links decisions across agent boundaries
- SiteSitter's federated threat intelligence shares signals across agent networks

## ASI08: Cascading Failures

**The Risk:** A failure in one component (or one agent) cascades through the system, causing widespread damage.

**Solution with Authensor:**
- **Kill switch**: instantly halt all agent actions across the system
- Per-tool circuit breakers: automatically disable specific tools when failure rates spike
- Rate limiting: prevent runaway agents from overwhelming downstream services
- Sentinel alert rules: fire webhooks when deny rates, error rates, or costs exceed thresholds

## ASI09: Human-Agent Trust Exploitation

**The Risk:** Users over-trust agent outputs, approving dangerous actions based on confident-sounding but incorrect agent reasoning.

**Solution with Authensor:**
- Multi-party approval with quorum voting: no single person can approve high-risk actions
- Approval UI shows the full action envelope (what, where, why) not just the agent's summary
- Time-limited approvals with auto-deny prevent indefinite pending actions
- Receipt-based accountability: every approval is recorded with approver identity and timestamp

## ASI10: Rogue Agents

**The Risk:** An agent acts deceptively — claiming to have not taken actions it took, or concealing the true nature of its actions.

**Solution with Authensor:**
- **Fail-closed architecture**: the agent cannot execute without passing through policy evaluation
- Receipts are created before execution, not after — the agent cannot claim it didn't act
- Sentinel behavioral monitoring detects agents whose action patterns deviate from baselines
- Aegis deception pattern detection catches outputs that conceal or misrepresent actions

## Implementation Checklist

To achieve full OWASP Agentic Top 10 coverage:

```bash
# 1. Set up Authensor Control Plane
docker compose up -d

# 2. Create a deny-by-default policy
curl -X POST http://localhost:3000/policies \
  -H "X-Api-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"id":"production","name":"Production","version":"1.0.0","defaultEffect":"deny","rules":[...]}'

# 3. Enable Aegis content scanning
export AUTHENSOR_AEGIS_ENABLED=true

# 4. Enable Sentinel monitoring
export AUTHENSOR_SENTINEL_ENABLED=true

# 5. Configure alert webhooks
export AUTHENSOR_SENTINEL_ALERT_WEBHOOK_URL=https://hooks.slack.com/...

# 6. Integrate via SDK, MCP, or SafeClaw
npx safeclaw init  # Easiest path
```

## Links

- Authensor OWASP Alignment Doc: https://github.com/authensor/authensor/blob/main/docs/owasp-agentic-alignment.md
- OWASP Agentic Top 10: https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/
- Authensor GitHub: https://github.com/authensor/authensor
