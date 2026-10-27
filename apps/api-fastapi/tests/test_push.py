"""The push endpoints, with push notifications kept in memory, and push.py's devices table and
sending with a stand-in for the database."""

import asyncio
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Any, Self

import httpx
import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from clubedge_api import push, users
from clubedge_api.contract import User
from clubedge_api.push import (
    PushDevice,
    PushMessage,
    PushNotifications,
    PushResult,
    PushService,
    is_push_token,
)
from clubedge_api.rate_limit import RateLimiter, create_memory_limiter
from tests.fakes import USER, UnavailableLimiter, client

TOKEN = "ExponentPushToken[ada-phone]"
DEVICE: PushDevice = {"token": TOKEN, "service": "expo", "platform": "ios"}


class MemoryPush(PushNotifications):
    """Push notifications kept in memory: each user's devices, and the messages sent."""

    def __init__(
        self, services: tuple[PushService, ...] = ("expo",), configured: bool = True
    ) -> None:
        super().__init__(services, None)
        self.configured = configured
        self.devices: dict[str, tuple[User, PushDevice]] = {}
        self.sent: list[PushMessage] = []

    async def register(self, user: User, device: PushDevice) -> None:
        self.devices[device["token"]] = (user, device)

    async def remove(self, token: str) -> None:
        self.devices.pop(token, None)

    async def send(self, user: User, message: PushMessage) -> PushResult | None:
        if not self.configured:
            return None
        self.sent.append(message)
        mine = [entry for entry in self.devices.values() if entry[0]["id"] == user["id"]]
        return PushResult(sent=len(mine))


async def bearer_user(request: Request) -> User | None:
    """USER for a request with an Authorization header, nobody otherwise."""
    return USER if request.headers.get("authorization") else None


def app_with(service: MemoryPush | None, **overrides: Any) -> TestClient:
    return client(get_current_user=bearer_user, push=service, site_name="My Product", **overrides)


def post(app: TestClient, path: str, body: object, signed_in: bool = True) -> httpx.Response:
    headers = {"authorization": "Bearer ada"} if signed_in else {}
    response: httpx.Response = app.post(path, json=body, headers=headers)
    return response


def test_saves_the_device_for_the_user_and_forgets_it_without_a_session() -> None:
    service = MemoryPush()
    app = app_with(service)
    saved = post(app, "/api/push/devices", DEVICE)
    assert saved.status_code == 204
    assert "no-store" in saved.headers["cache-control"]
    assert service.devices[TOKEN] == (USER, DEVICE)

    removed = post(app, "/api/push/devices/remove", {"token": TOKEN}, signed_in=False)
    assert removed.status_code == 204
    assert service.devices == {}


def test_needs_a_session_to_save_a_device_or_send_a_test() -> None:
    app = app_with(MemoryPush())
    for path, body in [("/api/push/devices", DEVICE), ("/api/push/test", {})]:
        response = post(app, path, body, signed_in=False)
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"


@pytest.mark.parametrize(
    "body",
    [
        {"service": "expo", "platform": "ios"},
        {"token": "not-an-expo-token", "service": "expo", "platform": "ios"},
        {**DEVICE, "platform": "web"},
        {**DEVICE, "service": "pager"},
    ],
)
def test_refuses_what_is_not_a_device(body: object) -> None:
    response = post(app_with(MemoryPush()), "/api/push/devices", body)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_input"


def test_refuses_a_token_of_a_service_the_server_does_not_send_through() -> None:
    app = app_with(MemoryPush(("fcm", "apns")))
    response = post(app, "/api/push/devices", DEVICE)
    assert response.status_code == 400
    assert response.json() == {
        "error": {
            "code": "invalid_input",
            "message": "This server sends notifications through FCM and APNs.",
        }
    }
    android = {"token": "fcm-token:APA91b", "service": "fcm", "platform": "android"}
    assert post(app, "/api/push/devices", android).status_code == 204


def test_takes_only_json() -> None:
    response = app_with(MemoryPush()).post(
        "/api/push/devices",
        content=b"token",
        headers={"authorization": "Bearer ada", "content-type": "text/plain"},
    )
    assert response.status_code == 415


def test_refuses_a_removal_without_a_token() -> None:
    response = post(app_with(MemoryPush()), "/api/push/devices/remove", {}, signed_in=False)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_input"


def test_is_not_configured_without_push_notifications() -> None:
    response = post(app_with(None), "/api/push/devices", DEVICE)
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_configured"


def test_sends_the_projects_test_notification_to_the_users_devices() -> None:
    service = MemoryPush()
    app = app_with(service)
    post(app, "/api/push/devices", DEVICE)
    response = post(app, "/api/push/test", {})
    assert response.status_code == 200
    assert response.json() == {"sent": 1, "removed": 0}
    assert service.sent == [
        PushMessage("My Product", "Notifications work on this device.", {"url": "/"})
    ]


