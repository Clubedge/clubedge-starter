"""Each auth provider's account deletion, and Better Auth's session check, against stand-ins for
the provider's HTTP API or the database.

The providers are variants of auth.py, so only the Starter repository has them all: this file
stays out of generated projects (clubedge.template.json's exclude).
"""

import asyncio
import json
from collections.abc import Callable
from typing import Any

import httpx
import pytest
from fastapi import Request

from clubedge_api.routes.account import ProviderAccountDeletion
from clubedge_api.variants import auth_appwrite, auth_better_auth, auth_firebase, auth_supabase
from tests.fakes import USER, FakeDatabase

Handler = Callable[[httpx.Request], httpx.Response]

REAL_CLIENT = httpx.AsyncClient


def serve(monkeypatch: pytest.MonkeyPatch, log: list[str], handler: Handler) -> None:
    """Answers the providers' HTTP requests with `handler`, logging each one's method and path."""

    def answer(request: httpx.Request) -> httpx.Response:
        log.append(f"{request.method} {request.url.path}")
        return handler(request)

    def fake_client(**options: Any) -> httpx.AsyncClient:
        return REAL_CLIENT(transport=httpx.MockTransport(answer), **options)

    monkeypatch.setattr(httpx, "AsyncClient", fake_client)


def deletion(log: list[str], password: str = "pw") -> ProviderAccountDeletion:
    """USER's deletion, logging when the app's data would be removed."""

    async def before_delete() -> None:
        log.append("profile deleted")

    return ProviderAccountDeletion(user=USER, password=password, before_delete=before_delete)


# Supabase: the password through a password sign-in, then the admin API with the secret key.


