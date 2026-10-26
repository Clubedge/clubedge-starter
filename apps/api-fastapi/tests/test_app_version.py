"""/api/app-version, the variables it reads, and the apps the API refuses, in process. The shared
contract suite checks the route against the live server too (`pnpm test`)."""

from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from clubedge_api.app import create_app
from clubedge_api.app_version import (
    PLATFORMS,
    app_platform,
    app_version,
    app_version_problems,
    is_older,
    parse_version,
    update_status,
)
from clubedge_api.contract import AppVersion
from clubedge_api.settings import get_settings
from tests.fakes import client, dependencies, ready

FIELDS = (
    "APP_MINIMUM_VERSION",
    "APP_LATEST_VERSION",
    "APP_NEXT_MINIMUM_VERSION",
    "APP_NEXT_MINIMUM_VERSION_FROM",
    "APP_UPDATE_URL",
)
VARIABLES = [
    field + suffix for field in FIELDS for suffix in ("", *(f"_{p.upper()}" for p in PLATFORMS))
]

UNSET: AppVersion = {
    "minimumVersion": None,
    "latestVersion": None,
    "updateUrl": None,
    "nextMinimumVersion": None,
    "nextMinimumFrom": None,
}

VERSIONS: AppVersion = {
    "minimumVersion": "1.2.0",
    "latestVersion": "1.4.1",
    "updateUrl": "https://apps.example.com/my-product",
    "nextMinimumVersion": "1.3.0",
    "nextMinimumFrom": "2026-11-01T00:00:00.000Z",
}


@pytest.fixture(autouse=True)
def no_app_versions(monkeypatch: pytest.MonkeyPatch) -> None:
    """No app version variables, whatever .env.local sets."""
    get_settings()
    for name in VARIABLES:
        monkeypatch.delenv(name, raising=False)


def set_env(monkeypatch: pytest.MonkeyPatch, **variables: str) -> None:
    for name, value in variables.items():
        monkeypatch.setenv(name, value)


def served(platform: str | None) -> AppVersion:
    return VERSIONS


def not_a_version(key: str) -> str:
    return f"{key} is not MAJOR.MINOR.PATCH, such as 1.4.0"


def test_answers_null_versions_until_they_are_set_never_cached() -> None:
    response = client().get("/api/app-version")
    assert response.status_code == 200
    assert response.json() == UNSET
    assert "no-store" in response.headers["cache-control"]


def test_serves_the_versions_from_the_composition_root() -> None:
    response = client(app_version=served).get("/api/app-version")
    assert response.status_code == 200
    assert response.json() == VERSIONS


def test_serves_the_platform_the_app_names_its_versions() -> None:
    platforms: list[str | None] = []

    def versions(platform: str | None) -> AppVersion:
        platforms.append(platform)
        return VERSIONS

    api = client(app_version=versions)
    api.get("/api/app-version", headers={"X-App-Platform": "ios"})
    api.get("/api/app-version", headers={"X-App-Platform": "web"})
    api.get("/api/app-version")
    assert platforms == ["ios", None, None]


