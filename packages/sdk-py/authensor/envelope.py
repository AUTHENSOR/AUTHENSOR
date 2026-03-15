"""
Envelope Factory

Helper for creating ActionEnvelope objects with sensible defaults.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional
from uuid import uuid4

from authensor.generated.action import Action
from authensor.generated import ActionEnvelope
from authensor.generated.constraints import Constraints
from authensor.generated.context import Context
from authensor.generated.environment import Environment
from authensor.generated.operation import Operation
from authensor.generated.principal import Principal
from authensor.generated.type import Type as PrincipalType


def create_envelope(
    action_type: str,
    resource: str,
    *,
    operation: Optional[Operation] = None,
    parameters: Optional[dict[str, Any]] = None,
    constraints: Optional[dict[str, Any]] = None,
    principal_id: str = "agent",
    principal_type: PrincipalType = PrincipalType.agent,
    principal_name: Optional[str] = None,
    principal_attributes: Optional[dict[str, Any]] = None,
    environment: Environment = Environment.development,
    session_id: Optional[str] = None,
    trace_id: Optional[str] = None,
    parent_envelope_id: Optional[str] = None,
    parent_receipt_id: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
) -> ActionEnvelope:
    """
    Create an ActionEnvelope with sensible defaults.

    Args:
        action_type: Action type identifier (e.g. "stripe.charges.create")
        resource: Target resource identifier or URL
        operation: CRUDE operation type
        parameters: Action-specific parameters for policy evaluation
        constraints: Pre-declared constraints (max_amount, currency, etc.)
        principal_id: ID of the principal making the request
        principal_type: Type of principal (user, agent, service, system)
        principal_name: Human-readable name for the principal
        principal_attributes: Additional principal attributes
        environment: Deployment environment
        session_id: Session identifier for correlation
        trace_id: Distributed trace ID for observability
        parent_envelope_id: Parent envelope ID if chained
        parent_receipt_id: Receipt ID of parent action for cross-agent chain tracing
        metadata: Additional context metadata

    Returns:
        A fully formed ActionEnvelope ready for evaluation
    """
    constraints_obj: Optional[Constraints] = None
    if constraints:
        constraints_obj = Constraints(**_camelize_keys(constraints))

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
            type=principal_type,
            id=principal_id,
            name=principal_name,
            attributes=principal_attributes,
        ),
        context=Context(
            environment=environment,
            sessionId=session_id,
            traceId=trace_id,
            parentEnvelopeId=parent_envelope_id,  # type: ignore[arg-type]
            metadata=metadata,
        ),
        constraints=constraints_obj,
    )


def _camelize_keys(data: dict[str, Any]) -> dict[str, Any]:
    """Convert snake_case dict keys to camelCase."""

    def camel(key: str) -> str:
        parts = key.split("_")
        return parts[0] + "".join(p.title() for p in parts[1:])

    result: dict[str, Any] = {}
    for key, value in data.items():
        new_key = camel(key)
        if isinstance(value, dict):
            result[new_key] = _camelize_keys(value)
        else:
            result[new_key] = value
    return result
