"""
Tests for AuthensorClient (mocked httpx).
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import httpx
import pytest

from authensor import AuthensorClient, Authensor
from authensor.exceptions import (
    AuthensorApprovalRequired,
    AuthensorDeniedError,
    AuthensorError,
)
from authensor.generated import ActionEnvelope
from authensor.generated.action import Action
from authensor.generated.context import Context
from authensor.generated.environment import Environment
from authensor.generated.principal import Principal
from authensor.generated.type import Type as PrincipalType

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

RECEIPT_ID = str(uuid4())
ENVELOPE_ID = str(uuid4())


def _make_envelope() -> ActionEnvelope:
    return ActionEnvelope(
        id=uuid4(),
        timestamp=datetime.now(timezone.utc),
        action=Action(type="http.request", resource="https://api.example.com/data"),
        principal=Principal(type=PrincipalType.agent, id="test-agent"),
        context=Context(environment=Environment.development),
    )


def _make_evaluate_response(outcome: str = "allow") -> dict:
    return {
        "receiptId": RECEIPT_ID,
        "decision": {
            "outcome": outcome,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
            "reason": f"Rule matched: {outcome}",
        },
        "evaluationTimeMs": 3.5,
    }


def _make_receipt_response(outcome: str = "allow") -> dict:
    return {
        "id": RECEIPT_ID,
        "envelopeId": ENVELOPE_ID,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "decision": {
            "outcome": outcome,
            "evaluatedAt": datetime.now(timezone.utc).isoformat(),
        },
        "status": "pending",
    }


def _mock_response(data: dict, status_code: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        content=json.dumps(data).encode(),
        headers={"Content-Type": "application/json"},
    )


# ---------------------------------------------------------------------------
# AuthensorClient.evaluate
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_evaluate_returns_receipt_on_allow():
    client = AuthensorClient(base_url="http://localhost:3000", api_key="test-key")
    envelope = _make_envelope()

    mock_resp = _mock_response(_make_evaluate_response("allow"))

    with patch.object(client._get_async_client(), "post", new=AsyncMock(return_value=mock_resp)):
        receipt = await client.evaluate(envelope)

    assert receipt.decision.outcome.value == "allow"
    await client.aclose()


@pytest.mark.asyncio
async def test_evaluate_returns_receipt_on_deny():
    client = AuthensorClient(base_url="http://localhost:3000")
    envelope = _make_envelope()

    mock_resp = _mock_response(_make_evaluate_response("deny"))

    with patch.object(client._get_async_client(), "post", new=AsyncMock(return_value=mock_resp)):
        receipt = await client.evaluate(envelope)

    assert receipt.decision.outcome.value == "deny"
    await client.aclose()


@pytest.mark.asyncio
async def test_evaluate_http_error_raises_authensor_error():
    client = AuthensorClient(base_url="http://localhost:3000")
    envelope = _make_envelope()

    mock_resp = _mock_response({"message": "Unauthorized"}, status_code=401)

    with patch.object(client._get_async_client(), "post", new=AsyncMock(return_value=mock_resp)):
        with pytest.raises(AuthensorError, match="401"):
            await client.evaluate(envelope)

    await client.aclose()


# ---------------------------------------------------------------------------
# AuthensorClient.get_receipt
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_get_receipt_returns_receipt():
    client = AuthensorClient(base_url="http://localhost:3000")
    mock_resp = _mock_response(_make_receipt_response())

    with patch.object(client._get_async_client(), "get", new=AsyncMock(return_value=mock_resp)):
        receipt = await client.get_receipt(RECEIPT_ID)

    assert str(receipt.id) == RECEIPT_ID
    await client.aclose()


# ---------------------------------------------------------------------------
# AuthensorClient.approve / deny
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_approve_posts_to_correct_path():
    client = AuthensorClient(base_url="http://localhost:3000")
    mock_resp = _mock_response(_make_receipt_response("allow"))
    mock_post = AsyncMock(return_value=mock_resp)

    with patch.object(client._get_async_client(), "post", new=mock_post):
        receipt = await client.approve(RECEIPT_ID, comment="LGTM")

    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert f"/receipts/{RECEIPT_ID}/approve" in str(call_kwargs)
    await client.aclose()


@pytest.mark.asyncio
async def test_deny_posts_to_correct_path():
    client = AuthensorClient(base_url="http://localhost:3000")
    mock_resp = _mock_response(_make_receipt_response("deny"))
    mock_post = AsyncMock(return_value=mock_resp)

    with patch.object(client._get_async_client(), "post", new=mock_post):
        await client.deny(RECEIPT_ID, comment="Not allowed")

    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert f"/receipts/{RECEIPT_ID}/deny" in str(call_kwargs)
    await client.aclose()


# ---------------------------------------------------------------------------
# AuthensorClient.kill_switch
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_kill_switch_calls_activate_endpoint():
    client = AuthensorClient(base_url="http://localhost:3000")
    mock_resp = httpx.Response(200, content=b"", headers={})
    mock_post = AsyncMock(return_value=mock_resp)

    with patch.object(client._get_async_client(), "post", new=mock_post):
        await client.kill_switch()

    mock_post.assert_called_once()
    call_kwargs = mock_post.call_args
    assert "kill-switch/activate" in str(call_kwargs)
    await client.aclose()


# ---------------------------------------------------------------------------
# Authensor.execute (high-level)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_execute_calls_executor_on_allow():
    authensor = Authensor(base_url="http://localhost:3000", api_key="sk-test")

    mock_eval_resp = _mock_response(_make_evaluate_response("allow"))
    mock_patch_resp = httpx.Response(200, content=b"{}", headers={})

    async_client = authensor._get_async_client()

    with (
        patch.object(async_client, "post", new=AsyncMock(return_value=mock_eval_resp)),
        patch.object(async_client, "patch", new=AsyncMock(return_value=mock_patch_resp)),
    ):
        executed = False

        async def executor():
            nonlocal executed
            executed = True
            return {"value": 42}

        result = await authensor.execute(
            action_type="http.request",
            resource="https://api.example.com",
            executor=executor,
        )

    assert executed
    assert result.result == {"value": 42}
    assert result.receipt_id == RECEIPT_ID
    await authensor.aclose()


@pytest.mark.asyncio
async def test_execute_raises_denied_on_deny():
    authensor = Authensor(base_url="http://localhost:3000")

    mock_resp = _mock_response(_make_evaluate_response("deny"))

    with patch.object(authensor._get_async_client(), "post", new=AsyncMock(return_value=mock_resp)):
        with pytest.raises(AuthensorDeniedError):
            await authensor.execute(
                action_type="file.write",
                resource="/etc/hosts",
                executor=AsyncMock(return_value=None),
            )

    await authensor.aclose()


@pytest.mark.asyncio
async def test_execute_raises_approval_required():
    authensor = Authensor(base_url="http://localhost:3000")

    mock_resp = _mock_response(_make_evaluate_response("require_approval"))

    with patch.object(authensor._get_async_client(), "post", new=AsyncMock(return_value=mock_resp)):
        with pytest.raises(AuthensorApprovalRequired) as exc_info:
            await authensor.execute(
                action_type="payments.charge",
                resource="stripe://customers/cus_123",
                executor=AsyncMock(return_value=None),
            )

    assert exc_info.value.receipt_id == RECEIPT_ID
    await authensor.aclose()


# ---------------------------------------------------------------------------
# Context manager
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_async_context_manager_closes_client():
    async with AuthensorClient(base_url="http://localhost:3000") as client:
        assert client is not None
    # After exit the internal client should be closed
    assert client._async_client is None or client._async_client.is_closed


# ---------------------------------------------------------------------------
# Headers
# ---------------------------------------------------------------------------


def test_build_headers_includes_auth_when_api_key_set():
    client = AuthensorClient(base_url="http://localhost:3000", api_key="sk-secret")
    headers = client._build_headers()
    assert headers["Authorization"] == "Bearer sk-secret"


def test_build_headers_no_auth_without_api_key():
    client = AuthensorClient(base_url="http://localhost:3000")
    headers = client._build_headers()
    assert "Authorization" not in headers


def test_base_url_trailing_slash_stripped():
    client = AuthensorClient(base_url="http://localhost:3000/")
    assert not client.config.base_url.endswith("/")
