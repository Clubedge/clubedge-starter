"""Expo's push service, as push.py's PushProvider. It delivers to the native app's Expo push
tokens through FCM and APNs, with the credentials EAS keeps for the app, so the server needs none
of its own: only an access token when the Expo project requires one."""

from typing import Any

import httpx

from clubedge_api.push import PushDevice, PushMessage, PushResult, PushService

SEND_URL = "https://exp.host/--/api/v2/push/send"
# Expo takes up to 100 notifications per request.
BATCH_SIZE = 100


class ExpoPushError(Exception):
    """Expo refused the request itself, such as a wrong access token."""


class ExpoPush:
    services: tuple[PushService, ...] = ("expo",)

    def __init__(
        self,
        access_token: str | None = None,
        *,
        url: str = SEND_URL,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.access_token = access_token
        self.url = url
        self.transport = transport

    async def send(self, devices: list[PushDevice], message: PushMessage) -> PushResult:
        result = PushResult()
        headers = {"accept": "application/json", "content-type": "application/json"}
        if self.access_token:
            headers["authorization"] = f"Bearer {self.access_token}"
        async with httpx.AsyncClient(transport=self.transport, timeout=15) as client:
            for start in range(0, len(devices), BATCH_SIZE):
                batch = devices[start : start + BATCH_SIZE]
                response = await client.post(
                    self.url,
                    headers=headers,
                    json=[
                        {
                            "to": device["token"],
                            "title": message.title,
                            "body": message.body,
                            "data": message.data,
                            "sound": "default",
                            "priority": "high",
                        }
                        for device in batch
                    ],
                )
                if response.is_error:
                    raise ExpoPushError(f"Expo's push service answered {response.status_code}.")
                tickets: list[dict[str, Any]] = response.json().get("data") or []
                for index, device in enumerate(batch):
                    ticket = tickets[index] if index < len(tickets) else {}
                    if ticket.get("status") == "ok":
                        result.sent += 1
                    # The app was uninstalled, or its token expired: it will never work again.
                    elif (ticket.get("details") or {}).get("error") == "DeviceNotRegistered":
                        result.invalid_tokens.append(device["token"])
        return result
