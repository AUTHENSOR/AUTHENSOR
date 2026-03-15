"""
AuthensorGuard

Wraps agent tool calls with policy enforcement.  Supports two usage styles:

1. **Decorator** — Declare once on the function; every call checks policy.

   Example::

       @guard
       async def send_email(to: str, subject: str, body: str) -> dict:
           ...

2. **Async context manager** — Protect an ad-hoc block of code.

   Example::

       async with guard.protect("file.write", "/etc/hosts"):
           write_file("/etc/hosts", new_content)
"""

from __future__ import annotations

import functools
import inspect
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Callable, Optional, TypeVar

from authensor.envelope import create_envelope
from authensor.exceptions import AuthensorApprovalRequired, AuthensorDenied, AuthensorDeniedError
from authensor.generated.environment import Environment
from authensor.generated.outcome import Outcome as DecisionOutcome
from authensor.generated.type import Type as PrincipalType

T = TypeVar("T")


class AuthensorGuard:
    """
    Guard helper for wrapping agent tool calls with Authensor policy enforcement.

    Typical usage with an AuthensorClient::

        from authensor import AuthensorClient, AuthensorGuard

        client = AuthensorClient(base_url="...", api_key="...")
        guard = AuthensorGuard(client, agent_id="my-agent")

        # As a decorator
        @guard
        async def delete_file(path: str) -> dict:
            os.remove(path)
            return {"deleted": path}

        # As a context manager
        async with guard.protect("db.write", "postgresql://db/users"):
            db.execute("INSERT INTO users ...")

    """

    def __init__(
        self,
        client: Any,  # AuthensorClient — avoid circular import with Any
        agent_id: str,
        *,
        role: str = "agent",
        environment: Environment = Environment.development,
        principal_type: PrincipalType = PrincipalType.agent,
    ) -> None:
        """
        Initialise a guard.

        Args:
            client: An ``AuthensorClient`` (or ``Authensor``) instance.
            agent_id: The principal ID to use in all envelopes.
            role: Human label for the agent role (used as principal name).
            environment: Deployment environment tag.
            principal_type: Principal type (default: agent).
        """
        self._client = client
        self._agent_id = agent_id
        self._role = role
        self._environment = environment
        self._principal_type = principal_type

    # ── Decorator interface ────────────────────────────────────────────

    def __call__(
        self,
        fn: Optional[Callable[..., Any]] = None,
        *,
        action_type: Optional[str] = None,
        resource: Optional[str] = None,
        parameters: Optional[dict[str, Any]] = None,
    ) -> Any:
        """
        Use the guard as a decorator.

        By default the action type is derived from the function's module and
        name (e.g. ``mymodule.send_email``).  Pass ``action_type`` and
        ``resource`` explicitly to override.

        ::

            @guard
            async def send_email(to: str, body: str): ...

            @guard(action_type="email.send", resource="smtp://mail.example.com")
            async def send_email(to: str, body: str): ...
        """
        if fn is None:
            # Called with keyword arguments: @guard(action_type=..., resource=...)
            def decorator(func: Callable[..., Any]) -> Callable[..., Any]:
                return self._wrap(func, action_type=action_type, resource=resource,
                                  parameters=parameters)
            return decorator

        # Called bare: @guard
        return self._wrap(fn, action_type=action_type, resource=resource,
                          parameters=parameters)

    def _wrap(
        self,
        fn: Callable[..., Any],
        *,
        action_type: Optional[str],
        resource: Optional[str],
        parameters: Optional[dict[str, Any]],
    ) -> Callable[..., Any]:
        """Wrap *fn* so every invocation is preceded by a policy check."""
        resolved_action_type = action_type or _infer_action_type(fn)

        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                resolved_resource = resource or _infer_resource(fn, args, kwargs)
                await self._check(
                    action_type=resolved_action_type,
                    resource=resolved_resource,
                    parameters=parameters,
                )
                return await fn(*args, **kwargs)

            return async_wrapper
        else:
            @functools.wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                resolved_resource = resource or _infer_resource(fn, args, kwargs)
                # For sync functions, use the sync client helpers
                envelope = create_envelope(
                    action_type=resolved_action_type,
                    resource=resolved_resource,
                    parameters=parameters,
                    principal_id=self._agent_id,
                    principal_type=self._principal_type,
                    principal_name=self._role,
                    environment=self._environment,
                )
                receipt = self._client.evaluate_sync(envelope)
                _check_receipt_decision(receipt, receipt_id=str(receipt.id))
                return fn(*args, **kwargs)

            return sync_wrapper

    # ── Context manager interface ──────────────────────────────────────

    @asynccontextmanager
    async def protect(
        self,
        action_type: str,
        resource: str,
        *,
        parameters: Optional[dict[str, Any]] = None,
    ) -> AsyncIterator[None]:
        """
        Async context manager that gates the enclosed block on a policy check.

        Raises:
            AuthensorDenied: If the policy denies the action.
            AuthensorApprovalRequired: If the policy requires approval.

        Example::

            async with guard.protect("db.delete", "postgresql://db/users"):
                db.execute("DELETE FROM users WHERE id = ?", user_id)
        """
        await self._check(action_type=action_type, resource=resource, parameters=parameters)
        yield

    # ── Internal check ─────────────────────────────────────────────────

    async def _check(
        self,
        action_type: str,
        resource: str,
        parameters: Optional[dict[str, Any]] = None,
    ) -> None:
        """Evaluate the envelope and raise on non-allow outcomes."""
        envelope = create_envelope(
            action_type=action_type,
            resource=resource,
            parameters=parameters,
            principal_id=self._agent_id,
            principal_type=self._principal_type,
            principal_name=self._role,
            environment=self._environment,
        )
        receipt = await self._client.evaluate(envelope)
        _check_receipt_decision(receipt, receipt_id=str(receipt.id))


