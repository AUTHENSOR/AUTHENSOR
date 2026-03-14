# Authensor Framework Adapter Specifications

> Research date: 2026-03-14
> Status: Actionable integration specs for Authensor adapters across 10 agent frameworks

---

## Universal Adapter Pattern

Every Authensor adapter follows the same core loop regardless of framework:

```
1. Intercept tool call (framework-specific hook)
2. Classify tool -> ActionEnvelope { action.type, action.resource, principal }
3. Local pre-filter: if safe read, allow immediately (no network)
4. POST /evaluate to Authensor control plane
5. Map decision -> framework-specific response:
   - allow  -> let tool execute
   - deny   -> block tool, return reason to agent
   - require_approval -> block tool, notify human, wait for approval
6. POST /receipts with outcome (async, non-blocking)
```

The adapter's job is steps 1 and 5 -- the framework-specific glue. Steps 2-4 and 6 are shared library code (`@authensor/sdk-ts` or `authensor-sdk-py`).

---

## 1. LangChain / LangGraph

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `BaseCallbackHandler.on_tool_start` | Callback | Before any tool executes |
| `BaseCallbackHandler.on_tool_end` | Callback | After tool returns |
| LangGraph validation node + conditional edge | Graph node | Before tool node in graph |
| `HumanInTheLoopMiddleware` | Middleware | Intercepts tool calls requiring approval |

### Recommended Pattern: LangGraph Validation Node

LangGraph's graph-based architecture makes the cleanest integration. Insert an Authensor guard node before the tool node:

```python
from langgraph.graph import StateGraph, END
from authensor import AuthensorClient, classify_tool_call

client = AuthensorClient(url="http://localhost:3000", token="...")

def authensor_guard(state: dict) -> dict:
    """LangGraph node that evaluates pending tool calls against Authensor."""
    messages = state["messages"]
    last = messages[-1]
    if not hasattr(last, "tool_calls") or not last.tool_calls:
        return state

    for tool_call in last.tool_calls:
        envelope = classify_tool_call(
            tool_name=tool_call["name"],
            tool_args=tool_call["args"],
            principal_id=state.get("agent_id", "langchain-agent"),
        )
        receipt = client.evaluate(envelope)

        if receipt.decision.outcome == "deny":
            # Replace tool call message with denial
            state["messages"].append(
                ToolMessage(
                    content=f"BLOCKED by policy: {receipt.decision.reason}",
                    tool_call_id=tool_call["id"],
                )
            )
            state["tool_blocked"] = True
            return state

        if receipt.decision.outcome == "require_approval":
            state["pending_approval"] = receipt.id
            state["tool_blocked"] = True
            return state

    state["tool_blocked"] = False
    return state

def route_after_guard(state: dict) -> str:
    if state.get("tool_blocked"):
        return "agent"  # Loop back to agent with denial message
    return "tools"      # Proceed to tool execution

graph = StateGraph(AgentState)
graph.add_node("agent", agent_node)
graph.add_node("authensor_guard", authensor_guard)
graph.add_node("tools", tool_node)
graph.add_edge("agent", "authensor_guard")
graph.add_conditional_edges("authensor_guard", route_after_guard)
graph.add_edge("tools", "agent")
```

### Alternative: Callback Handler (simpler, less control)

```python
from langchain_core.callbacks import BaseCallbackHandler

class AuthensorCallbackHandler(BaseCallbackHandler):
    def on_tool_start(self, serialized, input_str, **kwargs):
        envelope = classify_tool_call(
            tool_name=serialized.get("name"),
            tool_args=kwargs.get("inputs", {}),
            principal_id="langchain-agent",
        )
        receipt = self.client.evaluate(envelope)
        if receipt.decision.outcome in ("deny", "require_approval"):
            raise ToolExecutionDenied(receipt)
```

**Limitation:** `on_tool_start` cannot cleanly block execution in all LangChain versions. The callback fires but raising an exception may not gracefully return a message to the agent. The LangGraph node approach is strictly better.

### Adapter Requirements

- **Package:** `@authensor/langchain` (Python)
- **Exports:** `AuthensorGuardNode`, `AuthensorCallbackHandler`, `classify_tool_call`
- **Dependencies:** `langchain-core >= 0.3`, `langgraph >= 0.4`, `authensor-sdk-py`
- **Lines of code:** ~150 for the guard node, ~80 for the callback

### Sources

