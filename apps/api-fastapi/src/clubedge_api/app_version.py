"""What /api/app-version tells the apps installed on phones, from APP_MINIMUM_VERSION,
APP_LATEST_VERSION, and APP_UPDATE_URL. Unset, each is None."""

import os
import re
from collections.abc import Mapping
from urllib.parse import urlsplit

from clubedge_api.contract import AppVersion
from clubedge_api.settings import get_settings

# MAJOR.MINOR.PATCH, such as 1.4.0.
_VERSION = re.compile(r"[0-9]+\.[0-9]+\.[0-9]+")


def _numbers(version: str) -> tuple[int, ...]:
    """A version's numbers, which compare one by one: 1.9.0 is older than 1.10.0."""
    return tuple(int(number) for number in version.split("."))


def _is_https_url(value: str) -> bool:
    try:
        parts = urlsplit(value)
    except ValueError:
        return False
    return parts.scheme == "https" and bool(parts.hostname)


def app_version_problems(env: Mapping[str, str]) -> list[str]:
    """The mistakes in the APP_* variables of `env`, which `pnpm check:env` lists before a
    deploy; none while they are unset."""
    minimum = env.get("APP_MINIMUM_VERSION", "").strip()
    latest = env.get("APP_LATEST_VERSION", "").strip()
    update_url = env.get("APP_UPDATE_URL", "").strip()
    problems = [
        f"{key} is not MAJOR.MINOR.PATCH, such as 1.4.0"
        for key, version in [("APP_MINIMUM_VERSION", minimum), ("APP_LATEST_VERSION", latest)]
        if version and not _VERSION.fullmatch(version)
    ]
    if update_url and not _is_https_url(update_url):
        problems.append("APP_UPDATE_URL is not an https:// URL")
    # Checked once the rest is valid, so it compares two versions.
    if not problems and minimum and latest and _numbers(latest) < _numbers(minimum):
        problems.append("APP_LATEST_VERSION is older than APP_MINIMUM_VERSION")
    return problems


def app_version() -> AppVersion:
    """The versions, read on each request. A mistake in the variables raises ValueError: the
    request fails, and is reported, rather than telling the apps something wrong."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    problems = app_version_problems(os.environ)
    if problems:
        raise ValueError("; ".join(problems))
    return {
        "minimumVersion": os.environ.get("APP_MINIMUM_VERSION", "").strip() or None,
        "latestVersion": os.environ.get("APP_LATEST_VERSION", "").strip() or None,
        "updateUrl": os.environ.get("APP_UPDATE_URL", "").strip() or None,
    }
