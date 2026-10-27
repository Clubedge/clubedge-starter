"""The production variables `pnpm check:env` requires, for the modules this project has."""

import pytest

from clubedge_api.production_env import (
    ProductionEnvCheck,
    check_production_env,
    is_local_url,
    required_variables,
)

REQUIRED = {requirement.key for requirement in required_variables()}


def complete(**values: str) -> dict[str, str]:
    """A value for every variable this API requires, whichever modules it has, and `values`."""
    return {**{key: "https://service.example.com" for key in REQUIRED}, **values}


def test_passes_when_every_required_variable_is_set() -> None:
    assert check_production_env(complete()) == ProductionEnvCheck()
    assert check_production_env(complete()).ok


def test_always_requires_the_database() -> None:
    missing = {requirement.key for requirement in check_production_env({}).missing}
    assert "DATABASE_URL" in missing


def test_counts_empty_values_as_unset() -> None:
    missing = check_production_env(complete(DATABASE_URL="  ")).missing
    assert [requirement.key for requirement in missing] == ["DATABASE_URL"]


# clubedge:if framework!=none
def test_requires_the_frontends_url() -> None:
    missing = {requirement.key for requirement in check_production_env({}).missing}
    assert "FRONTEND_URL" in missing


def test_rejects_urls_to_this_machine() -> None:
    result = check_production_env(complete(FRONTEND_URL="http://localhost:3000"))
    assert result.local == ["FRONTEND_URL"]


def test_rejects_a_url_that_is_not_absolute() -> None:
    result = check_production_env(complete(FRONTEND_URL="my-app.example.com"))
    assert result.invalid == ["FRONTEND_URL is not an absolute URL"]


# clubedge:end
def test_checks_where_rate_limits_find_the_client_address() -> None:
    assert check_production_env(complete(TRUSTED_PROXY_HOPS="1")).ok
    result = check_production_env(complete(TRUSTED_PROXY_HOPS="1", CLIENT_IP_HEADER="x real ip"))
    assert result.invalid == [
        'CLIENT_IP_HEADER must be a header name, such as x-real-ip, not "x real ip"'
    ]


def test_checks_the_optional_direct_database_url() -> None:
    def direct(url: str) -> ProductionEnvCheck:
        return check_production_env(complete(DATABASE_URL_DIRECT=url))

    assert direct("postgresql://u:p@ep-x-1.eu-central-1.aws.neon.tech/neondb").ok
    assert direct("postgresql://u:p@localhost:5432/app").local == ["DATABASE_URL_DIRECT"]
    assert direct("https://db.example.com/app").invalid == [
        "DATABASE_URL_DIRECT is not a postgresql:// URL"
    ]
    assert direct("postgresql://u:p@ep-x-1-pooler.eu-central-1.aws.neon.tech/neondb").invalid == [
        "DATABASE_URL_DIRECT points at Neon's pooler: use the host without -pooler"
    ]


def test_checks_the_optional_app_versions() -> None:
    versions = complete(
        APP_MINIMUM_VERSION="1.2.0",
        APP_LATEST_VERSION="1.10.0",
        APP_UPDATE_URL="https://apps.example.com/my-product",
    )
    assert check_production_env(versions).ok
    assert check_production_env(complete(APP_MINIMUM_VERSION="1.2")).invalid == [
        "APP_MINIMUM_VERSION is not MAJOR.MINOR.PATCH, such as 1.4.0"
    ]
    older = complete(APP_MINIMUM_VERSION="1.10.0", APP_LATEST_VERSION="1.9.0")
    assert check_production_env(older).invalid == [
        "APP_LATEST_VERSION is older than APP_MINIMUM_VERSION"
    ]
    http = complete(APP_UPDATE_URL="http://apps.example.com/my-product")
    assert check_production_env(http).invalid == ["APP_UPDATE_URL is not an https:// URL"]


@pytest.mark.skipif("INNGEST_SIGNING_KEY" not in REQUIRED, reason="this project has no Inngest")
def test_refuses_the_inngest_dev_server_in_production() -> None:
    assert check_production_env(complete(INNGEST_DEV="1")).invalid == [
        "INNGEST_DEV is set: production uses Inngest Cloud's keys, so remove it"
    ]
    assert check_production_env(complete(INNGEST_DEV="0")).ok


@pytest.mark.skipif("FIREBASE_API_KEY" not in REQUIRED, reason="this project has no Firebase")
def test_refuses_the_firebase_auth_emulator_in_production() -> None:
    result = check_production_env(complete(FIREBASE_AUTH_EMULATOR_HOST="127.0.0.1:9099"))
    assert result.invalid == [
        "FIREBASE_AUTH_EMULATOR_HOST is set: production uses your Firebase project, so remove it"
    ]


@pytest.mark.skipif("EMAIL_FROM" not in REQUIRED, reason="this project sends no email")
def test_refuses_the_example_com_sender_of_env_example() -> None:
    result = check_production_env(complete(EMAIL_FROM="App <no-reply@example.com>"))
    assert result.invalid == [
        "EMAIL_FROM still uses example.com: set a sender on a domain you verified"
    ]
    assert check_production_env(complete(EMAIL_FROM="App <hi@mail.example.org>")).ok


# clubedge:if push=native
def test_refuses_a_push_service_with_only_some_of_its_credentials() -> None:
    fcm = {"FCM_PROJECT_ID": "my-product", "FCM_CLIENT_EMAIL": "push@my-product.example"}
    assert check_production_env(complete(**fcm)).invalid == ["FCM needs FCM_PRIVATE_KEY too"]
    assert check_production_env(complete(**fcm, FCM_PRIVATE_KEY="key")).ok
    assert check_production_env(complete(APNS_ENVIRONMENT="staging")).invalid == [
        "APNS_ENVIRONMENT must be production or development"
    ]


# clubedge:end
def test_tells_local_urls_from_hosted_ones() -> None:
    for url in [
        "http://localhost:3000",
        "redis://127.0.0.1:6379",
        "http://[::1]:3001",
        "http://0.0.0.0:3001",
        "http://app.localhost",
        "http://host.docker.internal:5432",
    ]:
        assert is_local_url(url), url
    for url in ["https://example.com", "postgresql://u:p@db.example.com/app", "not a url"]:
        assert not is_local_url(url), url
