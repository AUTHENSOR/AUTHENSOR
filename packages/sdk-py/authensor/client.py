"""
Authensor Client

Main SDK client for integrating Authensor into Python applications.
Provides both async-native methods and synchronous wrappers for use in
frameworks that don't support asyncio.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Optional, TypeVar
from uuid import uuid4

import httpx

from authensor.exceptions import (
    AuthensorApprovalRequired,
    AuthensorConnectionError,
    AuthensorDenied,
    AuthensorDeniedError,
    AuthensorError,
    AuthensorTimeoutError,
)
from authensor.generated import ActionEnvelope, ActionReceipt, Decision
from authensor.generated.action import Action
from authensor.generated.constraints import Constraints
from authensor.generated.context import Context
from authensor.generated.environment import Environment
from authensor.generated.operation import Operation
from authensor.generated.outcome import Outcome as DecisionOutcome
from authensor.generated.principal import Principal
from authensor.generated.type import Type as PrincipalType
from authensor.models import ExecuteResult

T = TypeVar("T")


@dataclass
class AuthensorConfig:
    """Configuration for the Authensor client."""

    base_url: str
    api_key: Optional[str] = None
    principal_id: str = "anonymous"
    principal_type: PrincipalType = PrincipalType.agent
    principal_name: Optional[str] = None
    environment: Environment = Environment.development
    timeout: float = 10.0


@dataclass
class EvaluateResponse:
    """Parsed response from the /evaluate endpoint."""

    receipt_id: str
    decision: Decision
    evaluation_time_ms: float
    receipt_url: Optional[str] = None
    receipt_link: Optional[str] = None


class AuthensorClient:
    """
    Authensor Python SDK client.

    Provides async-native policy enforcement plus sync wrappers for every
    method so the SDK works in both asyncio and synchronous contexts.

    Async usage::

        async with AuthensorClient(base_url="...", api_key="...") as client:
            receipt = await client.evaluate(envelope)

    Sync usage::

        with AuthensorClient(base_url="...", api_key="...") as client:
            receipt = client.evaluate_sync(envelope)
    """

    def __init__(
        self,
        base_url: str,
        api_key: Optional[str] = None,
        *,
        principal_id: str = "anonymous",
        principal_type: PrincipalType = PrincipalType.agent,
        principal_name: Optional[str] = None,
        environment: Environment = Environment.development,
        timeout: float = 10.0,
    ) -> None:
        """
        Initialise an AuthensorClient.

        Args:
            base_url: URL of the Authensor control plane (e.g. "https://cp.authensor.dev")
            api_key: API key for authentication.  Omit in development / open-mode.
            principal_id: Default principal ID for auto-built envelopes.
            principal_type: Default principal type.
            principal_name: Optional human-readable principal name.
            environment: Default deployment environment tag.
            timeout: HTTP request timeout in seconds (default 10).
        """
        self.config = AuthensorConfig(
            base_url=base_url.rstrip("/"),
            api_key=api_key,
            principal_id=principal_id,
            principal_type=principal_type,
            principal_name=principal_name,
            environment=environment,
            timeout=timeout,
        )
        self._async_client: Optional[httpx.AsyncClient] = None
        self._sync_client: Optional[httpx.Client] = None

    # ── HTTP client helpers ────────────────────────────────────────────

    def _build_headers(self) -> dict[str, str]:
        headers: dict[str, str] = {
            "Content-Type": "application/json",
            "User-Agent": "authensor-python-sdk/0.1.0",
        }
        if self.config.api_key:
            headers["Authorization"] = f"Bearer {self.config.api_key}"
        return headers

    def _get_async_client(self) -> httpx.AsyncClient:
        if self._async_client is None or self._async_client.is_closed:
            self._async_client = httpx.AsyncClient(
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                headers=self._build_headers(),
            )
        return self._async_client

    def _get_sync_client(self) -> httpx.Client:
        if self._sync_client is None or self._sync_client.is_closed:
            self._sync_client = httpx.Client(
                base_url=self.config.base_url,
                timeout=self.config.timeout,
                headers=self._build_headers(),
            )
        return self._sync_client

    # ── Async context manager ──────────────────────────────────────────

    async def __aenter__(self) -> "AuthensorClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.aclose()

    # ── Sync context manager ───────────────────────────────────────────

    def __enter__(self) -> "AuthensorClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    # ── Close helpers ──────────────────────────────────────────────────

    async def aclose(self) -> None:
        """Close the async HTTP client."""
        if self._async_client and not self._async_client.is_closed:
            await self._async_client.aclose()

    def close(self) -> None:
        """Close the sync HTTP client."""
        if self._sync_client and not self._sync_client.is_closed:
            self._sync_client.close()

    # ── Core async methods ─────────────────────────────────────────────

    async def evaluate(self, envelope: ActionEnvelope) -> ActionReceipt:
        """
        Evaluate an ActionEnvelope and return the resulting ActionReceipt.

        This is the lowest-level method.  For most use cases prefer the
        higher-level ``Authensor.execute()`` (which calls this internally).

        Raises:
            AuthensorDeniedError: If the decision outcome is ``deny``.
            AuthensorApprovalRequired: If outcome is ``require_approval``.
            AuthensorError: For HTTP / serialisation failures.
        """
        response = await self._send_evaluate(envelope)
        return self._receipt_from_evaluate_response(response)

    async def get_receipt(self, receipt_id: str) -> ActionReceipt:
        """
        Fetch a stored receipt by ID.

        Args:
            receipt_id: UUID of the receipt to fetch.

        Returns:
            The ActionReceipt for that ID.
        """
        client = self._get_async_client()
        try:
            resp = await client.get(f"/receipts/{receipt_id}")
            _raise_for_status(resp)
            return ActionReceipt.model_validate(resp.json())
        except httpx.TimeoutException as exc:
            raise AuthensorTimeoutError(str(exc)) from exc
        except httpx.ConnectError as exc:
            raise AuthensorConnectionError(str(exc)) from exc

    async def approve(self, receipt_id: str, *, comment: Optional[str] = None) -> ActionReceipt:
        """
        Approve a pending receipt.

        Args:
            receipt_id: UUID of the receipt awaiting approval.
            comment: Optional approver comment.

        Returns:
            The updated ActionReceipt.
        """
        client = self._get_async_client()
        payload: dict[str, Any] = {"decision": "approve"}
        if comment:
            payload["comment"] = comment
        try:
            resp = await client.post(f"/receipts/{receipt_id}/approve", json=payload)
            _raise_for_status(resp)
            return ActionReceipt.model_validate(resp.json())
        except httpx.TimeoutException as exc:
            raise AuthensorTimeoutError(str(exc)) from exc
        except httpx.ConnectError as exc:
            raise AuthensorConnectionError(str(exc)) from exc

    async def deny(self, receipt_id: str, *, comment: Optional[str] = None) -> ActionReceipt:
        """
        Deny a pending receipt.

        Args:
            receipt_id: UUID of the receipt awaiting approval.
            comment: Optional reason for denial.

        Returns:
            The updated ActionReceipt.
        """
        client = self._get_async_client()
        payload: dict[str, Any] = {"decision": "deny"}
        if comment:
            payload["comment"] = comment
        try:
            resp = await client.post(f"/receipts/{receipt_id}/deny", json=payload)
            _raise_for_status(resp)
            return ActionReceipt.model_validate(resp.json())
        except httpx.TimeoutException as exc:
            raise AuthensorTimeoutError(str(exc)) from exc
        except httpx.ConnectError as exc:
            raise AuthensorConnectionError(str(exc)) from exc

    async def kill_switch(self) -> None:
        """
        Activate the global kill switch, halting all agent action execution.

        This is an emergency stop that causes all subsequent evaluate() calls
        to return deny until the kill switch is released via the dashboard or
        the API.

        Raises:
            AuthensorError: If the request fails.
        """
        client = self._get_async_client()
        try:
            resp = await client.post("/kill-switch/activate")
            _raise_for_status(resp)
        except httpx.TimeoutException as exc:
            raise AuthensorTimeoutError(str(exc)) from exc
        except httpx.ConnectError as exc:
            raise AuthensorConnectionError(str(exc)) from exc

    async def list_receipts(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List receipts with optional filtering."""
        params: dict[str, Any] = {"limit": limit, "offset": offset}
        if status:
            params["status"] = status
        client = self._get_async_client()
        try:
            resp = await client.get("/receipts", params=params)
            _raise_for_status(resp)
            return resp.json()  # type: ignore[no-any-return]
        except httpx.TimeoutException as exc:
            raise AuthensorTimeoutError(str(exc)) from exc
        except httpx.ConnectError as exc:
            raise AuthensorConnectionError(str(exc)) from exc

    # ── Sync wrappers ──────────────────────────────────────────────────

    def evaluate_sync(self, envelope: ActionEnvelope) -> ActionReceipt:
        """Synchronous wrapper for :meth:`evaluate`."""
        return _run_sync(self.evaluate(envelope))

    def get_receipt_sync(self, receipt_id: str) -> ActionReceipt:
        """Synchronous wrapper for :meth:`get_receipt`."""
        return _run_sync(self.get_receipt(receipt_id))

    def approve_sync(self, receipt_id: str, *, comment: Optional[str] = None) -> ActionReceipt:
        """Synchronous wrapper for :meth:`approve`."""
        return _run_sync(self.approve(receipt_id, comment=comment))

    def deny_sync(self, receipt_id: str, *, comment: Optional[str] = None) -> ActionReceipt:
        """Synchronous wrapper for :meth:`deny`."""
        return _run_sync(self.deny(receipt_id, comment=comment))

    def kill_switch_sync(self) -> None:
        """Synchronous wrapper for :meth:`kill_switch`."""
        _run_sync(self.kill_switch())

    def list_receipts_sync(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """Synchronous wrapper for :meth:`list_receipts`."""
        return _run_sync(self.list_receipts(limit=limit, offset=offset, status=status))

    # ── Internal helpers ───────────────────────────────────────────────

    async def _send_evaluate(self, envelope: ActionEnvelope) -> EvaluateResponse:
        """POST /evaluate and parse the response."""
        client = self._get_async_client()
        payload = envelope.model_dump(mode="json", by_alias=True, exclude_none=True)
        try:
            resp = await client.post("/evaluate", json=payload)
            _raise_for_status(resp)
        except httpx.TimeoutException as exc:
            raise AuthensorTimeoutError(str(exc)) from exc
        except httpx.ConnectError as exc:
            raise AuthensorConnectionError(str(exc)) from exc

        data: dict[str, Any] = resp.json()
        return EvaluateResponse(
            receipt_id=data["receiptId"],
            decision=Decision.model_validate(data["decision"]),
            evaluation_time_ms=data.get("evaluationTimeMs", 0.0),
            receipt_url=data.get("receiptUrl"),
            receipt_link=data.get("receiptLink"),
        )

    @staticmethod
    def _receipt_from_evaluate_response(response: EvaluateResponse) -> ActionReceipt:
        """Build a minimal ActionReceipt from an EvaluateResponse.

        The control plane /evaluate endpoint returns only key fields.  We
        construct a partial ActionReceipt so callers always work with the same
        type.  Use ``get_receipt(receipt_id)`` to retrieve the full record.

        The receipt ``id`` is populated with the server-assigned receipt ID from
        the evaluate response so that ``str(receipt.id)`` is stable.
        """
        from authensor.generated.status1 import Status
        import uuid

        try:
            receipt_uuid = uuid.UUID(response.receipt_id)
        except (ValueError, AttributeError):
            receipt_uuid = uuid4()

        return ActionReceipt(
            id=receipt_uuid,
            envelopeId=uuid4(),  # placeholder — the envelope ID is not returned by /evaluate
            timestamp=datetime.now(timezone.utc),
            decision=response.decision,
            status=Status.pending,
        )

    async def _update_receipt(
        self,
        receipt_id: str,
        status: str,
        duration_ms: int,
        result: Optional[dict[str, Any]] = None,
        error: Optional[dict[str, Any]] = None,
    ) -> None:
        """PATCH /receipts/:id with execution outcome. Never raises."""
        try:
            client = self._get_async_client()
            await client.patch(
                f"/receipts/{receipt_id}",
                json={
                    "status": status,
                    "execution": {
                        "completedAt": datetime.now(timezone.utc).isoformat(),
                        "durationMs": duration_ms,
                        "result": result,
                        "error": error,
                    },
                },
            )
        except Exception:
            pass  # Best-effort — never propagate receipt update failures

    def _build_envelope(
        self,
        action_type: str,
        resource: str,
        operation: Optional[Operation] = None,
        parameters: Optional[dict[str, Any]] = None,
        constraints: Optional[dict[str, Any]] = None,
        context: Optional[dict[str, Any]] = None,
    ) -> ActionEnvelope:
        """Build an ActionEnvelope from the client's default config."""
        from authensor.envelope import _camelize_keys  # local import to avoid cycles

        ctx_data = _camelize_keys(context) if context else {}
        ctx_data.setdefault("environment", self.config.environment)

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
            context=Context(**ctx_data),
            constraints=Constraints(**_camelize_keys(constraints)) if constraints else None,
        )


