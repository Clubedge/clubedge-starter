"""The routes, implementing packages/contract/openapi.yaml.

They receive what they need from the composition root (server.py), so tests can pass stand-ins.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, TypedDict

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException


class User(TypedDict):
    id: str
    email: str
    displayName: str | None


@dataclass(frozen=True)
class ApiDependencies:
    service_id: str
    is_ready: Callable[[], Awaitable[bool]]
    get_current_user: Callable[[Request], Awaitable[User | None]]
    frontend_origin: str = "http://localhost:3000"


def error(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def create_app(dependencies: ApiDependencies) -> FastAPI:
    # The contract is openapi.yaml, so FastAPI's generated schema and docs are not served.
    app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[dependencies.frontend_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        return {
            "status": "ok",
            "service": dependencies.service_id,
            "timestamp": datetime.now(UTC).isoformat(),
        }

    @app.get("/api/ready")
    async def ready() -> JSONResponse:
        is_ready = await dependencies.is_ready()
        return JSONResponse(
            {"status": "ok" if is_ready else "unavailable"},
            status_code=200 if is_ready else 503,
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/api/session")
    async def session(request: Request) -> dict[str, Any]:
        return {"user": await dependencies.get_current_user(request)}

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        if exc.status_code == 404:
            return error("not_found", "No such API endpoint.", 404)
        return error("http_error", str(exc.detail), exc.status_code)

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        return error("internal_error", "Something went wrong.", 500)

    return app
