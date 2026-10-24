"""Stand-ins the tests share: the composition root's dependencies, a signed-in user, a rate
limiter whose backend is down, and a database."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from typing import Any, Self

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


@dataclass
class FakeCursor:
    row: tuple[object, ...] | None

    async def fetchone(self) -> tuple[object, ...] | None:
        return self.row


@dataclass
class FakeDatabase:
    """A database that answers each statement with the next of `rows` (None when they run out),
    and records the statements, with their whitespace collapsed. Tests put its connect() in place
    of db.connect where a module imported it."""

    rows: list[tuple[object, ...] | None] = field(default_factory=list)
    statements: list[tuple[str, tuple[object, ...]]] = field(default_factory=list)

    async def execute(self, query: str, params: tuple[object, ...] = ()) -> FakeCursor:
        self.statements.append((" ".join(query.split()), params))
        return FakeCursor(self.rows.pop(0) if self.rows else None)

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[Self]:
        yield self