# ── Convenience alias matching original class name ─────────────────────

class Authensor(AuthensorClient):
    """
    High-level Authensor client — wraps AuthensorClient with an
    ``execute()`` helper that gates action execution on the policy decision.

    This is the recommended entry point for most agent frameworks.

    Example::

        async with Authensor(base_url="...", api_key="...") as authensor:
            result = await authensor.execute(
                action_type="stripe.charges.create",
                resource="stripe://customers/cus_123/charges",
                executor=lambda: stripe.charges.create(amount=1000),
                constraints={"max_amount": 500, "currency": "USD"},
            )
    """

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
    ) -> "ExecuteResult[T]":
        """
        Execute an action with policy enforcement.

        The executor is only called when the policy decision is ``allow``.

        Args:
            action_type: Action type (e.g. "stripe.charges.create")
            resource: Target resource
            executor: Async callable to run if the action is allowed
            operation: CRUDE operation hint
            parameters: Parameters for policy evaluation
            constraints: Pre-declared constraints
            context: Extra context fields

        Returns:
            ExecuteResult containing the result, receipt ID, and decision.

        Raises:
            AuthensorDeniedError: Policy returned deny.
            AuthensorApprovalRequired: Policy returned require_approval.
        """
        envelope = self._build_envelope(
            action_type=action_type,
            resource=resource,
            operation=operation,
            parameters=parameters,
            constraints=constraints,
            context=context,
        )
        evaluation = await self._send_evaluate(envelope)

        if evaluation.decision.outcome == DecisionOutcome.require_approval:
            raise AuthensorApprovalRequired(
                receipt_id=evaluation.receipt_id,
                decision=evaluation.decision,
            )

        if evaluation.decision.outcome != DecisionOutcome.allow:
            raise AuthensorDeniedError(evaluation.decision, receipt_id=evaluation.receipt_id)

        start_time = time.perf_counter()
        try:
            result = await executor()
            duration_ms = int((time.perf_counter() - start_time) * 1000)
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
        except (AuthensorDeniedError, AuthensorApprovalRequired):
            raise
        except Exception:
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            import sys
            _, exc, _ = sys.exc_info()
            await self._update_receipt(
                evaluation.receipt_id,
                status="failed",
                duration_ms=duration_ms,
                error={"message": str(exc)},
            )
            raise

    async def evaluate_action(
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
        Evaluate (check) an action without executing it.

        Returns:
            A tuple of ``(allowed, decision, receipt_id)``.
        """
        envelope = self._build_envelope(
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

    async def get_receipt(self, receipt_id: str) -> ActionReceipt:
        """Get a receipt by ID."""
        return await super().get_receipt(receipt_id)

    async def list_receipts(
        self,
        *,
        limit: int = 50,
        offset: int = 0,
        status: Optional[str] = None,
    ) -> dict[str, Any]:
        """List recent receipts."""
        return await super().list_receipts(limit=limit, offset=offset, status=status)


# ── Utility: run async coroutine from sync context ─────────────────────

def _run_sync(coro: Awaitable[T]) -> T:  # type: ignore[type-arg]
    """
    Run an async coroutine synchronously.

    Works whether or not there is already a running event loop (e.g. in
    Jupyter notebooks or frameworks that manage their own loops).
    """
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # We're inside an already-running loop (e.g. Jupyter).
        # Use a thread so we don't deadlock.
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future = pool.submit(asyncio.run, coro)
            return future.result()
    else:
        return asyncio.run(coro)


def _raise_for_status(response: httpx.Response) -> None:
    """Raise an AuthensorError for non-2xx responses."""
    if not response.is_success:
        try:
            detail = response.json().get("message", response.text)
        except Exception:
            detail = response.text
        raise AuthensorError(
            f"Control plane returned {response.status_code}: {detail}"
        )