def test_says_when_no_push_service_is_set_up() -> None:
    response = post(app_with(MemoryPush(configured=False)), "/api/push/test", {})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_configured"


def test_says_when_the_push_service_fails() -> None:
    service = MemoryPush()

    async def fail(user: User, message: PushMessage) -> PushResult | None:
        raise ConnectionError("FCM refused the request")

    service.send = fail  # type: ignore[method-assign]
    response = post(app_with(service), "/api/push/test", {})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "unavailable"


def one_per_window(requests: int, window_seconds: int) -> RateLimiter:
    """One test notification a window, so the second one waits."""
    return create_memory_limiter(1, 30)


def unavailable(requests: int, window_seconds: int) -> RateLimiter:
    return UnavailableLimiter()


def test_limits_the_test_notifications_each_user_asks_for() -> None:
    app = app_with(MemoryPush(), create_rate_limiter=one_per_window)
    assert post(app, "/api/push/test", {}).status_code == 200
    limited = post(app, "/api/push/test", {})
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) > 0


def test_refuses_test_notifications_while_the_limit_cannot_be_checked() -> None:
    app = app_with(MemoryPush(), create_rate_limiter=unavailable)
    response = post(app, "/api/push/test", {})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "unavailable"


@dataclass
class FakeCursor:
    rows: list[tuple[object, ...]]

    async def fetchall(self) -> list[tuple[object, ...]]:
        return self.rows


@dataclass
class FakeDatabase:
    """A database whose queries answer `rows`, recording each statement with its whitespace
    collapsed."""

    rows: list[tuple[object, ...]] = field(default_factory=list)
    statements: list[tuple[str, tuple[object, ...]]] = field(default_factory=list)

    async def execute(self, query: str, params: tuple[object, ...] = ()) -> FakeCursor:
        self.statements.append((" ".join(query.split()), params))
        return FakeCursor(self.rows)

    @asynccontextmanager
    async def connect(self) -> AsyncIterator[Self]:
        yield self


def database(monkeypatch: pytest.MonkeyPatch, rows: list[tuple[object, ...]]) -> FakeDatabase:
    db = FakeDatabase(rows)
    monkeypatch.setattr(push, "connect", db.connect)
    return db


def test_saves_a_token_for_whoever_signs_in_on_the_device(monkeypatch: pytest.MonkeyPatch) -> None:
    db = database(monkeypatch, [])
    asyncio.run(push.register("row-1", DEVICE))
    [(statement, params)] = db.statements
    assert statement.startswith("insert into push_devices (token, user_id, service, platform)")
    assert "on conflict (token) do update set user_id = excluded.user_id" in statement
    assert params == (TOKEN, "row-1", "expo", "ios")


class OneProvider:
    """A provider of Expo's tokens that refuses `refused` for good."""

    services: tuple[PushService, ...] = ("expo",)

    def __init__(self, refused: list[str]) -> None:
        self.refused = refused
        self.sent_to: list[str] = []

    async def send(self, devices: list[PushDevice], message: PushMessage) -> PushResult:
        self.sent_to = [device["token"] for device in devices]
        return PushResult(sent=len(devices) - len(self.refused), invalid_tokens=self.refused)


def test_sends_to_the_devices_the_provider_reaches_and_forgets_refused_tokens(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old = "ExponentPushToken[old]"
    apple = "a" * 64
    db = database(
        monkeypatch, [(TOKEN, "expo", "ios"), (old, "expo", "android"), (apple, "apns", "ios")]
    )
    provider = OneProvider([old])
    result = asyncio.run(push.send_to_user(provider, "row-1", PushMessage("Hi", "There")))
    assert result == PushResult(sent=1, invalid_tokens=[old])
    # The APNs token is another provider's to reach: it is neither sent to nor removed.
    assert provider.sent_to == [TOKEN, old]
    assert db.statements[-1] == ("delete from push_devices where token = any(%s)", ([old],))


def test_sends_nothing_without_a_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    async def profile_id(user: User) -> str:
        return "row-1"

    monkeypatch.setattr(users, "ensure_user_id", profile_id)
    unconfigured = PushNotifications(("fcm", "apns"), None)
    assert asyncio.run(unconfigured.send(USER, PushMessage("a", "b"))) is None


@pytest.mark.parametrize(
    ("service", "token", "valid"),
    [
        ("expo", "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", True),
        ("expo", "ExpoPushToken[xxxxxxxxxxxxxxxxxxxxxx]", True),
        ("expo", "xxxxxxxxxxxxxxxxxxxxxx", False),
        ("fcm", "dGVzdA:APA91bH-x_y.z", True),
        ("fcm", "has space", False),
        ("apns", "a" * 64, True),
        ("apns", "not-hex", False),
    ],
)
def test_knows_each_services_tokens(service: PushService, token: str, valid: bool) -> None:
    assert is_push_token(service, token) is valid