def test_reads_the_versions_and_where_to_get_the_update(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(
        monkeypatch,
        APP_MINIMUM_VERSION="1.2.0",
        APP_LATEST_VERSION="1.10.0",
        APP_UPDATE_URL="https://apps.example.com/my-product",
    )
    assert app_version() == {
        **UNSET,
        "minimumVersion": "1.2.0",
        "latestVersion": "1.10.0",
        "updateUrl": "https://apps.example.com/my-product",
    }


def test_answers_none_for_each_empty_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    # As in a copied .env.example.
    for name in FIELDS:
        monkeypatch.setenv(name, "")
    assert app_version() == UNSET


def test_gives_a_platform_its_own_variables(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(
        monkeypatch,
        APP_MINIMUM_VERSION="1.2.0",
        APP_LATEST_VERSION="1.4.0",
        APP_LATEST_VERSION_IOS="1.3.0",
        APP_UPDATE_URL="https://example.com/download",
        APP_UPDATE_URL_IOS="https://apps.apple.com/app/id1",
    )
    ios = app_version("ios")
    assert ios["minimumVersion"] == "1.2.0"
    assert ios["latestVersion"] == "1.3.0"
    assert ios["updateUrl"] == "https://apps.apple.com/app/id1"
    android = app_version("android")
    assert android["latestVersion"] == "1.4.0"
    assert android["updateUrl"] == "https://example.com/download"


DEADLINE = datetime(2026, 11, 1, tzinfo=UTC)
ANNOUNCED = {
    "APP_MINIMUM_VERSION": "1.0.0",
    "APP_NEXT_MINIMUM_VERSION": "1.2.0",
    "APP_NEXT_MINIMUM_VERSION_FROM": "2026-11-01T01:00:00+01:00",
}


def test_announces_a_minimum_until_its_date_in_utc(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(monkeypatch, **ANNOUNCED)
    assert app_version(None, DEADLINE - timedelta(milliseconds=1)) == {
        **UNSET,
        "minimumVersion": "1.0.0",
        "nextMinimumVersion": "1.2.0",
        "nextMinimumFrom": "2026-11-01T00:00:00.000Z",
    }


def test_requires_an_announced_minimum_on_its_date(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(monkeypatch, **ANNOUNCED)
    assert app_version(None, DEADLINE) == {**UNSET, "minimumVersion": "1.2.0"}


def test_announces_a_minimum_for_one_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    set_env(
        monkeypatch,
        APP_MINIMUM_VERSION="1.0.0",
        APP_NEXT_MINIMUM_VERSION_ANDROID="1.2.0",
        APP_NEXT_MINIMUM_VERSION_FROM_ANDROID="2026-11-01T00:00:00Z",
    )
    assert app_version("android", DEADLINE)["minimumVersion"] == "1.2.0"
    assert app_version("ios", DEADLINE)["minimumVersion"] == "1.0.0"


def test_fails_the_request_rather_than_tell_the_apps_something_wrong(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_MINIMUM_VERSION", "1.2")
    with pytest.raises(ValueError, match="APP_MINIMUM_VERSION"):
        app_version()
    app = create_app(dependencies(app_version=app_version))
    response = TestClient(app, raise_server_exceptions=False).get("/api/app-version")
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "internal_error"


def test_names_each_variable_that_is_not_valid() -> None:
    assert app_version_problems({}) == []
    problems = app_version_problems(
        {
            "APP_MINIMUM_VERSION": "1.2",
            "APP_LATEST_VERSION": "v1.4.0",
            "APP_UPDATE_URL": "http://apps.example.com/my-product",
            "APP_LATEST_VERSION_IOS": "1.4",
            "APP_NEXT_MINIMUM_VERSION_FROM": "2026-11-01",
        }
    )
    assert problems == [
        not_a_version("APP_MINIMUM_VERSION"),
        not_a_version("APP_LATEST_VERSION"),
        "APP_NEXT_MINIMUM_VERSION_FROM is not a date and time with its time zone,"
        " such as 2026-11-01T00:00:00Z",
        "APP_UPDATE_URL is not an https:// URL",
        not_a_version("APP_LATEST_VERSION_IOS"),
    ]


def test_compares_the_versions_number_by_number() -> None:
    def problems(minimum: str, latest: str) -> list[str]:
        return app_version_problems({"APP_MINIMUM_VERSION": minimum, "APP_LATEST_VERSION": latest})

    assert problems("1.9.0", "1.10.0") == []
    assert problems("1.4.0", "1.4.0") == []
    assert problems("1.10.0", "1.9.0") == ["APP_LATEST_VERSION is older than APP_MINIMUM_VERSION"]


def problems_for(**env: str) -> list[str]:
    return app_version_problems(env)


def test_checks_a_platforms_own_versions_against_the_shared_ones() -> None:
    found = problems_for(APP_MINIMUM_VERSION="1.2.0", APP_LATEST_VERSION_IOS="1.1.0")
    assert found == ["APP_LATEST_VERSION_IOS is older than APP_MINIMUM_VERSION"]


def test_checks_an_announced_minimum() -> None:
    start = "2026-11-01T00:00:00Z"
    alone = problems_for(APP_NEXT_MINIMUM_VERSION="1.2.0")
    assert alone == [
        "APP_NEXT_MINIMUM_VERSION and APP_NEXT_MINIMUM_VERSION_FROM go together:"
        " set both, or neither",
    ]
    same = problems_for(
        APP_MINIMUM_VERSION="1.2.0",
        APP_NEXT_MINIMUM_VERSION="1.2.0",
        APP_NEXT_MINIMUM_VERSION_FROM=start,
    )
    assert same == ["APP_NEXT_MINIMUM_VERSION is not newer than APP_MINIMUM_VERSION"]
    beyond = problems_for(
        APP_LATEST_VERSION="1.1.0",
        APP_NEXT_MINIMUM_VERSION="1.2.0",
        APP_NEXT_MINIMUM_VERSION_FROM=start,
    )
    assert beyond == ["APP_LATEST_VERSION is older than APP_NEXT_MINIMUM_VERSION"]


def test_reads_dates_in_the_one_form_the_typescript_api_reads() -> None:
    def problems(start: str) -> list[str]:
        return problems_for(APP_NEXT_MINIMUM_VERSION="1.3.0", APP_NEXT_MINIMUM_VERSION_FROM=start)

    assert problems("2026-11-01T00:00:00Z") == []
    assert problems("2026-11-01T01:00:00.000+01:00") == []
    assert problems("2028-02-29T00:00:00Z") == []
    not_a_date = (
        "APP_NEXT_MINIMUM_VERSION_FROM is not a date and time with its time zone,"
        " such as 2026-11-01T00:00:00Z"
    )
    for start in (
        "2026-11-01 00:00:00Z",
        "2026-W44-7T00:00:00Z",
        "2026-11-01T00:00:00",
        "2026-11-01T01:00+01:00",
        "2026-11-01T00:00:00+0100",
        "2026-11-01T24:00:00Z",
        "2026-02-30T00:00:00Z",
    ):
        assert problems(start) == [not_a_date]


def outdated(path: str, version: str = "1.1.9") -> int:
    api = client(app_version=served, is_ready=ready)
    status: int = api.get(path, headers={"X-App-Version": version}).status_code
    return status


def test_answers_an_app_below_the_minimum_426_update_required() -> None:
    response = client(app_version=served).get("/api/session", headers={"X-App-Version": "1.1.9"})
    assert response.status_code == 426
    assert response.json()["error"]["code"] == "update_required"


def test_refuses_an_app_by_the_minimum_of_its_platform() -> None:
    def by_platform(platform: str | None) -> AppVersion:
        versions = VERSIONS.copy()
        versions["minimumVersion"] = "1.3.0" if platform == "ios" else "1.2.0"
        return versions

    api = client(app_version=by_platform)

    def status(platform: str) -> int:
        headers = {"X-App-Version": "1.2.5", "X-App-Platform": platform}
        code: int = api.get("/api/session", headers=headers).status_code
        return code

    assert status("ios") == 426
    assert status("android") == 200


def test_still_tells_an_app_below_the_minimum_whether_and_where_to_update() -> None:
    for path in ("/api/health", "/api/ready", "/api/app-version"):
        assert outdated(path) == 200


def test_refuses_only_apps_below_the_minimum() -> None:
    assert outdated("/api/session", "1.2.0") == 200
    assert outdated("/api/session", "beta") == 200
    assert client(app_version=served).get("/api/session").status_code == 200


def test_serves_apps_while_the_variables_have_a_mistake(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_MINIMUM_VERSION", "1.2")
    api = client(app_version=app_version)
    assert api.get("/api/session", headers={"X-App-Version": "0.1.0"}).status_code == 200


# The same rules as the apps' and the TypeScript API's (packages/contract/src/app-version.ts).
def test_follows_the_shared_version_rules() -> None:
    assert parse_version(" 1.0 ") == (1, 0, 0)
    assert parse_version("1.4.0-beta") is None
    assert is_older("1.9.0", "1.10.0")
    assert not is_older("beta", "1.0.0")
    assert app_platform(" Android ") == "android"
    assert app_platform("web") is None
    assert update_status("1.1.0", VERSIONS) == "required"
    assert update_status("1.2.0", VERSIONS) == "upcoming"
    assert update_status("1.3.0", VERSIONS) == "available"
    assert update_status("1.4.1", VERSIONS) == "current"
    assert update_status("beta", VERSIONS) is None
    assert update_status("1.0.0", None) is None