@pytest.fixture
def supabase(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://project.supabase.co")
    monkeypatch.setenv("SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test")
    monkeypatch.setenv("SUPABASE_SECRET_KEY", "sb_secret_test")


def supabase_api(sign_in: httpx.Response) -> Handler:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/auth/v1/token":
            assert request.url.params["grant_type"] == "password"
            assert request.headers["apikey"] == "sb_publishable_test"
            assert json.loads(request.content) == {"email": USER["email"], "password": "pw"}
            return sign_in
        assert request.headers["apikey"] == "sb_secret_test"
        assert request.headers["authorization"] == "Bearer sb_secret_test"
        return httpx.Response(200, json={})

    return handler


@pytest.mark.usefixtures("supabase")
def test_supabase_deletes_the_user_once_the_password_signs_in(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log: list[str] = []
    serve(monkeypatch, log, supabase_api(httpx.Response(200, json={"user": {"id": "user-1"}})))
    assert auth_supabase.can_delete_account()
    assert asyncio.run(auth_supabase.delete_account(deletion(log))) == "deleted"
    assert log == ["POST /auth/v1/token", "profile deleted", "DELETE /auth/v1/admin/users/user-1"]


@pytest.mark.usefixtures("supabase")
@pytest.mark.parametrize(
    ("sign_in", "result"),
    [
        (httpx.Response(400, json={"error_code": "invalid_credentials"}), "invalid-password"),
        (httpx.Response(200, json={"user": {"id": "someone-else"}}), "invalid-password"),
        (httpx.Response(429, json={"error_code": "over_request_rate_limit"}), "rate-limited"),
    ],
)
def test_supabase_keeps_the_user_when_the_password_does_not_sign_in(
    monkeypatch: pytest.MonkeyPatch, sign_in: httpx.Response, result: str
) -> None:
    log: list[str] = []
    serve(monkeypatch, log, supabase_api(sign_in))
    assert asyncio.run(auth_supabase.delete_account(deletion(log))) == result
    assert log == ["POST /auth/v1/token"]


@pytest.mark.usefixtures("supabase")
def test_supabase_reports_an_outage_rather_than_a_wrong_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log: list[str] = []
    serve(monkeypatch, log, supabase_api(httpx.Response(503, text="unavailable")))
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(auth_supabase.delete_account(deletion(log)))
    assert log == ["POST /auth/v1/token"]


@pytest.mark.usefixtures("supabase")
def test_supabase_needs_the_secret_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SUPABASE_SECRET_KEY")
    log: list[str] = []
    serve(monkeypatch, log, supabase_api(httpx.Response(500)))
    assert not auth_supabase.can_delete_account()
    assert asyncio.run(auth_supabase.delete_account(deletion(log))) == "not-supported"
    assert log == []


# Firebase: the password through Identity Toolkit, whose ID token then deletes the user.


def firebase_api(sign_in: httpx.Response) -> Handler:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.params["key"] == "web-api-key"
        body = json.loads(request.content)
        if request.url.path.endswith("/accounts:signInWithPassword"):
            assert body == {"email": USER["email"], "password": "pw", "returnSecureToken": True}
            return sign_in
        assert body == {"idToken": "id-token"}
        return httpx.Response(200, json={"kind": "identitytoolkit#DeleteAccountResponse"})

    return handler


def test_firebase_deletes_the_user_with_its_own_id_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIREBASE_API_KEY", "web-api-key")
    monkeypatch.delenv("FIREBASE_AUTH_EMULATOR_HOST", raising=False)
    log: list[str] = []
    signed_in = httpx.Response(200, json={"localId": "user-1", "idToken": "id-token"})
    serve(monkeypatch, log, firebase_api(signed_in))
    assert auth_firebase.can_delete_account()
    assert asyncio.run(auth_firebase.delete_account(deletion(log))) == "deleted"
    assert log == [
        "POST /v1/accounts:signInWithPassword",
        "profile deleted",
        "POST /v1/accounts:delete",
    ]


def test_firebase_uses_the_auth_emulator(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FIREBASE_API_KEY", "web-api-key")
    monkeypatch.setenv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099")
    log: list[str] = []
    signed_in = httpx.Response(200, json={"localId": "user-1", "idToken": "id-token"})
    serve(monkeypatch, log, firebase_api(signed_in))
    assert asyncio.run(auth_firebase.delete_account(deletion(log))) == "deleted"
    assert log[-1] == "POST /identitytoolkit.googleapis.com/v1/accounts:delete"


@pytest.mark.parametrize(
    ("message", "result"),
    [
        ("INVALID_LOGIN_CREDENTIALS", "invalid-password"),
        ("INVALID_PASSWORD", "invalid-password"),
        ("USER_DISABLED", "invalid-password"),
        ("TOO_MANY_ATTEMPTS_TRY_LATER : Access has been temporarily disabled.", "rate-limited"),
    ],
)
def test_firebase_keeps_the_user_when_the_password_does_not_sign_in(
    monkeypatch: pytest.MonkeyPatch, message: str, result: str
) -> None:
    monkeypatch.setenv("FIREBASE_API_KEY", "web-api-key")
    log: list[str] = []
    refused = httpx.Response(400, json={"error": {"message": message}})
    serve(monkeypatch, log, firebase_api(refused))
    assert asyncio.run(auth_firebase.delete_account(deletion(log))) == result
    assert log == ["POST /v1/accounts:signInWithPassword"]


def test_firebase_refuses_another_users_password_and_reports_outages(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FIREBASE_API_KEY", "web-api-key")
    log: list[str] = []
    someone_else = httpx.Response(200, json={"localId": "someone-else", "idToken": "id-token"})
    serve(monkeypatch, log, firebase_api(someone_else))
    assert asyncio.run(auth_firebase.delete_account(deletion(log))) == "invalid-password"
    serve(monkeypatch, log, firebase_api(httpx.Response(503, json={"error": {"message": "x"}})))
    with pytest.raises(RuntimeError, match="could not check the password"):
        asyncio.run(auth_firebase.delete_account(deletion(log)))
    assert "profile deleted" not in log


def test_firebase_needs_the_web_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("FIREBASE_API_KEY", raising=False)
    assert not auth_firebase.can_delete_account()
    assert asyncio.run(auth_firebase.delete_account(deletion([]))) == "not-supported"


# Appwrite: the password through a session the API key creates and ends, then the users API.


@pytest.fixture
def appwrite(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1/")
    monkeypatch.setenv("APPWRITE_PROJECT_ID", "project")
    monkeypatch.setenv("APPWRITE_API_KEY", "api-key")


def appwrite_api(session: httpx.Response) -> Handler:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-appwrite-project"] == "project"
        assert request.headers["x-appwrite-key"] == "api-key"
        if request.url.path == "/v1/account/sessions/email":
            assert json.loads(request.content) == {"email": USER["email"], "password": "pw"}
            return session
        return httpx.Response(204)

    return handler


@pytest.mark.usefixtures("appwrite")
def test_appwrite_deletes_the_user_after_ending_the_password_check_session(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log: list[str] = []
    session = httpx.Response(201, json={"$id": "session-1", "userId": "user-1"})
    serve(monkeypatch, log, appwrite_api(session))
    assert auth_appwrite.can_delete_account()
    assert asyncio.run(auth_appwrite.delete_account(deletion(log))) == "deleted"
    assert log == [
        "POST /v1/account/sessions/email",
        "DELETE /v1/users/user-1/sessions/session-1",
        "profile deleted",
        "DELETE /v1/users/user-1",
    ]


@pytest.mark.usefixtures("appwrite")
@pytest.mark.parametrize(
    ("session", "result"),
    [
        (httpx.Response(401, json={"type": "user_invalid_credentials"}), "invalid-password"),
        (httpx.Response(401, json={"type": "user_blocked"}), "invalid-password"),
        (httpx.Response(429, json={"type": "general_rate_limit_exceeded"}), "rate-limited"),
    ],
)
def test_appwrite_keeps_the_user_when_the_password_does_not_sign_in(
    monkeypatch: pytest.MonkeyPatch, session: httpx.Response, result: str
) -> None:
    log: list[str] = []
    serve(monkeypatch, log, appwrite_api(session))
    assert asyncio.run(auth_appwrite.delete_account(deletion(log))) == result
    assert log == ["POST /v1/account/sessions/email"]


@pytest.mark.usefixtures("appwrite")
def test_appwrite_ends_the_session_of_another_users_password(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    log: list[str] = []
    session = httpx.Response(201, json={"$id": "session-1", "userId": "someone-else"})
    serve(monkeypatch, log, appwrite_api(session))
    assert asyncio.run(auth_appwrite.delete_account(deletion(log))) == "invalid-password"
    assert log == [
        "POST /v1/account/sessions/email",
        "DELETE /v1/users/someone-else/sessions/session-1",
    ]


def test_appwrite_needs_the_api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APPWRITE_ENDPOINT", "https://cloud.appwrite.io/v1")
    monkeypatch.setenv("APPWRITE_PROJECT_ID", "project")
    monkeypatch.delenv("APPWRITE_API_KEY", raising=False)
    assert not auth_appwrite.can_delete_account()
    assert asyncio.run(auth_appwrite.delete_account(deletion([]))) == "not-supported"


# Better Auth: the password against its hash in auth_account, then the auth_user row.

# Made by better-auth/crypto's hashPassword (better-auth 1.7) for these passwords.
PASSWORD = "correct horse battery"
PASSWORD_HASH = (
    "dd0004d2fc62f18377666ddf8049fd15:6e2aabea7d6a740a7a613883dfc5d01a1bb112be79b5161997b898"
    "ee68757bd725b5289c4f1585d9d98296df64f65956075bc14f1c4ca61661f405f9dae07e92"
)
# A fullwidth C and an "fi" ligature, which NFKC normalization turns into a C and "fi".
UNNORMALIZED_PASSWORD = "Ｃafé ﬁ"
UNNORMALIZED_PASSWORD_HASH = (
    "9bfdc232894e76207f1a06455cfedca6:f550a01ad53e013fd85ea2f1dc82aab6485c215b89af4d99bedca4"
    "62c436868b506167de5facf39968a63f42dba43d492ba9965a2c17bf7151107b812aa3b4eb"
)


def test_better_auth_verifies_passwords_as_better_auth_hashes_them() -> None:
    verify = auth_better_auth.verify_password
    assert asyncio.run(verify(PASSWORD_HASH, PASSWORD))
    assert not asyncio.run(verify(PASSWORD_HASH, "correct horse battery "))
    assert not asyncio.run(verify(PASSWORD_HASH, "Correct horse battery"))
    assert asyncio.run(verify(UNNORMALIZED_PASSWORD_HASH, UNNORMALIZED_PASSWORD))
    assert asyncio.run(verify(UNNORMALIZED_PASSWORD_HASH, "Café fi"))
    for malformed in ["", "no-colon", ":key", "salt:"]:
        with pytest.raises(ValueError, match="Invalid password hash"):
            asyncio.run(verify(malformed, PASSWORD))


@pytest.mark.parametrize(
    ("credential", "password", "result"),
    [
        ((PASSWORD_HASH,), PASSWORD, "deleted"),
        ((PASSWORD_HASH,), "not my password", "invalid-password"),
        # Signed up with another provider only, so no password.
        (None, PASSWORD, "invalid-password"),
        ((None,), PASSWORD, "invalid-password"),
    ],
)
def test_better_auth_deletes_the_user_once_the_password_matches(
    monkeypatch: pytest.MonkeyPatch,
    credential: tuple[object, ...] | None,
    password: str,
    result: str,
) -> None:
    db = FakeDatabase([credential])
    monkeypatch.setattr(auth_better_auth, "connect", db.connect)
    log: list[str] = []
    assert auth_better_auth.can_delete_account()
    assert asyncio.run(auth_better_auth.delete_account(deletion(log, password))) == result
    select = (
        "select password from auth_account"
        " where user_id = %s and provider_id = 'credential' limit 1",
        ("user-1",),
    )
    if result == "deleted":
        assert log == ["profile deleted"]
        assert db.statements == [select, ("delete from auth_user where id = %s", ("user-1",))]
    else:
        assert log == []
        assert db.statements == [select]


# Better Auth's sessions: the frontend's server checks them, from the cookie or the bearer token.

CREDENTIALS = ("cookie", "authorization")
SESSION = {"user": {"id": USER["id"], "email": USER["email"], "name": USER["displayName"]}}


def session_request(headers: dict[str, str]) -> Request:
    """A request to the API carrying these headers."""
    raw = [(name.encode(), value.encode()) for name, value in headers.items()]
    return Request({"type": "http", "headers": raw})


def better_auth_session(sent: list[dict[str, str]]) -> Handler:
    """Better Auth's get-session, answering with USER's session, keeping each one's credentials."""

    def handler(request: httpx.Request) -> httpx.Response:
        sent.append({name: value for name, value in request.headers.items() if name in CREDENTIALS})
        return httpx.Response(200, json=SESSION)

    return handler


@pytest.mark.parametrize(
    "credentials",
    [
        {"cookie": "better-auth.session_token=token.signature"},
        # A client without the cookie, such as a mobile app, sends the session token instead.
        {"authorization": "Bearer token.signature"},
    ],
)
def test_better_auth_asks_for_the_session_with_the_cookie_or_token(
    monkeypatch: pytest.MonkeyPatch, credentials: dict[str, str]
) -> None:
    monkeypatch.setenv("BETTER_AUTH_URL", "http://frontend.test/")
    log: list[str] = []
    sent: list[dict[str, str]] = []
    serve(monkeypatch, log, better_auth_session(sent))
    assert asyncio.run(auth_better_auth.get_current_user(session_request(credentials))) == USER
    assert log == ["GET /api/auth/get-session"]
    assert sent == [credentials]


def test_better_auth_asks_nothing_without_a_cookie_or_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("BETTER_AUTH_URL", "http://frontend.test")
    log: list[str] = []
    serve(monkeypatch, log, better_auth_session([]))
    assert asyncio.run(auth_better_auth.get_current_user(session_request({}))) is None
    assert log == []
