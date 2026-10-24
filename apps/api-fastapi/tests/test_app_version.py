"""/api/app-version and the variables it reads, in process. The shared contract suite checks the
route against the live server too (`pnpm test`)."""

import pytest
from fastapi.testclient import TestClient

from clubedge_api.app import create_app
from clubedge_api.app_version import app_version, app_version_problems
from clubedge_api.contract import AppVersion
from clubedge_api.settings import get_settings
from tests.fakes import client, dependencies

VARIABLES = ("APP_MINIMUM_VERSION", "APP_LATEST_VERSION", "APP_UPDATE_URL")


@pytest.fixture(autouse=True)
def no_app_versions(monkeypatch: pytest.MonkeyPatch) -> None:
    """No app version variables, whatever .env.local sets."""
    get_settings()
    for name in VARIABLES:
        monkeypatch.delenv(name, raising=False)


def not_a_version(key: str) -> str:
    return f"{key} is not MAJOR.MINOR.PATCH, such as 1.4.0"


def test_answers_null_versions_until_they_are_set_never_cached() -> None:
    response = client().get("/api/app-version")
    assert response.status_code == 200
    assert response.json() == {"minimumVersion": None, "latestVersion": None, "updateUrl": None}
    assert "no-store" in response.headers["cache-control"]


def test_serves_the_versions_from_the_composition_root() -> None:
    def versions() -> AppVersion:
        return {
            "minimumVersion": "1.2.0",
            "latestVersion": "1.4.1",
            "updateUrl": "https://apps.example.com/my-product",
        }

    response = client(app_version=versions).get("/api/app-version")
    assert response.status_code == 200
    assert response.json() == versions()


def test_reads_the_versions_and_where_to_get_the_update(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_MINIMUM_VERSION", "1.2.0")
    monkeypatch.setenv("APP_LATEST_VERSION", "1.10.0")
    monkeypatch.setenv("APP_UPDATE_URL", "https://apps.example.com/my-product")
    assert app_version() == {
        "minimumVersion": "1.2.0",
        "latestVersion": "1.10.0",
        "updateUrl": "https://apps.example.com/my-product",
    }


def test_answers_none_for_each_empty_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    # As in a copied .env.example.
    for name in VARIABLES:
        monkeypatch.setenv(name, "")
    assert app_version() == {"minimumVersion": None, "latestVersion": None, "updateUrl": None}


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
        }
    )
    assert problems == [
        not_a_version("APP_MINIMUM_VERSION"),
        not_a_version("APP_LATEST_VERSION"),
        "APP_UPDATE_URL is not an https:// URL",
    ]


def test_compares_the_versions_number_by_number() -> None:
    def problems(minimum: str, latest: str) -> list[str]:
        return app_version_problems({"APP_MINIMUM_VERSION": minimum, "APP_LATEST_VERSION": latest})

    assert problems("1.9.0", "1.10.0") == []
    assert problems("1.4.0", "1.4.0") == []
    assert problems("1.10.0", "1.9.0") == ["APP_LATEST_VERSION is older than APP_MINIMUM_VERSION"]
