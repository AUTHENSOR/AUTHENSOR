"""
Authensor guard for CrewAI

Provides a decorator and guard class to evaluate CrewAI tool/task
executions against Authensor policies.

Usage:
    from authensor_crewai import AuthensorGuard

    guard = AuthensorGuard("http://localhost:3000")

    # As a decorator
    @guard.protect
    def my_tool(query: str) -> str:
        return search(query)

    # As a pre-check
    result = guard.evaluate("search_tool", {"query": "test"})
    if result["allowed"]:
        # proceed
"""

import os
import json
import uuid
from datetime import datetime, timezone
from functools import wraps
from typing import Any, Callable, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError


class AuthensorGuard:
    """Authensor policy guard for CrewAI agents."""

    def __init__(
        self,
        control_plane_url: str,
        api_key: Optional[str] = None,
        principal_id: str = "crewai-agent",
        principal_type: str = "agent",
    ):
        self.base_url = control_plane_url.rstrip("/")
        self.api_key = api_key or os.environ.get("AUTHENSOR_API_KEY")
        self.principal_id = principal_id
        self.principal_type = principal_type

    def evaluate(
        self, tool_name: str, args: Optional[dict[str, Any]] = None
    ) -> dict[str, Any]:
        """Evaluate a tool call against Authensor policies."""
        envelope = {
            "id": str(uuid.uuid4()),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "action": {
                "type": f"crewai.{tool_name}",
                "resource": f"crewai://{tool_name}",
                "operation": "execute",
                "parameters": args or {},
            },
            "principal": {
                "type": self.principal_type,
                "id": self.principal_id,
            },
            "context": {
                "environment": os.environ.get("NODE_ENV", "development"),
            },
        }

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        data = json.dumps(envelope).encode()
        req = Request(
            f"{self.base_url}/evaluate", data=data, headers=headers, method="POST"
        )

        try:
            with urlopen(req) as resp:
                result = json.loads(resp.read())
        except URLError as e:
            return {
                "allowed": False,
                "outcome": "error",
                "reason": str(e),
            }

        outcome = result.get("decision", {}).get("outcome", "deny")
        return {
            "allowed": outcome == "allow",
            "receipt_id": result.get("receiptId"),
            "outcome": outcome,
            "reason": result.get("decision", {}).get("reason"),
        }

    def guard(self, tool_name: str, args: Optional[dict[str, Any]] = None) -> str:
        """Evaluate and raise if denied. Returns receipt_id on success."""
        result = self.evaluate(tool_name, args)
        if not result["allowed"]:
            raise PermissionError(
                f"Authensor denied {tool_name}: {result.get('reason', result['outcome'])}"
            )
        return result["receipt_id"]

    def protect(self, func: Callable) -> Callable:
        """Decorator to gate a function through Authensor policy evaluation."""
        tool_name = getattr(func, "__name__", "unknown_tool")

        @wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            self.guard(tool_name, kwargs if kwargs else None)
            return func(*args, **kwargs)

        return wrapper
