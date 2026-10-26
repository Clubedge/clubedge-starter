"""The contract's shapes that routes and providers share (packages/contract/openapi.yaml)."""

from collections.abc import Awaitable, Callable
from typing import TypedDict

from fastapi import Request


class User(TypedDict):
    id: str
    email: str
    displayName: str | None


class AppVersion(TypedDict):
    """The app versions the API serves, MAJOR.MINOR.PATCH, such as 1.4.0; None while unset."""

    # The oldest version the API still serves: older apps must update before they continue.
    minimumVersion: str | None
    # The newest released version: older apps may show an update notice.
    latestVersion: str | None
    # Where apps get the update, such as their store listing.
    updateUrl: str | None
    # A minimum announced for a date: older apps keep working until then, and warn their users.
    nextMinimumVersion: str | None
    # When it becomes the minimum, in UTC, such as 2026-11-01T00:00:00.000Z.
    nextMinimumFrom: str | None


class ErrorDetail(TypedDict):
    code: str
    message: str


class ErrorBody(TypedDict):
    """Every error response, such as {"error": {"code": "not_found", "message": "..."}}."""

    error: ErrorDetail


# The signed-in user of a request, or None: auth.py, through the composition root (server.py).
GetCurrentUser = Callable[[Request], Awaitable[User | None]]
