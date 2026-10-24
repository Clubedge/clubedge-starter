"""Provider-neutral payments, as packages/payments has them: the PaymentProvider interface, the
billing logic, and the subscription tables.

The tables belong to packages/payments, whose migrations the shared Node migrator applies
(`pnpm db:migrate`, or `node /app/migrate.mjs` in the image), so this API reads and writes the same
rows, with the same rules, as the TypeScript one. Every row names its provider, so another
provider's adapter writes the same tables; plans are the app's own ids, never a provider's prices.
"""

from collections.abc import AsyncIterator, Mapping
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Final, Literal, Protocol

import psycopg
from psycopg.rows import TupleRow, class_row

from clubedge_api.settings import get_settings

# Subscription states, using the vocabulary most providers share.
SubscriptionStatus = Literal[
    "active",
    "trialing",
    "past_due",
    "unpaid",
    "paused",
    "incomplete",
    "incomplete_expired",
    "canceled",
]

# Statuses that grant access to the paid features.
ENTITLED_STATUSES: Final[frozenset[str]] = frozenset({"active", "trialing"})

# What a webhook did: a redelivered event is a "duplicate" and changes nothing.
WebhookResult = Literal["applied", "ignored", "duplicate"]


@dataclass(frozen=True)
class SubscriptionSnapshot:
    """A subscription as the provider reports it now."""

    # The provider's id, such as "stripe".
    provider: str
    customer_id: str
    subscription_id: str
    # The app's user id (users.id), carried through checkout; None when the provider lacks it.
    user_id: str | None
    # The app's plan id; None when the provider's price matches no configured plan.
    plan_id: str | None
    status: SubscriptionStatus
    current_period_end: datetime | None
    cancel_at_period_end: bool


@dataclass(frozen=True)
class SubscriptionUpdated:
    """A verified webhook event about a subscription, with the subscription's current state."""

    id: str
    subscription: SubscriptionSnapshot


@dataclass(frozen=True)
class IgnoredEvent:
    """A verified webhook event billing does not need."""

    id: str


# A verified webhook event, normalized by the provider.
PaymentEvent = SubscriptionUpdated | IgnoredEvent


@dataclass(frozen=True)
class CheckoutInput:
    # The app's user id (users.id), returned with the subscription's events.
    user_id: str
    email: str
    plan_id: str
    success_url: str
    cancel_url: str
    # The provider's customer id from an earlier subscription, so the customer is reused.
    customer_id: str | None = None


class PaymentProvider(Protocol):
    """A payment provider, such as Stripe (payments_stripe.py). Billing, the tables, and the
    routes only use this, never a provider's SDK."""

    @property
    def id(self) -> str:
        """Stored with each subscription, such as "stripe"."""

    async def create_checkout(self, checkout: CheckoutInput) -> str:
        """Starts a hosted checkout for a plan: the URL to send the user to."""

    async def create_portal(self, *, customer_id: str, return_url: str) -> str:
        """Opens the provider's hosted billing management for a customer: the URL to send the
        user to."""

    async def parse_webhook(self, body: bytes, headers: Mapping[str, str]) -> PaymentEvent:
        """Verifies a webhook request's signature over its raw body and returns its normalized
        event. Raises WebhookVerificationError when the provider did not sign the request."""


class WebhookVerificationError(Exception):
    """The webhook request was not signed by the payment provider."""


class NoBillingAccountError(Exception):
    """The user never subscribed with the provider, so there is no billing account to manage."""


@dataclass(frozen=True)
class Subscription:
    """A row of the subscriptions table."""

    id: str
    user_id: str
    provider: str
    provider_customer_id: str
    provider_subscription_id: str
    plan_id: str | None
    status: str
    current_period_end: datetime | None
    cancel_at_period_end: bool
    created_at: datetime
    updated_at: datetime


def is_entitled(subscription: Subscription | None) -> bool:
    """Whether a subscription grants access to the paid features."""
    return subscription is not None and subscription.status in ENTITLED_STATUSES


class SubscriptionWrites(Protocol):
    """The writes of one webhook event, which apply together or not at all."""

    async def record_event(self, provider: str, event_id: str) -> bool:
        """Records the event as applied: False when it already was."""

    async def find_id(self, provider: str, subscription_id: str) -> str | None:
        """The row id of the provider's subscription, or None."""

    async def update(self, row_id: str, snapshot: SubscriptionSnapshot) -> None:
        """Sets the row to the snapshot's state."""

    async def insert(self, user_id: str, snapshot: SubscriptionSnapshot) -> None:
        """Adds the snapshot's subscription for the user (users.id)."""


class SubscriptionStore(Protocol):
    """Where subscriptions live: PostgresSubscriptions, or a stand-in in tests."""

    async def find(self, user_id: str) -> Subscription | None:
        """The user's most recently updated subscription with any provider, or None."""

    async def customer_id(self, user_id: str, provider: str) -> str | None:
        """The provider's customer id from the user's latest subscription with it, or None."""

    def transaction(self) -> AbstractAsyncContextManager[SubscriptionWrites]:
        """Writes that commit when the block ends, and roll back when it raises."""


