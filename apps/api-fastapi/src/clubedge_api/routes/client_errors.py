"""Browser error reports: GET says how the browser reports its errors, read at runtime rather than
at build time; POST takes a report and reports it like a server error."""

import logging
import re
from collections.abc import Callable
from typing import Literal, NotRequired, TypedDict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from clubedge_api.http import NO_STORE, ApiError, json_only, limit_body, read_json
from clubedge_api.rate_limit import CreateRateLimiter, rate_limit
from clubedge_api.settings import ClientIpSettings
from clubedge_api.telemetry import BrowserErrorReporting

logger = logging.getLogger(__name__)

MAX_BODY = 16_384

ClientErrorKind = Literal["error", "unhandledrejection", "render"]
_KINDS: tuple[ClientErrorKind, ...] = ("error", "unhandledrejection", "render")


class ClientErrorReport(TypedDict):
    """An uncaught error, an unhandled rejection, or a render error that a boundary caught."""

    kind: ClientErrorKind
    name: str
    message: str
    stack: NotRequired[str]
    # The page's path, without its query string.
    path: str


def _text(value: object, limit: int) -> str | None:
    return value[:limit] if isinstance(value, str) and value.strip() else None


def parse_client_error_report(body: object) -> ClientErrorReport | None:
    """Reads a report the browser sent, keeping only the expected fields within size limits and
    dropping query strings, which can carry tokens. None for anything else."""
    if not isinstance(body, dict):
        return None
    kind = next((candidate for candidate in _KINDS if candidate == body.get("kind")), None)
    message = _text(body.get("message"), 1_000)
    path = _text(body.get("path"), 300)
    if kind is None or message is None or path is None or not path.startswith("/"):
        return None
    report: ClientErrorReport = {
        "kind": kind,
        "name": _text(body.get("name"), 100) or "Error",
        "message": message,
        "path": re.split(r"[?#]", path, maxsplit=1)[0],
    }
    stack = _text(body.get("stack"), 8_000)
    if stack is not None:
        report["stack"] = stack
    return report


class ClientError(Exception):
    """An error that happened in the browser, as a server-side exception to report. The browser's
    stack follows the message as a note, since no Python traceback can carry it."""

    def __init__(self, report: ClientErrorReport) -> None:
        name, message = report["name"], report["message"]
        super().__init__(f"{name}: {message}")
        if "stack" in report:
            self.add_note(report["stack"])


def client_errors_router(
    *,
    create_rate_limiter: CreateRateLimiter,
    client_ip_settings: ClientIpSettings,
    browser_error_reporting: Callable[[], BrowserErrorReporting] | None,
) -> APIRouter:
    """The browser's reporting settings, from `browser_error_reporting` (none without it), and
    the reports it posts, 30 a minute per address (found by `client_ip_settings`)."""
    router = APIRouter()
    # Per address, so a broken page in one browser cannot flood the error reports.
    limiter = create_rate_limiter(30, 60)

    @router.get("/api/client-errors")
    async def reporting() -> JSONResponse:
        if browser_error_reporting is None:
            return JSONResponse({"provider": "none"}, headers=NO_STORE)
        return JSONResponse(browser_error_reporting(), headers=NO_STORE)

    @router.post(
        "/api/client-errors",
        dependencies=[
            Depends(
                rate_limit(limiter, scope="client-errors", client_ip_settings=client_ip_settings)
            ),
            Depends(json_only),
            Depends(limit_body(MAX_BODY)),
        ],
    )
    async def report(request: Request) -> Response:
        # limit_body has answered 413 already when the body outgrew MAX_BODY.
        parsed = parse_client_error_report(await read_json(request))
        if parsed is None:
            raise ApiError(
                400, "invalid_report", "The error report is not valid.", headers=NO_STORE
            )
        logger.error(
            "Browser error",
            exc_info=ClientError(parsed),
            extra={"url.path": parsed["path"], "browser.event": parsed["kind"]},
        )
        return Response(status_code=204)

    return router
