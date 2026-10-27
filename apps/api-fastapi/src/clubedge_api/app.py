"""The routes, implementing packages/contract/openapi.yaml.

They receive what they need from the composition root (server.py), so tests can pass stand-ins.
"""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from clubedge_api import telemetry  # clubedge:only observability!=none
from clubedge_api.app_version import (
    APP_PLATFORM_HEADER,
    APP_VERSION_HEADER,
    app_platform,
    update_status,
)
from clubedge_api.contract import AppVersion, GetCurrentUser
from clubedge_api.http import NO_STORE, ApiError, api_error
from clubedge_api.push import PushNotifications  # clubedge:only push!=none
from clubedge_api.rate_limit import CreateRateLimiter, create_memory_limiter
from clubedge_api.routes import billing as billing_routes  # clubedge:only payments!=none
from clubedge_api.routes.account import AccountService, account_router  # clubedge:only auth!=none
from clubedge_api.routes.app_version import app_version_router
from clubedge_api.routes.inngest import inngest_router  # clubedge:only jobs=inngest
from clubedge_api.routes.jobs import BackgroundJobs, jobs_router  # clubedge:only jobs!=none
from clubedge_api.routes.jobs_run import jobs_run_router  # clubedge:only jobs=bullmq
from clubedge_api.routes.push import push_router  # clubedge:only push!=none
from clubedge_api.settings import ClientIpSettings


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
    # The app versions installed apps check, for their platform (app_version.py); every one None
    # when absent, and then no app is refused.
    app_version: Callable[[str | None], AppVersion] | None = None
    # Where those limits find the client's address: the connection's own unless server.py says.
    client_ip_settings: ClientIpSettings = ClientIpSettings()
    # clubedge:if auth!=none
    # The account settings (account.py); they answer 503 not_configured when absent.
    account: AccountService | None = None
    # clubedge:end
    # clubedge:if observability!=none
    # How the browser reports its errors (observability.py); not at all when absent.
    browser_error_reporting: Callable[[], telemetry.BrowserErrorReporting] | None = None
    # The observability provider (observability.py), which traces each request; none when absent.
    observability: telemetry.Observability | None = None
    # clubedge:end
    # clubedge:if jobs!=none
    # Background jobs (background_jobs.py); their routes answer 404 when absent.
    jobs: BackgroundJobs | None = None
    # clubedge:end
    # clubedge:if payments!=none
    # Billing with the payment provider (server.py); payments are not configured while absent.
    payments: billing_routes.BillingDependencies | None = None
    # clubedge:end
    # clubedge:if push!=none
    # Push notifications to the mobile apps (push.py); not configured while absent.
    push: PushNotifications | None = None
    # The project's name, which the test notification shows.
    site_name: str = "Clubedge Starter"
    # clubedge:end


# What an app below the minimum version can still ask: whether the API runs, and where to update.
_SERVED_WHILE_OUTDATED = frozenset({"/api/health", "/api/ready", "/api/app-version"})


def create_app(dependencies: ApiDependencies) -> FastAPI:
    """The API. Each module's routes come from routes/, included after the session route for the
    modules this project uses, with what they need from `dependencies`."""

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        """Runs while the server does: what follows the yield runs once it has stopped taking
        requests."""
        yield
        # clubedge:if observability!=none
        if dependencies.observability is not None:
            # Send what the provider still buffers before the process exits.
            await dependencies.observability.flush()
        # clubedge:end

    # The contract is openapi.yaml, so FastAPI's generated schema and docs are not served.
    app = FastAPI(openapi_url=None, docs_url=None, redoc_url=None, lifespan=lifespan)

    async def refuse_outdated_apps(
        request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        """Apps installed on phones send their version with each request: one below the minimum
        gets 426 update_required on every route but those it needs to learn that, and where to
        update, so it shows its update screen whatever it asked."""
        installed = request.headers.get(APP_VERSION_HEADER)
        app_version = dependencies.app_version
        if not installed or app_version is None or request.url.path in _SERVED_WHILE_OUTDATED:
            return await call_next(request)
        versions: AppVersion | None = None
        # A mistake in the APP_* variables refuses no app: /api/app-version reports it.
        with suppress(ValueError):
            versions = app_version(app_platform(request.headers.get(APP_PLATFORM_HEADER)))
        if update_status(installed, versions) == "required":
            return api_error(
                426,
                "update_required",
                "This version of the app is no longer supported: update it to continue.",
            )
        return await call_next(request)

    # Added before CORS, so CORS runs first, as in the Hono API.
    app.add_middleware(BaseHTTPMiddleware, dispatch=refuse_outdated_apps)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[dependencies.frontend_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
    )
    # clubedge:if observability!=none
    from clubedge_api.tracing import RequestTracing

    # Added last, so it runs first: each request's span covers CORS and the route too.
    if dependencies.observability is not None:
        app.add_middleware(RequestTracing, observability=dependencies.observability)
    # clubedge:end

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

    app.include_router(app_version_router(app_version=dependencies.app_version))

    # clubedge:if auth!=none
    app.include_router(
        account_router(
            get_current_user=dependencies.get_current_user,
            account=dependencies.account,
            create_rate_limiter=dependencies.create_rate_limiter,
        )
    )

    # clubedge:end
    # clubedge:if observability!=none
    from clubedge_api.routes.client_errors import client_errors_router

    app.include_router(
        client_errors_router(
            create_rate_limiter=dependencies.create_rate_limiter,
            client_ip_settings=dependencies.client_ip_settings,
            browser_error_reporting=dependencies.browser_error_reporting,
        )
    )

    # clubedge:end
    # clubedge:if jobs!=none
    if dependencies.jobs:
        jobs = dependencies.jobs
        app.include_router(jobs_router(jobs=jobs, get_current_user=dependencies.get_current_user))
        app.include_router(jobs_run_router(jobs=jobs))  # clubedge:only jobs=bullmq
        app.include_router(inngest_router(jobs=jobs))  # clubedge:only jobs=inngest

    # clubedge:end
    # clubedge:if payments!=none
    app.include_router(
        billing_routes.billing_router(
            payments=dependencies.payments, get_current_user=dependencies.get_current_user
        )
    )
    # clubedge:end
    # clubedge:if push!=none
    app.include_router(
        push_router(
            get_current_user=dependencies.get_current_user,
            push=dependencies.push,
            create_rate_limiter=dependencies.create_rate_limiter,
            site_name=dependencies.site_name,
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
