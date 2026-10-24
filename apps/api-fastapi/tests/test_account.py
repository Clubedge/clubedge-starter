"""The account settings endpoints, with an account service kept in memory, and the service's
order of deletion with stand-ins for the database and the auth provider."""

import asyncio

import httpx
import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from clubedge_api import auth, users
from clubedge_api.account import AccountSettings
from clubedge_api.contract import User
from clubedge_api.rate_limit import CreateRateLimiter, RateLimiter
from clubedge_api.routes.account import AccountDeletionResult, ProviderAccountDeletion
from tests.fakes import USER, UnavailableLimiter, client


class MemoryAccount:
    """An account service kept in memory, with the deletion result the test picks."""

    def __init__(self, result: AccountDeletionResult = "deleted", can_delete: bool = True) -> None:
        self.result: AccountDeletionResult = result
        self.can_delete = can_delete
        self.names: dict[str, str | None] = {}
        self.deleted: list[tuple[User, str]] = []

    def can_delete_account(self) -> bool:
        return self.can_delete

    async def get_display_name(self, user: User) -> str | None:
        return self.names.get(user["id"])

    async def set_display_name(self, user: User, display_name: str | None) -> None:
        self.names[user["id"]] = display_name

    async def delete_account(self, user: User, password: str) -> AccountDeletionResult:
        self.deleted.append((user, password))
        return self.result


async def bearer_user(request: Request) -> User | None:
    """USER for a request with an Authorization header, nobody otherwise."""
    return USER if request.headers.get("authorization") else None


def app_with(
    service: MemoryAccount | None, create_rate_limiter: CreateRateLimiter | None = None
) -> TestClient:
    limits = {"create_rate_limiter": create_rate_limiter} if create_rate_limiter else {}
    return client(get_current_user=bearer_user, account=service, **limits)


def post(app: TestClient, path: str, body: object) -> httpx.Response:
    response: httpx.Response = app.post(path, json=body, headers={"authorization": "Bearer ada"})
    return response


def test_shows_the_account_with_the_display_name_the_app_keeps() -> None:
    app = app_with(MemoryAccount())
    saved = post(app, "/api/account/profile", {"displayName": " Ada "})
    assert saved.status_code == 204
    assert "no-store" in saved.headers["cache-control"]
    response = app.get("/api/account", headers={"authorization": "Bearer ada"})
    assert "no-store" in response.headers["cache-control"]
    assert response.json() == {
        "email": "ada@example.com",
        "displayName": "Ada",
        "canDeleteAccount": True,
    }


def test_clears_the_display_name_with_an_empty_one_and_refuses_a_long_one() -> None:
    service = MemoryAccount()
    app = app_with(service)
    post(app, "/api/account/profile", {"displayName": "Ada"})
    post(app, "/api/account/profile", {"displayName": "  "})
    assert service.names[USER["id"]] is None
    for body in [{"displayName": "x" * 81}, {"displayName": 7}, {}, ["Ada"]]:
        response = post(app, "/api/account/profile", body)
        assert response.status_code == 400, body
        assert response.json()["error"]["code"] == "invalid_input"
    assert service.names[USER["id"]] is None


def test_needs_a_signed_in_user_and_is_never_cached() -> None:
    app = app_with(MemoryAccount())
    responses = [
        app.get("/api/account"),
        app.post("/api/account/profile", json={"displayName": "x"}),
        app.post("/api/account/delete", json={"password": "x"}),
    ]
    for response in responses:
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "unauthorized"
        assert "no-store" in response.headers["cache-control"]


def test_takes_only_small_json_bodies() -> None:
    app = app_with(MemoryAccount())
    for path in ["/api/account/profile", "/api/account/delete"]:
        form = app.post(
            path,
            content="displayName=x",
            headers={
                "authorization": "Bearer ada",
                "content-type": "application/x-www-form-urlencoded",
            },
        )
        assert form.status_code == 415
        assert form.json()["error"]["code"] == "unsupported_media_type"
        large = post(app, path, {"displayName": "x" * 5_000, "password": "x"})
        assert large.status_code == 413
        assert large.json()["error"]["code"] == "payload_too_large"


def test_answers_not_configured_without_an_account_service() -> None:
    app = app_with(None)
    responses = [
        app.get("/api/account", headers={"authorization": "Bearer ada"}),
        post(app, "/api/account/profile", {"displayName": "Ada"}),
        post(app, "/api/account/delete", {"password": "pw"}),
    ]
    for response in responses:
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "not_configured"


def test_deletes_the_account_after_the_provider_checks_the_password() -> None:
    service = MemoryAccount()
    response = post(app_with(service), "/api/account/delete", {"password": "pw"})
    assert response.status_code == 204
    assert "no-store" in response.headers["cache-control"]
    assert service.deleted == [(USER, "pw")]


