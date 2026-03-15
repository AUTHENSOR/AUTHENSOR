"""
Tests for Pydantic model validation (ActionEnvelope, ActionReceipt, Policy, etc.).
"""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from authensor.generated.action import Action
from authensor.generated import ActionEnvelope
from authensor.generated.action_receipt import ActionReceipt
from authensor.generated.context import Context
from authensor.generated.decision import Decision
from authensor.generated.default_effect import DefaultEffect
from authensor.generated.environment import Environment
from authensor.generated.operation import Operation
from authensor.generated.outcome import Outcome
from authensor.generated.policy import Policy
from authensor.generated.principal import Principal
from authensor.generated.rule import Rule
from authensor.generated.status1 import Status
from authensor.generated.type import Type as PrincipalType

# ---------------------------------------------------------------------------
# ActionEnvelope
# ---------------------------------------------------------------------------


def test_action_envelope_minimal():
    env = ActionEnvelope(
        id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        action=Action(type="http.request", resource="https://api.example.com"),
        principal=Principal(type=PrincipalType.agent, id="agent-1"),
        context=Context(),
    )
    assert env.action.type == "http.request"
    assert env.action.resource == "https://api.example.com"
    assert env.principal.type == PrincipalType.agent


def test_action_envelope_with_all_fields():
    from authensor.generated.constraints import Constraints

    env = ActionEnvelope(
        id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        action=Action(
            type="stripe.charges.create",
            resource="stripe://charges",
            operation=Operation.create,
            parameters={"amount": 1000, "currency": "usd"},
        ),
        principal=Principal(
            type=PrincipalType.user,
            id="user-123",
            name="Alice",
            attributes={"role": "admin"},
        ),
        context=Context(
            sessionId="sess-abc",
            traceId="trace-xyz",
            environment=Environment.production,
            metadata={"ip": "1.2.3.4"},
        ),
        constraints=Constraints(maxAmount=500.0, currency="USD"),
    )
    assert env.action.operation == Operation.create
    assert env.principal.name == "Alice"
    assert env.context.environment == Environment.production
    assert env.constraints is not None
    assert env.constraints.maxAmount == 500.0


def test_action_envelope_invalid_action_type_raises():
    with pytest.raises(ValidationError):
        ActionEnvelope(
            id=uuid4(),
            timestamp=datetime.now(timezone.utc),
            action=Action(
                type="INVALID ACTION TYPE",  # Must be lowercase dotted
                resource="/path",
            ),
            principal=Principal(type=PrincipalType.agent, id="a"),
            context=Context(),
        )


def test_action_envelope_extra_fields_forbidden():
    with pytest.raises(ValidationError):
        ActionEnvelope(
            id=uuid4(),
            timestamp=datetime.now(timezone.utc),
            action=Action(type="http.request", resource="https://example.com"),
            principal=Principal(type=PrincipalType.agent, id="a"),
            context=Context(),
            unknown_field="bad",  # type: ignore[call-arg]
        )


# ---------------------------------------------------------------------------
# ActionReceipt
# ---------------------------------------------------------------------------


def test_action_receipt_minimal():
    receipt = ActionReceipt(
        id=uuid4(),
        envelopeId=uuid4(),
        timestamp=datetime.now(timezone.utc),
        decision=Decision(
            outcome=Outcome.allow,
            evaluatedAt=datetime.now(timezone.utc),
        ),
        status=Status.pending,
    )
    assert receipt.decision.outcome == Outcome.allow
    assert receipt.status == Status.pending


def test_action_receipt_with_all_fields():
    from authensor.generated.approval import Approval
    from authensor.generated.execution import Execution
    from authensor.generated.scope import Scope as ApprovalStatus

    receipt = ActionReceipt(
        id=uuid4(),
        envelopeId=uuid4(),
        timestamp=datetime.now(timezone.utc),
        decision=Decision(
            outcome=Outcome.require_approval,
            evaluatedAt=datetime.now(timezone.utc),
            policyId="policy-1",
            policyVersion="1.0.0",
            reason="Manual review required",
        ),
        status=Status.pending,
        metadata={"source": "test"},
    )
    assert receipt.decision.outcome == Outcome.require_approval
    assert receipt.decision.reason == "Manual review required"
    assert receipt.metadata == {"source": "test"}


