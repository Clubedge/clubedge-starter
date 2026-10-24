"""The Stripe provider, as packages/payments-stripe tests it, against a stand-in for Stripe's API:
the real SDK builds and sends each request, and nothing reaches Stripe."""

import asyncio
import hashlib
import hmac
import json
import time
from collections.abc import Mapping
from dataclasses import dataclass, replace
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qsl, urlsplit

import pytest
import stripe

from clubedge_api.check_services import service_checks
from clubedge_api.payments import (
    CheckoutInput,
    IgnoredEvent,
    SubscriptionSnapshot,
    SubscriptionUpdated,
    WebhookVerificationError,
)
from clubedge_api.payments_stripe import (
    StripePayments,
    stripe_billing,
    stripe_client,
    stripe_prices,
)

WEBHOOK_SECRET = "whsec_test_secret"

CHECKOUT = CheckoutInput(
    user_id="user-1",
    email="ada@example.com",
    plan_id="pro",
    success_url="https://app.example/dashboard?billing=success",
    cancel_url="https://app.example/dashboard",
)


@dataclass(frozen=True)
class StripeRequest:
    method: str
    url: str
    form: dict[str, str]


class FakeStripeApi(stripe.HTTPClient):
    """Answers the Stripe API requests a test sets up, such as "GET /v1/balance", and records
    each one; anything else gets Stripe's 404."""

    name = "fake"

    def __init__(self, responses: Mapping[str, object] | None = None) -> None:
        super().__init__()
        self.responses = dict(responses or {})
        self.requests: list[StripeRequest] = []

    async def request_async(
        self, method: str, url: str, headers: Mapping[str, str], post_data: Any = None
    ) -> tuple[bytes, int, Mapping[str, str]]:
        form = dict(parse_qsl(post_data or "", keep_blank_values=True))
        self.requests.append(StripeRequest(method.upper(), url, form))
        route = f"{method.upper()} {urlsplit(url).path}"
        if route not in self.responses:
            error = {"error": {"type": "invalid_request_error", "message": f"No {route}."}}
            return json.dumps(error).encode(), 404, {}
        return json.dumps(self.responses[route]).encode(), 200, {}


def payments(api: FakeStripeApi) -> StripePayments:
    return StripePayments(
        secret_key="sk_test_dummy",
        webhook_secret=WEBHOOK_SECRET,
        prices={"pro": "price_pro"},
        client=stripe_client("sk_test_dummy", http_client=api),
    )


def signed(message: object, secret: str = WEBHOOK_SECRET) -> tuple[bytes, dict[str, str]]:
    """A webhook body and its headers, signed the way Stripe signs them."""
    body = json.dumps(message)
    timestamp = int(time.time())
    payload = f"{timestamp}.{body}".encode()
    signature = hmac.new(secret.encode(), payload, hashlib.sha256).hexdigest()
    return body.encode(), {"stripe-signature": f"t={timestamp},v1={signature}"}


def subscription(**changes: object) -> dict[str, object]:
    """A Stripe subscription as the API returns it, active on the "pro" plan's price."""
    return {
        "id": "sub_1",
        "object": "subscription",
        "customer": "cus_1",
        "status": "active",
        "cancel_at_period_end": False,
        "metadata": {"userId": "user-1"},
        "items": {
            "object": "list",
            "data": [{"price": {"id": "price_pro"}, "current_period_end": 1_893_456_000}],
        },
        **changes,
    }


def event(event_id: str, event_type: str, data: object) -> dict[str, object]:
    return {"id": event_id, "object": "event", "type": event_type, "data": {"object": data}}


def test_creates_subscription_checkouts_that_carry_the_user_id_reusing_customers() -> None:
    session = {"id": "cs_1", "object": "checkout.session", "url": "https://checkout.stripe.com/c/1"}
    api = FakeStripeApi({"POST /v1/checkout/sessions": session})
    provider = payments(api)

    assert asyncio.run(provider.create_checkout(CHECKOUT)) == "https://checkout.stripe.com/c/1"
    assert api.requests[-1].url == "https://api.stripe.com/v1/checkout/sessions"
    assert api.requests[-1].form == {
        "mode": "subscription",
        "line_items[0][price]": "price_pro",
        "line_items[0][quantity]": "1",
        "success_url": CHECKOUT.success_url,
        "cancel_url": CHECKOUT.cancel_url,
        "client_reference_id": "user-1",
        "customer_email": "ada@example.com",
        "subscription_data[metadata][userId]": "user-1",
    }

    asyncio.run(provider.create_checkout(replace(CHECKOUT, customer_id="cus_1")))
    assert api.requests[-1].form["customer"] == "cus_1"
    assert "customer_email" not in api.requests[-1].form

    with pytest.raises(ValueError, match='No Stripe price is configured for the plan "enterprise"'):
        asyncio.run(provider.create_checkout(replace(CHECKOUT, plan_id="enterprise")))
    assert len(api.requests) == 2


def test_opens_the_customer_portal() -> None:
    session = {
        "id": "bps_1",
        "object": "billing_portal.session",
        "url": "https://billing.stripe.com/p/1",
    }
    api = FakeStripeApi({"POST /v1/billing_portal/sessions": session})
    url = asyncio.run(
        payments(api).create_portal(customer_id="cus_1", return_url="https://app.example/dashboard")
    )
    assert url == "https://billing.stripe.com/p/1"
    assert api.requests[-1].form == {
        "customer": "cus_1",
        "return_url": "https://app.example/dashboard",
    }


