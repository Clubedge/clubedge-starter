"""The billing routes, as the Hono API's tests have them: the plans and the user's subscription,
checkout and the portal for the user's profile, and the provider's signed webhook."""

from dataclasses import dataclass
from urllib.parse import urljoin

import httpx
import pytest
from fastapi.testclient import TestClient

from clubedge_api.contract import User
from clubedge_api.payments import Billing, CheckoutInput, SubscriptionUpdated
from clubedge_api.routes.billing import NOT_CONFIGURED, BillingDependencies
from tests.fake_payments import SIGNED, FakeProvider, MemorySubscriptions, snapshot
from tests.fakes import USER, client, signed_in, signed_out

PROFILE_ID = "profile-1"


async def profile_id(user: User) -> str:
    return PROFILE_ID


@dataclass
class Setup:
    client: TestClient
    store: MemorySubscriptions
    provider: FakeProvider

    def post(self, path: str, body: str | bytes, **headers: str) -> httpx.Response:
        response: httpx.Response = self.client.post(
            path, content=body, headers={"content-type": "application/json", **headers}
        )
        return response


def setup(*, signed: bool = True, configured: bool = True) -> Setup:
    store = MemorySubscriptions()
    provider = FakeProvider()
    payments = BillingDependencies(
        billing=Billing(store=store, provider=provider),
        get_user_profile_id=profile_id,
        app_url=lambda path: urljoin("https://app.example.com", path),
    )
    test_client = client(
        get_current_user=signed_in(USER) if signed else signed_out,
        payments=payments if configured else None,
    )
    return Setup(test_client, store, provider)


def test_lists_the_plans_and_the_signed_in_users_subscription() -> None:
    subject = setup()
    subject.store.add(PROFILE_ID, status="past_due", cancel_at_period_end=True)
    response = subject.client.get("/api/billing")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "configured": True,
        "plans": [
            {
                "id": "pro",
                "name": "Pro",
                "description": "Everything in the free plan, plus the paid features you build.",
            }
        ],
        "subscription": {
            "planId": "pro",
            "status": "past_due",
            "currentPeriodEnd": "2030-01-01T00:00:00.000Z",
            "cancelAtPeriodEnd": True,
            "entitled": False,
        },
    }


def test_has_no_subscription_when_signed_out_or_while_payments_are_not_configured() -> None:
    for subject, configured in [(setup(signed=False), True), (setup(configured=False), False)]:
        subject.store.add(PROFILE_ID)
        response = subject.client.get("/api/billing")
        assert response.status_code == 200
        assert response.headers["cache-control"] == "no-store"
        body = response.json()
        assert (body["configured"], body["subscription"]) == (configured, None)
        assert [plan["id"] for plan in body["plans"]] == ["pro"]


def test_starts_checkout_for_the_users_profile_coming_back_to_the_frontend() -> None:
    subject = setup()
    response = subject.post("/api/billing/checkout", '{"planId": "pro"}')
    assert response.status_code == 200
    assert response.json() == {"url": "https://pay.example/checkout"}
    assert subject.provider.checkouts == [
        CheckoutInput(
            user_id=PROFILE_ID,
            email="ada@example.com",
            plan_id="pro",
            success_url="https://app.example.com/dashboard?billing=success",
            cancel_url="https://app.example.com/dashboard",
            customer_id=None,
        )
    ]


def test_refuses_an_unknown_plan() -> None:
    subject = setup()
    for body in ['{"planId": "gold"}', '{"planId": null}', "[]", "not json"]:
        response = subject.post("/api/billing/checkout", body)
        assert response.status_code == 400, body
        assert response.json()["error"]["code"] == "invalid_plan"
    assert subject.provider.checkouts == []


@pytest.mark.parametrize("path", ["/api/billing/checkout", "/api/billing/portal"])
def test_needs_a_signed_in_user(path: str) -> None:
    response = setup(signed=False).post(path, '{"planId": "pro"}')
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"
    assert response.headers["cache-control"] == "no-store"


@pytest.mark.parametrize("path", ["/api/billing/checkout", "/api/billing/portal"])
def test_takes_only_json_which_another_site_cannot_make_a_browser_send(path: str) -> None:
    for content_type in ["application/x-www-form-urlencoded", "text/plain"]:
        response = setup().post(path, "planId=pro", **{"content-type": content_type})
        assert response.status_code == 415
        assert response.json()["error"]["code"] == "unsupported_media_type"


@pytest.mark.parametrize("path", ["/api/billing/checkout", "/api/billing/portal"])
def test_refuses_a_body_over_16_kib(path: str) -> None:
    body = '{"planId": "pro", "padding": "' + "x" * 16_384 + '"}'
    response = setup().post(path, body)
    assert response.status_code == 413
    assert response.json()["error"]["code"] == "payload_too_large"


def test_opens_the_portal_for_a_user_who_subscribed() -> None:
    subject = setup()
    subject.store.add(PROFILE_ID)
    response = subject.post("/api/billing/portal", "{}")
    assert response.status_code == 200
    assert response.json() == {"url": "https://pay.example/portal"}
    assert subject.provider.portals == [("cus_1", "https://app.example.com/dashboard")]


def test_answers_409_for_a_user_without_a_billing_account() -> None:
    response = setup().post("/api/billing/portal", "{}")
    assert response.status_code == 409
    assert response.json() == {
        "error": {"code": "no_billing_account", "message": "Subscribe to a plan first."}
    }


def test_applies_a_signed_event_from_its_raw_body_whatever_its_content_type() -> None:
    subject = setup()
    subject.provider.next_event = SubscriptionUpdated(id="evt_1", subscription=snapshot(PROFILE_ID))
    body = '{ "id": "evt_1" }'
    headers = {**SIGNED, "content-type": "text/plain"}
    response = subject.post("/api/webhooks/payments", body, **headers)
    assert response.status_code == 200
    assert response.json() == {"received": True, "result": "applied"}
    assert subject.provider.webhooks == [body.encode()]
    redelivered = subject.post("/api/webhooks/payments", body, **headers)
    assert redelivered.json() == {"received": True, "result": "duplicate"}
    assert len(subject.store.rows) == 1


def test_refuses_an_unsigned_event() -> None:
    response = setup().post("/api/webhooks/payments", "{}")
    assert response.status_code == 400
    assert response.json() == {
        "error": {"code": "invalid_signature", "message": "The webhook signature is not valid."}
    }


def test_answers_500_when_the_event_cannot_be_applied_so_the_provider_retries(
    caplog: pytest.LogCaptureFixture,
) -> None:
    response = setup().post("/api/webhooks/payments", "boom", **SIGNED)
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "webhook_failed"
    assert "Payment webhook failed" in caplog.text
    assert "database down" in caplog.text


def test_refuses_a_webhook_over_1_mib() -> None:
    subject = setup()
    response = subject.post("/api/webhooks/payments", "x" * 1_048_577, **SIGNED)
    assert response.status_code == 413
    assert subject.provider.webhooks == []


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/billing/checkout", '{"planId": "pro"}'),
        ("/api/billing/portal", "{}"),
        ("/api/webhooks/payments", "{}"),
    ],
)
def test_answers_503_while_payments_are_not_configured(path: str, body: str) -> None:
    response = setup(configured=False).post(path, body, **SIGNED)
    assert response.status_code == 503
    assert response.json() == {"error": {"code": "not_configured", "message": NOT_CONFIGURED}}
