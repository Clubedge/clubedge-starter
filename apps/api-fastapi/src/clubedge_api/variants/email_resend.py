"""The API's email: `from clubedge_api.email import email`, then
`await email.send({"to": ..., "subject": ..., "text": ..., "html": ...})`.

Email through Resend's API. EMAIL_FROM must use a domain verified in Resend.
"""

import os
from functools import cache

from clubedge_api.email_provider import EmailMessage, EmailProvider, fallback
from clubedge_api.email_resend import ResendEmail
from clubedge_api.settings import get_settings, is_production

__all__ = ["EmailMessage", "EmailProvider", "email"]


@cache
def _provider() -> EmailProvider:
    """The provider the environment configures, made on first use so imports read nothing."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    api_key = os.environ.get("RESEND_API_KEY", "").strip()
    sender = os.environ.get("EMAIL_FROM", "").strip() or "App <no-reply@example.com>"
    if api_key:
        return ResendEmail(api_key, sender)
    return fallback("RESEND_API_KEY", production=is_production())


class _ConfiguredEmail:
    async def send(self, message: EmailMessage) -> None:
        await _provider().send(message)


# Without RESEND_API_KEY, development prints emails to the server log and production refuses to
# send.
email: EmailProvider = _ConfiguredEmail()
