"""The route guards and the contract's error shape."""

from collections.abc import Iterator

import httpx
from fastapi import Depends, Request
from fastapi.responses import JSONResponse, PlainTextResponse
from fastapi.testclient import TestClient

from clubedge_api.app import create_app
from clubedge_api.http import ApiError, json_only, limit_body, read_json
from tests.fakes import dependencies

NOT_JSON = {"code": "unsupported_media_type", "message": "Send the request body as JSON."}
TOO_LARGE = {"code": "payload_too_large", "message": "The request body is too large."}


def guarded_client() -> TestClient:
    app = create_app(dependencies())

    @app.post("/json", dependencies=[Depends(json_only)])
    async def json_route() -> JSONResponse:
        return JSONResponse({"ok": True})

    @app.post("/small", dependencies=[Depends(limit_body(16))])
    async def small(request: Request) -> PlainTextResponse:
        return PlainTextResponse(await request.body())

    @app.post("/parse", dependencies=[Depends(json_only), Depends(limit_body(1024))])
    async def parse(request: Request) -> JSONResponse:
        return JSONResponse({"body": await read_json(request)})

    @app.get("/error")
    async def error() -> JSONResponse:
        raise ApiError(409, "conflict", "Already there.", headers={"Retry-After": "5"})

    return TestClient(app)


def post(path: str, body: str, content_type: str | None = None) -> httpx.Response:
    headers = {"content-type": content_type} if content_type else {}
    response: httpx.Response = guarded_client().post(path, content=body, headers=headers)
    return response


def test_accepts_json_and_refuses_what_a_cross_site_form_can_send() -> None:
    for content_type in ["application/json", "application/json; charset=utf-8", "Application/JSON"]:
        assert post("/json", "{}", content_type).status_code == 200, content_type
    for refused in ["text/plain", "application/x-www-form-urlencoded", "application/jsonp", None]:
        response = post("/json", "{}", refused)
        assert response.status_code == 415, refused
        assert response.json() == {"error": NOT_JSON}


def test_refuses_a_body_over_the_limit() -> None:
    response = post("/small", "within")
    assert response.status_code == 200
    assert response.text == "within"
    response = post("/small", "x" * 17)
    assert response.status_code == 413
    assert response.json() == {"error": TOO_LARGE}


def test_counts_a_body_that_streams_in_without_a_length() -> None:
    def chunks() -> Iterator[bytes]:
        yield b"x" * 10
        yield b"x" * 10

    response = guarded_client().post("/small", content=chunks())
    assert response.status_code == 413
    assert response.json() == {"error": TOO_LARGE}


def test_reads_the_json_body_behind_the_limit() -> None:
    response = post("/parse", '{"name": "Ada"}', "application/json")
    assert response.json() == {"body": {"name": "Ada"}}
    assert post("/parse", "not json", "application/json").json() == {"body": None}


def test_answers_errors_in_the_contracts_shape() -> None:
    response = guarded_client().get("/error")
    assert response.status_code == 409
    assert response.json() == {"error": {"code": "conflict", "message": "Already there."}}
    assert response.headers["retry-after"] == "5"
