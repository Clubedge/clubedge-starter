"""Request tracing: a span for each API request, as the Hono API traces its requests."""

import logging

from starlette.types import ASGIApp, Receive, Scope, Send

from clubedge_api.telemetry import Observability

logger = logging.getLogger(__name__)


class RequestTracing:
    """Traces each request as a span named by its method and path, such as "GET /api/health",
    with those as its attributes. An error that escapes a route is reported inside the span, with
    the request's method and path, so the report is recorded on the span too; the app then
    answers 500."""

    def __init__(self, app: ASGIApp, *, observability: Observability) -> None:
        self.app = app
        self.observability = observability

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        path: str = scope.get("path", "")
        if scope["type"] != "http" or not (path == "/api" or path.startswith("/api/")):
            await self.app(scope, receive, send)
            return
        method: str = scope["method"]
        # The path has no query string, which can carry tokens.
        attributes = {"http.request.method": method, "url.path": path}
        failure: Exception | None = None
        with self.observability.traced(f"{method} {path}", attributes):
            try:
                await self.app(scope, receive, send)
            except Exception as error:
                logger.exception("Request failed", extra=attributes)
                failure = error
        if failure is not None:
            raise failure
