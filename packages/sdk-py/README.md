# Authensor Python SDK

Python SDK for integrating Authensor policy enforcement into your agents and applications.

## Installation

```bash
pip install authensor
# or with uv
uv add authensor
```

## Quick Start

```python
import asyncio
from authensor import Authensor

async def main():
    # Initialize the client
    authensor = Authensor(
        control_plane_url="http://localhost:3000",
        principal_id="my-agent",
    )

    # Execute an action with policy enforcement
    async with authensor:
        result = await authensor.execute(
            action_type="http.request",
            resource="https://api.example.com/data",
            executor=lambda: fetch_data(),  # Your async function
        )

        print(f"Receipt ID: {result.receipt_id}")
        print(f"Result: {result.result}")

asyncio.run(main())
```

## Development

```bash
# Install dependencies
uv sync

# Run tests
uv run pytest

# Generate types from schemas
uv run datamodel-codegen \
    --input ../schemas/src/action-envelope.schema.json \
    --output authensor/generated/envelope.py \
    --output-model-type pydantic_v2.BaseModel
```
