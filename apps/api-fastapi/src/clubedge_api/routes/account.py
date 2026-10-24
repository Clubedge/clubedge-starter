"""The account settings page's endpoints: the display name the app keeps, and account deletion.

Password changes stay with the auth provider (its browser SDK, or Better Auth's server), as
sign-in does; deleting an account needs the server, which removes the app's data as well.
"""

import logging
import math
import time
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated, Literal, Protocol, TypedDict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from clubedge_api.contract import GetCurrentUser, User
from clubedge_api.http import NO_STORE, ApiError, json_only, limit_body, read_json
from clubedge_api.rate_limit import CreateRateLimiter

logger = logging.getLogger(__name__)

# How deleting an account ended, from the provider's password check onwards.
AccountDeletionResult = Literal[
    "deleted", "invalid-password", "rate-limited", "active-subscription", "not-supported"
]


@dataclass(frozen=True)
class ProviderAccountDeletion:
    """What the auth provider's delete_account (auth.py) is given."""

    user: User
    password: str
    # Removes the app's data for the user; runs after the password check, before the deletion.
    before_delete: Callable[[], Awaitable[None]]


class AccountService(Protocol):
    """What the routes need from the composition root (account.py)."""

    def can_delete_account(self) -> bool:
        """Whether delete_account works with this server's settings."""

    async def get_display_name(self, user: User) -> str | None: ...

    async def set_display_name(self, user: User, display_name: str | None) -> None: ...

    async def delete_account(self, user: User, password: str) -> AccountDeletionResult:
        """Checks the password with the provider, removes the app's data for the user, then
        deletes the user from the provider, which ends its sessions."""


class Account(TypedDict):
    """GET /api/account's answer (openapi.yaml's Account)."""

    email: str
    displayName: str | None
    canDeleteAccount: bool


MAX_BODY = 4_096
MAX_DISPLAY_NAME = 80
MAX_PASSWORD = 128

NOT_CONFIGURED = "Account settings are not configured on this server."
CANNOT_DELETE = "Deleting accounts is not set up here."
TOO_MANY_ATTEMPTS = "Too many attempts. Try again later."


def _display_name(body: object) -> str | None:
    """The trimmed display name of a profile update, or None when the body is not one."""
    if not isinstance(body, dict):
        return None
    name = body.get("displayName")
    if not isinstance(name, str) or len(name.strip()) > MAX_DISPLAY_NAME:
        return None
    return name.strip()


def _password(body: object) -> str | None:
    """The password of a deletion request, or None when the body is not one."""
    if not isinstance(body, dict):
        return None
    password = body.get("password")
    if not isinstance(password, str) or not 1 <= len(password) <= MAX_PASSWORD:
        return None
    return password


def account_router(
    *,
    get_current_user: GetCurrentUser,
    account: AccountService | None,
    create_rate_limiter: CreateRateLimiter,
) -> APIRouter:
    """GET /api/account, POST /api/account/profile, and POST /api/account/delete. Without
    `account`, they answer 503 not_configured to a signed-in user."""
    router = APIRouter()
    # Password checks, per user, so a stolen session cannot guess the password.
    limiter = create_rate_limiter(10, 60)
    guards = [Depends(json_only), Depends(limit_body(MAX_BODY))]

    async def signed_in(request: Request) -> User:
        user = await get_current_user(request)
        if user is None:
            raise ApiError(401, "unauthorized", "Sign in first.", headers=NO_STORE)
        return user

    @router.get("/api/account")
    async def get_account(user: Annotated[User, Depends(signed_in)]) -> JSONResponse:
        if account is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED, headers=NO_STORE)
        body: Account = {
            "email": user["email"],
            "displayName": await account.get_display_name(user),
            "canDeleteAccount": account.can_delete_account(),
        }
        return JSONResponse(body, headers=NO_STORE)

    @router.post("/api/account/profile", dependencies=guards)
    async def update_profile(
        request: Request, user: Annotated[User, Depends(signed_in)]
    ) -> Response:
        if account is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED, headers=NO_STORE)
        display_name = _display_name(await read_json(request))
        if display_name is None:
            raise ApiError(
                400, "invalid_input", "A display name has up to 80 characters.", headers=NO_STORE
            )
        await account.set_display_name(user, display_name or None)
        return Response(status_code=204, headers=NO_STORE)

    @router.post("/api/account/delete", dependencies=guards)
    async def delete_account(
        request: Request, user: Annotated[User, Depends(signed_in)]
    ) -> Response:
        if account is None or not account.can_delete_account():
            raise ApiError(503, "not_configured", CANNOT_DELETE, headers=NO_STORE)
        try:
            limit = await limiter.limit(f"account:{user['id']}")
        except Exception:
            # Fail closed: without a working limit, password guesses would be unlimited.
            logger.exception("Rate limiter unavailable")
            raise ApiError(
                503, "unavailable", "Password checks are unavailable right now.", headers=NO_STORE
            ) from None
        if not limit.success:
            seconds = max(1, math.ceil(limit.reset_at - time.time()))
            raise ApiError(
                429,
                "rate_limited",
                TOO_MANY_ATTEMPTS,
                headers={**NO_STORE, "Retry-After": str(seconds)},
            )
        password = _password(await read_json(request))
        if password is None:
            raise ApiError(400, "invalid_input", "Enter your password.", headers=NO_STORE)

        result = await account.delete_account(user, password)
        if result == "deleted":
            return Response(status_code=204, headers=NO_STORE)
        if result == "invalid-password":
            raise ApiError(
                403, "invalid_password", "That password is not correct.", headers=NO_STORE
            )
        if result == "rate-limited":
            raise ApiError(429, "rate_limited", TOO_MANY_ATTEMPTS, headers=NO_STORE)
        if result == "active-subscription":
            raise ApiError(
                409, "active_subscription", "Cancel the subscription first.", headers=NO_STORE
            )
        raise ApiError(503, "not_configured", CANNOT_DELETE, headers=NO_STORE)

    return router