def test_action_receipt_outcomes():
    for outcome_val in ("allow", "deny", "require_approval", "rate_limited"):
        receipt = ActionReceipt(
            id=uuid4(),
            envelopeId=uuid4(),
            timestamp=datetime.now(timezone.utc),
            decision=Decision(
                outcome=Outcome(outcome_val),
                evaluatedAt=datetime.now(timezone.utc),
            ),
            status=Status.pending,
        )
        assert receipt.decision.outcome.value == outcome_val


# ---------------------------------------------------------------------------
# Policy
# ---------------------------------------------------------------------------


def test_policy_minimal():
    policy = Policy(
        id="policy-1",
        name="Test Policy",
        version="1.0.0",
        rules=[],
    )
    assert policy.id == "policy-1"
    assert policy.enabled is True  # default


def test_policy_with_rules():
    policy = Policy(
        id="p1",
        name="My Policy",
        version="1.0.0",
        rules=[
            Rule(
                id="r1",
                name="Allow reads",
                effect="allow",
                condition={
                    "any": [
                        {"field": "action.type", "operator": "matches", "value": ".*\\.read$"}
                    ]
                },
            ),
            Rule(
                id="r2",
                name="Deny destructive",
                effect="deny",
                condition={
                    "any": [
                        {"field": "action.type", "operator": "matches", "value": ".*\\.drop$"}
                    ]
                },
            ),
        ],
        defaultEffect=DefaultEffect.deny,
    )
    assert len(policy.rules) == 2
    assert policy.rules[0].effect.value == "allow"
    assert policy.rules[1].effect.value == "deny"
    assert policy.defaultEffect == DefaultEffect.deny


def test_policy_version_must_be_semver():
    with pytest.raises(ValidationError):
        Policy(
            id="p1",
            name="Bad",
            version="not-semver",  # Fails pattern ^\d+\.\d+\.\d+$
            rules=[],
        )


# ---------------------------------------------------------------------------
# create_envelope helper
# ---------------------------------------------------------------------------


def test_create_envelope_helper_builds_valid_envelope():
    from authensor.envelope import create_envelope

    env = create_envelope(
        action_type="http.request",
        resource="https://api.example.com",
        principal_id="agent-1",
        parameters={"method": "GET"},
    )
    assert env.action.type == "http.request"
    assert env.action.parameters == {"method": "GET"}
    assert env.principal.id == "agent-1"
    assert env.context.environment == Environment.development


def test_create_envelope_with_snake_case_constraints():
    from authensor.envelope import create_envelope

    env = create_envelope(
        action_type="payments.charge",
        resource="stripe://charges",
        constraints={"max_amount": 100.0, "currency": "USD"},
    )
    assert env.constraints is not None
    assert env.constraints.maxAmount == 100.0
    assert env.constraints.currency == "USD"


def test_create_envelope_generates_unique_ids():
    from authensor.envelope import create_envelope

    env1 = create_envelope("http.request", "https://a.com")
    env2 = create_envelope("http.request", "https://a.com")
    assert env1.id != env2.id


# ---------------------------------------------------------------------------
# Outcome enum
# ---------------------------------------------------------------------------


def test_outcome_enum_values():
    assert Outcome.allow.value == "allow"
    assert Outcome.deny.value == "deny"
    assert Outcome.require_approval.value == "require_approval"
    assert Outcome.rate_limited.value == "rate_limited"


# ---------------------------------------------------------------------------
# Serialisation round-trip
# ---------------------------------------------------------------------------


def test_envelope_serialises_and_deserialises():
    env = ActionEnvelope(
        id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        action=Action(type="file.read", resource="/data.txt"),
        principal=Principal(type=PrincipalType.agent, id="agent-1"),
        context=Context(environment=Environment.production),
    )
    serialised = env.model_dump(mode="json", by_alias=True, exclude_none=True)
    restored = ActionEnvelope.model_validate(serialised)

    assert restored.id == env.id
    assert restored.action.type == env.action.type
    assert restored.context.environment == env.context.environment
