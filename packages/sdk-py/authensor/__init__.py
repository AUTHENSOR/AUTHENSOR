"""
Authensor Python SDK

A Python SDK for integrating Authensor policy enforcement into your agents
and applications.

Example:
    ```python
    from authensor import Authensor

    authensor = Authensor(
        control_plane_url="http://localhost:3000",
        principal_id="my-agent",
    )

    # Execute an action with policy enforcement
    result = await authensor.execute(
        action_type="stripe.charges.create",
        resource="stripe://customers/cus_123/charges",
        executor=lambda: stripe.charges.create(amount=1000, currency="usd"),
        constraints={"max_amount": 1000, "currency": "USD"},
    )
    ```
"""

from authensor.client import Authensor, AuthensorConfig
from authensor.models import (
    ActionEnvelope,
    ActionReceipt,
    Decision,
    DecisionOutcome,
    ExecuteResult,
    Policy,
)
from authensor.exceptions import AuthensorDeniedError, AuthensorError

__version__ = "0.0.1"

__all__ = [
    "Authensor",
    "AuthensorConfig",
    "ActionEnvelope",
    "ActionReceipt",
    "Decision",
    "DecisionOutcome",
    "Policy",
    "ExecuteResult",
    "AuthensorError",
    "AuthensorDeniedError",
]
