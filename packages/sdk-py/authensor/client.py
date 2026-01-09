"""
Authensor Client

Main SDK client for integrating Authensor into Python applications.
"""

import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional, TypeVar
from uuid import uuid4

import httpx

from authensor.exceptions import AuthensorDeniedError, AuthensorError
from authensor.generated import ActionEnvelope, Decision
from authensor.generated.action import Action
from authensor.generated.constraints import Constraints
from authensor.generated.context import Context
from authensor.generated.environment import Environment
from authensor.generated.operation import Operation
from authensor.generated.principal import Principal
from authensor.generated.principal_type import PrincipalType
from authensor.generated.outcome import Outcome as DecisionOutcome
from authensor.models import ExecuteResult

T = TypeVar("T")


@dataclass
class AuthensorConfig:
    """Configuration for the Authensor client."""

    control_plane_url: str
    api_key: Optional[str] = None
    principal_id: str = "anonymous"
    principal_type: PrincipalType = PrincipalType.agent
    principal_name: Optional[str] = None
    environment: Environment = Environment.development
    timeout: float = 10.0


@dataclass
class EvaluateResponse:
    """Response from the evaluate endpoint."""

    receipt_id: str
    decision: Decision
    evaluation_time_ms: float


class Authensor:
    """
    Authensor Python SDK client.

    Use this client to integrate Authensor policy enforcement into your
    Python agents and applications.
    """

    def __init__(
        self,
        control_plane_url: str,
        *,
        api_key: Optional[str] = None,
        principal_id: str = "anonymous",
        principal_type: PrincipalType = PrincipalType.agent,
        principal_name: Optional[str] = None,
        environment: Environment = Environment.development,
        timeout: float = 10.0,
    ):
        """
        Initialize the Authensor client.

        Args:
            control_plane_url: URL of the Authensor Control Plane
            api_key: Optional API key for authentication
            principal_id: ID of the principal making requests
            principal_type: Type of principal (user, agent, service, system)
            principal_name: Optional human-readable name
            environment: Deployment environment
            timeout: Request timeout in seconds
        """
        self.config = AuthensorConfig(
            control_plane_url=control_plane_url.rstrip("/"),
            api_key=api_key,
            principal_id=principal_id,
            principal_type=principal_type,
            principal_name=principal_name,
            environment=environment,
            timeout=timeout,
        )
        self._client = httpx.AsyncClient(
            base_url=self.config.control_plane_url,
            timeout=timeout,
            headers=self._build_headers(),
        )

    def _build_headers(self) -> dict[str, str]:
        """Build request headers."""
        headers = {"Content-Type": "application/json"}
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    async def evaluate(
        self,
        action_type: str,
        resource: str,
        *,
        operation: Optional[Operation] = None,
        parameters: Optional[dict[str, Any]] = None,
        constraints: Optional[dict[str, Any]] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> tuple[bool, Decision, str]:
        """
        Evaluate an action without executing it.

        Use this to check if an action would be allowed before doing it.

        Returns:
            A tuple of (allowed, decision, receipt_id)
        """
        envelope = self._create_envelope(
            action_type=action_type,
            resource=resource,
            operation=operation,
            parameters=parameters,
            constraints=constraints,
            context=context,
        )

        response = await self._send_evaluate(envelope)
        allowed = response.decision.outcome == DecisionOutcome.allow

        return allowed, response.decision, response.receipt_id

    async def execute(
        self,
        action_type: str,
        resource: str,
        executor: Callable[[], Awaitable[T]],
        *,
        operation: Optional[Operation] = None,
        parameters: Optional[dict[str, Any]] = None,
        constraints: Optional[dict[str, Any]] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> ExecuteResult:
        """
        Execute an action with policy enforcement.

        The action is only executed if the policy allows it.

        Args:
            action_type: Type of action (e.g., "stripe.charges.create")
            resource: Target resource (e.g., "stripe://customers/cus_123")
            executor: Async function to execute if allowed
            operation: CRUDE operation type
            parameters: Action parameters for policy evaluation
            constraints: Constraints for policy evaluation

        Returns:
            ExecuteResult with the action result and receipt info

        Raises:
            AuthensorDeniedError: If the action is denied by policy
        """
        envelope = self._create_envelope(
            action_type=action_type,
            resource=resource,
            operation=operation,
            parameters=parameters,
            constraints=constraints,
            context=context,
        )

        evaluation = await self._send_evaluate(envelope)

        if evaluation.decision.outcome != DecisionOutcome.allow:
            raise AuthensorDeniedError(evaluation.decision)

        start_time = time.time()
        try:
            result = await executor()
            duration_ms = int((time.time() - start_time) * 1000)

            await self._update_receipt(
                evaluation.receipt_id,
                status="executed",
                duration_ms=duration_ms,
                result=result if isinstance(result, dict) else {"value": result},
            )

            return ExecuteResult(
                result=result,
                receipt_id=evaluation.receipt_id,
                decision=evaluation.decision,
            )
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)

            await self._update_receipt(
                evaluation.receipt_id,
                status="failed",
                duration_ms=duration_ms,
                error={"message": str(e)},
            )
            raise

    async def get_receipt(self, receipt_id: str) -> dict[str, Any]:
        """Get a receipt by ID."""
        response = await self._client.get(f"/receipts/{receipt_id}")
        response.raise_for_status()
        return response.json()

    async def list_receipts(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List recent receipts."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status

        response = await self._client.get("/receipts", params=params)
        response.raise_for_status()
        return response.json()

    def _create_envelope(
        self,
        action_type: str,
        resource: str,
        operation: Optional[Operation] = None,
        parameters: Optional[dict[str, Any]] = None,
        constraints: Optional[dict[str, Any]] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> ActionEnvelope:
        """Create an action envelope."""
        context_payload = _camelize_keys(context)
        context_payload.setdefault("environment", self.config.environment)
        return ActionEnvelope(
            id=uuid4(),
            timestamp=datetime.now(timezone.utc),
            action=Action(
                type=action_type,
                resource=resource,
                operation=operation,
                parameters=parameters,
            ),
            principal=Principal(
                type=self.config.principal_type,
                id=self.config.principal_id,
                name=self.config.principal_name,
            ),
            context=Context(**context_payload),
            constraints=Constraints(**_camelize_keys(constraints)) if constraints else None,
        )

    async def _send_evaluate(self, envelope: ActionEnvelope) -> EvaluateResponse:
        """Send an envelope for evaluation."""
        response = await self._client.post(
            "/evaluate",
            json=envelope.model_dump(mode="json", by_alias=True, exclude_none=True),
        )

        if not response.is_success:
            raise AuthensorError(f"Evaluation failed: {response.text}")

        data = response.json()
        return EvaluateResponse(
            receipt_id=data["receiptId"],
            decision=Decision(**data["decision"]),
            evaluation_time_ms=data["evaluationTimeMs"],
        )

    async def _update_receipt(
        self,
        receipt_id: str,
        status: str,
        duration_ms: int,
        result: Optional[dict[str, Any]] = None,
        error: Optional[dict[str, Any]] = None,
    ) -> None:
        """Update a receipt after execution."""
        try:
            await self._client.patch(
                f"/receipts/{receipt_id}",
                json={
                    "status": status,
                    "execution": {
                        "completedAt": datetime.utcnow().isoformat(),
                        "durationMs": duration_ms,
                        "result": result,
                        "error": error,
                    },
                },
            )
        except Exception:
            # Don't fail the action if receipt update fails
            pass

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    async def __aenter__(self) -> "Authensor":
        """Enter async context manager."""
        return self

    async def __aexit__(self, *args: Any) -> None:
        """Exit async context manager."""
        await self.close()


def _camelize_keys(data: Optional[dict[str, Any]]) -> dict[str, Any]:
    """Convert snake_case dict keys to camelCase to satisfy schema field names."""
    if not data:
        return {}

    def camel(key: str) -> str:
        parts = key.split("_")
        return parts[0] + "".join(p.title() for p in parts[1:])

    converted: dict[str, Any] = {}
    for key, value in data.items():
        new_key = camel(key)
        if isinstance(value, dict):
            converted[new_key] = _camelize_keys(value)
        else:
            converted[new_key] = value
    return converted
