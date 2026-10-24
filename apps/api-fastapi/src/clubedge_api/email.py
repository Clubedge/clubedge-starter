"""The API's email: `from clubedge_api.email import email`, then
`await email.send({"to": ..., "subject": ..., "text": ..., "html": ...})`.

Email over SMTP: any provider's SMTP endpoint, or a local inbox such as Mailpit.
"""

import os
from functools import cache

from clubedge_api.email_provider import EmailMessage, EmailProvider, fallback
from clubedge_api.email_smtp import SmtpEmail
from clubedge_api.settings import get_settings, is_production

__all__ = ["EmailMessage", "EmailProvider", "email"]


@cache
def _provider() -> EmailProvider:
    """The provider the environment configures, made on first use so imports read nothing."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    smtp_url = os.environ.get("SMTP_URL", "").strip()
    sender = os.environ.get("EMAIL_FROM", "").strip() or "App <no-reply@example.com>"
    if smtp_url:
        return SmtpEmail(smtp_url, sender)
    return fallback("SMTP_URL", production=is_production())


class _ConfiguredEmail:
    async def send(self, message: EmailMessage) -> None:
        await _provider().send(message)


# Without SMTP_URL, development prints emails to the server log and production refuses to send.
email: EmailProvider = _ConfiguredEmail()
