"""Push notifications' endpoints: the mobile apps save their device's push token for the
signed-in user, forget it when they sign out, and ask for a test notification. Sending itself
happens from the server's own code, through push.py's PushNotifications."""

import logging
import math
import time
from typing import Annotated, TypedDict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse, Response

from clubedge_api.contract import GetCurrentUser, User
from clubedge_api.http import NO_STORE, ApiError, json_only, limit_body, read_json
from clubedge_api.push import (
    PUSH_SERVICES,
    PushDevice,
    PushMessage,
    PushNotifications,
    PushResult,
    is_push_token,
)
from clubedge_api.rate_limit import CreateRateLimiter

logger = logging.getLogger(__name__)


class PushTestResult(TypedDict):
    """POST /api/push/test's answer (openapi.yaml's PushTestResult)."""

    sent: int
    removed: int


MAX_BODY = 8_192
MAX_TOKEN = 4_096

NOT_CONFIGURED = "Push notifications are not set up on this server."
SERVICE_NAMES = {"expo": "Expo's push service", "fcm": "FCM", "apns": "APNs"}


def _token(body: object) -> str | None:
    if not isinstance(body, dict):
        return None
    token = body.get("token")
    return token if isinstance(token, str) and 1 <= len(token) <= MAX_TOKEN else None


def _device(body: object) -> PushDevice | None:
    """The device a registration sends, or None when the body is not one."""
    token = _token(body)
    if token is None or not isinstance(body, dict):
        return None
    platform = body.get("platform")
    if platform not in ("ios", "android"):
        return None
    for service in PUSH_SERVICES:
        if body.get("service") == service and is_push_token(service, token):
            return {
                "token": token,
                "service": service,
                "platform": "ios" if platform == "ios" else "android",
            }
    return None


def push_router(
    *,
    get_current_user: GetCurrentUser,
    push: PushNotifications | None,
    create_rate_limiter: CreateRateLimiter,
    site_name: str,
) -> APIRouter:
    """POST /api/push/devices, POST /api/push/devices/remove, and POST /api/push/test. Without
    `push`, they answer 503 not_configured."""
    router = APIRouter()
    # Test notifications, per user: each one reaches every device the user has.
    limiter = create_rate_limiter(5, 60)
    guards = [Depends(json_only), Depends(limit_body(MAX_BODY))]

    async def signed_in(request: Request) -> User:
        user = await get_current_user(request)
        if user is None:
            raise ApiError(401, "unauthorized", "Sign in first.", headers=NO_STORE)
        return user

    @router.post("/api/push/devices", dependencies=guards)
    async def register_device(
        request: Request, user: Annotated[User, Depends(signed_in)]
    ) -> Response:
        if push is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED, headers=NO_STORE)
        device = _device(await read_json(request))
        if device is None:
            raise ApiError(
                400,
                "invalid_input",
                "Send the device's push token, its service, and its platform.",
                headers=NO_STORE,
            )
        if device["service"] not in push.services:
            names = " and ".join(SERVICE_NAMES[service] for service in push.services)
            raise ApiError(
                400,
                "invalid_input",
                f"This server sends notifications through {names}.",
                headers=NO_STORE,
            )
        await push.register(user, device)
        return Response(status_code=204, headers=NO_STORE)

    @router.post("/api/push/devices/remove", dependencies=guards)
    async def remove_device(request: Request) -> Response:
        token = _token(await read_json(request))
        if token is None:
            raise ApiError(400, "invalid_input", "Send the device's push token.")
        if push is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED)
        await push.remove(token)
        return Response(status_code=204)

    @router.post("/api/push/test", dependencies=guards)
    async def send_test(user: Annotated[User, Depends(signed_in)]) -> JSONResponse:
        if push is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED, headers=NO_STORE)
        try:
            limit = await limiter.limit(f"push-test:{user['id']}")
        except Exception:
            logger.exception("Rate limiter unavailable")
            raise ApiError(
                503,
                "unavailable",
                "Test notifications are unavailable right now.",
                headers=NO_STORE,
            ) from None
        if not limit.success:
            seconds = max(1, math.ceil(limit.reset_at - time.time()))
            raise ApiError(
                429,
                "rate_limited",
                "Too many test notifications. Try again later.",
                headers={**NO_STORE, "Retry-After": str(seconds)},
            )
        result: PushResult | None
        try:
            result = await push.send(
                user,
                PushMessage(site_name, "Notifications work on this device.", {"url": "/"}),
            )
        except Exception:
            logger.exception("Push notification failed")
            raise ApiError(
                503,
                "unavailable",
                "The push service did not take the notification. Try again later.",
                headers=NO_STORE,
            ) from None
        if result is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED, headers=NO_STORE)
        body: PushTestResult = {"sent": result.sent, "removed": len(result.invalid_tokens)}
        return JSONResponse(body, headers=NO_STORE)

    return router
