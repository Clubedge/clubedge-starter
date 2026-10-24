"""Stripe behind the provider-neutral PaymentProvider (payments.py), as packages/payments-stripe
has it: Checkout, the customer portal, and verified webhooks. The rest of the API only uses
Billing, which stripe_billing() puts together from the Stripe variables."""

import os
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any, Final
from urllib.parse import urljoin, urlsplit

import stripe
from stripe.params.checkout import SessionCreateParams

from clubedge_api.payments import (
    Billing,
    CheckoutInput,
    IgnoredEvent,
    PaymentEvent,
    PostgresSubscriptions,
    SubscriptionSnapshot,
    SubscriptionStatus,
    SubscriptionUpdated,
    WebhookVerificationError,
)
from clubedge_api.plans import PLANS
from clubedge_api.routes.billing import BillingDependencies
from clubedge_api.users import ensure_user_id

SUBSCRIPTION_EVENTS: Final = frozenset(
    {
        "customer.subscription.created",
        "customer.subscription.updated",
        "customer.subscription.deleted",
        "customer.subscription.paused",
        "customer.subscription.resumed",
    }
)

STATUSES: Final[dict[str, SubscriptionStatus]] = {
    "active": "active",
    "trialing": "trialing",
    "past_due": "past_due",
    "unpaid": "unpaid",
    "paused": "paused",
    "incomplete": "incomplete",
    "incomplete_expired": "incomplete_expired",
    "canceled": "canceled",
}


def _id_of(value: object) -> str | None:
    """The id of an expandable field: an id, or the object it was expanded to."""
    if isinstance(value, str):
        return value
    if isinstance(value, dict) and isinstance(value.get("id"), str):
        return str(value["id"])
    return None


def _time(seconds: object) -> datetime | None:
    """A time Stripe sends as seconds since the epoch, or None."""
    if isinstance(seconds, int | float) and seconds:
        return datetime.fromtimestamp(seconds, UTC)
    return None


def stripe_client(
    secret_key: str, api_base: str | None = None, *, http_client: stripe.HTTPClient | None = None
) -> stripe.StripeClient:
    """A Stripe API client. `api_base` (STRIPE_API_BASE) sends its requests to another server,
    such as stripe-mock or the fake in e2e/stripe-fake.ts; as in packages/payments-stripe, only
    its scheme, host, and port count."""
    if not api_base:
        return stripe.StripeClient(secret_key, http_client=http_client)
    url = urlsplit(api_base)
    if url.scheme not in ("http", "https") or not url.hostname:
        raise ValueError("STRIPE_API_BASE is not an absolute http(s) URL.")
    host = url.netloc.rpartition("@")[2]
    return stripe.StripeClient(
        secret_key, base_addresses={"api": f"{url.scheme}://{host}"}, http_client=http_client
    )


