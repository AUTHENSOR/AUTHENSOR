"""
SDK models derived from JSON Schemas.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from authensor.generated import ActionEnvelope, ActionReceipt, Decision, Policy
from authensor.generated.outcome import Outcome as DecisionOutcome


class ExecuteResult(BaseModel):
    """Result wrapper for executed actions."""

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
