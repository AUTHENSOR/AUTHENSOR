# Authensor Python SDK

[![PyPI version](https://img.shields.io/pypi/v/authensor.svg)](https://pypi.org/project/authensor/)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Python versions](https://img.shields.io/pypi/pyversions/authensor.svg)](https://pypi.org/project/authensor/)

**The open-source safety stack for AI agents.** Policy enforcement, content scanning, approval workflows, and cryptographic audit trails.

Authensor sits between your agent and the real world, evaluating every action against a policy before execution. If the policy says *deny*, the action never runs. If it says *require approval*, a human is notified and the agent waits. Every decision is recorded as an immutable, hash-chained audit receipt.

[Documentation](https://authensor.com/docs) | [GitHub](https://github.com/authensor/authensor) | [Changelog](https://github.com/authensor/authensor/blob/main/CHANGELOG.md)

## Installation

```bash
pip install authensor
# or
uv add authensor
```

Requires Python 3.10+ and installs `httpx` and `pydantic` v2.

## Quickstart

```python
import asyncio
from authensor import AuthensorClient

async def main():
    async with AuthensorClient(
        base_url="https://cp.authensor.dev",
        api_key="sk-...",
        principal_id="my-agent",
    ) as client:
        from authensor import create_envelope

        envelope = create_envelope(
            action_type="http.request",
            resource="https://api.example.com/data",
            parameters={"method": "GET"},
        )
        receipt = await client.evaluate(envelope)
        print(receipt.decision.outcome)   # "allow"

asyncio.run(main())
```

## Core concepts

| Class | Purpose |
|---|---|
| `AuthensorClient` | Low-level async HTTP client: `evaluate`, `get_receipt`, `approve`, `deny`, `kill_switch` |
| `Authensor` | High-level client that adds `execute()` — gate + run in one call |
| `AuthensorGuard` | Decorator / context manager for wrapping tool functions |
| `create_envelope` | Factory for `ActionEnvelope` objects |

## AuthensorClient

### Async (recommended)

```python
from authensor import AuthensorClient, create_envelope

async with AuthensorClient(base_url="...", api_key="sk-...") as client:

    # Evaluate — check without executing
    envelope = create_envelope("file.write", "/etc/hosts")
    receipt = await client.evaluate(envelope)

    if receipt.decision.outcome == "allow":
        write_file("/etc/hosts", new_content)

    # Fetch a stored receipt
    stored = await client.get_receipt("receipt-uuid")

    # Approve / deny a pending receipt
    await client.approve("receipt-uuid", comment="Looks good")
    await client.deny("receipt-uuid", comment="Not in scope")

    # Emergency kill switch — blocks all subsequent evaluations
    await client.kill_switch()
```

### Sync wrappers

Every async method has a `_sync` twin for frameworks that don't support asyncio:

```python
from authensor import AuthensorClient, create_envelope

with AuthensorClient(base_url="...", api_key="sk-...") as client:
    envelope = create_envelope("db.query", "postgresql://db/users")
    receipt = client.evaluate_sync(envelope)
    stored  = client.get_receipt_sync("receipt-uuid")
    client.approve_sync("receipt-uuid")
    client.deny_sync("receipt-uuid")
    client.kill_switch_sync()
```

## Authensor (execute helper)

```python
from authensor import Authensor, AuthensorDeniedError, AuthensorApprovalRequired

async with Authensor(base_url="...", api_key="sk-...", principal_id="agent-1") as a:
    try:
        result = await a.execute(
            action_type="stripe.charges.create",
            resource="stripe://customers/cus_123/charges",
            executor=lambda: stripe.charges.create(amount=500, currency="usd"),
            constraints={"max_amount": 1000, "currency": "USD"},
        )
        print("Charge created, receipt:", result.receipt_id)

    except AuthensorApprovalRequired as e:
        print(f"Waiting for human approval: {e.receipt_id}")

    except AuthensorDeniedError as e:
        print(f"Blocked by policy: {e.decision.reason}")
```

## AuthensorGuard

`AuthensorGuard` is the most ergonomic way to protect individual tool functions.

### As a decorator

```python
from authensor import AuthensorClient, AuthensorGuard

client = AuthensorClient(base_url="...", api_key="sk-...")
guard  = AuthensorGuard(client, agent_id="research-agent")

@guard
async def fetch_url(url: str) -> str:
    """The guard auto-infers action_type from the function name."""
    async with httpx.AsyncClient() as http:
        return (await http.get(url)).text

# Override action_type and resource explicitly:
@guard(action_type="payments.charge", resource="stripe://charges")
async def charge_customer(amount: int, currency: str) -> dict:
    return await stripe.charges.create(amount=amount, currency=currency)
```

### As a context manager

```python
async with guard.protect("db.delete", "postgresql://db/users"):
    await db.execute("DELETE FROM users WHERE id = ?", user_id)
```

On `deny` → `AuthensorDenied` is raised; the body never runs.
On `require_approval` → `AuthensorApprovalRequired` is raised with a `receipt_id`.

## Framework examples

### CrewAI

```python
from crewai import Agent, Task, Crew
from crewai.tools import tool
from authensor import AuthensorClient, AuthensorGuard, AuthensorDeniedError

client = AuthensorClient(base_url="...", api_key="sk-...")
guard  = AuthensorGuard(client, agent_id="crewai-agent")


@tool("Send email")
@guard
async def send_email(to: str, subject: str, body: str) -> str:
    """Send an email — requires policy approval."""
    result = email_service.send(to=to, subject=subject, body=body)
    return f"Sent to {to}"


@tool("Read document")
@guard
async def read_document(path: str) -> str:
    """Read a document from the filesystem."""
    with open(path) as f:
        return f.read()


researcher = Agent(
    role="Researcher",
    goal="Gather information",
    backstory="...",
    tools=[send_email, read_document],
    verbose=True,
)

task = Task(
    description="Research topic X and email a summary to team@example.com",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
crew.kickoff()
```

### LangChain / LangGraph (Python)

```python
from langchain_core.tools import tool
from langchain_openai import ChatOpenAI
from langchain.agents import AgentExecutor, create_openai_tools_agent
from authensor import AuthensorClient, AuthensorGuard, AuthensorDeniedError, AuthensorApprovalRequired

client = AuthensorClient(base_url="...", api_key="sk-...", principal_id="langchain-agent")
guard  = AuthensorGuard(client, agent_id="langchain-agent")


@tool
@guard
async def web_search(query: str) -> str:
    """Search the web for information."""
    return search_api(query)


@tool
@guard(action_type="file.write", resource="/workspace")
async def write_file(path: str, content: str) -> str:
    """Write content to a file."""
    with open(path, "w") as f:
        f.write(content)
    return f"Written to {path}"


llm = ChatOpenAI(model="gpt-4o")
tools = [web_search, write_file]
agent = create_openai_tools_agent(llm, tools, prompt)
executor = AgentExecutor(agent=agent, tools=tools, verbose=True)

try:
    result = executor.invoke({"input": "Research AI safety and write a report"})
except AuthensorApprovalRequired as e:
    print(f"Action pending human approval: {e.receipt_id}")
except AuthensorDeniedError as e:
    print(f"Action blocked by policy: {e.decision.reason}")
```

### AutoGen

```python
import autogen
from authensor import Authensor, AuthensorGuard, AuthensorApprovalRequired

authensor = Authensor(
    base_url="...",
    api_key="sk-...",
    principal_id="autogen-agent",
)
guard = AuthensorGuard(authensor, agent_id="autogen-agent")

config_list = [{"model": "gpt-4o", "api_key": "..."}]

llm_config = {
    "config_list": config_list,
    "functions": [
        {
            "name": "send_payment",
            "description": "Send a payment via Stripe",
            "parameters": {
                "type": "object",
                "properties": {
                    "amount": {"type": "integer"},
                    "currency": {"type": "string"},
                    "recipient": {"type": "string"},
                },
                "required": ["amount", "currency", "recipient"],
            },
        },
    ],
}


@guard(action_type="payments.send", resource="stripe://charges")
async def send_payment(amount: int, currency: str, recipient: str) -> dict:
    """Guarded payment function — blocked if policy denies."""
    return await stripe.charges.create(amount=amount, currency=currency)


assistant = autogen.AssistantAgent(
    name="assistant",
    llm_config=llm_config,
)
user_proxy = autogen.UserProxyAgent(
    name="user_proxy",
    human_input_mode="NEVER",
    function_map={"send_payment": send_payment},
)

try:
    user_proxy.initiate_chat(
        assistant,
        message="Send $50 USD to alice@example.com",
    )
except AuthensorApprovalRequired as e:
    print(f"Awaiting human approval for receipt {e.receipt_id}")
```

## Models

All models are Pydantic v2 `BaseModel` subclasses generated from the [Authensor JSON Schemas](https://authensor.com/schemas).

```python
from authensor import (
    ActionEnvelope,   # Input to evaluate()
    ActionReceipt,    # Output of evaluate() / get_receipt()
    Decision,         # Embedded in ActionReceipt
    Policy,           # Policy definition
    DecisionOutcome,  # Enum: allow | deny | require_approval | rate_limited
)
```

## Exceptions

| Exception | When raised |
|---|---|
| `AuthensorDeniedError` | Policy decision is `deny` or `rate_limited` |
| `AuthensorApprovalRequired` | Policy decision is `require_approval` — check `exc.receipt_id` |
| `AuthensorTimeoutError` | Control plane request timed out |
| `AuthensorConnectionError` | Could not reach the control plane |
| `AuthensorError` | Base class for all SDK errors |

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `AUTHENSOR_BASE_URL` | — | Control plane URL (alternative to constructor arg) |
| `AUTHENSOR_API_KEY` | — | API key (alternative to constructor arg) |

## Development

```bash
# Install with dev extras
uv sync --extra dev

# Run tests
uv run pytest

# Type check
uv run mypy authensor

# Lint
uv run ruff check authensor

# Regenerate Pydantic models from schemas
uv run authensor-gen
```

## License

MIT
