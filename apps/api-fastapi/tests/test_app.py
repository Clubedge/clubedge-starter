"""The routes in process. The shared contract suite also runs against the live server
(`pnpm test`, through clubedge-contract-check)."""

from tests.fakes import client, not_ready, ready


def test_health_reports_the_service_and_the_time() -> None:
    response = client().get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "my-product"
    assert body["timestamp"]


def test_ready_matches_the_database_and_is_never_cached() -> None:
    for is_ready, status, text in [(ready, 200, "ok"), (not_ready, 503, "unavailable")]:
        response = client(is_ready=is_ready).get("/api/ready")
        assert response.status_code == status
        assert response.json() == {"status": text}
        assert "no-store" in response.headers["cache-control"]


def test_session_has_no_user_when_signed_out() -> None:
    response = client().get("/api/session")
    assert response.status_code == 200
    assert response.json() == {"user": None}


def test_unknown_paths_are_json_not_found_errors() -> None:
    response = client().get("/api/no-such-endpoint")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "not_found"


def test_a_method_a_path_does_not_take_is_not_found_too() -> None:
    response = client().post("/api/health")
    assert response.status_code == 404
    assert response.json() == {"error": {"code": "not_found", "message": "No such API endpoint."}}
