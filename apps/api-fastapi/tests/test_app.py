"""The routes in process. The shared contract suite also runs against the live server
(`pnpm test`, through clubedge-contract-check)."""

from fastapi import Request
from fastapi.testclient import TestClient

from clubedge_api.app import ApiDependencies, User, create_app


def client(ready: bool) -> TestClient:
    async def is_ready() -> bool:
        return ready

    async def no_user(request: Request) -> User | None:
        return None

    return TestClient(create_app(ApiDependencies("my-product", is_ready, no_user)))


def test_health_reports_the_service_and_the_time() -> None:
    response = client(ready=False).get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "my-product"
    assert body["timestamp"]


def test_ready_matches_the_database_and_is_never_cached() -> None:
    for ready, status, text in [(True, 200, "ok"), (False, 503, "unavailable")]:
        response = client(ready).get("/api/ready")
        assert response.status_code == status
        assert response.json() == {"status": text}
        assert "no-store" in response.headers["cache-control"]


def test_session_has_no_user_when_signed_out() -> None:
    response = client(ready=False).get("/api/session")
    assert response.status_code == 200
    assert response.json() == {"user": None}


def test_unknown_paths_are_json_not_found_errors() -> None:
    response = client(ready=False).get("/api/no-such-endpoint")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"
