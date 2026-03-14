# Authensor + Claude Code / Cursor Integration

Authensor evaluates every tool call your AI coding agent makes -- file writes, shell
commands, network requests, MCP actions -- against your policies **before** the tool
executes. If the policy says deny, the tool never runs. If it says require approval,
the agent pauses until you approve. Read-only operations pass through instantly with
no network call.

This guide covers three integration paths:

| Path | Best for |
|------|----------|
| **SafeClaw** (recommended) | Full dashboard, audit trail, SMS/webhook alerts, offline cache |
| **Direct hook script** | Lightweight, no extra dependencies, BYOD (bring your own dashboard) |
| **Cursor** | Same Authensor backend, different hook wiring |

---

## 1. Quick Setup with SafeClaw

SafeClaw is the open-source client for Authensor. It wraps the Claude Agent SDK,
intercepts every `PreToolUse` event, and gates execution through the Authensor
control plane.

### Install and initialize

```bash
npx @authensor/safeclaw
```

Your browser opens with a setup wizard. Or initialize from the CLI:

```bash
safeclaw init --demo
```

This does three things:

1. Creates a profile at `~/.safeclaw/config.json` with a unique install ID.
2. Provisions a free demo Authensor token (7-day expiry).
3. Applies the default deny-by-default policy.

### How the hook works

Every tool call flows through `gateway.js`, SafeClaw's PreToolUse hook:

```
Agent wants to call a tool (e.g., Bash with "rm -rf /tmp/old")
  |
  v
classifier.js maps it --> action type: "code.exec", resource: "rm -rf /tmp/old"
  |
  v
Is it a safe read? (Read, Glob, Grep, TodoWrite, Skill, etc.)
  YES --> allow locally, no network call
  NO  --> send action metadata to POST /evaluate on Authensor
           |
           v
        Authensor evaluates against your active policy
           |
           +--> "allow"            --> tool executes
           +--> "deny"             --> tool blocked, agent told why
           +--> "require_approval" --> agent pauses, you get notified
                                       (SMS, webhook, dashboard, CLI)
                                       approve/reject via any channel
```

**What leaves your machine:** Only `action.type` and `action.resource` (with secrets
redacted). Never your API keys, file contents, or conversation.

**What stays local:** Your `ANTHROPIC_API_KEY`, your files, all tool output, the full
conversation.

### Run a task

```bash
safeclaw run "Refactor the auth module to use JWT"
```

Read operations execute immediately. Everything else is checked against your policy.
Risky actions pause until you approve:

```bash
# In another terminal, or from the dashboard:
safeclaw approvals approve rcpt_abc123
```

### Useful commands

```bash
safeclaw health          # Verify Authensor connectivity
safeclaw policy show     # View your active policy
safeclaw receipts        # View audit trail
safeclaw audit verify    # Verify hash chain integrity
safeclaw doctor          # Run 10 diagnostic checks
```

---

## 2. Direct Claude Code Hook Setup (Without SafeClaw)

If you want Authensor policy enforcement directly inside Claude Code without the
SafeClaw wrapper, you can wire up a `PreToolUse` hook using Claude Code's native
hooks system.

### Step 1: Create the hook script

Save this as `~/.claude/hooks/authensor-gate.sh` and make it executable:

