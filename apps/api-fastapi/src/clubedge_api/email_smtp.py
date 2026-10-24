"""Email through any SMTP server: a provider's SMTP endpoint, or a local inbox such as Mailpit."""

from dataclasses import dataclass
from email.message import EmailMessage as MimeMessage
from email.utils import formataddr
from urllib.parse import unquote, urlsplit

import aiosmtplib

from clubedge_api.email_provider import EmailMessage, parse_sender


@dataclass(frozen=True)
class SmtpServer:
    host: str
    port: int
    # smtps:// connects over TLS from the start; smtp:// upgrades with STARTTLS when offered.
    tls: bool
    username: str | None = None
    password: str | None = None


def parse_smtp_url(url: str) -> SmtpServer:
    """smtp://user:password@host:port, or smtps:// for TLS from the start. The port defaults to
    587, or 465 with smtps://."""
    try:
        parts = urlsplit(url.strip())
        port = parts.port
    except ValueError as error:
        raise ValueError(f"SMTP_URL is not a valid URL: {error}") from error
    scheme = parts.scheme.lower()
    if scheme not in ("smtp", "smtps"):
        raise ValueError("SMTP_URL must start with smtp:// or smtps://.")
    if not parts.hostname:
        raise ValueError("SMTP_URL has no host.")
    tls = scheme == "smtps"
    return SmtpServer(
        host=parts.hostname,
        port=port or (465 if tls else 587),
        tls=tls,
        username=unquote(parts.username) if parts.username else None,
        password=unquote(parts.password) if parts.password is not None else None,
    )


class SmtpEmail:
    def __init__(self, url: str, sender: str) -> None:
        """`url` is SMTP_URL; `sender` is EMAIL_FROM, as "Name <address>" or an address."""
        self.server = parse_smtp_url(url)
        self._sender = parse_sender(sender)

    def _client(self) -> aiosmtplib.SMTP:
        return aiosmtplib.SMTP(
            hostname=self.server.host,
            port=self.server.port,
            use_tls=self.server.tls,
            start_tls=False if self.server.tls else None,
            timeout=30,
        )

    async def _log_in(self, smtp: aiosmtplib.SMTP) -> None:
        if self.server.username:
            await smtp.login(self.server.username, self.server.password or "")

    async def send(self, message: EmailMessage) -> None:
        mime = MimeMessage()
        mime["From"] = formataddr((self._sender.name, self._sender.address))
        mime["To"] = message["to"]
        mime["Subject"] = message["subject"]
        mime.set_content(message["text"])
        html = message.get("html")
        if html:
            mime.add_alternative(html, subtype="html")
        smtp = self._client()
        async with smtp:
            await self._log_in(smtp)
            await smtp.send_message(mime)

    async def verify(self) -> None:
        """Connects and authenticates without sending anything, for `pnpm check:services`."""
        smtp = self._client()
        async with smtp:
            await self._log_in(smtp)
