"""
Tests for AuthensorGuard decorator and context manager.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import httpx
import pytest

from authensor import AuthensorClient, AuthensorGuard
from authensor.exceptions import AuthensorApprovalRequired, AuthensorDenied
from authensor.generated.action_receipt import ActionReceipt
from authensor.generated.decision import Decision
from authensor.generated.environment import Environment
from authensor.generated.outcome import Outcome
from authensor.generated.status1 import Status

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

RECEIPT_ID = str(uuid4())


def _make_receipt(outcome: str = "allow") -> ActionReceipt:
    return ActionReceipt(
        id=uuid4(),
        envelopeId=uuid4(),
        timestamp=datetime.now(timezone.utc),
        decision=Decision(
            outcome=Outcome(outcome),
            evaluatedAt=datetime.now(timezone.utc),
        ),
        status=Status.pending,
    )


def _make_evaluate_json(outcome: str = "allow") -> dict:
    return {
        "receiptId": RECEIPT_ID,
        "decision": {
            "outcome": outcome,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "evaluationTimeMs": 1.0,
    }


def _mock_http_response(outcome: str = "allow") -> httpx.Response:
    return httpx.Response(
        200,
        content=json.dumps(_make_evaluate_json(outcome)).encode(),
        headers={"Content-Type": "application/json"},
    )


# ---------------------------------------------------------------------------
# Decorator — async function
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guard_decorator_allows_when_policy_allows():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    @guard
    async def read_file(path: str) -> str:
        return "file contents"

    mock_post = AsyncMock(return_value=_mock_http_response("allow"))
    with patch.object(client._get_async_client(), "post", new=mock_post):
        result = await read_file("/data.txt")

    assert result == "file contents"
    await client.aclose()


@pytest.mark.asyncio
async def test_guard_decorator_raises_denied_on_deny():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    @guard
    async def drop_table(table: str) -> None:
        pass

    mock_post = AsyncMock(return_value=_mock_http_response("deny"))
    with patch.object(client._get_async_client(), "post", new=mock_post):
        with pytest.raises(AuthensorDenied):
            await drop_table("users")

    await client.aclose()


@pytest.mark.asyncio
async def test_guard_decorator_raises_approval_required():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    @guard
    async def send_email(to: str, body: str) -> dict:
        return {"sent": True}

    mock_post = AsyncMock(return_value=_mock_http_response("require_approval"))
    with patch.object(client._get_async_client(), "post", new=mock_post):
        with pytest.raises(AuthensorApprovalRequired) as exc_info:
            await send_email(to="user@example.com", body="Hello")

    assert exc_info.value.receipt_id == RECEIPT_ID
    await client.aclose()


# ---------------------------------------------------------------------------
# Decorator — with explicit action_type and resource
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guard_decorator_with_explicit_action_type():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    @guard(action_type="payments.charge", resource="stripe://charges")
    async def charge_customer(amount: int) -> dict:
        return {"charged": amount}

    mock_post = AsyncMock(return_value=_mock_http_response("allow"))
    with patch.object(client._get_async_client(), "post", new=mock_post):
        result = await charge_customer(amount=100)

    assert result == {"charged": 100}
    await client.aclose()


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_guard_context_manager_allows():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    mock_post = AsyncMock(return_value=_mock_http_response("allow"))
    executed = False

    with patch.object(client._get_async_client(), "post", new=mock_post):
        async with guard.protect("file.read", "/data.json"):
            executed = True

    assert executed
    await client.aclose()


@pytest.mark.asyncio
async def test_guard_context_manager_raises_denied():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    mock_post = AsyncMock(return_value=_mock_http_response("deny"))

    with patch.object(client._get_async_client(), "post", new=mock_post):
        with pytest.raises(AuthensorDenied):
            async with guard.protect("db.drop", "postgresql://db/users"):
                pass  # Should not reach here

    await client.aclose()


@pytest.mark.asyncio
async def test_guard_context_manager_raises_approval_required():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    mock_post = AsyncMock(return_value=_mock_http_response("require_approval"))

    with patch.object(client._get_async_client(), "post", new=mock_post):
        with pytest.raises(AuthensorApprovalRequired):
            async with guard.protect("payments.send", "bank://transfer"):
                pass

    await client.aclose()


# ---------------------------------------------------------------------------
# Decorator — sync function
# ---------------------------------------------------------------------------


def test_guard_decorator_sync_function_allows():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    @guard
    def get_config(key: str) -> str:
        return "value"

    # Patch the sync client evaluate path
    receipt = _make_receipt("allow")
    with patch.object(client, "evaluate_sync", return_value=receipt):
        result = get_config("db_url")

    assert result == "value"


def test_guard_decorator_sync_function_raises_denied():
    client = AuthensorClient(base_url="http://localhost:3000")
    guard = AuthensorGuard(client, agent_id="test-agent")

    @guard
    def delete_user(user_id: str) -> None:
        pass

    receipt = _make_receipt("deny")
    with patch.object(client, "evaluate_sync", return_value=receipt):
        with pytest.raises(AuthensorDenied):
            delete_user("user-123")


# ---------------------------------------------------------------------------
# Action type inference
# ---------------------------------------------------------------------------


def test_infer_action_type_from_function_name():
    from authensor.guard import _infer_action_type

    def send_email() -> None:
        pass

    action_type = _infer_action_type(send_email)
    assert "send" in action_type
    assert "email" in action_type


def test_infer_action_type_returns_dotted_string():
    from authensor.guard import _infer_action_type

    def my_function() -> None:
        pass

    action_type = _infer_action_type(my_function)
    # Should be a non-empty string with only lowercase, digits, and dots
    import re
    assert re.match(r"^[a-z0-9][a-z0-9.]*$", action_type), action_type
