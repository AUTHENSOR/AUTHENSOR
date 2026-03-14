# Python Quickstart

This example demonstrates how to use the Authensor Python SDK.

## Prerequisites

1. Start the Authensor stack:
   ```bash
   # From the root of the repo
   corepack enable
   docker compose up -d
   corepack pnpm dev
   ```

2. The control plane should be running at `http://localhost:3000`

## Setup

```bash
# From this directory
cd examples/python-quickstart

# Create venv and install deps
uv sync

# Or with pip
pip install -e ../../packages/sdk-py
pip install httpx
```

## Run the Example

```bash
# With uv
uv run main.py

# Or with Python directly
python main.py
```

## What This Example Does

1. **Evaluates an action** - Checks if an HTTP request would be allowed
2. **Executes a protected action** - Makes a real HTTP request through Authensor
3. **Shows error handling** - Demonstrates how to handle denied actions
4. **Lists receipts** - Shows recent action receipts

## Key Concepts

- **Envelope**: Describes the action you want to perform
- **Decision**: The policy engine's verdict (allow/deny/require_approval)
- **Receipt**: A permanent record of the action and its outcome

## Using in Your Agent

```python
from authensor import Authensor

async with Authensor(
    control_plane_url="http://localhost:3000",
    principal_id="my-agent",
) as authensor:
    result = await authensor.execute(
        action_type="stripe.charges.create",
        resource="stripe://customers/cus_123/charges",
        executor=create_charge,
        constraints={"max_amount": 10000, "currency": "USD"},
    )
```