# ── Helpers ─────────────────────────────────────────────────────────────


def _check_receipt_decision(receipt: Any, receipt_id: str) -> None:
    """Raise the appropriate exception if the decision is not allow."""
    outcome = receipt.decision.outcome

    if outcome == DecisionOutcome.require_approval:
        raise AuthensorApprovalRequired(
            receipt_id=receipt_id,
            decision=receipt.decision,
        )

    if outcome != DecisionOutcome.allow:
        raise AuthensorDenied(receipt.decision, receipt_id=receipt_id)


def _infer_action_type(fn: Callable[..., Any]) -> str:
    """
    Derive a dotted action type from the function's qualified name.

    ``mymodule.send_email`` → ``mymodule.send.email``
    ``SendEmailTool.run``   → ``send.email.tool.run``
    Falls back to the bare function name if no module info is available.
    """
    module = getattr(fn, "__module__", None) or ""
    qualname = getattr(fn, "__qualname__", fn.__name__)

    # Use only the last component of the qualified name (skip class prefix)
    name_part = qualname.split(".")[-1]

    # Convert camelCase / PascalCase to dot.case
    import re
    name_dotted = re.sub(r"(?<=[a-z0-9])([A-Z])", r".\1", name_part).lower()
    name_dotted = re.sub(r"_+", ".", name_dotted)
    # Strip any leading digits from segments
    name_dotted = re.sub(r"(?:^|\.)(\d)", r".\1", name_dotted).lstrip(".")

    # Take the top-level module name (e.g. "tools" from "tools.email")
    module_top = module.split(".")[0] if module and module != "__main__" else ""

    if module_top:
        return f"{module_top}.{name_dotted}"
    return name_dotted


def _infer_resource(
    fn: Callable[..., Any],
    args: tuple[Any, ...],
    kwargs: dict[str, Any],
) -> str:
    """
    Try to extract a meaningful resource string from the function arguments.

    Looks for common parameter names: ``resource``, ``path``, ``url``,
    ``uri``, ``target``.  Falls back to ``<module>.<name>``.
    """
    sig = inspect.signature(fn)
    try:
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        for name in ("resource", "url", "uri", "path", "target", "endpoint"):
            value = bound.arguments.get(name)
            if value is not None:
                return str(value)
    except TypeError:
        pass

    module = getattr(fn, "__module__", "") or ""
    return f"{module}.{fn.__name__}" if module else fn.__name__
