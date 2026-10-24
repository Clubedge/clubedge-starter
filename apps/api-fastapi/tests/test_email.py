"""What every email provider shares, and the API's email without a provider configured."""

import asyncio
from collections.abc import Iterator

import pytest

from clubedge_api import email as email_module
from clubedge_api.email_provider import (
    ConsoleEmail,
    EmailMessage,
    MemoryEmail,
    Sender,
    UnconfiguredEmail,
    fallback,
    parse_sender,
)
from clubedge_api.settings import get_settings

MESSAGE: EmailMessage = {
    "to": "ada@example.com",
    "subject": "Reset your password",
    "text": "Open the link.",
}


@pytest.fixture(autouse=True)
def no_provider(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No email variables, whatever .env.local sets, and a provider made afresh."""
    get_settings()
    for name in ["SMTP_URL", "RESEND_API_KEY", "EMAIL_FROM", "NODE_ENV"]:
        monkeypatch.delenv(name, raising=False)
    email_module._provider.cache_clear()
    yield
    email_module._provider.cache_clear()


def test_reads_the_sender_as_a_name_and_address_or_an_address() -> None:
    assert parse_sender("App <no-reply@example.com>") == Sender("no-reply@example.com", "App")
    assert parse_sender("  no-reply@example.com ") == Sender("no-reply@example.com")
    assert parse_sender("<no-reply@example.com>") == Sender("no-reply@example.com")
    assert str(Sender("no-reply@example.com", "App")) == "App <no-reply@example.com>"
    assert str(Sender("no-reply@example.com")) == "no-reply@example.com"


def test_refuses_a_sender_that_is_not_an_address() -> None:
    for sender in ["", "App", "@example.com", "app@", "a@b@example.com", "App <a b@example.com>"]:
        with pytest.raises(ValueError, match="EMAIL_FROM must be an address"):
            parse_sender(sender)


def test_prints_or_keeps_messages_instead_of_sending_them() -> None:
    printed: list[str] = []
    asyncio.run(ConsoleEmail(printed.append).send(MESSAGE))
    assert printed == ["Email to ada@example.com: Reset your password\n\nOpen the link.\n"]
    memory = MemoryEmail()
    asyncio.run(memory.send(MESSAGE))
    assert memory.sent == [MESSAGE]


def test_falls_back_to_the_log_in_development_and_refuses_in_production() -> None:
    assert isinstance(fallback("SMTP_URL", production=False), ConsoleEmail)
    refusing = fallback("SMTP_URL", production=True)
    assert isinstance(refusing, UnconfiguredEmail)
    with pytest.raises(RuntimeError, match="set SMTP_URL to send email in production"):
        asyncio.run(refusing.send(MESSAGE))


def test_the_api_prints_emails_without_a_provider_in_development(
    capsys: pytest.CaptureFixture[str],
) -> None:
    asyncio.run(email_module.email.send(MESSAGE))
    output = capsys.readouterr().out
    assert "Email to ada@example.com: Reset your password\n\nOpen the link.\n" in output


def test_the_api_refuses_to_send_without_a_provider_in_production(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("NODE_ENV", "production")
    with pytest.raises(RuntimeError, match="Email is not configured: set"):
        asyncio.run(email_module.email.send(MESSAGE))
