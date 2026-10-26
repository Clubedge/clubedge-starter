"""What /api/app-version tells the apps installed on phones, from the APP_* variables, and which
apps the API refuses (app.py), by the rules of packages/contract/src/app-version.ts.

Each variable can be set for one platform by adding _IOS or _ANDROID to its name: that
platform's value then wins, for apps that name it (X-App-Platform). Unset, each is None."""

import os
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlsplit

from clubedge_api.contract import AppVersion
from clubedge_api.settings import get_settings

# The headers each request from an installed app carries: its version, and its platform.
APP_VERSION_HEADER = "x-app-version"
APP_PLATFORM_HEADER = "x-app-platform"

# The platforms the API can give their own versions and update link.
PLATFORMS = ("ios", "android")

# What an installed app does for the versions the API serves (app-version.ts says more).
UpdateStatus = Literal["current", "available", "upcoming", "required"]

# A variable's version: MAJOR.MINOR.PATCH, such as 1.4.0.
_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")
# An installed app's version, whose missing parts count as 0: Android and iOS often say "1.0".
_INSTALLED = re.compile(r"([0-9]+)(?:\.([0-9]+))?(?:\.([0-9]+))?")
# A date and time in the one form the TypeScript API reads (zod's z.iso.datetime with offsets): a
# date, T, a time to the second or finer, and Z or an offset such as +01:00.
_DATE_TIME = re.compile(
    r"\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?"
    r"(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)",
    re.ASCII,
)

# Each variable, in the order `pnpm check:env` lists their mistakes, and what it holds.
_FIELDS = (
    ("APP_MINIMUM_VERSION", "version"),
    ("APP_LATEST_VERSION", "version"),
    ("APP_NEXT_MINIMUM_VERSION", "version"),
    ("APP_NEXT_MINIMUM_VERSION_FROM", "date"),
    ("APP_UPDATE_URL", "url"),
)
_SUFFIXES = ("", *(f"_{platform.upper()}" for platform in PLATFORMS))


def parse_version(version: str) -> tuple[int, int, int] | None:
    """A version's MAJOR, MINOR, and PATCH numbers, or None when it is not one."""
    match = _INSTALLED.fullmatch(version.strip())
    if match is None:
        return None
    major, minor, patch = match.groups()
    return int(major), int(minor or 0), int(patch or 0)


def is_older(version: str, than: str) -> bool:
    """Whether `version` comes before `than`, number by number: 1.9.0 before 1.10.0."""
    a, b = parse_version(version), parse_version(than)
    return a is not None and b is not None and a < b


def app_platform(value: str | None) -> str | None:
    """The platform a request names, or None for none or any other value."""
    platform = (value or "").strip().lower()
    return platform if platform in PLATFORMS else None


def update_status(installed: str, versions: AppVersion | None) -> UpdateStatus | None:
    """What the app does: required below the minimum, upcoming below an announced one,
    available below the latest, else current. None when it can't tell, without versions or a
    valid installed version."""
    if versions is None or parse_version(installed) is None:
        return None

    def below(version: str | None) -> bool:
        return version is not None and is_older(installed, version)

    if below(versions.get("minimumVersion")):
        return "required"
    if below(versions.get("nextMinimumVersion")):
        return "upcoming"
    if below(versions.get("latestVersion")):
        return "available"
    return "current"


def _is_https_url(value: str) -> bool:
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme == "https" and bool(parts.hostname)


def _parse_date(value: str) -> datetime | None:
    """A date and time with its time zone, such as 2026-11-01T00:00:00Z, or None."""
    if _DATE_TIME.fullmatch(value) is None:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _utc(moment: datetime) -> str:
    """A moment in UTC, as the TypeScript API writes it: 2026-11-01T00:00:00.000Z."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _setting(env: Mapping[str, str], field: str, platform: str | None) -> tuple[str, str | None]:
    """A variable's name and value for `platform`: its own when set, else the shared one."""
    if platform is not None:
        own = f"{field}_{platform.upper()}"
        value = env.get(own, "").strip()
        if value:
            return own, value
    return field, env.get(field, "").strip() or None


def _inconsistencies(env: Mapping[str, str]) -> list[str]:
    """The versions that contradict each other, for each platform and for apps naming none."""
    problems: dict[str, None] = {}  # Ordered, without repeats.
    for platform in (None, *PLATFORMS):
        minimum_key, minimum = _setting(env, "APP_MINIMUM_VERSION", platform)
        latest_key, latest = _setting(env, "APP_LATEST_VERSION", platform)
        next_key, next_minimum = _setting(env, "APP_NEXT_MINIMUM_VERSION", platform)
        from_key, start = _setting(env, "APP_NEXT_MINIMUM_VERSION_FROM", platform)
        if minimum and latest and is_older(latest, minimum):
            problems[f"{latest_key} is older than {minimum_key}"] = None
        if (next_minimum is None) != (start is None):
            problems[f"{next_key} and {from_key} go together: set both, or neither"] = None
        if next_minimum and minimum and not is_older(minimum, next_minimum):
            problems[f"{next_key} is not newer than {minimum_key}"] = None
        if next_minimum and latest and is_older(latest, next_minimum):
            problems[f"{latest_key} is older than {next_key}"] = None
    return list(problems)


def app_version_problems(env: Mapping[str, str]) -> list[str]:
    """The mistakes in the APP_* variables of `env`, which `pnpm check:env` lists before a
    deploy; none while they are unset."""
    problems: list[str] = []
    for suffix in _SUFFIXES:
        for field, kind in _FIELDS:
            key = field + suffix
            value = env.get(key, "").strip()
            if not value:
                continue
            if kind == "version" and not _VERSION.fullmatch(value):
                problems.append(f"{key} is not MAJOR.MINOR.PATCH, such as 1.4.0")
            elif kind == "date" and _parse_date(value) is None:
                problems.append(
                    f"{key} is not a date and time with its time zone, such as 2026-11-01T00:00:00Z"
                )
            elif kind == "url" and not _is_https_url(value):
                problems.append(f"{key} is not an https:// URL")
    # Checked once each is valid, so they compare versions.
    return problems or _inconsistencies(env)


def app_version(platform: str | None = None, now: datetime | None = None) -> AppVersion:
    """The versions for apps on `platform` at `now`, read on each request. A mistake in the
    variables raises ValueError: the request fails, and is reported, rather than telling the apps
    something wrong. On its date, the announced minimum becomes the one the API requires, with no
    redeploy."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    problems = app_version_problems(os.environ)
    if problems:
        raise ValueError("; ".join(problems))

    def value(field: str) -> str | None:
        return _setting(os.environ, field, platform)[1]

    next_minimum = value("APP_NEXT_MINIMUM_VERSION")
    start = value("APP_NEXT_MINIMUM_VERSION_FROM")
    starts_at = _parse_date(start) if start else None
    due = (
        next_minimum is not None
        and starts_at is not None
        and starts_at <= (now or datetime.now(UTC))
    )
    return {
        "minimumVersion": next_minimum if due else value("APP_MINIMUM_VERSION"),
        "latestVersion": value("APP_LATEST_VERSION"),
        "updateUrl": value("APP_UPDATE_URL"),
        "nextMinimumVersion": None if due else next_minimum,
        "nextMinimumFrom": None if due or starts_at is None else _utc(starts_at),
    }