@pytest.mark.parametrize(
    ("result", "status", "code"),
    [
        ("invalid-password", 403, "invalid_password"),
        ("active-subscription", 409, "active_subscription"),
        ("rate-limited", 429, "rate_limited"),
        ("not-supported", 503, "not_configured"),
    ],
)
def test_answers_each_deletion_result(
    result: AccountDeletionResult, status: int, code: str
) -> None:
    response = post(app_with(MemoryAccount(result)), "/api/account/delete", {"password": "pw"})
    assert response.status_code == status
    assert response.json()["error"]["code"] == code


def test_refuses_to_delete_where_deleting_is_not_set_up_before_checking_anything() -> None:
    service = MemoryAccount(can_delete=False)
    response = post(app_with(service), "/api/account/delete", {"password": "pw"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "not_configured"
    assert service.deleted == []


def test_needs_a_password() -> None:
    service = MemoryAccount()
    app = app_with(service)
    for body in [{"password": ""}, {"password": "x" * 129}, {}, "pw"]:
        response = post(app, "/api/account/delete", body)
        assert response.status_code == 400, body
        assert response.json()["error"]["code"] == "invalid_input"
    assert service.deleted == []


def test_limits_password_checks_per_user_with_retry_after() -> None:
    service = MemoryAccount("invalid-password")
    app = app_with(service)
    for _ in range(10):
        assert post(app, "/api/account/delete", {"password": "guess"}).status_code == 403
    response = post(app, "/api/account/delete", {"password": "guess"})
    assert response.status_code == 429
    assert int(response.headers["retry-after"]) > 0
    assert len(service.deleted) == 10


def test_refuses_password_checks_while_the_limit_cannot_be_checked() -> None:
    def unavailable(requests: int, window_seconds: int) -> RateLimiter:
        return UnavailableLimiter()

    service = MemoryAccount()
    response = post(app_with(service, unavailable), "/api/account/delete", {"password": "pw"})
    assert response.status_code == 503
    assert response.json()["error"]["code"] == "unavailable"
    assert service.deleted == []


# The service, with stand-ins for the users row (users.py) and the provider (auth.py).


class Provider:
    """An auth provider that knows one password, and records the deletion."""

    def __init__(self, events: list[str], password: str = "pw") -> None:
        self.events = events
        self.password = password

    async def delete_account(self, deletion: ProviderAccountDeletion) -> AccountDeletionResult:
        if deletion.password != self.password:
            return "invalid-password"
        await deletion.before_delete()
        self.events.append(f"provider deletes {deletion.user['id']}")
        return "deleted"


@pytest.fixture
def events(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """What the stand-ins for the database and the provider did, in order."""
    log: list[str] = []
    names: dict[str, str | None] = {}

    async def ensure_user_id(user: User) -> str:
        return f"profile-of-{user['id']}"

    async def get_display_name(user_id: str) -> str | None:
        return names.get(user_id)

    async def set_display_name(user_id: str, display_name: str | None) -> None:
        names[user_id] = display_name

    async def delete_user_profile(auth_user_id: str) -> None:
        log.append(f"profile of {auth_user_id} deleted")

    monkeypatch.setattr(users, "ensure_user_id", ensure_user_id)
    monkeypatch.setattr(users, "get_display_name", get_display_name)
    monkeypatch.setattr(users, "set_display_name", set_display_name)
    monkeypatch.setattr(users, "delete_user_profile", delete_user_profile)
    monkeypatch.setattr(auth, "delete_account", Provider(log).delete_account)
    # clubedge:if payments=stripe

    async def unsubscribed(profile_id: str) -> bool:
        return False

    monkeypatch.setattr("clubedge_api.account.has_active_subscription", unsubscribed)
    # clubedge:end
    return log


def test_keeps_the_display_name_in_the_users_row(events: list[str]) -> None:
    settings = AccountSettings()
    asyncio.run(settings.set_display_name(USER, "Ada Lovelace"))
    assert asyncio.run(settings.get_display_name(USER)) == "Ada Lovelace"


# clubedge:if payments=stripe
def test_keeps_an_account_with_an_active_subscription(
    events: list[str], monkeypatch: pytest.MonkeyPatch
) -> None:
    checked: list[str] = []

    async def subscribed(profile_id: str) -> bool:
        checked.append(profile_id)
        return True

    monkeypatch.setattr("clubedge_api.account.has_active_subscription", subscribed)
    assert asyncio.run(AccountSettings().delete_account(USER, "pw")) == "active-subscription"
    assert checked == ["profile-of-user-1"]
    assert events == []


# clubedge:end
def test_removes_the_profile_once_the_password_is_right_then_the_provider_user(
    events: list[str],
) -> None:
    settings = AccountSettings()
    assert asyncio.run(settings.delete_account(USER, "wrong")) == "invalid-password"
    assert events == []
    assert asyncio.run(settings.delete_account(USER, "pw")) == "deleted"
    assert events == ["profile of user-1 deleted", "provider deletes user-1"]
