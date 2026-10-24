"""Billing: the plans and the user's subscription, checkout and the billing portal on the payment
provider's hosted pages, and the provider's webhook, which records subscriptions."""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Literal, TypedDict

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from clubedge_api.contract import GetCurrentUser, User
from clubedge_api.http import NO_STORE, ApiError, json_only, limit_body, read_json
from clubedge_api.payments import (
    Billing,
    NoBillingAccountError,
    Subscription,
    WebhookResult,
    WebhookVerificationError,
    is_entitled,
)
from clubedge_api.plans import PLANS, Plan, find_plan

logger = logging.getLogger(__name__)

MAX_BODY = 16_384
# Stripe's events are far smaller; the limit only stops a flood of bytes.
MAX_WEBHOOK_BODY = 1_048_576

NOT_CONFIGURED = "Payments are not configured on this server."


@dataclass(frozen=True)
class BillingDependencies:
    """What billing needs from the composition root (server.py), once the payment provider's keys
    are set: without them, the routes answer that payments are not configured."""

    billing: Billing
    # The app's users row id for a signed-in user, creating the row if needed.
    get_user_profile_id: Callable[[User], Awaitable[str]]
    # A page of the frontend, where the provider's pages send the user back.
    app_url: Callable[[str], str]


class BillingSubscription(TypedDict):
    planId: str | None
    status: str
    currentPeriodEnd: str | None
    cancelAtPeriodEnd: bool
    entitled: bool


class BillingStatus(TypedDict):
    configured: bool
    plans: list[Plan]
    subscription: BillingSubscription | None


class BillingRedirect(TypedDict):
    url: str


class WebhookReceipt(TypedDict):
    received: Literal[True]
    result: WebhookResult


def iso_time(moment: datetime) -> str:
    """A time in UTC with milliseconds, as JavaScript's toISOString writes it."""
    return moment.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def billing_subscription(row: Subscription) -> BillingSubscription:
    return {
        "planId": row.plan_id,
        "status": row.status,
        "currentPeriodEnd": iso_time(row.current_period_end) if row.current_period_end else None,
        "cancelAtPeriodEnd": row.cancel_at_period_end,
        "entitled": is_entitled(row),
    }


def billing_router(
    *, payments: BillingDependencies | None, get_current_user: GetCurrentUser
) -> APIRouter:
    """The billing routes. `payments` is None while the provider's keys are unset: the plans are
    still listed, and the rest answers 503 not_configured."""
    router = APIRouter()
    guards = [Depends(json_only), Depends(limit_body(MAX_BODY))]

    def configured() -> BillingDependencies:
        if payments is None:
            raise ApiError(503, "not_configured", NOT_CONFIGURED, headers=NO_STORE)
        return payments

    async def signed_in(request: Request, message: str) -> User:
        user = await get_current_user(request)
        if user is None:
            raise ApiError(401, "unauthorized", message, headers=NO_STORE)
        return user

    @router.get("/api/billing")
    async def billing_status(request: Request) -> JSONResponse:
        user = await get_current_user(request) if payments else None
        subscription: BillingSubscription | None = None
        if payments and user:
            profile_id = await payments.get_user_profile_id(user)
            row = await payments.billing.subscription_for(profile_id)
            subscription = billing_subscription(row) if row else None
        body: BillingStatus = {
            "configured": payments is not None,
            "plans": list(PLANS),
            "subscription": subscription,
        }
        return JSONResponse(body, headers=NO_STORE)

    @router.post("/api/billing/checkout", dependencies=guards)
    async def checkout(request: Request) -> JSONResponse:
        billing = configured()
        user = await signed_in(request, "Sign in to choose a plan.")
        body = await read_json(request)
        plan = find_plan(body.get("planId") if isinstance(body, dict) else None)
        if plan is None:
            raise ApiError(400, "invalid_plan", "There is no such plan.", headers=NO_STORE)
        url = await billing.billing.checkout(
            user_id=await billing.get_user_profile_id(user),
            email=user["email"],
            plan_id=plan["id"],
            success_url=billing.app_url("/dashboard?billing=success"),
            cancel_url=billing.app_url("/dashboard"),
        )
        redirect: BillingRedirect = {"url": url}
        return JSONResponse(redirect, headers=NO_STORE)

    @router.post("/api/billing/portal", dependencies=guards)
    async def portal(request: Request) -> JSONResponse:
        billing = configured()
        user = await signed_in(request, "Sign in to manage billing.")
        try:
            url = await billing.billing.portal(
                user_id=await billing.get_user_profile_id(user),
                return_url=billing.app_url("/dashboard"),
            )
        except NoBillingAccountError:
            raise ApiError(
                409, "no_billing_account", "Subscribe to a plan first.", headers=NO_STORE
            ) from None
        redirect: BillingRedirect = {"url": url}
        return JSONResponse(redirect, headers=NO_STORE)

    # Signed by the provider rather than sent by a browser, so it takes the body as it comes.
    @router.post("/api/webhooks/payments", dependencies=[Depends(limit_body(MAX_WEBHOOK_BODY))])
    async def payment_webhook(request: Request) -> JSONResponse:
        billing = configured()
        # The raw bytes, because the signature covers them exactly.
        body = await request.body()
        try:
            result = await billing.billing.handle_webhook(body, request.headers)
        except WebhookVerificationError:
            raise ApiError(
                400, "invalid_signature", "The webhook signature is not valid.", headers=NO_STORE
            ) from None
        except Exception:
            # 500 makes the provider retry the event later.
            logger.exception("Payment webhook failed")
            raise ApiError(
                500, "webhook_failed", "The webhook could not be applied.", headers=NO_STORE
            ) from None
        receipt: WebhookReceipt = {"received": True, "result": result}
        return JSONResponse(receipt, headers=NO_STORE)

    return router
