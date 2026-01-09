"""
Authensor Python Quickstart

This example demonstrates how to use the Authensor Python SDK to:
1. Connect to the control plane
2. Evaluate actions against policies
3. Execute actions with policy enforcement
4. View receipts

Run: uv run main.py
"""

import asyncio
import os
import httpx
from authensor import Authensor, AuthensorDeniedError

CONTROL_PLANE_URL = os.getenv("CONTROL_PLANE_URL", "http://localhost:3000")


async def main():
    print("🚀 Authensor Python Quickstart\n")
    print(f"Control Plane: {CONTROL_PLANE_URL}\n")

    # Initialize the SDK
    async with Authensor(
        control_plane_url=CONTROL_PLANE_URL,
        principal_id="quickstart-agent-py",
        principal_name="Python Quickstart Agent",
    ) as authensor:
        try:
            # Example 1: Check if an action is allowed (without executing)
            print("📋 Example 1: Evaluate an action\n")
            allowed, decision, receipt_id = await authensor.evaluate(
                action_type="http.request",
                resource="https://api.example.com/data",
            )
            print(f"  Allowed: {allowed}")
            print(f"  Decision: {decision.outcome.value}")
            print(f"  Receipt ID: {receipt_id}")
            print()

            # Example 2: Execute an action with policy enforcement
            print("🔧 Example 2: Execute a protected action\n")

            async def fetch_data():
                """This is your actual action - only runs if allowed."""
                async with httpx.AsyncClient() as client:
                    response = await client.get("https://httpbin.org/get")
                    return response.json()

            result = await authensor.execute(
                action_type="http.request",
                resource="https://httpbin.org/get",
                executor=fetch_data,
                operation="read",
                parameters={"method": "GET"},
            )
            print(f"  Receipt ID: {result.receipt_id}")
            print(f"  Decision: {result.decision.outcome.value}")
            print(f"  Result keys: {', '.join(result.result.keys())}")
            print()

            # Example 3: Handle a denied action
            print("🚫 Example 3: Handle denied actions\n")
            print("  (This would fail with restrictive policies)")
            print("  In development mode, the default policy allows all actions.\n")

            # Example 4: List recent receipts
            print("📜 Example 4: List receipts\n")
            receipts = await authensor.list_receipts(limit=5)
            print(f"  Found {len(receipts.get('receipts', []))} receipts")
            print()

            print("✅ Quickstart complete!")
            print(f"\nView your receipts at: {CONTROL_PLANE_URL}/receipts")

        except AuthensorDeniedError as e:
            print(f"❌ Action denied: {e.decision.reason}")
            raise SystemExit(1)
        except Exception as e:
            print(f"❌ Error: {e}")
            raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