```bash
#!/usr/bin/env bash
# Authensor PreToolUse gate for Claude Code
# Reads tool call JSON from stdin, evaluates against Authensor, outputs decision.

set -euo pipefail

AUTHENSOR_URL="${AUTHENSOR_URL:-http://localhost:3000}"  # Self-hosted default; set to your hosted URL if using the hosted tier
AUTHENSOR_TOKEN="${AUTHENSOR_TOKEN:-}"

# Read the hook input from stdin (Claude Code sends JSON)
INPUT=$(cat)

TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
TOOL_INPUT=$(echo "$INPUT" | jq -c '.tool_input // {}')

# --- Classify the tool into an Authensor action type ---
classify_tool() {
  case "$1" in
    Read)           echo "safe.read.file" ;;
    Glob)           echo "safe.read.glob" ;;
    Grep)           echo "safe.read.grep" ;;
    TodoWrite)      echo "safe.read.meta" ;;
    Skill)          echo "safe.read.meta" ;;
    TaskOutput)     echo "safe.read.meta" ;;
    Write)          echo "filesystem.write" ;;
    Edit)           echo "filesystem.write" ;;
    NotebookEdit)   echo "filesystem.write" ;;
    Bash)           echo "code.exec" ;;
    WebFetch)       echo "network.http" ;;
    WebSearch)      echo "network.search" ;;
    Task)           echo "agent.subagent" ;;
    mcp__*)         echo "mcp.${1#mcp__}" ;;
    *)              echo "unknown.$1" ;;
  esac
}

# Extract the resource (file path, command, URL, etc.)
extract_resource() {
  echo "$TOOL_INPUT" | jq -r '
    .file_path // .command // .url // .pattern // .query // .skill // ""
  ' | head -c 200
}

ACTION_TYPE=$(classify_tool "$TOOL_NAME")
RESOURCE=$(extract_resource)

# --- Local pre-filter: safe reads skip the network entirely ---
if [[ "$ACTION_TYPE" == safe.read.* ]]; then
  # Output nothing -- empty stdout means "allow" in Claude Code hooks
  exit 0
fi

# --- Call Authensor /evaluate ---
ENVELOPE=$(jq -n \
  --arg action_type "$ACTION_TYPE" \
  --arg resource "$RESOURCE" \
  --arg principal_id "claude-code-$(whoami)" \
  --arg timestamp "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    action: { type: $action_type, resource: $resource },
    principal: { type: "agent", id: $principal_id },
    timestamp: $timestamp
  }')

RESPONSE=$(curl -s -w '\n%{http_code}' \
  -X POST "${AUTHENSOR_URL}/evaluate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTHENSOR_TOKEN}" \
  -d "$ENVELOPE" \
  --max-time 10 2>/dev/null) || {
    # Fail closed: if Authensor is unreachable, deny
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Authensor control plane unreachable (fail-closed)"}}'
    exit 0
}

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [[ "$HTTP_CODE" -ge 400 ]]; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Authensor returned HTTP '"$HTTP_CODE"'"}}'
  exit 0
fi

OUTCOME=$(echo "$BODY" | jq -r '.decision.outcome // .outcome // "deny"')
RECEIPT_ID=$(echo "$BODY" | jq -r '.receiptId // .id // "unknown"')

case "$OUTCOME" in
  allow|allowed)
    # Allow -- output nothing (empty = allow)
    exit 0
    ;;
  deny|denied)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Denied by Authensor policy (receipt: '"$RECEIPT_ID"')"}}'
    exit 0
    ;;
  require_approval)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Approval required. Approve at: '"${AUTHENSOR_URL}/receipts/${RECEIPT_ID}/view"'"}}'
    exit 0
    ;;
  *)
    echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"Unknown decision: '"$OUTCOME"'"}}'
    exit 0
    ;;
esac
```

```bash
chmod +x ~/.claude/hooks/authensor-gate.sh
```

### Step 2: Configure hooks.json

Create or edit `.claude/hooks.json` in your project root (or `~/.claude/hooks.json`
for global enforcement):

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "type": "command",
        "command": "~/.claude/hooks/authensor-gate.sh"
      }
    ]
  }
}
```

### Step 3: Set your Authensor token

```bash
# Self-hosted (default):
export AUTHENSOR_URL="http://localhost:3000"
export AUTHENSOR_TOKEN="authensor_your_key_here"

# Hosted tier:
# export AUTHENSOR_URL="https://<your-tenant>.up.railway.app"
# export AUTHENSOR_TOKEN="authensor_demo_..."
# Request a hosted demo token at: https://forms.gle/QdfeWAr2G4pc8GxQA
```

### Hook input/output format

**Input** (JSON on stdin from Claude Code):

```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "git push origin main"
  }
}
```

**Output to deny** (JSON on stdout):

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Denied by Authensor policy (receipt: rcpt_abc123)"
  }
}
```

**Output to allow:** Empty stdout (exit 0 with no output).

---

## 3. Cursor Integration

Cursor does not currently support the same `PreToolUse` hook mechanism that Claude
Code uses. There are two practical approaches:

### Option A: Wrap commands through a gated shell

Create a wrapper script that intercepts shell commands and checks them against
Authensor before execution. Set this as your default shell in Cursor's terminal
settings:

1. Save the hook script from Section 2 as `~/.authensor/gate.sh`.
2. In Cursor settings, set the terminal shell to a wrapper:

```bash
#!/usr/bin/env bash
# ~/.authensor/cursor-shell.sh
# Wraps every command through Authensor evaluation

AUTHENSOR_URL="${AUTHENSOR_URL:-http://localhost:3000}"  # Self-hosted default; set to your hosted URL if using the hosted tier
AUTHENSOR_TOKEN="${AUTHENSOR_TOKEN:-}"

# If run interactively, just exec bash
if [[ $# -eq 0 ]]; then
  exec /bin/bash
fi

# Build the envelope
COMMAND="$*"
ENVELOPE=$(jq -n \
  --arg cmd "$COMMAND" \
  --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{
    action: { type: "code.exec", resource: $cmd },
    principal: { type: "agent", id: "cursor" },
    timestamp: $ts
  }')

RESULT=$(curl -s -X POST "${AUTHENSOR_URL}/evaluate" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${AUTHENSOR_TOKEN}" \
  -d "$ENVELOPE" --max-time 10 2>/dev/null)

OUTCOME=$(echo "$RESULT" | jq -r '.decision.outcome // "deny"' 2>/dev/null)

if [[ "$OUTCOME" == "allow" || "$OUTCOME" == "allowed" ]]; then
  exec /bin/bash -c "$COMMAND"
else
  echo "[Authensor] Blocked: $OUTCOME" >&2
  exit 1
fi
```

