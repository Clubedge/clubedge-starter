"""The routes, implementing packages/contract/openapi.yaml.

They receive what they need from the composition root (server.py), so tests can pass stand-ins.
"""

from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from clubedge_api.contract import GetCurrentUser
from clubedge_api.http import NO_STORE, ApiError, api_error
from clubedge_api.rate_limit import CreateRateLimiter, create_memory_limiter
from clubedge_api.routes import billing as billing_routes  # clubedge:only payments!=none


@dataclass(frozen=True)
class ApiDependencies:
    """What the routes need from the composition root (server.py), so tests can pass stand-ins.

    A module's own dependency is optional, None by default: without it, its routes answer as the
    Hono API's do (404 not_found, or 503 not_configured).
    """

    service_id: str
    is_ready: Callable[[], Awaitable[bool]]
    get_current_user: GetCurrentUser
    frontend_origin: str = "http://localhost:3000"
    # Makes the limits for routes anyone can call: in process memory unless server.py says where.
    create_rate_limiter: CreateRateLimiter = create_memory_limiter
    # clubedge:if payments!=none
    # Billing with the payment provider (server.py); payments are not configured while absent.
    payments: billing_routes.BillingDependencies | None = None
    # clubedge:end


def create_app(dependencies: ApiDependencies) -> FastAPI:
    """The API. Each module's routes come from routes/, included after the session route for the
    modules this project uses, with what they need from `dependencies`."""
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
            headers=NO_STORE,
        )

    @app.get("/api/session")
    async def session(request: Request) -> dict[str, Any]:
        return {"user": await dependencies.get_current_user(request)}

    # clubedge:if payments!=none
    app.include_router(
        billing_routes.billing_router(
            payments=dependencies.payments, get_current_user=dependencies.get_current_user
        )
    )
    # clubedge:end

    @app.exception_handler(ApiError)
    async def refused(request: Request, exc: ApiError) -> JSONResponse:
        return exc.response()

    @app.exception_handler(RequestValidationError)
    async def invalid_input(request: Request, exc: RequestValidationError) -> JSONResponse:
        return api_error(400, "invalid_input", "The request is not valid.")

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        # As in the Hono API, a method a path doesn't take is as unknown as a path it lacks.
        if exc.status_code in (404, 405):
            return api_error(404, "not_found", "No such API endpoint.")
        return api_error(exc.status_code, "http_error", str(exc.detail))

    @app.exception_handler(Exception)
    async def internal_error(request: Request, exc: Exception) -> JSONResponse:
        return api_error(500, "internal_error", "Something went wrong.")

    return app