class StripePayments:
    """Stripe Checkout, the customer portal, and verified webhooks behind PaymentProvider."""

    id = "stripe"

    def __init__(
        self,
        *,
        secret_key: str,
        webhook_secret: str,
        prices: Mapping[str, str],
        api_base: str | None = None,
        client: stripe.StripeClient | None = None,
    ) -> None:
        """`prices` maps the app's plan ids to Stripe price ids, such as {"pro": "price_..."};
        `webhook_secret` is the signing secret of the webhook endpoint (whsec_...). Tests pass
        a `client` instead of one made from the secret key."""
        self._stripe = client or stripe_client(secret_key, api_base)
        self._webhook_secret = webhook_secret
        self._prices = dict(prices)
        self._plans_by_price = {price: plan for plan, price in prices.items()}

    async def verify(self) -> None:
        """Checks the secret key with a read-only request, for `pnpm check:services`."""
        await self._stripe.v1.balance.retrieve_async()

    async def create_checkout(self, checkout: CheckoutInput) -> str:
        price = self._prices.get(checkout.plan_id)
        if not price:
            raise ValueError(f'No Stripe price is configured for the plan "{checkout.plan_id}".')
        params: SessionCreateParams = {
            "mode": "subscription",
            "line_items": [{"price": price, "quantity": 1}],
            "success_url": checkout.success_url,
            "cancel_url": checkout.cancel_url,
            "client_reference_id": checkout.user_id,
            # Every subscription event carries the app's user id from here on.
            "subscription_data": {"metadata": {"userId": checkout.user_id}},
        }
        if checkout.customer_id:
            params["customer"] = checkout.customer_id
        else:
            params["customer_email"] = checkout.email
        session = await self._stripe.v1.checkout.sessions.create_async(params)
        url = session.to_dict().get("url")
        if not isinstance(url, str) or not url:
            raise RuntimeError("Stripe did not return a Checkout URL.")
        return url

    async def create_portal(self, *, customer_id: str, return_url: str) -> str:
        session = await self._stripe.v1.billing_portal.sessions.create_async(
            {"customer": customer_id, "return_url": return_url}
        )
        url = session.to_dict().get("url")
        if not isinstance(url, str) or not url:
            raise RuntimeError("Stripe did not return a billing portal URL.")
        return url

    async def parse_webhook(self, body: bytes, headers: Mapping[str, str]) -> PaymentEvent:
        signature = headers.get("stripe-signature")
        if not signature:
            raise WebhookVerificationError("The request has no Stripe signature.")
        try:
            # The signature covers the exact bytes, so it is checked on the raw body.
            event = self._stripe.construct_event(body, signature, self._webhook_secret).to_dict()
        except Exception as error:
            raise WebhookVerificationError(str(error) or "Invalid Stripe signature.") from error

        event_id = str(event.get("id") or "")
        data = event.get("data")
        found = data.get("object") if isinstance(data, dict) else None
        payload: Mapping[str, Any] = found if isinstance(found, dict) else {}
        subscription_id: str | None = None
        if event.get("type") in SUBSCRIPTION_EVENTS:
            object_id = payload.get("id")
            subscription_id = object_id if isinstance(object_id, str) else None
        elif event.get("type") == "checkout.session.completed":
            subscription_id = _id_of(payload.get("subscription"))
        if not subscription_id:
            return IgnoredEvent(id=event_id)

        # Events can arrive out of order, so read the subscription's current state from Stripe
        # rather than trusting the event's copy.
        subscription = await self._stripe.v1.subscriptions.retrieve_async(subscription_id)
        return SubscriptionUpdated(id=event_id, subscription=self.snapshot(subscription.to_dict()))

    def snapshot(self, subscription: Mapping[str, Any]) -> SubscriptionSnapshot:
        """A Stripe subscription, as JSON, in the provider-neutral shape."""
        items = subscription.get("items")
        data = items.get("data") if isinstance(items, dict) else None
        first = data[0] if isinstance(data, list) and data else None
        item: Mapping[str, Any] = first if isinstance(first, dict) else {}
        price_id = _id_of(item.get("price"))
        customer_id = _id_of(subscription.get("customer"))
        if customer_id is None:
            raise ValueError("The Stripe subscription has no customer.")
        metadata = subscription.get("metadata")
        user_id = metadata.get("userId") if isinstance(metadata, dict) else None
        return SubscriptionSnapshot(
            provider="stripe",
            customer_id=customer_id,
            subscription_id=str(subscription.get("id") or ""),
            user_id=user_id if isinstance(user_id, str) and user_id else None,
            plan_id=self._plans_by_price.get(price_id) if price_id else None,
            status=STATUSES.get(str(subscription.get("status")), "incomplete"),
            current_period_end=_time(item.get("current_period_end")),
            cancel_at_period_end=bool(subscription.get("cancel_at_period_end")),
        )


def stripe_prices(env: Mapping[str, str]) -> dict[str, str]:
    """Each plan's Stripe price, from STRIPE_PRICE_<PLAN>, such as STRIPE_PRICE_PRO."""
    prices: dict[str, str] = {}
    for plan in PLANS:
        price = env.get(f"STRIPE_PRICE_{plan['id'].upper().replace('-', '_')}", "").strip()
        if price:
            prices[plan["id"]] = price
    return prices


def stripe_billing(
    database_url: str | None, frontend_url: str, env: Mapping[str, str] = os.environ
) -> BillingDependencies | None:
    """Billing with Stripe once STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET are set, or None: the
    billing routes then answer that payments are not configured. Checkout and the billing
    portal send the user back to pages of the frontend (FRONTEND_URL), as the API serves none."""
    secret_key = env.get("STRIPE_SECRET_KEY", "").strip()
    webhook_secret = env.get("STRIPE_WEBHOOK_SECRET", "").strip()
    if not secret_key or not webhook_secret:
        return None
    provider = StripePayments(
        secret_key=secret_key,
        webhook_secret=webhook_secret,
        prices=stripe_prices(env),
        # For tests and stripe-mock: send API requests to another server.
        api_base=env.get("STRIPE_API_BASE", "").strip() or None,
    )
    return BillingDependencies(
        billing=Billing(store=PostgresSubscriptions(database_url), provider=provider),
        get_user_profile_id=ensure_user_id,
        app_url=lambda path: urljoin(frontend_url, path),
    )
