"""
Authensor Python SDK

A Python SDK for integrating Authensor policy enforcement into your agents
and applications.

Quickstart::

    from authensor import AuthensorClient, AuthensorGuard

    client = AuthensorClient(
        base_url="https://cp.authensor.dev",
        api_key="sk-...",
        principal_id="my-agent",
    )
    guard = AuthensorGuard(client, agent_id="my-agent")

    # Decorator style
    @guard
    async def send_payment(amount: int, currency: str) -> dict:
        return await stripe.charges.create(amount=amount, currency=currency)

    # Context manager style
    async with guard.protect("db.write", "postgresql://db/users"):
        await db.execute("INSERT INTO users ...")
"""

from authensor.client import Authensor, AuthensorClient, AuthensorConfig
from authensor.envelope import create_envelope
from authensor.exceptions import (
    AuthensorApprovalRequired,
    AuthensorConnectionError,
    AuthensorDenied,
    AuthensorDeniedError,
    AuthensorError,
    AuthensorTimeoutError,
)
from authensor.guard import AuthensorGuard
from authensor.models import (
    ActionEnvelope,
    ActionReceipt,
    Decision,
    DecisionOutcome,
    ExecuteResult,
    Policy,
)

__version__ = "0.1.0"

__all__ = [
    # Clients
    "AuthensorClient",
    "Authensor",
    "AuthensorConfig",
    # Guard
    "AuthensorGuard",
    # Envelope factory
    "create_envelope",
    # Models
    "ActionEnvelope",
    "ActionReceipt",
    "Decision",
    "DecisionOutcome",
    "ExecuteResult",
    "Policy",
    # Exceptions
    "AuthensorError",
    "AuthensorDeniedError",
    "AuthensorDenied",
    "AuthensorApprovalRequired",
    "AuthensorTimeoutError",
    "AuthensorConnectionError",
]
