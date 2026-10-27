"""Expo's push service, against a stand-in for Expo's API."""

import asyncio
import json
from collections.abc import Callable

import httpx
import pytest

from clubedge_api.push import PushDevice, PushMessage, PushResult
from clubedge_api.push_expo import ExpoPush, ExpoPushError

MESSAGE = PushMessage("Hello", "From the test", {"url": "/settings"})


def device(name: str) -> PushDevice:
    return {"token": f"ExponentPushToken[{name}]", "service": "expo", "platform": "android"}


def expo(
    requests: list[httpx.Request], ticket: Callable[[str], dict[str, object]] | None = None
) -> httpx.MockTransport:
    """Expo's API, answering each notification with `ticket(token)`, ok by default."""

    def answer(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        notifications = json.loads(request.content)
        tickets = [
            ticket(item["to"]) if ticket else {"status": "ok", "id": "ticket"}
            for item in notifications
        ]
        return httpx.Response(200, json={"data": tickets})

    return httpx.MockTransport(answer)


def test_sends_each_notification_with_its_data_and_the_access_token() -> None:
    requests: list[httpx.Request] = []
    provider = ExpoPush("secret", transport=expo(requests))
    assert asyncio.run(provider.send([device("a")], MESSAGE)) == PushResult(sent=1)
    [request] = requests
    assert str(request.url) == "https://exp.host/--/api/v2/push/send"
    assert request.headers["authorization"] == "Bearer secret"
    assert json.loads(request.content) == [
        {
            "to": "ExponentPushToken[a]",
            "title": "Hello",
            "body": "From the test",
            "data": {"url": "/settings"},
            "sound": "default",
            "priority": "high",
        }
    ]


def test_sends_no_authorization_without_an_access_token() -> None:
    requests: list[httpx.Request] = []
    asyncio.run(ExpoPush(transport=expo(requests)).send([device("a")], MESSAGE))
    assert "authorization" not in requests[0].headers


def test_names_the_tokens_of_devices_that_are_no_longer_registered() -> None:
    def ticket(token: str) -> dict[str, object]:
        if "gone" in token:
            return {"status": "error", "details": {"error": "DeviceNotRegistered"}}
        if "busy" in token:
            return {"status": "error", "details": {"error": "MessageRateExceeded"}}
        return {"status": "ok", "id": "ticket"}

    provider = ExpoPush(transport=expo([], ticket))
    result = asyncio.run(provider.send([device("a"), device("gone"), device("busy")], MESSAGE))
    # A device refused for now keeps its token: only DeviceNotRegistered is for good.
    assert result == PushResult(sent=1, invalid_tokens=["ExponentPushToken[gone]"])


def test_sends_100_notifications_per_request() -> None:
    requests: list[httpx.Request] = []
    devices = [device(str(index)) for index in range(250)]
    result = asyncio.run(ExpoPush(transport=expo(requests)).send(devices, MESSAGE))
    assert result.sent == 250
    assert [len(json.loads(request.content)) for request in requests] == [100, 100, 50]


def test_fails_when_expo_refuses_the_request_itself() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(429, json={"errors": [{"code": "PUSH_TOO_MANY"}]})

    provider = ExpoPush(transport=httpx.MockTransport(refuse))
    with pytest.raises(ExpoPushError):
        asyncio.run(provider.send([device("a")], MESSAGE))