class Billing:
    """Billing with one provider: checkout and portal sessions, the current subscription, and
    webhook handling. Provider-neutral: it only uses PaymentProvider and the subscription store."""

    def __init__(self, *, store: SubscriptionStore, provider: PaymentProvider) -> None:
        self._store = store
        self._provider = provider

    async def subscription_for(self, user_id: str) -> Subscription | None:
        """The user's (users.id) current subscription, or None."""
        return await self._store.find(user_id)

    async def checkout(
        self, *, user_id: str, email: str, plan_id: str, success_url: str, cancel_url: str
    ) -> str:
        """Starts checkout for a plan, reusing the user's customer with this provider: the URL to
        send the user to."""
        return await self._provider.create_checkout(
            CheckoutInput(
                user_id=user_id,
                email=email,
                plan_id=plan_id,
                success_url=success_url,
                cancel_url=cancel_url,
                customer_id=await self._store.customer_id(user_id, self._provider.id),
            )
        )

    async def portal(self, *, user_id: str, return_url: str) -> str:
        """Opens billing management: the URL to send the user to. Raises NoBillingAccountError
        when the user never subscribed with this provider."""
        customer_id = await self._store.customer_id(user_id, self._provider.id)
        if not customer_id:
            raise NoBillingAccountError("This user has no billing account yet.")
        return await self._provider.create_portal(customer_id=customer_id, return_url=return_url)

    async def handle_webhook(self, body: bytes, headers: Mapping[str, str]) -> WebhookResult:
        """Verifies and applies a webhook. Each event is applied once: a redelivered event
        returns "duplicate". Raises WebhookVerificationError for requests the provider did not
        sign."""
        event = await self._provider.parse_webhook(body, headers)
        if isinstance(event, IgnoredEvent):
            return "ignored"
        async with self._store.transaction() as writes:
            if not await writes.record_event(self._provider.id, event.id):
                return "duplicate"
            snapshot = event.subscription
            existing = await writes.find_id(snapshot.provider, snapshot.subscription_id)
            if existing is not None:
                await writes.update(existing, snapshot)
            elif snapshot.user_id:
                await writes.insert(snapshot.user_id, snapshot)
            else:
                # Without the app's user id there is no row to attach the subscription to.
                return "ignored"
        return "applied"


async def _connect(database_url: str | None) -> psycopg.AsyncConnection[TupleRow]:
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set: payments keep their state in the database.")
    # No prepared statements, so poolers in transaction mode (Supabase's, PgBouncer) work too.
    return await psycopg.AsyncConnection.connect(
        database_url, connect_timeout=5, prepare_threshold=None
    )


async def find_subscription(db: psycopg.AsyncConnection[Any], user_id: str) -> Subscription | None:
    """The user's most recently updated subscription with any provider, or None. It reads only
    the database, so it works even while the payment provider is not configured."""
    async with db.cursor(row_factory=class_row(Subscription)) as cursor:
        await cursor.execute(
            "select id::text as id, user_id::text as user_id, provider, provider_customer_id,"
            " provider_subscription_id, plan_id, status, current_period_end,"
            " cancel_at_period_end, created_at, updated_at"
            " from subscriptions where user_id = %s::uuid order by updated_at desc limit 1",
            (user_id,),
        )
        return await cursor.fetchone()


class _PostgresWrites:
    def __init__(self, db: psycopg.AsyncConnection[TupleRow]) -> None:
        self._db = db

    async def record_event(self, provider: str, event_id: str) -> bool:
        cursor = await self._db.execute(
            "insert into payment_events (provider, event_id) values (%s, %s)"
            " on conflict do nothing returning event_id",
            (provider, event_id),
        )
        return await cursor.fetchone() is not None

    async def find_id(self, provider: str, subscription_id: str) -> str | None:
        cursor = await self._db.execute(
            "select id::text from subscriptions"
            " where provider = %s and provider_subscription_id = %s limit 1",
            (provider, subscription_id),
        )
        row = await cursor.fetchone()
        return str(row[0]) if row else None

    async def update(self, row_id: str, snapshot: SubscriptionSnapshot) -> None:
        await self._db.execute(
            "update subscriptions set provider = %s, provider_customer_id = %s, plan_id = %s,"
            " status = %s, current_period_end = %s, cancel_at_period_end = %s, updated_at = now()"
            " where id = %s::uuid",
            (
                snapshot.provider,
                snapshot.customer_id,
                snapshot.plan_id,
                snapshot.status,
                snapshot.current_period_end,
                snapshot.cancel_at_period_end,
                row_id,
            ),
        )

    async def insert(self, user_id: str, snapshot: SubscriptionSnapshot) -> None:
        await self._db.execute(
            "insert into subscriptions (user_id, provider, provider_customer_id,"
            " provider_subscription_id, plan_id, status, current_period_end, cancel_at_period_end)"
            " values (%s::uuid, %s, %s, %s, %s, %s, %s, %s)",
            (
                user_id,
                snapshot.provider,
                snapshot.customer_id,
                snapshot.subscription_id,
                snapshot.plan_id,
                snapshot.status,
                snapshot.current_period_end,
                snapshot.cancel_at_period_end,
            ),
        )


class PostgresSubscriptions:
    """The subscriptions and payment_events tables, which packages/payments's migrations create.
    Each call opens its own connection to DATABASE_URL."""

    def __init__(self, database_url: str | None) -> None:
        self._database_url = database_url

    async def find(self, user_id: str) -> Subscription | None:
        async with await _connect(self._database_url) as db:
            return await find_subscription(db, user_id)

    async def customer_id(self, user_id: str, provider: str) -> str | None:
        async with await _connect(self._database_url) as db:
            cursor = await db.execute(
                "select provider_customer_id from subscriptions"
                " where user_id = %s::uuid and provider = %s order by updated_at desc limit 1",
                (user_id, provider),
            )
            row = await cursor.fetchone()
        return str(row[0]) if row else None

    @asynccontextmanager
    async def transaction(self) -> AsyncIterator[SubscriptionWrites]:
        async with await _connect(self._database_url) as db, db.transaction():
            yield _PostgresWrites(db)


async def has_active_subscription(profile_id: str) -> bool:
    """Whether the user, by their users row id, has a subscription that grants the paid features.
    It reads only the database, so it holds even while the payment provider is not configured."""
    return is_entitled(await PostgresSubscriptions(get_settings().database_url).find(profile_id))
