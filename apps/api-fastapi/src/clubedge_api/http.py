"""What routes share: the contract's error shape, and request guards for mutating routes.

A guard is a FastAPI dependency that a route lists in the order it runs, such as
`dependencies=[Depends(json_only), Depends(limit_body(16_384))]`. It refuses a request by raising
ApiError, which the app answers in the contract's shape.
"""

import json
import re
from collections.abc import Awaitable, Callable, Mapping
from typing import Final

from fastapi import Request
from fastapi.responses import JSONResponse

from clubedge_api.contract import ErrorBody

# A route guard: refuses the request by raising ApiError, else lets it through.
Guard = Callable[[Request], Awaitable[None]]

# For answers that depend on who asks or change from one moment to the next: never cached.
NO_STORE: Final[Mapping[str, str]] = {"Cache-Control": "no-store"}

_JSON_CONTENT_TYPE = re.compile(r"application/json\s*(;|$)", re.IGNORECASE)


def api_error(
    status: int, code: str, message: str, *, headers: Mapping[str, str] | None = None
) -> JSONResponse:
    """A JSON error in the contract's shape, such as 401 unauthorized."""
    body: ErrorBody = {"error": {"code": code, "message": message}}
    return JSONResponse(body, status_code=status, headers=headers)


class ApiError(Exception):
    """Answers the request with api_error, raised from a route or a guard."""

    def __init__(
        self, status: int, code: str, message: str, *, headers: Mapping[str, str] | None = None
    ) -> None:
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.headers = headers

    def response(self) -> JSONResponse:
        return api_error(self.status, self.code, self.message, headers=self.headers)


async def json_only(request: Request) -> None:
    """Accepts only JSON on a mutating route. Another site can make a browser post a form
    (urlencoded, multipart, or text/plain) with the user's cookies, but not JSON: that needs a
    CORS preflight, which only the frontend's origin passes. Webhooks are signed by their sender
    instead."""
    if not _JSON_CONTENT_TYPE.match(request.headers.get("content-type", "")):
        raise ApiError(415, "unsupported_media_type", "Send the request body as JSON.")


def _too_large() -> ApiError:
    return ApiError(413, "payload_too_large", "The request body is too large.")


def limit_body(max_size: int) -> Guard:
    """Refuses a body over `max_size` bytes with 413, while it streams in. The route then reads
    the body with request.body() or read_json, which return what the guard read."""

    async def guard(request: Request) -> None:
        declared = request.headers.get("content-length", "")
        if declared.isdecimal() and int(declared) > max_size:
            raise _too_large()
        body = bytearray()
        async for chunk in request.stream():
            body += chunk
            if len(body) > max_size:
                raise _too_large()
        # Starlette's Request keeps a body it has read: request.body() returns this one.
        request._body = bytes(body)

    return guard


async def read_json(request: Request) -> object:
    """The body as JSON, or None when it is not JSON. Behind limit_body, it reads what the guard
    read, so a large body has had its 413 already."""
    body = await request.body()
    try:
        parsed: object = json.loads(body)
    except ValueError:
        return None
    return parsed
