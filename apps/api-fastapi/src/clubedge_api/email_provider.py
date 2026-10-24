"""What every email provider offers the API, as packages/email does for the TypeScript apps. Code
that sends email depends on EmailProvider, never on a provider's library."""

import re
from collections.abc import Callable
from dataclasses import dataclass
from typing import NotRequired, Protocol, TypedDict


class EmailMessage(TypedDict):
    to: str
    subject: str
    # The plain-text body: every message has one, for clients that do not render HTML.
    text: str
    html: NotRequired[str]


class EmailProvider(Protocol):
    async def send(self, message: EmailMessage) -> None: ...


@dataclass(frozen=True)
class Sender:
    address: str
    name: str | None = None

    def __str__(self) -> str:
        return f"{self.name} <{self.address}>" if self.name else self.address


def parse_sender(value: str) -> Sender:
    """The sender (EMAIL_FROM) as "Name <address>" or a bare address, checked before any provider
    uses it."""
    # Plain string handling rather than a regular expression, so no input can make it slow.
    text = value.strip()
    open_bracket = text.rfind("<")
    named = open_bracket != -1 and text.endswith(">")
    name = text[:open_bracket].strip() if named else ""
    address = text[open_bracket + 1 : -1].strip() if named else text
    at = address.find("@")
    valid = (
        0 < at == address.rfind("@")
        and at < len(address) - 1
        and re.search(r"[\s<>]", address) is None
    )
    if not valid:
        raise ValueError(f'EMAIL_FROM must be an address or "Name <address>", got "{value}".')
    return Sender(address, name or None)


def _print(text: str) -> None:
    print(text, flush=True)


class ConsoleEmail:
    """Prints messages instead of sending them, for development without an email service: links
    in verification and password reset emails can be opened from the terminal."""

    def __init__(self, log: Callable[[str], None] = _print) -> None:
        self._log = log

    async def send(self, message: EmailMessage) -> None:
        self._log(f"Email to {message['to']}: {message['subject']}\n\n{message['text']}\n")


class MemoryEmail:
    """Keeps sent messages in memory, for tests."""

    def __init__(self) -> None:
        self.sent: list[EmailMessage] = []

    async def send(self, message: EmailMessage) -> None:
        self.sent.append(message)


class UnconfiguredEmail:
    """Refuses to send: production without a provider, where printing would lose the email."""

    def __init__(self, variable: str) -> None:
        self._message = f"Email is not configured: set {variable} to send email in production."

    async def send(self, message: EmailMessage) -> None:
        raise RuntimeError(self._message)


def fallback(variable: str, *, production: bool) -> EmailProvider:
    """Without a provider (its `variable` unset), development prints emails to the server log and
    production refuses to send."""
    return UnconfiguredEmail(variable) if production else ConsoleEmail()
