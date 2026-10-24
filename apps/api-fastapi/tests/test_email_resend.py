"""Email through Resend's API, answered by a stand-in for Resend, and its `pnpm check:services`
check."""

import asyncio
import json

import httpx
import pytest

from clubedge_api.check_services import service_checks
from clubedge_api.email_provider import EmailMessage
from clubedge_api.email_resend import ResendEmail

MESSAGE: EmailMessage = {
    "to": "ada@example.com",
    "subject": "Reset your password",
    "text": "Open the link.",
    "html": "<p>Open the link.</p>",
}


class FakeResend:
    """Records each request and answers each with a copy of `response`."""

    def __init__(self, response: httpx.Response) -> None:
        self.requests: list[httpx.Request] = []
        self.response = response

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.response
        return httpx.Response(answer.status_code, headers=answer.headers, content=answer.content)

    def email(self) -> ResendEmail:
        return ResendEmail(
            "re_key", "App <no-reply@example.com>", transport=httpx.MockTransport(self)
        )


def test_sends_the_message_with_the_api_key() -> None:
    resend = FakeResend(httpx.Response(200, json={"id": "email-1"}))
    asyncio.run(resend.email().send(MESSAGE))
    (request,) = resend.requests
    assert (request.method, str(request.url)) == ("POST", "https://api.resend.com/emails")
    assert request.headers["authorization"] == "Bearer re_key"
    assert json.loads(request.content) == {
        "from": "App <no-reply@example.com>",
        "to": ["ada@example.com"],
        "subject": "Reset your password",
        "text": "Open the link.",
        "html": "<p>Open the link.</p>",
    }


def test_reports_what_resend_refused() -> None:
    resend = FakeResend(httpx.Response(422, json={"message": "The domain is not verified."}))
    with pytest.raises(RuntimeError, match=r"could not send the email \(422\).*not verified"):
        asyncio.run(resend.email().send(MESSAGE))


def test_verifies_the_api_key_without_sending() -> None:
    resend = FakeResend(httpx.Response(200, json={"data": []}))
    asyncio.run(resend.email().verify())
    (request,) = resend.requests
    assert (request.method, str(request.url)) == ("GET", "https://api.resend.com/domains")


def test_accepts_a_key_limited_to_sending_and_refuses_a_wrong_key() -> None:
    restricted = {"name": "restricted_api_key", "message": "This API key can only send emails."}
    asyncio.run(FakeResend(httpx.Response(401, json=restricted)).email().verify())
    wrong = FakeResend(httpx.Response(401, json={"name": "validation_error"}))
    with pytest.raises(RuntimeError, match=r"could not verify the API key \(401\)"):
        asyncio.run(wrong.email().verify())


def test_checks_the_api_key_once_it_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    unset = {c.name: c for c in service_checks({})}["Email (Resend)"]
    assert unset.skip == "RESEND_API_KEY is not set; development prints emails to the log"
    verified: list[str] = []

    async def verify(self: ResendEmail) -> None:
        verified.append("verified")

    monkeypatch.setattr(ResendEmail, "verify", verify)
    check = {c.name: c for c in service_checks({"RESEND_API_KEY": "re_key"})}["Email (Resend)"]
    assert asyncio.run(check.run()) == "API key accepted"
    assert verified == ["verified"]