### Option B: Use SafeClaw as the agent runner

Instead of using Cursor's built-in agent, run tasks through SafeClaw directly:

```bash
safeclaw run "Fix the failing tests in src/auth/"
```

This gives you full policy enforcement, the approval flow, audit trail, and
dashboard -- regardless of which editor you use.

### Option C: Cursor rules file

You can add an `.cursor/rules` file that instructs the Cursor agent to self-check
against Authensor before executing tools. This is advisory (the agent can ignore it)
but adds a layer of friction:

```
Before executing any file write, shell command, or network request, call the
Authensor evaluate endpoint to check if the action is permitted:

  POST http://localhost:3000/evaluate
  Authorization: Bearer $AUTHENSOR_TOKEN
  Body: { "action": { "type": "<action_type>", "resource": "<resource>" },
          "principal": { "type": "agent", "id": "cursor" } }

If the response outcome is "deny" or "require_approval", do not execute the action.
Inform the user of the decision and the receipt URL.

(If using the hosted tier, replace http://localhost:3000 with your hosted URL.)
```

> Note: Option C is not a security boundary -- it relies on the model following
> instructions. Options A and B provide deterministic enforcement.

---

## 4. Policy Examples

Policies are JSON documents with a `defaultEffect` and an ordered list of rules.
First matching rule wins. If no rule matches, the `defaultEffect` applies.

### Example 1: Allow reads, require approval for writes

```json
{
  "id": "read-free-write-gated",
  "version": "v1",
  "name": "Read Free, Write Gated",
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "allow-reads",
      "effect": "allow",
      "description": "All read operations pass through instantly",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "safe.read" }
        ]
      }
    },
    {
      "id": "approve-writes",
      "effect": "require_approval",
      "description": "File writes and code execution require human approval",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "filesystem." },
          { "field": "action.type", "operator": "startsWith", "value": "code." }
        ]
      }
    }
  ]
}
```

### Example 2: Block file operations outside the project directory

```json
{
  "id": "project-boundary",
  "version": "v1",
  "name": "Project Boundary Enforcement",
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "allow-reads",
      "effect": "allow",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "safe.read" }
        ]
      }
    },
    {
      "id": "deny-outside-project",
      "effect": "deny",
      "description": "Block writes outside the project tree",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "filesystem.write" },
          { "field": "action.resource", "operator": "matches", "value": "^(?!/Users/me/projects/myapp)" }
        ]
      }
    },
    {
      "id": "allow-project-writes",
      "effect": "allow",
      "description": "Allow writes inside the project",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "filesystem.write" },
          { "field": "action.resource", "operator": "startsWith", "value": "/Users/me/projects/myapp" }
        ]
      }
    },
    {
      "id": "approve-exec",
      "effect": "require_approval",
      "description": "Shell commands need approval",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "eq", "value": "code.exec" }
        ]
      }
    }
  ]
}
```

> Tip: SafeClaw also has built-in workspace scoping (`safeclaw init --workspace`)
> that enforces project boundaries at the client level before the policy is even
> consulted.

### Example 3: Rate-limit API calls

Rate limiting is configured at the control plane level, not in the policy JSON.
The SafeClaw client also supports local rate limiting via `settings.json`:

```json
{
  "rateLimitPerMinute": 30,
  "rateLimitBurst": 5
}
```

For server-side rate limits, the Authensor control plane enforces sliding-window
limits on all write endpoints. Contact your Authensor admin to adjust per-tenant
limits.

### Example 4: Require approval for any git push