- [LangChain Guardrails docs](https://docs.langchain.com/oss/python/langchain/guardrails)
- [LangGraph guardrails example](https://github.com/langchain-ai/langgraph-guardrails-example)
- [NeMo Guardrails LangGraph integration](https://docs.nvidia.com/nemo/guardrails/latest/integration/langchain/langgraph-integration.html)
- [Add Security Guardrails to LangChain in 5 Minutes](https://dev.to/thebotclub/add-security-guardrails-to-langchain-in-5-minutes-m74)

---

## 2. OpenAI Agents SDK

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `@input_guardrail` | Decorator | Before first agent processes user input |
| `@output_guardrail` | Decorator | After final agent produces output |
| Tool-level guardrails | Per-tool | Before/after each function-tool invocation |

### Key API Surface

```python
from agents import (
    Agent,
    GuardrailFunctionOutput,
    InputGuardrailTripwireTriggered,
    RunContextWrapper,
    Runner,
    input_guardrail,
    output_guardrail,
)
```

### Recommended Pattern: Input Guardrail + Tool Wrapper

The SDK's guardrails are oriented around input/output screening, not individual tool calls. For per-tool-call authorization, wrap each tool function:

```python
from agents import Agent, input_guardrail, GuardrailFunctionOutput, RunContextWrapper
from authensor import AuthensorClient, classify_tool_call

client = AuthensorClient(url="http://localhost:3000", token="...")

# --- Per-tool-call authorization via tool wrapper ---
def authensor_tool_guard(tool_fn, action_type: str):
    """Decorator that gates a tool function through Authensor."""
    async def guarded(*args, **kwargs):
        envelope = classify_tool_call(
            tool_name=tool_fn.__name__,
            tool_args=kwargs,
            principal_id="openai-agent",
            action_type_override=action_type,
        )
        receipt = client.evaluate(envelope)
        if receipt.decision.outcome == "deny":
            return f"BLOCKED: {receipt.decision.reason} (receipt: {receipt.id})"
        if receipt.decision.outcome == "require_approval":
            return f"APPROVAL REQUIRED: {receipt.approval_url}"
        return await tool_fn(*args, **kwargs)
    guarded.__name__ = tool_fn.__name__
    guarded.__doc__ = tool_fn.__doc__
    return guarded

# --- Input guardrail for prompt injection / abuse detection ---
@input_guardrail
async def authensor_input_guard(
    ctx: RunContextWrapper[None],
    agent: Agent,
    input: str | list,
) -> GuardrailFunctionOutput:
    envelope = classify_tool_call(
        tool_name="user_input",
        tool_args={"content": str(input)[:500]},
        principal_id="openai-agent",
        action_type_override="input.user_message",
    )
    receipt = client.evaluate(envelope)
    return GuardrailFunctionOutput(
        output_info=receipt.decision,
        tripwire_triggered=(receipt.decision.outcome == "deny"),
    )

agent = Agent(
    name="My Agent",
    instructions="...",
    tools=[authensor_tool_guard(send_email, "communication.email")],
    input_guardrails=[authensor_input_guard],
)
```

### Adapter Requirements

- **Package:** `authensor-openai-agents` (Python)
- **Exports:** `authensor_tool_guard` decorator, `authensor_input_guard`, `authensor_output_guard`
- **Dependencies:** `openai-agents >= 0.2`, `authensor-sdk-py`
- **Key consideration:** The SDK's `InputGuardrailTripwireTriggered` exception halts execution immediately -- map Authensor `deny` to `tripwire_triggered=True`

### Sources

- [OpenAI Agents SDK Guardrails](https://openai.github.io/openai-agents-python/guardrails/)
- [Hands-On with Agents SDK Guardrails](https://towardsdatascience.com/hands-on-with-agents-sdk-safeguarding-input-and-output-with-guardrails/)
- [OpenAI Agents SDK guardrails docs](https://github.com/openai/openai-agents-python/blob/main/docs/guardrails.md)

---

## 3. CrewAI

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `Task(guardrail=fn)` | Task parameter | After agent completes a task, before passing output |
| `Task(guardrails=[fn1, fn2])` | Task parameter (plural) | Sequential validation chain |
| `@task` decorator with `guardrail` | Decorator param | Same as above, decorator syntax |

### Key API Surface

```python
# Guardrail function signature:
def my_guardrail(result: TaskOutput) -> Tuple[bool, Any]:
    # Return (True, validated_output) to pass
    # Return (False, "error message") to retry/fail
```

### Recommended Pattern: Task Guardrail + Tool Interception

CrewAI guardrails operate at the task output level, not the tool call level. For pre-tool-call authorization, you need a custom tool wrapper:

```python
from crewai import Agent, Task, Crew, TaskOutput
from crewai.tools import BaseTool
from typing import Tuple, Any
from authensor import AuthensorClient, classify_tool_call

client = AuthensorClient(url="http://localhost:3000", token="...")

# --- Tool-level: Wrap BaseTool ---
class AuthensorGatedTool(BaseTool):
    """Wraps any CrewAI tool with Authensor policy enforcement."""
    name: str = "gated_tool"
    description: str = ""
    inner_tool: BaseTool
    action_type: str

    def _run(self, **kwargs) -> str:
        envelope = classify_tool_call(
            tool_name=self.inner_tool.name,
            tool_args=kwargs,
            principal_id="crewai-agent",
            action_type_override=self.action_type,
        )
        receipt = client.evaluate(envelope)
        if receipt.decision.outcome == "deny":
            return f"BLOCKED: {receipt.decision.reason}"
        if receipt.decision.outcome == "require_approval":
            return f"APPROVAL REQUIRED: {receipt.approval_url}"
        return self.inner_tool._run(**kwargs)

# --- Task-level: Guardrail function ---
def authensor_output_guardrail(result: TaskOutput) -> Tuple[bool, Any]:
    """Validate task output against Authensor content policies."""
    envelope = classify_tool_call(
        tool_name="task_output",
        tool_args={"content": result.raw[:1000]},
        principal_id="crewai-agent",
        action_type_override="output.task_result",
    )
    receipt = client.evaluate(envelope)
    if receipt.decision.outcome == "deny":
        return (False, f"Output blocked by policy: {receipt.decision.reason}")
    return (True, result.raw)

task = Task(
    description="Research competitors",
    agent=researcher,
    guardrail=authensor_output_guardrail,
)
```

### Adapter Requirements

- **Package:** `authensor-crewai` (Python)
- **Exports:** `AuthensorGatedTool`, `authensor_output_guardrail`, `gate_all_tools(agent)`
- **Dependencies:** `crewai >= 0.80`, `authensor-sdk-py`
- **Key limitation:** CrewAI has no native pre-tool-call hook. The `AuthensorGatedTool` wrapper is the only way to intercept before execution. The `guardrail=` param on Task only validates *after* the task completes.

### Sources

- [CrewAI Tasks documentation](https://docs.crewai.com/en/concepts/tasks)
- [Task guardrails quickstart](https://github.com/crewAIInc/crewAI-quickstarts/blob/main/Guardrails/task_guardrails.ipynb)
- [How to Implement Guardrails for Your AI Agents with CrewAI](https://towardsdatascience.com/how-to-implement-guardrails-for-your-ai-agents-with-crewai-80b8cb55fa43/)
- [CrewAI Guardrails guide](https://www.analyticsvidhya.com/blog/2025/11/introduction-to-task-guardrails-in-crewai/)

---

## 4. AutoGen (Microsoft Agent Framework)

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `InterventionHandler` | Class | Before any message is delivered to an agent |
| `DropToolCallMessage` | Return type | Silently drops a tool call |
| `FunctionCallMiddleware` | Middleware | Wraps tool invocation pipeline |

### Key API Surface

```python
from autogen_core import (
    DefaultInterventionHandler,
    DropMessage,
)
```

### Recommended Pattern: InterventionHandler

AutoGen's `InterventionHandler` intercepts messages between agents, including tool call messages. Return `DropMessage` to block:

```python
from autogen_core import DefaultInterventionHandler, DropMessage
from autogen_agentchat.messages import ToolCallRequestEvent
from authensor import AuthensorClient, classify_tool_call

client = AuthensorClient(url="http://localhost:3000", token="...")

class AuthensorInterventionHandler(DefaultInterventionHandler):
    """Intercepts tool calls and evaluates them against Authensor policies."""

    async def on_send(self, message, *, sender, recipient, **kwargs):
        # Only intercept tool call messages
        if not isinstance(message, ToolCallRequestEvent):
            return message

        for tool_call in message.content:
            envelope = classify_tool_call(
                tool_name=tool_call.name,
                tool_args=tool_call.arguments,
                principal_id=f"autogen-{sender}",
            )
            receipt = client.evaluate(envelope)

            if receipt.decision.outcome == "deny":
                # Drop the tool call entirely
                return DropMessage

            if receipt.decision.outcome == "require_approval":
                # Could implement approval flow here
                approved = await self._wait_for_approval(receipt)
                if not approved:
                    return DropMessage

        return message  # Allow

    async def on_response(self, message, *, sender, recipient, **kwargs):
        # Post-tool validation if needed
        return message

# Register with the runtime
runtime = SingleThreadedAgentRuntime(
    intervention_handlers=[AuthensorInterventionHandler()]
)
```

### Adapter Requirements

- **Package:** `authensor-autogen` (Python)
- **Exports:** `AuthensorInterventionHandler`, `AuthensorFunctionCallMiddleware`
- **Dependencies:** `autogen-core >= 0.4`, `autogen-agentchat >= 0.4`, `authensor-sdk-py`
- **Key consideration:** AutoGen 0.4 merged with Semantic Kernel into the Microsoft Agent Framework. The `InterventionHandler` is the primary pre-execution hook. `DropMessage` blocks the tool call without an error -- the agent simply never receives it. For better UX, inject a denial message instead.

### Sources

- [AutoGen Tool Use with Intervention Handler](https://microsoft.github.io/autogen/stable//user-guide/core-user-guide/cookbook/tool-use-with-intervention.html)
- [AutoGen GitHub](https://github.com/microsoft/autogen)
- [Microsoft Agent Framework overview](https://learn.microsoft.com/en-us/agent-framework/overview/)

---

## 5. Claude Agent SDK (Anthropic)

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `PreToolUse` | Hook event | After Claude creates tool params, before tool executes |
| `PostToolUse` | Hook event | After tool returns result |
| `PreSubagent` / `PostSubagent` | Hook event | Before/after subagent invocation |
| `SessionStart` / `SessionStop` | Hook event | Session lifecycle |

### Key API Surface

**Decision responses from PreToolUse hooks:**
- `permissionDecision: "allow"` -- tool executes
- `permissionDecision: "deny"` -- tool blocked, agent told reason
- `permissionDecision: "ask"` -- prompt user for confirmation

**Hook receives (stdin JSON):**
```json
{
  "tool_name": "Bash",
  "tool_input": { "command": "git push origin main" },
  "tool_use_id": "toolu_abc123"
}
```

**Hook returns (stdout JSON):**
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "Denied by Authensor policy"
  }
}
```

### Recommended Pattern: This is SafeClaw

SafeClaw is already the Authensor adapter for Claude Agent SDK. The integration is documented in `/docs/integrations/claude-code.md`. The core flow:

```
PreToolUse hook fires
  -> classifier.js maps tool_name to action.type
  -> safe reads (Read, Glob, Grep) -> allow locally, skip network
  -> everything else -> POST /evaluate to Authensor
  -> map Authensor decision to permissionDecision
```

**SDK (programmatic) integration:**

```python
# Python SDK
from claude_agent_sdk import Agent, PreToolUseHook

class AuthensorHook(PreToolUseHook):
    async def on_pre_tool_use(self, tool_name, tool_input, tool_use_id, context):
        envelope = classify_tool_call(tool_name, tool_input)
        receipt = await self.client.evaluate(envelope)
        if receipt.decision.outcome == "deny":
            return {"decision": "deny", "reason": receipt.decision.reason}
        if receipt.decision.outcome == "require_approval":
            return {"decision": "deny", "reason": f"Approval required: {receipt.approval_url}"}
        return {"decision": "allow"}

agent = Agent(hooks=[AuthensorHook(client)])
```

**JSON config (hooks.json):**

```json
{
  "hooks": {
    "PreToolUse": [{
      "type": "command",
      "command": "~/.claude/hooks/authensor-gate.sh"
    }],
    "PostToolUse": [{
      "type": "command",
      "command": "~/.claude/hooks/authensor-audit.sh",
      "matcher": { "tool_name": "*" }
    }]
  }
}
```

### Adapter Requirements

- **Package:** `@authensor/safeclaw` (TypeScript/Node), or `~/.claude/hooks/authensor-gate.sh` (shell)
- **Exports:** CLI (`safeclaw run`, `safeclaw init`), hook scripts, gateway module
- **Dependencies:** Node.js 18+, `@authensor/sdk-ts`, `@authensor/engine`
- **Key advantage:** Deterministic enforcement. Hooks are framework guarantees, not prompt-based. The LLM cannot bypass them.

### Sources

- [Claude Agent SDK hooks docs](https://platform.claude.com/docs/en/agent-sdk/hooks)
- [Claude Code hooks guide](https://code.claude.com/docs/en/hooks-guide)
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks)
- [Building Guardrails for AI Coding Assistants](https://dev.to/mikelane/building-guardrails-for-ai-coding-assistants-a-pretooluse-hook-system-for-claude-code-ilj)

---

## 6. Google ADK (Agent Developer Kit)

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `before_tool_callback` | Agent param | Before any tool executes |
| `after_tool_callback` | Agent param | After tool returns result |
| `before_model_callback` | Agent param | Before LLM inference |
| `after_model_callback` | Agent param | After LLM returns |
| ADK Plugins | Plugin class | Modular lifecycle hooks |

### Key API Surface

```python
# Callback signature:
def before_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
) -> Optional[dict]:
    # Return None to allow tool execution
    # Return a dict to short-circuit with a canned response
```

### Recommended Pattern: before_tool_callback

Google ADK provides the cleanest pre-tool-call hook of any framework:

```python
from google.adk import Agent
from google.adk.tools import BaseTool, ToolContext
from authensor import AuthensorClient, classify_tool_call
from typing import Optional

client = AuthensorClient(url="http://localhost:3000", token="...")

def authensor_before_tool(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
) -> Optional[dict]:
    """ADK before_tool_callback that gates every tool through Authensor."""
    envelope = classify_tool_call(
        tool_name=tool.name,
        tool_args=args,
        principal_id=f"adk-agent-{tool_context.agent_name}",
    )
    receipt = client.evaluate(envelope)

    if receipt.decision.outcome == "deny":
        # Return a dict to short-circuit -- tool never executes
        return {
            "status": "blocked",
            "reason": receipt.decision.reason,
            "receipt_id": receipt.id,
        }

    if receipt.decision.outcome == "require_approval":
        return {
            "status": "pending_approval",
            "approval_url": receipt.approval_url,
            "receipt_id": receipt.id,
        }

    return None  # Allow -- tool executes normally

def authensor_after_tool(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    result: dict,
) -> Optional[dict]:
    """Post-tool audit logging."""
    client.log_result(
        tool_name=tool.name,
        args=args,
        result_summary=str(result)[:500],
    )
    return None  # Don't modify result

agent = Agent(
    name="my_agent",
    model="gemini-2.0-flash",
    tools=[search_tool, email_tool],
    before_tool_callback=authensor_before_tool,
    after_tool_callback=authensor_after_tool,
)
```

### Plugin Pattern (recommended for modularity)

```python
from google.adk.plugins import BasePlugin

class AuthensorPlugin(BasePlugin):
    """ADK Plugin that enforces Authensor policies on all tool calls."""

    def __init__(self, client: AuthensorClient):
        self.client = client

    def before_tool(self, tool, args, tool_context):
        # Same logic as callback above
        ...

    def after_tool(self, tool, args, tool_context, result):
        # Audit logging
        ...
```

### Adapter Requirements

- **Package:** `authensor-google-adk` (Python)
- **Exports:** `authensor_before_tool`, `authensor_after_tool`, `AuthensorPlugin`
- **Dependencies:** `google-adk >= 1.0`, `authensor-sdk-py`
- **Key advantage:** `before_tool_callback` returning a dict short-circuits execution cleanly. The agent receives the dict as the tool's response, so it can react to denials gracefully. The Plugin pattern is preferred for production.

### Sources

- [ADK Safety and Security](https://google.github.io/adk-docs/safety/)
- [ADK Callbacks documentation](https://google.github.io/adk-docs/callbacks/)
- [ADK Callback types](https://google.github.io/adk-docs/callbacks/types-of-callbacks/)
- [Tutorial: Callbacks and Guardrails](https://raphaelmansuy.github.io/adk_training/docs/callbacks_guardrails/)
- [ADK Plugins](https://google.github.io/adk-docs/plugins/)

---

## 7. Amazon Bedrock Agents

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `CreateGuardrail` API | REST API | Creates a guardrail configuration |
| `ApplyGuardrail` API | REST API | Evaluates content against a guardrail (standalone) |
| `GuardrailConfiguration` on `CreateAgent` | Agent config | Associates guardrail with agent |
| Action group Lambda | Lambda function | Executes tool logic (interceptable) |

### Key API Surface

```python
import boto3

bedrock = boto3.client("bedrock")
bedrock_runtime = boto3.client("bedrock-runtime")

# Create a guardrail
bedrock.create_guardrail(
    name="authensor-policy",
    contentPolicyConfig={...},
    topicPolicyConfig={...},
    wordPolicyConfig={...},
    sensitiveInformationPolicyConfig={...},
)

# Apply guardrail standalone
bedrock_runtime.apply_guardrail(
    guardrailIdentifier="gr-abc123",
    guardrailVersion="DRAFT",
    source="INPUT",  # or "OUTPUT"
    content=[{"text": {"text": "user message"}}],
)

# Associate with agent
bedrock.create_agent(
    agentName="my-agent",
    guardrailConfiguration={
        "guardrailIdentifier": "gr-abc123",
        "guardrailVersion": "1",
    },
)
```

### Recommended Pattern: Action Group Lambda + ApplyGuardrail

Bedrock's guardrails are content-level (filtering harmful text, PII, topics). For tool-level authorization (Authensor's domain), intercept at the Action Group Lambda:

```python
import json
import requests

AUTHENSOR_URL = "https://your-authensor.up.railway.app"
AUTHENSOR_TOKEN = "authensor_..."

def lambda_handler(event, context):
    """Bedrock Agent Action Group Lambda with Authensor gate."""
    action_group = event.get("actionGroup")
    api_path = event.get("apiPath")
    parameters = event.get("parameters", [])
    http_method = event.get("httpMethod")

    # --- Authensor gate ---
    envelope = {
        "action": {
            "type": f"bedrock.{action_group}.{api_path}",
            "resource": api_path,
            "operation": http_method.lower(),
            "parameters": {p["name"]: p["value"] for p in parameters},
        },
        "principal": {
            "type": "agent",
            "id": f"bedrock-{event.get('agent', {}).get('alias', 'unknown')}",
        },
        "context": {
            "environment": "production",
            "sessionId": event.get("sessionId"),
        },
    }

    try:
        resp = requests.post(
            f"{AUTHENSOR_URL}/evaluate",
            json=envelope,
            headers={"Authorization": f"Bearer {AUTHENSOR_TOKEN}"},
            timeout=10,
        )
        decision = resp.json().get("decision", {}).get("outcome", "deny")
    except Exception:
        decision = "deny"  # Fail closed

    if decision == "deny":
        return {
            "messageVersion": "1.0",
            "response": {
                "actionGroup": action_group,
                "apiPath": api_path,
                "httpMethod": http_method,
                "httpStatusCode": 403,
                "responseBody": {
                    "application/json": {
                        "body": json.dumps({"error": "Blocked by Authensor policy"})
                    }
                },
            },
        }

    # --- Tool logic proceeds here ---
    result = execute_tool(action_group, api_path, parameters)
    return format_response(action_group, api_path, http_method, result)
```

### Hybrid: Bedrock Guardrails + Authensor

Use Bedrock's built-in guardrails for content filtering (PII, toxicity) and Authensor for tool authorization. They are complementary:

| Layer | Responsibility |
|-------|---------------|
| Bedrock Guardrails (`ContentPolicyConfig`) | Block harmful/toxic content |
| Bedrock Guardrails (`SensitiveInformationPolicyConfig`) | Detect/redact PII |
| Authensor (Action Group Lambda) | Authorize tool execution against policies |

### Adapter Requirements

- **Package:** `authensor-bedrock` (Python Lambda layer)
- **Exports:** `authensor_action_group_handler` decorator, `AuthensorBedrockMiddleware`
- **Dependencies:** `requests`, `authensor-sdk-py` (vendored or Lambda layer)
- **Key consideration:** Bedrock Agents' guardrails are oriented toward content safety, not tool authorization. Authensor fills the tool authorization gap. The integration point is the Action Group Lambda, where every tool call is a Lambda invocation.

### Sources

- [Amazon Bedrock Guardrails](https://aws.amazon.com/bedrock/guardrails/)
- [Associate guardrails with agents](https://docs.aws.amazon.com/bedrock/latest/userguide/agents-guardrail.html)
- [ApplyGuardrail API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ApplyGuardrail.html)
- [CreateGuardrail API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_CreateGuardrail.html)
- [Building AI Agents in AWS](https://interworks.com/blog/2026/03/06/building-ai-agents-in-aws-a-hands-on-amazon-bedrock-walkthrough/)

---

## 8. Semantic Kernel (Microsoft)

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `IFunctionInvocationFilter` | Interface (C#) | Every time a KernelFunction is invoked |
| `IAutoFunctionInvocationFilter` | Interface (C#) | During auto-function-calling (richer context) |
| `IPromptRenderFilter` | Interface (C#) | Before prompt is sent to LLM |
| `@kernel.filter(FilterTypes.FUNCTION_INVOCATION)` | Decorator (Python) | Python equivalent of IFunctionInvocationFilter |
| `@kernel.filter(FilterTypes.AUTO_FUNCTION_INVOCATION)` | Decorator (Python) | Python equivalent of IAutoFunctionInvocationFilter |

### Key API Surface

**C#:**
```csharp
public class AuthensorFilter : IAutoFunctionInvocationFilter
{
    public async Task OnAutoFunctionInvocationAsync(
        AutoFunctionInvocationContext context,
        Func<AutoFunctionInvocationContext, Task> next)
    {
        // context.Function.Name -- tool name
        // context.Function.PluginName -- plugin name
        // context.Arguments -- tool arguments
        // context.ChatHistory -- full conversation
        // context.RequestSequenceIndex -- which turn
        // context.FunctionSequenceIndex -- which function in this turn
        // context.FunctionCount -- total functions to call this turn

        // Call next(context) to allow, or set context.Result and return to block
    }
}
```

**Python:**
```python
@kernel.filter(filter_type=FilterTypes.AUTO_FUNCTION_INVOCATION)
async def authensor_filter(context, next):
    # context.function.name, context.function.plugin_name
    # context.arguments
    pass
```

### Recommended Pattern: AutoFunctionInvocationFilter

```csharp
// C# -- primary Semantic Kernel language
public class AuthensorFilter : IAutoFunctionInvocationFilter
{
    private readonly AuthensorClient _client;

    public AuthensorFilter(AuthensorClient client)
    {
        _client = client;
    }

    public async Task OnAutoFunctionInvocationAsync(
        AutoFunctionInvocationContext context,
        Func<AutoFunctionInvocationContext, Task> next)
    {
        var envelope = new ActionEnvelope
        {
            Action = new ActionDetail
            {
                Type = $"{context.Function.PluginName}.{context.Function.Name}",
                Resource = context.Function.Name,
                Parameters = context.Arguments.ToDictionary(),
            },
            Principal = new Principal
            {
                Type = "agent",
                Id = $"semantic-kernel-{context.Function.PluginName}",
            },
        };

        var receipt = await _client.EvaluateAsync(envelope);

        switch (receipt.Decision.Outcome)
        {
            case "deny":
                // Block execution, return denial to agent
                context.Result = new FunctionResult(
                    context.Function,
                    $"BLOCKED by Authensor: {receipt.Decision.Reason}");
                return; // Don't call next()

            case "require_approval":
                context.Result = new FunctionResult(
                    context.Function,
                    $"APPROVAL REQUIRED: {receipt.ApprovalUrl}");
                return;

            default:
                await next(context); // Allow
                break;
        }
    }
}

// Registration
builder.Services.AddSingleton<IAutoFunctionInvocationFilter>(
    new AuthensorFilter(authensorClient));
```

```python
# Python equivalent
@kernel.filter(filter_type=FilterTypes.AUTO_FUNCTION_INVOCATION)
async def authensor_filter(context: AutoFunctionInvocationContext, next):
    envelope = classify_tool_call(
        tool_name=f"{context.function.plugin_name}.{context.function.name}",
        tool_args=dict(context.arguments),
        principal_id="semantic-kernel-agent",
    )
    receipt = client.evaluate(envelope)

    if receipt.decision.outcome == "deny":
        context.result = FunctionResult(
            function=context.function,
            value=f"BLOCKED: {receipt.decision.reason}",
        )
        return  # Don't call next

    if receipt.decision.outcome == "require_approval":
        context.result = FunctionResult(
            function=context.function,
            value=f"APPROVAL REQUIRED: {receipt.approval_url}",
        )
        return

    await next(context)
```

### Adapter Requirements

- **Package:** `Authensor.SemanticKernel` (NuGet, C#) and `authensor-semantic-kernel` (PyPI, Python)
- **Exports:** `AuthensorFilter` (IAutoFunctionInvocationFilter), `AuthensorPromptFilter`
- **Dependencies:** `Microsoft.SemanticKernel >= 1.30`, `Authensor.Sdk`
- **Key advantage:** `IAutoFunctionInvocationFilter` provides the richest context of any framework -- you get chat history, the full list of functions to be called this turn, sequence indices. This enables policies like "block if this is the 3rd tool call in a single turn."

### Sources

- [Semantic Kernel Filters](https://learn.microsoft.com/en-us/semantic-kernel/concepts/enterprise-readiness/filters)
- [AutoFunctionInvocationFiltering sample](https://github.com/microsoft/semantic-kernel/blob/main/dotnet/samples/Concepts/Filtering/AutoFunctionInvocationFiltering.cs)
- [Using Filters in Semantic Kernel blog](https://devblogs.microsoft.com/semantic-kernel/filters-in-semantic-kernel/)
- [IFunctionInvocationFilter API reference](https://learn.microsoft.com/en-us/dotnet/api/microsoft.semantickernel.ifunctioninvocationfilter)

---

## 9. Haystack (deepset)

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `ToolInvoker` component | Pipeline component | Executes tool calls from LLM |
| `ConditionalRouter` | Pipeline component | Routes messages based on classification |
| `Agent(break_point=)` | Agent param | Pauses execution at specified points |
| Custom `@component` | Decorator | Any custom component in the pipeline |

### Key API Surface

Haystack uses a pipeline-based architecture. There is no single "before_tool" hook. Instead, you insert a custom component before the `ToolInvoker`:

```python
from haystack import component, Pipeline
from haystack.components.tools import ToolInvoker
from haystack.dataclasses import ChatMessage
```

### Recommended Pattern: Custom Guard Component Before ToolInvoker

```python
from haystack import component
from haystack.dataclasses import ChatMessage
from typing import List, Optional
from authensor import AuthensorClient, classify_tool_call

client = AuthensorClient(url="http://localhost:3000", token="...")

@component
class AuthensorToolGuard:
    """Haystack component that gates tool calls through Authensor policies.
    Insert between the ChatGenerator and ToolInvoker in your pipeline."""

    @component.output_types(
        approved=List[ChatMessage],
        denied=List[ChatMessage],
    )
    def run(self, messages: List[ChatMessage]):
        approved = []
        denied = []

        for msg in messages:
            if not msg.tool_calls:
                approved.append(msg)
                continue

            blocked_calls = []
            allowed_calls = []

            for tool_call in msg.tool_calls:
                envelope = classify_tool_call(
                    tool_name=tool_call.tool_name,
                    tool_args=tool_call.arguments,
                    principal_id="haystack-agent",
                )
                receipt = client.evaluate(envelope)

                if receipt.decision.outcome in ("deny", "require_approval"):
                    blocked_calls.append(tool_call)
                    denied.append(ChatMessage.from_tool(
                        tool_name=tool_call.tool_name,
                        tool_result=f"BLOCKED: {receipt.decision.reason}",
                        origin=tool_call,
                    ))
                else:
                    allowed_calls.append(tool_call)

            if allowed_calls:
                # Create new message with only allowed tool calls
                approved_msg = ChatMessage.from_assistant(
                    text=msg.text,
                    tool_calls=allowed_calls,
                )
                approved.append(approved_msg)

        return {"approved": approved, "denied": denied}

# Pipeline wiring
pipe = Pipeline()
pipe.add_component("llm", chat_generator)
pipe.add_component("authensor_guard", AuthensorToolGuard())
pipe.add_component("tool_invoker", ToolInvoker(tools=tools))
pipe.add_component("router", ConditionalRouter(...))

pipe.connect("llm.replies", "authensor_guard.messages")
pipe.connect("authensor_guard.approved", "tool_invoker.messages")
pipe.connect("authensor_guard.denied", "router.denied_messages")
```

### Adapter Requirements

- **Package:** `authensor-haystack` (Python)
- **Exports:** `AuthensorToolGuard` component, `AuthensorContentGuard` component
- **Dependencies:** `haystack-ai >= 2.8`, `authensor-sdk-py`
- **Key consideration:** Haystack has no built-in pre-tool hook. The architecture is pipeline components connected by edges. You must insert an `AuthensorToolGuard` component between the LLM and the `ToolInvoker`. This requires modifying the pipeline topology. For Agent-based flows (new in Haystack 2.8+), breakpoints can pause but not evaluate policies.

### Sources

- [Haystack AI Guardrails cookbook](https://haystack.deepset.ai/cookbook/safety_moderation_open_lms)
- [Haystack Agents documentation](https://docs.haystack.deepset.ai/docs/agents)
- [ToolInvoker documentation](https://docs.haystack.deepset.ai/docs/toolinvoker)
- [Breakpoint on Agent in a Pipeline](https://haystack.deepset.ai/cookbook/agent-breakpoints)

---

## 10. Mastra

### Integration Points

| Hook | Type | When it fires |
|------|------|---------------|
| `inputProcessors` | Agent config array | Before LLM sees user message |
| `outputProcessors` | Agent config array (deprecated name: guardrails) | Before response reaches user |
| `processOutputStep` | Processor method | After every step in the agentic loop (including before tool execution) |
| `Processor` interface | Class | Implements `processInput` and/or `processOutputStep` |

### Key API Surface

```typescript
import type { Processor } from '@mastra/core';

interface Processor {
  id: string;
  processInput?(params: {
    userMessage: string;
    messages: Message[];
    abort: (reason: string, opts?: { retry?: boolean }) => void;
  }): Promise<{ userMessage: string; messages: Message[] }>;

  processOutputStep?(params: {
    text: string;
    toolCalls: ToolCall[];
    abort: (reason: string, opts?: { retry?: boolean; metadata?: any }) => void;
    retryCount: number;
  }): Promise<ToolCall[]>;
}
```

### Recommended Pattern: Processor with processOutputStep

The `processOutputStep` method fires after every LLM step, including before tool execution. This is where Authensor gates tool calls:

```typescript
import type { Processor, ToolCall } from '@mastra/core';
import { AuthensorClient, classifyToolCall } from '@authensor/sdk-ts';

const client = new AuthensorClient({
  url: 'http://localhost:3000',
  token: '...',
});

export class AuthensorProcessor implements Processor {
  id = 'authensor-policy-gate';

  async processInput({ userMessage, messages, abort }) {
    // Optional: screen user input against content policies
    const envelope = classifyToolCall({
      toolName: 'user_input',
      toolArgs: { content: userMessage.slice(0, 500) },
      principalId: 'mastra-agent',
      actionTypeOverride: 'input.user_message',
    });
    const receipt = await client.evaluate(envelope);
    if (receipt.decision.outcome === 'deny') {
      abort(`Input blocked by policy: ${receipt.decision.reason}`);
    }
    return { userMessage, messages };
  }

  async processOutputStep({ text, toolCalls, abort, retryCount }) {
    if (!toolCalls || toolCalls.length === 0) {
      return toolCalls;
    }

    const approvedCalls: ToolCall[] = [];

    for (const toolCall of toolCalls) {
      const envelope = classifyToolCall({
        toolName: toolCall.name,
        toolArgs: toolCall.arguments,
        principalId: 'mastra-agent',
      });
      const receipt = await client.evaluate(envelope);

      if (receipt.decision.outcome === 'deny') {
        abort(`Tool "${toolCall.name}" blocked: ${receipt.decision.reason}`, {
          retry: false,
        });
        return [];
      }

      if (receipt.decision.outcome === 'require_approval') {
        abort(`Approval required for "${toolCall.name}": ${receipt.approvalUrl}`, {
          retry: true,
          metadata: { receiptId: receipt.id, approvalUrl: receipt.approvalUrl },
        });
        return [];
      }

      approvedCalls.push(toolCall);
    }

    return approvedCalls;
  }
}

// Usage
import { Agent } from '@mastra/core';
import { openai } from '@ai-sdk/openai';

const agent = new Agent({
  name: 'secure-agent',
  instructions: 'You are a helpful assistant.',
  model: openai('gpt-4o'),
  inputProcessors: [new AuthensorProcessor()],
  // processOutputStep runs via the same processor
});
```

### Adapter Requirements

- **Package:** `@authensor/mastra` (TypeScript/npm)
- **Exports:** `AuthensorProcessor`, `AuthensorInputProcessor`, `AuthensorOutputProcessor`
- **Dependencies:** `@mastra/core >= 0.8`, `@authensor/sdk-ts`
- **Key advantage:** Mastra's `processOutputStep` fires on every agentic loop iteration, including tool calls. The `abort()` function with `retry: true` and metadata enables the LLM to self-correct. Tripwires with retry support mean the agent gets feedback about *why* it was blocked and can try a different approach.

### Sources

- [Mastra Guardrails docs](https://mastra.ai/en/docs/agents/guardrails)
- [Mastra Processor Interface reference](https://mastra.ai/reference/processors/processor-interface)
- [Building low-latency guardrails](https://mastra.ai/blog/building-fast-reliable-input-processors)
- [Guardrails and beyond: Control the agent loop with processors](https://mastra.ai/workshops/implement-processors-in-mastra)
- [Mastra changelog 2026-01-20](https://mastra.ai/blog/changelog-2026-01-20)

---

## Comparison Matrix

| Framework | Pre-tool hook | Can block? | Receives args? | Return denial msg to agent? | Language | Effort |
|-----------|--------------|------------|----------------|---------------------------|----------|--------|
| **LangGraph** | Graph node + conditional edge | Yes | Yes | Yes (ToolMessage) | Python | Medium |
| **OpenAI Agents SDK** | Tool wrapper / `@input_guardrail` | Yes | Yes (wrapper) / No (guardrail) | Yes | Python | Medium |
| **CrewAI** | Tool wrapper (no native hook) | Yes | Yes | Yes (string return) | Python | Medium |
| **AutoGen** | `InterventionHandler.on_send` | Yes (DropMessage) | Yes | Needs injection | Python | Medium |
| **Claude Agent SDK** | `PreToolUse` hook | Yes | Yes | Yes (permissionDecision) | TS/Shell | Low (done) |
| **Google ADK** | `before_tool_callback` | Yes (return dict) | Yes | Yes (dict is response) | Python | Low |
| **Bedrock Agents** | Action Group Lambda | Yes (403) | Yes | Yes (response body) | Python | Medium |
| **Semantic Kernel** | `IAutoFunctionInvocationFilter` | Yes (set result) | Yes | Yes (FunctionResult) | C#/Python | Low |
| **Haystack** | Custom component before ToolInvoker | Yes | Yes | Yes (ChatMessage) | Python | High |
| **Mastra** | `processOutputStep` | Yes (abort) | Yes (toolCalls) | Yes (abort with retry) | TypeScript | Low |

### Priority Ranking for Authensor Adapter Development

1. **Claude Agent SDK** -- Already built (SafeClaw). Maintain and evolve.
2. **Google ADK** -- Cleanest hook API, growing ecosystem. Build next.
3. **Mastra** -- TypeScript-native, `processOutputStep` is a perfect fit. Build alongside ADK.
4. **Semantic Kernel** -- Enterprise market, rich context. C# adapter opens Microsoft ecosystem.
5. **LangGraph** -- Largest community, graph node pattern is well-understood.
6. **OpenAI Agents SDK** -- Growing adoption, but lacks native per-tool hooks.
7. **AutoGen** -- Merging into Microsoft Agent Framework; target the unified API.
8. **Bedrock Agents** -- AWS enterprises, Lambda layer distribution.
9. **CrewAI** -- Popular for multi-agent, but no native pre-tool hook.
10. **Haystack** -- Pipeline architecture requires topology changes; niche audience.

---

## Shared SDK Requirements

All adapters depend on a shared `classify_tool_call()` function and SDK client. The Python SDK needs:

```python
# authensor-sdk-py

def classify_tool_call(
    tool_name: str,
    tool_args: dict,
    principal_id: str,
    action_type_override: str | None = None,
    environment: str = "development",
) -> ActionEnvelope:
    """Map a framework-agnostic tool call to an Authensor ActionEnvelope."""
    ...

class AuthensorClient:
    def __init__(self, url: str, token: str, fail_closed: bool = True):
        ...

    def evaluate(self, envelope: ActionEnvelope) -> ActionReceipt:
        """POST /evaluate and return the receipt."""
        ...

    async def evaluate_async(self, envelope: ActionEnvelope) -> ActionReceipt:
        """Async variant."""
        ...
```

The TypeScript SDK (`@authensor/sdk-ts`) already provides `createEnvelope()` and the client. The Python SDK should mirror it.
