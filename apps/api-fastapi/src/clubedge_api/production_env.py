"""The variables a production deploy of the API needs, for the modules this project uses.

`pnpm check:env` checks them in the deploy's environment, so a missing key stops the deploy
instead of shipping an API whose features fail at runtime.
"""

import re
from collections.abc import Mapping
from dataclasses import dataclass, field
from urllib.parse import urlsplit

from clubedge_api.app_version import app_version_problems
from clubedge_api.db import is_neon_pooled_url
from clubedge_api.settings import parse_client_ip_settings


@dataclass(frozen=True)
class Requirement:
    key: str
    use: str
    # An absolute URL to a hosted service, not this machine.
    url: bool = False


def required_variables() -> list[Requirement]:
    """What every production deploy of this API needs."""
    return [
        Requirement("DATABASE_URL", "the database", url=True),
        # clubedge:if framework!=none
        Requirement("FRONTEND_URL", "the frontend's origin, for CORS and links", url=True),
        # clubedge:end
        # clubedge:if auth=supabase
        Requirement("SUPABASE_URL", "Supabase Auth", url=True),
        Requirement("SUPABASE_PUBLISHABLE_KEY", "Supabase Auth"),
        # clubedge:end
        # clubedge:if auth=better-auth
        Requirement("BETTER_AUTH_URL", "Better Auth sessions, served by the frontend", url=True),
        # clubedge:end
        # clubedge:if auth=appwrite
        Requirement("APPWRITE_ENDPOINT", "Appwrite", url=True),
        Requirement("APPWRITE_PROJECT_ID", "Appwrite"),
        # clubedge:end
        # clubedge:if auth=firebase
        Requirement("FIREBASE_API_KEY", "Firebase Authentication"),
        # clubedge:end
        # clubedge:if cache=redis
        Requirement("REDIS_URL", "the rate limits and cache, shared by every instance", url=True),
        # clubedge:end
        # clubedge:if storage=s3
        Requirement("STORAGE_BUCKET", "file storage"),
        Requirement("STORAGE_ACCESS_KEY_ID", "file storage"),
        Requirement("STORAGE_SECRET_ACCESS_KEY", "file storage"),
        # clubedge:end
        # clubedge:if email=smtp
        Requirement("SMTP_URL", "email", url=True),
        # clubedge:end
        # clubedge:if email=resend
        Requirement("RESEND_API_KEY", "email"),
        # clubedge:end
        # clubedge:if email=smtp|resend
        Requirement("EMAIL_FROM", "the sender of every email"),
        # clubedge:end
        # clubedge:if jobs=inngest
        Requirement("INNGEST_EVENT_KEY", "background jobs (Inngest's event key)"),
        Requirement("INNGEST_SIGNING_KEY", "background jobs (Inngest's signing key)"),
        # clubedge:end
        # clubedge:if payments=stripe
        Requirement("STRIPE_SECRET_KEY", "payments"),
        Requirement("STRIPE_WEBHOOK_SECRET", "payments"),
        Requirement("STRIPE_PRICE_PRO", "payments"),
        # clubedge:end
    ]


def _url_host(value: str) -> str | None:
    """The host of an absolute URL, or None for a value that isn't one."""
    try:
        parts = urlsplit(value.strip())
    except ValueError:
        return None
    return parts.hostname if parts.scheme and parts.hostname else None


_LOCAL_HOSTS = {"localhost", "127.0.0.1", "0.0.0.0", "::1", "host.docker.internal"}


def is_local_url(value: str) -> bool:
    """A URL to this machine: from a development env file, unreachable from the deployed API."""
    host = _url_host(value)
    return host is not None and (host in _LOCAL_HOSTS or host.endswith(".localhost"))


@dataclass(frozen=True)
class ProductionEnvCheck:
    missing: list[Requirement] = field(default_factory=list)
    local: list[str] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)

    @property
    def ok(self) -> bool:
        return not (self.missing or self.local or self.invalid)


def check_production_env(env: Mapping[str, str]) -> ProductionEnvCheck:
    """The required variables that are unset, point at this machine, or have an unusable value."""
    values = {key: text.strip() for key, text in env.items() if text.strip()}
    required = required_variables()
    missing = [r for r in required if r.key not in values]
    urls = [r.key for r in required if r.url and r.key in values]
    local = [key for key in urls if is_local_url(values[key])]
    invalid = [f"{key} is not an absolute URL" for key in urls if _url_host(values[key]) is None]
    # Optional, but migrations use it instead of DATABASE_URL when it is set.
    direct = values.get("DATABASE_URL_DIRECT")
    if direct:
        if _url_host(direct) is None:
            invalid.append("DATABASE_URL_DIRECT is not an absolute URL")
        elif not re.match(r"postgres(ql)?://", direct, re.IGNORECASE):
            invalid.append("DATABASE_URL_DIRECT is not a postgresql:// URL")
        elif is_local_url(direct):
            local.append("DATABASE_URL_DIRECT")
        elif is_neon_pooled_url(direct):
            invalid.append(
                "DATABASE_URL_DIRECT points at Neon's pooler: use the host without -pooler"
            )
    # Optional too: the versions /api/app-version tells the apps installed on phones.
    invalid.extend(app_version_problems(values))
    # Optional too: where rate limits find the client's address (SETUP.md, "Client addresses").
    try:
        parse_client_ip_settings(values)
    except ValueError as error:
        invalid.append(str(error))
    # clubedge:if jobs=inngest
    # The Dev Server only runs on a developer's machine: production talks to Inngest Cloud.
    inngest_dev = values.get("INNGEST_DEV", "")
    if inngest_dev and inngest_dev.lower() not in ("0", "false"):
        invalid.append("INNGEST_DEV is set: production uses Inngest Cloud's keys, so remove it")
    # clubedge:end
    # clubedge:if auth=firebase
    # The emulator only runs on a developer's machine.
    if "FIREBASE_AUTH_EMULATOR_HOST" in values:
        invalid.append(
            "FIREBASE_AUTH_EMULATOR_HOST is set: production uses your Firebase project, "
            "so remove it"
        )
    # clubedge:end
    # clubedge:if push=native
    # A push service with only some of its credentials fails at its first notification.
    invalid.extend(_push_credential_problems(values))
    # clubedge:end
    # clubedge:if email=smtp|resend
    # .env.example's placeholder sender: providers refuse a domain you haven't verified.
    if re.search(r"@example\.com\b", values.get("EMAIL_FROM", ""), re.IGNORECASE):
        invalid.append("EMAIL_FROM still uses example.com: set a sender on a domain you verified")
    # clubedge:end
    return ProductionEnvCheck(missing, local, invalid)


# clubedge:if push=native


def _push_credential_problems(values: Mapping[str, str]) -> list[str]:
    """FCM's and APNs' credentials, each set whole or not at all: a platform whose service has
    none gets no notifications, which may be deliberate, but half of them is a mistake."""
    services = {
        "FCM": ("FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY"),
        "APNs": ("APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_TOPIC"),
    }
    problems: list[str] = []
    for service, keys in services.items():
        unset = [key for key in keys if key not in values]
        if 0 < len(unset) < len(keys):
            problems.append(f"{service} needs {', '.join(unset)} too")
    if values.get("APNS_ENVIRONMENT", "production") not in ("production", "development"):
        problems.append("APNS_ENVIRONMENT must be production or development")
    return problems


# clubedge:end
