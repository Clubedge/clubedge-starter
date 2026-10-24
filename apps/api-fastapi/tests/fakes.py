"""Stand-ins the tests share: the composition root's dependencies, a signed-in user, and a rate
limiter whose backend is down."""

from dataclasses import replace
from typing import Any

from fastapi import Request
from fastapi.testclient import TestClient

from clubedge_api.app import ApiDependencies, create_app
from clubedge_api.contract import GetCurrentUser, User
from clubedge_api.rate_limit import RateLimitResult

USER: User = {"id": "user-1", "email": "ada@example.com", "displayName": "Ada"}


async def ready() -> bool:
    return True


async def not_ready() -> bool:
    return False


async def signed_out(request: Request) -> User | None:
    return None


def signed_in(user: User) -> GetCurrentUser:
    """Every request comes from `user`."""

    async def current_user(request: Request) -> User | None:
        return user

    return current_user


def dependencies(**overrides: Any) -> ApiDependencies:
    """The API's dependencies, without a database or a signed-in user unless `overrides` say."""
    return replace(ApiDependencies("my-product", not_ready, signed_out), **overrides)


def client(**overrides: Any) -> TestClient:
    """A client of the app made from dependencies(**overrides)."""
    return TestClient(create_app(dependencies(**overrides)))


class UnavailableLimiter:
    """A rate limiter whose backend (Redis) is down."""

    async def limit(self, identifier: str) -> RateLimitResult:
        raise ConnectionError("The rate limiter's backend is down.")
