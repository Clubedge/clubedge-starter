"""Billing, provider-neutral, as packages/payments tests it: each webhook event applies once, later
events update the subscription's row, and checkout and the portal reuse the provider's customer.
PostgresSubscriptions runs the same steps in SQL, which the browser tests exercise end to end."""

import asyncio
from dataclasses import replace

import pytest

from clubedge_api.payments import (
    Billing,
    IgnoredEvent,
    NoBillingAccountError,
    SubscriptionUpdated,
    WebhookVerificationError,
    is_entitled,
)
from tests.fake_payments import SIGNED, FakeProvider, MemorySubscriptions, snapshot

USER_ID = "8b0f6c1e-3d7a-4f7e-9a51-2f3c4d5e6f70"


def billing() -> tuple[Billing, MemorySubscriptions, FakeProvider]:
    store = MemorySubscriptions()
    provider = FakeProvider()
    return Billing(store=store, provider=provider), store, provider


def test_applies_subscription_events_and_each_event_only_once() -> None:
    subject, store, provider = billing()

    provider.next_event = SubscriptionUpdated(id="evt_1", subscription=snapshot(USER_ID))
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "applied"
    row = asyncio.run(subject.subscription_for(USER_ID))
    assert row is not None
    assert (row.plan_id, row.status, row.provider) == ("pro", "active", "fake")
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "duplicate"

    # Later events update the same row, even when they do not carry the user id.
    provider.next_event = SubscriptionUpdated(
        id="evt_2",
        subscription=replace(snapshot(None), status="past_due", cancel_at_period_end=True),
    )
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "applied"
    row = asyncio.run(subject.subscription_for(USER_ID))
    assert row is not None
    assert (row.status, row.cancel_at_period_end) == ("past_due", True)
    assert len(store.rows) == 1


def test_ignores_events_it_does_not_need_and_subscriptions_without_a_user() -> None:
    subject, store, provider = billing()
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "ignored"

    provider.next_event = SubscriptionUpdated(
        id="evt_3", subscription=replace(snapshot(None), subscription_id="sub_unknown")
    )
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "ignored"
    assert store.rows == []
    # Recorded all the same, as packages/payments does: a redelivery changes nothing.
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "duplicate"


def test_refuses_unsigned_webhooks_without_recording_them() -> None:
    subject, store, provider = billing()
    provider.next_event = SubscriptionUpdated(id="evt_1", subscription=snapshot(USER_ID))
    with pytest.raises(WebhookVerificationError):
        asyncio.run(subject.handle_webhook(b"{}", {}))
    assert (store.rows, store.events) == ([], set())


def test_applies_an_event_that_failed_when_the_provider_retries_it() -> None:
    subject, store, provider = billing()
    provider.next_event = SubscriptionUpdated(id="evt_1", subscription=snapshot(USER_ID))
    with pytest.raises(ConnectionError):
        asyncio.run(subject.handle_webhook(b"boom", SIGNED))
    assert store.events == set()
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "applied"


def test_reuses_the_customer_for_a_new_checkout_and_opens_the_portal_only_for_customers() -> None:
    subject, _store, provider = billing()

    def checkout() -> str:
        return asyncio.run(
            subject.checkout(
                user_id=USER_ID,
                email="ada@example.com",
                plan_id="pro",
                success_url="https://app.example/dashboard?billing=success",
                cancel_url="https://app.example/dashboard",
            )
        )

    assert checkout() == "https://pay.example/checkout"
    assert provider.checkouts[-1].user_id == USER_ID
    assert provider.checkouts[-1].customer_id is None
    with pytest.raises(NoBillingAccountError):
        asyncio.run(subject.portal(user_id=USER_ID, return_url="https://app.example/dashboard"))

    provider.next_event = SubscriptionUpdated(id="evt_4", subscription=snapshot(USER_ID))
    asyncio.run(subject.handle_webhook(b"{}", SIGNED))
    checkout()
    assert provider.checkouts[-1].customer_id == "cus_1"
    url = asyncio.run(subject.portal(user_id=USER_ID, return_url="https://app.example/dashboard"))
    assert url == "https://pay.example/portal"
    assert provider.portals == [("cus_1", "https://app.example/dashboard")]


def test_reads_the_latest_subscription_of_the_user() -> None:
    subject, store, provider = billing()
    store.add(USER_ID, status="canceled")
    store.add("someone-else", status="active")
    latest = store.add(USER_ID, status="trialing")
    assert asyncio.run(subject.subscription_for(USER_ID)) == latest
    assert asyncio.run(subject.subscription_for("nobody")) is None
    provider.next_event = IgnoredEvent(id="evt_5")
    assert asyncio.run(subject.handle_webhook(b"{}", SIGNED)) == "ignored"


def test_grants_access_while_active_or_trialing() -> None:
    store = MemorySubscriptions()
    for status, entitled in [
        ("active", True),
        ("trialing", True),
        ("past_due", False),
        ("unpaid", False),
        ("canceled", False),
    ]:
        assert is_entitled(store.add(USER_ID, status=status)) is entitled, status
    assert not is_entitled(None)
