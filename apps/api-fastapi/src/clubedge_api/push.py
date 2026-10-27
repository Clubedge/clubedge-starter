"""Push notifications, provider-neutral: the devices table (packages/push's push_devices, with its
own migrations), the PushProvider a push service implements, and sending to a user's devices,
which forgets the tokens a service refuses for good. The provider is push_expo.py's or
push_native.py's, which server.py picks."""

import re
from dataclasses import dataclass, field
from typing import Literal, Protocol, TypedDict

from clubedge_api import users
from clubedge_api.contract import User
from clubedge_api.db import connect

# The service a device's token belongs to: Expo's push service for the native app's Expo push
# tokens, Firebase Cloud Messaging for Android's, and APNs for Apple's.
PushService = Literal["expo", "fcm", "apns"]
PUSH_SERVICES: tuple[PushService, ...] = ("expo", "fcm", "apns")
PushPlatform = Literal["ios", "android"]


class PushDevice(TypedDict):
    """A device's push token, with the service it belongs to and the device's platform."""

    token: str
    service: PushService
    platform: PushPlatform


@dataclass(frozen=True)
class PushMessage:
    """A notification: a title, a text, and data the app reads when it is tapped (`url` opens
    that screen of the app). String values only, as every service passes them."""

    title: str
    body: str
    data: dict[str, str] = field(default_factory=dict)


@dataclass
class PushResult:
    """What a send did: the devices the service took the notification for, and the tokens it says
    will never work again, such as an uninstalled app's."""

    sent: int = 0
    invalid_tokens: list[str] = field(default_factory=list)


class PushProvider(Protocol):
    """One push service. `services` names those whose tokens it sends to."""

    services: tuple[PushService, ...]

    async def send(self, devices: list[PushDevice], message: PushMessage) -> PushResult: ...


_TOKEN_SHAPES: dict[PushService, re.Pattern[str]] = {
    "expo": re.compile(r"Expo(nent)?PushToken\[[^\]\s]+\]"),
    "fcm": re.compile(r"[\w:.-]+"),
    "apns": re.compile(r"[0-9a-fA-F]{64,200}"),
}


def is_push_token(service: PushService, token: str) -> bool:
    """Whether `token` has the shape of a token of `service`, before it is saved."""
    return 0 < len(token) <= 4_096 and _TOKEN_SHAPES[service].fullmatch(token) is not None


async def register(user_id: str, device: PushDevice) -> None:
    """Saves the token for the user; a token saved for someone else moves to this user."""
    async with connect() as db:
        await db.execute(
            "insert into push_devices (token, user_id, service, platform) values (%s, %s, %s, %s)"
            " on conflict (token) do update set user_id = excluded.user_id,"
            " service = excluded.service, platform = excluded.platform, updated_at = now()",
            (device["token"], user_id, device["service"], device["platform"]),
        )


async def remove(token: str) -> None:
    """Forgets a token, such as when the app signs out or turns notifications off."""
    async with connect() as db:
        await db.execute("delete from push_devices where token = %s", (token,))


async def devices_of(user_id: str) -> list[PushDevice]:
    """The user's devices, oldest first."""
    async with connect() as db:
        cursor = await db.execute(
            "select token, service, platform from push_devices where user_id = %s"
            " order by created_at",
            (user_id,),
        )
        rows = await cursor.fetchall()
    return [
        {"token": token, "service": service, "platform": platform}
        for token, service, platform in rows
    ]


async def remove_tokens(tokens: list[str]) -> None:
    """Forgets tokens a push service refused for good."""
    if not tokens:
        return
    async with connect() as db:
        await db.execute("delete from push_devices where token = any(%s)", (tokens,))


async def send_to_user(provider: PushProvider, user_id: str, message: PushMessage) -> PushResult:
    """Sends a notification to each of the user's devices the provider reaches, then forgets the
    tokens the push service says will never work again."""
    reachable = [
        device for device in await devices_of(user_id) if device["service"] in provider.services
    ]
    if not reachable:
        return PushResult()
    result = await provider.send(reachable, message)
    await remove_tokens(result.invalid_tokens)
    return result


class PushNotifications:
    """What the push routes (routes/push.py) and the rest of the API use: `services` are those
    whose tokens the server takes, and `provider` sends, or is None while no push service is set
    up. Tokens are saved before then, and reached once it is."""

    def __init__(self, services: tuple[PushService, ...], provider: PushProvider | None) -> None:
        self.services = services
        self.provider = provider

    async def register(self, user: User, device: PushDevice) -> None:
        await register(await users.ensure_user_id(user), device)

    async def remove(self, token: str) -> None:
        await remove(token)

    async def send(self, user: User, message: PushMessage) -> PushResult | None:
        """Sends to each of the user's devices, such as from a background job; None while no
        push service is set up."""
        if self.provider is None or not self.provider.services:
            return None
        return await send_to_user(self.provider, await users.ensure_user_id(user), message)
