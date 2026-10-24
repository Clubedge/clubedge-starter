"""Email over SMTP through a stand-in for aiosmtplib's client, and its `pnpm check:services`
check."""

import asyncio
from collections.abc import Iterator
from email.message import EmailMessage as MimeMessage
from typing import Self

import aiosmtplib
import pytest

from clubedge_api import email as email_module
from clubedge_api.check_services import CheckError, service_checks
from clubedge_api.email_provider import EmailMessage
from clubedge_api.email_smtp import SmtpEmail, SmtpServer, parse_smtp_url
from clubedge_api.settings import get_settings

MESSAGE: EmailMessage = {
    "to": "ada@example.com",
    "subject": "Reset your password",
    "text": "Open the link.",
    "html": "<p>Open the link.</p>",
}


class FakeSmtp:
    """Stands in for aiosmtplib.SMTP: records the connection, the login, and each message."""

    def __init__(self, options: dict[str, object]) -> None:
        self.options = options
        self.events: list[str] = []
        self.logins: list[tuple[str, str]] = []
        self.messages: list[MimeMessage] = []

    async def __aenter__(self) -> Self:
        self.events.append("connect")
        return self

    async def __aexit__(self, *exc: object) -> None:
        self.events.append("quit")

    async def login(self, username: str, password: str) -> None:
        self.events.append("login")
        self.logins.append((username, password))

    async def send_message(self, message: MimeMessage) -> None:
        self.events.append("send")
        self.messages.append(message)


@pytest.fixture
def connections(monkeypatch: pytest.MonkeyPatch) -> Iterator[list[FakeSmtp]]:
    """Each SMTP connection the code opens, without a server."""
    opened: list[FakeSmtp] = []

    def connect(**options: object) -> FakeSmtp:
        opened.append(FakeSmtp(options))
        return opened[-1]

    monkeypatch.setattr(aiosmtplib, "SMTP", connect)
    get_settings()
    monkeypatch.delenv("SMTP_URL", raising=False)
    monkeypatch.delenv("EMAIL_FROM", raising=False)
    email_module._provider.cache_clear()
    yield opened
    email_module._provider.cache_clear()


def test_reads_the_server_from_smtp_url() -> None:
    assert parse_smtp_url("smtp://localhost:1025") == SmtpServer("localhost", 1025, tls=False)
    assert parse_smtp_url("smtp://smtp.example.com").port == 587
    server = parse_smtp_url("smtps://user%40example.com:p%3Ass@smtp.example.com")
    assert server == SmtpServer("smtp.example.com", 465, True, "user@example.com", "p:ss")
    for url in ["http://smtp.example.com", "smtp://", "smtp://smtp.example.com:port"]:
        with pytest.raises(ValueError, match="SMTP_URL"):
            parse_smtp_url(url)


def test_sends_a_text_and_html_message_after_logging_in(connections: list[FakeSmtp]) -> None:
    sender = SmtpEmail("smtps://user:secret@smtp.example.com", "App <no-reply@example.com>")
    asyncio.run(sender.send(MESSAGE))
    (smtp,) = connections
    assert smtp.options == {
        "hostname": "smtp.example.com",
        "port": 465,
        "use_tls": True,
        "start_tls": False,
        "timeout": 30,
    }
    assert smtp.events == ["connect", "login", "send", "quit"]
    assert smtp.logins == [("user", "secret")]
    (message,) = smtp.messages
    assert message["From"] == "App <no-reply@example.com>"
    assert (message["To"], message["Subject"]) == ("ada@example.com", "Reset your password")
    plain, html = message.get_body(("plain",)), message.get_body(("html",))
    assert plain is not None and html is not None
    assert plain.get_content() == "Open the link.\n"
    assert html.get_content() == "<p>Open the link.</p>\n"


def test_verifies_by_connecting_and_logging_in_without_sending(
    connections: list[FakeSmtp],
) -> None:
    asyncio.run(SmtpEmail("smtp://localhost:1025", "no-reply@example.com").verify())
    (smtp,) = connections
    # STARTTLS when the server offers it, as local inboxes such as Mailpit don't.
    assert (smtp.options["use_tls"], smtp.options["start_tls"]) == (False, None)
    assert smtp.events == ["connect", "quit"]


def test_the_api_sends_through_smtp_once_smtp_url_is_set(
    connections: list[FakeSmtp], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SMTP_URL", "smtp://localhost:1025")
    asyncio.run(email_module.email.send(MESSAGE))
    (smtp,) = connections
    assert smtp.messages[0]["From"] == "App <no-reply@example.com>"


def test_checks_the_smtp_server_once_smtp_url_is_set(connections: list[FakeSmtp]) -> None:
    unset = {c.name: c for c in service_checks({})}["Email (SMTP)"]
    assert unset.skip == "SMTP_URL is not set; development prints emails to the log"
    check = {c.name: c for c in service_checks({"SMTP_URL": "smtp://localhost:1025"})}
    assert asyncio.run(check["Email (SMTP)"].run()) == "connected to localhost:1025"
    assert connections[0].events == ["connect", "quit"]
    wrong = {c.name: c for c in service_checks({"SMTP_URL": "http://localhost:1025"})}
    with pytest.raises(CheckError, match="smtp://"):
        asyncio.run(wrong["Email (SMTP)"].run())