```json
{
  "id": "safe-git",
  "version": "v1",
  "name": "Safe Git Operations",
  "defaultEffect": "deny",
  "rules": [
    {
      "id": "allow-reads",
      "effect": "allow",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "safe.read" }
        ]
      }
    },
    {
      "id": "approve-git-push",
      "effect": "require_approval",
      "description": "Any git push requires human approval",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "code.exec" },
          { "field": "action.resource", "operator": "contains", "value": "git push" }
        ]
      }
    },
    {
      "id": "allow-safe-git",
      "effect": "allow",
      "description": "Non-destructive git commands are fine",
      "condition": {
        "all": [
          { "field": "action.type", "operator": "eq", "value": "code.exec" },
          { "field": "action.resource", "operator": "matches", "value": "^git (status|log|diff|branch|fetch|stash list)" }
        ]
      }
    },
    {
      "id": "approve-other-exec",
      "effect": "require_approval",
      "description": "All other shell commands need approval",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "eq", "value": "code.exec" }
        ]
      }
    },
    {
      "id": "approve-writes",
      "effect": "require_approval",
      "condition": {
        "any": [
          { "field": "action.type", "operator": "startsWith", "value": "filesystem." },
          { "field": "action.type", "operator": "startsWith", "value": "network." }
        ]
      }
    }
  ]
}
```

### Applying a policy

With SafeClaw:

```bash
# Copy your policy to the active location
cp my-policy.json ~/.safeclaw/policies/default.json
safeclaw policy apply
```

With the direct hook: upload the policy to the Authensor control plane using the API:

```bash
curl -X POST "${AUTHENSOR_URL}/policies" \
  -H "Authorization: Bearer ${AUTHENSOR_TOKEN}" \
  -H "Content-Type: application/json" \
  -d @my-policy.json
```

---

## 5. Viewing the Audit Trail

Every tool call that passes through Authensor produces a receipt -- a tamper-evident
record of what was attempted, what the policy decided, and whether it was approved.

### Browser view

Open the receipts dashboard in your browser:

```
# Self-hosted (default):
http://localhost:3000/receipts/view

# Hosted tier:
# https://<your-tenant>.up.railway.app/receipts/view
```

You will need your admin token as a query parameter or `Authorization` header.
Each receipt shows:

- Timestamp
- Tool / action type (e.g., `code.exec`, `filesystem.write`)
- Resource (e.g., the command or file path, with secrets redacted)
- Decision outcome (`allow`, `deny`, `require_approval`)
- Approval status (if applicable)
- Policy that was evaluated

Click any receipt to see the full envelope, decision details, and execution result.

### CLI (SafeClaw)

```bash
safeclaw receipts            # List recent receipts
safeclaw audit               # View local audit log (hash-chained JSONL)
safeclaw audit verify        # Verify the hash chain has not been tampered with
```

### API

```bash
# List receipts
curl -s "${AUTHENSOR_URL}/receipts?limit=20" \
  -H "Authorization: Bearer ${AUTHENSOR_TOKEN}" | jq

# Export as NDJSON
curl -s "${AUTHENSOR_URL}/receipts/export" \
  -H "Authorization: Bearer ${AUTHENSOR_TOKEN}" > receipts.ndjson

# Verify hash chain integrity
curl -s "${AUTHENSOR_URL}/receipts/verify" \
  -H "Authorization: Bearer ${AUTHENSOR_TOKEN}" | jq
```

### Local audit log (SafeClaw)

SafeClaw also maintains a local append-only audit ledger at `~/.safeclaw/audit.jsonl`.
Each entry is SHA-256 hash-chained to the previous entry. This provides a local
tamper-detection layer independent of the control plane.

---

## Action Type Reference

When writing policies, these are the action types produced by the classifier:

| Tool | Action Type | Category |
|------|------------|----------|
| `Read` | `safe.read.file` | Local pre-filter (no network call) |
| `Glob` | `safe.read.glob` | Local pre-filter |
| `Grep` | `safe.read.grep` | Local pre-filter |
| `TodoWrite` | `safe.read.meta` | Local pre-filter |
| `Skill` | `safe.read.meta` | Local pre-filter |
| `TaskOutput` | `safe.read.meta` | Local pre-filter |
| `Write` | `filesystem.write` | Evaluated by Authensor |
| `Edit` | `filesystem.write` | Evaluated by Authensor |
| `NotebookEdit` | `filesystem.write` | Evaluated by Authensor |
| `Bash` | `code.exec` | Evaluated by Authensor |
| `WebFetch` | `network.http` | Evaluated by Authensor |
| `WebSearch` | `network.search` | Evaluated by Authensor |
| `Task` | `agent.subagent` | Evaluated by Authensor |
| `mcp__*` | `mcp.<server>.<action>` | Evaluated by Authensor |

---

## Fail-Closed Guarantee

Both SafeClaw and the direct hook script follow the same safety contract:

- If the Authensor control plane is unreachable, **all non-read actions are denied**.
- Deny decisions are never cached. Only allow decisions can be cached for offline
  resilience (SafeClaw only, opt-in via `settings.json`).
- If no policy is configured on the control plane, the default behavior is to deny
  (unless the admin has explicitly enabled the fallback allow-all policy).

This means an attacker cannot bypass Authensor by taking the control plane offline.
The worst case is that the agent stops making progress -- it never gains unauthorized
access.
