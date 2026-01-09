"""
Authensor Exceptions

Custom exceptions for the Authensor SDK.
"""

from authensor.models import Decision


class AuthensorError(Exception):
    """Base exception for Authensor SDK errors."""

    pass


class AuthensorDeniedError(AuthensorError):
    """Exception raised when an action is denied by policy."""

    def __init__(self, decision: Decision):
        self.decision = decision
        reason = decision.reason or decision.outcome.value
        super().__init__(f"Action denied: {reason}")
