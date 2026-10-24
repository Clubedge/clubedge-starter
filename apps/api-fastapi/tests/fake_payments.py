"""Stand-ins for payments: the subscription tables in memory, with their constraints, and a
payment provider whose next webhook event the test chooses."""

import uuid
from collections.abc import AsyncIterator, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field, replace
from datetime import UTC, datetime, timedelta

from clubedge_api.payments import (
    CheckoutInput,
    IgnoredEvent,
    PaymentEvent,
    Subscription,
    SubscriptionSnapshot,
    SubscriptionWrites,
    WebhookVerificationError,
)

PERIOD_END = datetime(2030, 1, 1, tzinfo=UTC)

# The headers of a webhook FakeProvider accepts.
SIGNED = {"stripe-signature": "valid"}


def snapshot(user_id: str | None) -> SubscriptionSnapshot:
    """The provider's subscription "sub_1" for `user_id`, active on the "pro" plan."""
    return SubscriptionSnapshot(
        provider="fake",
        customer_id="cus_1",
        subscription_id="sub_1",
        user_id=user_id,
        plan_id="pro",
        status="active",
        current_period_end=PERIOD_END,
        cancel_at_period_end=False,
    )


@dataclass
class MemorySubscriptions:
    """The subscriptions and payment_events tables, in memory."""

    rows: list[Subscription] = field(default_factory=list)
    events: set[tuple[str, str]] = field(default_factory=set)
    ticks: int = 0

    def now(self) -> datetime:
        """A clock that moves on at each write, so the latest row is the last one written."""
        self.ticks += 1
        return datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=self.ticks)

    def add(
        self, user_id: str, *, status: str = "active", cancel_at_period_end: bool = False
    ) -> Subscription:
        """Adds a subscription row, as a webhook would have."""
        now = self.now()
        row = Subscription(
            id=str(uuid.uuid4()),
            user_id=user_id,
            provider="fake",
            provider_customer_id="cus_1",
            provider_subscription_id="sub_1",
            plan_id="pro",
            status=status,
            current_period_end=PERIOD_END,
            cancel_at_period_end=cancel_at_period_end,
            created_at=now,
            updated_at=now,
        )
        self.rows.append(row)
        return row

    def _latest(self, user_id: str, provider: str | None = None) -> Subscription | None:
        rows = [row for row in self.rows if row.user_id == user_id]
        if provider is not None:
            rows = [row for row in rows if row.provider == provider]
        return max(rows, key=lambda row: row.updated_at, default=None)

    async def find(self, user_id: str) -> Subscription | None:
        return self._latest(user_id)

    async def customer_id(self, user_id: str, provider: str) -> str | None:
        row = self._latest(user_id, provider)
        return row.provider_customer_id if row else None

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[SubscriptionWrites]:
        # The writes apply when the block ends without raising, as a database transaction's do.
        writes = _MemoryWrites(self, list(self.rows), set(self.events))
        yield writes
        self.rows, self.events = writes.rows, writes.events


@dataclass
class _MemoryWrites:
    store: MemorySubscriptions
    rows: list[Subscription]
    events: set[tuple[str, str]]

    async def record_event(self, provider: str, event_id: str) -> bool:
        if (provider, event_id) in self.events:
            return False
        self.events.add((provider, event_id))
        return True

    async def find_id(self, provider: str, subscription_id: str) -> str | None:
        for row in self.rows:
            if row.provider == provider and row.provider_subscription_id == subscription_id:
                return row.id
        return None

    async def update(self, row_id: str, snapshot: SubscriptionSnapshot) -> None:
        for index, row in enumerate(self.rows):
            if row.id == row_id:
                self.rows[index] = replace(
                    row,
                    provider=snapshot.provider,
                    provider_customer_id=snapshot.customer_id,
                    plan_id=snapshot.plan_id,
                    status=snapshot.status,
                    current_period_end=snapshot.current_period_end,
                    cancel_at_period_end=snapshot.cancel_at_period_end,
                    updated_at=self.store.now(),
                )

    async def insert(self, user_id: str, snapshot: SubscriptionSnapshot) -> None:
        now = self.store.now()
        self.rows.append(
            Subscription(
                id=str(uuid.uuid4()),
                user_id=user_id,
                provider=snapshot.provider,
                provider_customer_id=snapshot.customer_id,
                provider_subscription_id=snapshot.subscription_id,
                plan_id=snapshot.plan_id,
                status=snapshot.status,
                current_period_end=snapshot.current_period_end,
                cancel_at_period_end=snapshot.cancel_at_period_end,
                created_at=now,
                updated_at=now,
            )
        )


class FakeProvider:
    """A payment provider whose next webhook event the test chooses. A webhook needs the
    signature "valid" (SIGNED), and the body "boom" fails as a database outage would."""

    id = "fake"

    def __init__(self) -> None:
        self.next_event: PaymentEvent = IgnoredEvent(id="evt_ignored")
        self.checkouts: list[CheckoutInput] = []
        self.portals: list[tuple[str, str]] = []
        self.webhooks: list[bytes] = []

    async def create_checkout(self, checkout: CheckoutInput) -> str:
        self.checkouts.append(checkout)
        return "https://pay.example/checkout"

    async def create_portal(self, *, customer_id: str, return_url: str) -> str:
        self.portals.append((customer_id, return_url))
        return "https://pay.example/portal"

    async def parse_webhook(self, body: bytes, headers: Mapping[str, str]) -> PaymentEvent:
        if headers.get("stripe-signature") != "valid":
            raise WebhookVerificationError("The request has no valid signature.")
        self.webhooks.append(body)
        if body == b"boom":
            raise ConnectionError("database down")
        return self.next_event
