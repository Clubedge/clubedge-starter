"""The contract's shapes that routes and providers share (packages/contract/openapi.yaml)."""

from collections.abc import Awaitable, Callable
from typing import TypedDict

from fastapi import Request


class User(TypedDict):
    id: str
    email: str
    displayName: str | None


class ErrorDetail(TypedDict):
    code: str
    message: str


class ErrorBody(TypedDict):
    """Every error response, such as {"error": {"code": "not_found", "message": "..."}}."""

    error: ErrorDetail


# The signed-in user of a request, or None: auth.py, through the composition root (server.py).
GetCurrentUser = Callable[[Request], Awaitable[User | None]]
