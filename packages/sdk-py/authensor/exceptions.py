"""
Authensor Exceptions

Custom exceptions for the Authensor SDK.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from authensor.generated.decision import Decision
    from authensor.generated.outcome import Outcome


class AuthensorError(Exception):
    """Base exception for all Authensor SDK errors."""

    pass


class AuthensorDeniedError(AuthensorError):
    """
    Raised when an action is denied by policy.

    Attributes:
        decision: The policy decision that caused the denial.
        receipt_id: The receipt ID for audit trail purposes.
    """

    def __init__(self, decision: "Decision", receipt_id: str | None = None) -> None:
        self.decision = decision
        self.receipt_id = receipt_id
        reason = decision.reason or decision.outcome.value
        super().__init__(f"Action denied: {reason}")


# Alias used in the guard module (matches the task spec naming)
AuthensorDenied = AuthensorDeniedError


class AuthensorApprovalRequired(AuthensorError):
    """
    Raised when an action requires human approval before it can proceed.

    The receipt is in PENDING state. Poll or subscribe to the receipt to learn
    when a human approver resolves it.

    Attributes:
        receipt_id: The receipt ID to poll for approval status.
        decision: The policy decision that triggered approval.
    """

    def __init__(self, receipt_id: str, decision: "Decision") -> None:
        self.receipt_id = receipt_id
        self.decision = decision
        reason = decision.reason or "approval required by policy"
        super().__init__(
            f"Action requires approval: {reason} (receipt_id={receipt_id})"
        )


class AuthensorTimeoutError(AuthensorError):
    """Raised when a request to the control plane times out."""

    pass


class AuthensorConnectionError(AuthensorError):
    """Raised when the SDK cannot reach the control plane."""

    pass
