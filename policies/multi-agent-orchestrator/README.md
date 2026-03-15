# Multi-Agent Orchestrator Policy

**Template ID:** `multi-agent-orchestrator`
**Version:** 1.0.0
**Category:** Multi-Agent Systems
**Environment:** All

## Use Case

This template governs an orchestrator agent that decomposes high-level goals into
subtasks and delegates them to specialised sub-agents. The orchestrator is the
"root" of a delegation tree. This policy controls how deep and how wide that tree
can grow, and enforces the audit trail linkage between each level.

## Key Concepts

**Delegation depth:** How many layers of agent-to-agent delegation exist. Depth 0 is
the orchestrator; depth 1 is its direct sub-agents; depth 2 is their sub-agents.

**Fan-out:** How many concurrent sub-agents the orchestrator has active at one time.

**parentReceiptId:** Every delegation envelope must carry the `context.parentReceiptId`
field, set to the Authensor receipt ID of the orchestrator's own authorised action.
This creates a cryptographic chain linking every sub-agent action back to the top-level
human-approved task.

**Privilege levels:** Encoded as integers: 1=reader, 2=executor, 3=operator, 4=admin.

## What It Allows

- Delegation to agents with equal or lower privilege (`agent.delegate`, fan-out <= 5)
- Sub-agent spawning within fan-out limit (`agent.spawn`, currentFanOut < 5)
- Status checks, result collection, result synthesis (`agent.status`, `agent.collect`, `result.aggregate`)
- Sub-agent termination (`agent.terminate`)

## What It Blocks

- Delegations without `context.parentReceiptId` (broken audit chain)
- Delegation chains deeper than 3 levels
- Fan-out of 5 or more concurrent sub-agents
- 5 consecutive delegation actions without interleaved non-delegation work (delegation storm)
- Auth escalation immediately followed by delegation (privilege laundering)
- Any non-orchestration actions (tool calls, data writes, shell exec) — use sub-agents for those

## What Requires Approval

- Delegation to an agent with higher privilege than the orchestrator
- Sessions that accumulate a risk score > 100
- Delegation storms: 5 consecutive delegations detected in a 5-action window

## Envelope Requirements

Your orchestration framework must inject these fields into every delegation envelope:

```json
{
  "context": {
    "parentReceiptId": "<receipt-id-of-orchestrators-own-authorised-action>",
    "delegationDepth": 1,
    "currentFanOut": 2
  },
  "action": {
    "parameters": {
      "targetPrivilegeLevel": 2
    }
  }
}
```

`delegationDepth` and `currentFanOut` must be tracked by the orchestration framework
and injected at envelope-submission time. Agents must not set these values themselves.

## How to Customise

**Increase fan-out limit:**
Change the `gte: 5` in rule `block-excessive-fan-out` and the `lt: 5` in rule
`allow-spawn-within-limits` to your desired limit. Be aware that larger fan-outs
are harder to monitor in real time.

**Adjust privilege level thresholds:**
Replace the static `value: 2` placeholders in rules 4 and 5 with the correct
privilege level for your orchestrator's role. Consider having the control plane
inject `context.principalPrivilegeLevel` dynamically at envelope validation time.

**Allow direct tool use by the orchestrator:**
Add a rule before `deny-all-other` to allow specific tool action types the
orchestrator needs to call directly (e.g., reading a task queue).
