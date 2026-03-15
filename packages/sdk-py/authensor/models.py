"""
SDK models derived from JSON Schemas.

Re-exports the generated Pydantic models plus a few SDK-specific helpers.
"""

from __future__ import annotations

from typing import Any, Generic, Optional, TypeVar

from pydantic import BaseModel

from authensor.generated import ActionEnvelope, ActionReceipt, Decision, Policy
from authensor.generated.outcome import Outcome as DecisionOutcome

T = TypeVar("T")


class ExecuteResult(BaseModel, Generic[T]):
    """
    Result wrapper returned by ``Authensor.execute()``.

    Attributes:
        result: The value returned by the executor callable.
        receipt_id: The audit receipt ID for this execution.
        decision: The policy decision that allowed execution.
    """

    model_config = {"arbitrary_types_allowed": True}

    result: Any
    receipt_id: str
    decision: Decision


__all__ = [
    "ActionEnvelope",
    "ActionReceipt",
    "Decision",
    "DecisionOutcome",
    "ExecuteResult",
    "Policy",
]