def test_refuses_webhooks_without_a_valid_stripe_signature() -> None:
    api = FakeStripeApi()
    updated = event("evt_1", "customer.subscription.updated", subscription())
    body, headers = signed(updated)
    with pytest.raises(WebhookVerificationError, match="no Stripe signature"):
        asyncio.run(payments(api).parse_webhook(body, {}))
    with pytest.raises(WebhookVerificationError):
        asyncio.run(payments(api).parse_webhook(*signed(updated, "whsec_someone_else")))
    with pytest.raises(WebhookVerificationError):
        asyncio.run(payments(api).parse_webhook(body.replace(b"evt_1", b"evt_9"), headers))
    assert api.requests == []


def test_normalizes_subscription_events_from_the_subscriptions_current_state() -> None:
    # The event's copy is stale; the provider reads the current subscription.
    current = subscription(status="past_due", cancel_at_period_end=True)
    api = FakeStripeApi({"GET /v1/subscriptions/sub_1": current})
    updated = event("evt_2", "customer.subscription.updated", subscription())

    assert asyncio.run(payments(api).parse_webhook(*signed(updated))) == SubscriptionUpdated(
        id="evt_2",
        subscription=SubscriptionSnapshot(
            provider="stripe",
            customer_id="cus_1",
            subscription_id="sub_1",
            user_id="user-1",
            plan_id="pro",
            status="past_due",
            current_period_end=datetime.fromtimestamp(1_893_456_000, UTC),
            cancel_at_period_end=True,
        ),
    )
    assert api.requests == [
        StripeRequest("GET", "https://api.stripe.com/v1/subscriptions/sub_1", {})
    ]


def test_follows_completed_checkouts_to_their_subscription_and_ignores_other_events() -> None:
    items = {"object": "list", "data": [{"price": {"id": "price_unknown"}}]}
    api = FakeStripeApi({"GET /v1/subscriptions/sub_1": subscription(items=items, metadata={})})
    session = {"object": "checkout.session", "subscription": "sub_1"}

    completed = asyncio.run(
        payments(api).parse_webhook(*signed(event("evt_3", "checkout.session.completed", session)))
    )
    assert isinstance(completed, SubscriptionUpdated)
    found = completed.subscription
    assert (found.plan_id, found.current_period_end, found.user_id) == (None, None, None)

    paid = event("evt_4", "invoice.paid", {"object": "invoice"})
    assert asyncio.run(payments(api).parse_webhook(*signed(paid))) == IgnoredEvent(id="evt_4")
    # A one-time payment's checkout has no subscription.
    one_time = event("evt_5", "checkout.session.completed", {**session, "subscription": None})
    assert asyncio.run(payments(api).parse_webhook(*signed(one_time))) == IgnoredEvent(id="evt_5")
    assert len(api.requests) == 1


def test_reads_expanded_customers_and_unknown_statuses() -> None:
    provider = payments(FakeStripeApi())
    customer = {"id": "cus_2", "object": "customer"}
    assert provider.snapshot(subscription(customer=customer)).customer_id == "cus_2"
    assert provider.snapshot(subscription(status="something_new")).status == "incomplete"
    assert provider.snapshot(subscription(metadata={"userId": ""})).user_id is None
    with pytest.raises(ValueError, match="no customer"):
        provider.snapshot(subscription(customer=None))


def test_sends_requests_to_stripe_api_base_when_it_is_set() -> None:
    for api_base, url in [
        (None, "https://api.stripe.com/v1/balance"),
        ("http://127.0.0.1:12111", "http://127.0.0.1:12111/v1/balance"),
        # Only the scheme, host, and port count, as in packages/payments-stripe.
        ("http://127.0.0.1:12111/ignored/", "http://127.0.0.1:12111/v1/balance"),
    ]:
        api = FakeStripeApi({"GET /v1/balance": {"object": "balance"}})
        client = stripe_client("sk_test_dummy", api_base, http_client=api)
        provider = StripePayments(
            secret_key="sk_test_dummy", webhook_secret=WEBHOOK_SECRET, prices={}, client=client
        )
        asyncio.run(provider.verify())
        assert api.requests == [StripeRequest("GET", url, {})]
    with pytest.raises(ValueError, match="STRIPE_API_BASE"):
        stripe_client("sk_test_dummy", "localhost:12111")


def test_reads_each_plans_price_from_its_variable() -> None:
    assert stripe_prices({"STRIPE_PRICE_PRO": "price_123"}) == {"pro": "price_123"}
    assert stripe_prices({"STRIPE_PRICE_PRO": " "}) == {}
    assert stripe_prices({}) == {}


def test_bills_with_stripe_once_both_keys_are_set() -> None:
    frontend = "https://app.example.com"
    assert stripe_billing(None, frontend, {}) is None
    assert stripe_billing(None, frontend, {"STRIPE_SECRET_KEY": "sk_test_dummy"}) is None
    keys = {"STRIPE_SECRET_KEY": "sk_test_dummy", "STRIPE_WEBHOOK_SECRET": WEBHOOK_SECRET}
    configured = stripe_billing(None, frontend, keys)
    assert configured is not None
    assert configured.app_url("/dashboard") == "https://app.example.com/dashboard"


def test_checks_the_stripe_secret_key_only_when_it_is_set() -> None:
    checks = {check.name: check for check in service_checks({})}
    assert checks["Payments (Stripe)"].skip == "STRIPE_SECRET_KEY is not set"
    checks = {check.name: check for check in service_checks({"STRIPE_SECRET_KEY": "sk_test_x"})}
    assert checks["Payments (Stripe)"].skip is None
