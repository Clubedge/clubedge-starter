"""FCM and APNs, as push.py's PushProvider: notifications go straight to Google's and Apple's push
services, with this server's own credentials, to the device tokens both mobile apps register
(Firebase Cloud Messaging tokens on Android, APNs device tokens on iOS). Each platform's devices
get notifications once its credentials are set."""

import asyncio
import base64
import json
import os
import time
from collections.abc import Awaitable, Callable, Mapping
from dataclasses import dataclass
from typing import Any
from urllib.parse import quote

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from clubedge_api.push import PushDevice, PushMessage, PushResult, PushService

FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
APNS_PRODUCTION = "https://api.push.apple.com"
APNS_SANDBOX = "https://api.sandbox.push.apple.com"
# Requests in flight at once, per service.
CONCURRENCY = 10
# Each service's variables, which it needs all of.
FCM_VARIABLES = ("FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY")
APNS_VARIABLES = ("APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY", "APNS_TOPIC")


class NativePushError(Exception):
    """A push service refused this server's credentials."""


@dataclass(frozen=True)
class FcmCredentials:
    """A Firebase service account's fields: Project settings, Service accounts, Generate new
    key. The private key's line breaks can be written as \\n, as env files often hold it."""

    project_id: str
    client_email: str
    private_key: str


@dataclass(frozen=True)
class ApnsCredentials:
    """An APNs authentication key (.p8): Apple Developer, Keys. `topic` is the app's bundle
    identifier; apps built for the stores (TestFlight too) are in production, debug builds in the
    sandbox."""

    key_id: str
    team_id: str
    private_key: str
    topic: str
    production: bool = True


def _base64url(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode()


def _json_part(value: Mapping[str, str | int]) -> str:
    return _base64url(json.dumps(value, separators=(",", ":")).encode())


def sign_jwt(header: dict[str, str], claims: dict[str, str | int], private_key: str) -> str:
    """A JSON Web Token signed with RS256 (a Google service account) or ES256 (an APNs key)."""
    data = f"{_json_part(header)}.{_json_part(claims)}".encode()
    key = serialization.load_pem_private_key(private_key.replace("\\n", "\n").encode(), None)
    if header["alg"] == "ES256":
        if not isinstance(key, ec.EllipticCurvePrivateKey):
            raise NativePushError("An APNs key is an elliptic curve key, in a .p8 file.")
        r, s = decode_dss_signature(key.sign(data, ec.ECDSA(hashes.SHA256())))
        # JSON Web Tokens hold the signature raw: r and s side by side.
        signature = r.to_bytes(32, "big") + s.to_bytes(32, "big")
    else:
        if not isinstance(key, rsa.RSAPrivateKey):
            raise NativePushError("A Google service account's key is an RSA key.")
        signature = key.sign(data, padding.PKCS1v15(), hashes.SHA256())
    return f"{data.decode()}.{_base64url(signature)}"


def _app_data(message: PushMessage, service: PushService) -> dict[str, object]:
    """The data the apps read when a notification is tapped, such as `url`: Capacitor finds it in
    the payload's keys, Expo's notifications library in `body`, which FCM, taking only strings,
    carries as JSON."""
    body: object = (
        json.dumps(message.data, separators=(",", ":")) if service == "fcm" else message.data
    )
    return {**message.data, "body": body}


async def _each_limited(
    items: list[PushDevice], task: Callable[[PushDevice], Awaitable[None]]
) -> None:
    """Runs `task` for each item, a few at a time."""
    gate = asyncio.Semaphore(CONCURRENCY)

    async def run(item: PushDevice) -> None:
        async with gate:
            await task(item)

    await asyncio.gather(*(run(item) for item in items))


def _fcm_error_code(response: httpx.Response) -> str | None:
    try:
        error: dict[str, Any] = response.json().get("error") or {}
    except ValueError:
        return None
    for detail in error.get("details") or []:
        if isinstance(detail, dict) and detail.get("errorCode"):
            return str(detail["errorCode"])
    status = error.get("status")
    return str(status) if status else None


class NativePush:
    """FCM for Android and APNs for iOS, each when its credentials are given. A device whose
    service has none is left out of sends, keeping its token for when it does."""

    def __init__(
        self,
        fcm: FcmCredentials | None = None,
        apns: ApnsCredentials | None = None,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
        apns_origin: str | None = None,
        now: Callable[[], float] = time.time,
    ) -> None:
        self.fcm = fcm
        self.apns = apns
        self.transport = transport
        self.apns_origin = apns_origin
        self.now = now
        services: list[PushService] = []
        if fcm:
            services.append("fcm")
        if apns:
            services.append("apns")
        self.services: tuple[PushService, ...] = tuple(services)
        self._fcm_token: tuple[str, float] | None = None
        self._apns_token: tuple[str, float] | None = None

    async def send(self, devices: list[PushDevice], message: PushMessage) -> PushResult:
        result = PushResult()
        android = [device for device in devices if device["service"] == "fcm"]
        apple = [device for device in devices if device["service"] == "apns"]
        if self.fcm and android:
            await self._send_fcm(self.fcm, android, message, result)
        if self.apns and apple:
            await self._send_apns(self.apns, apple, message, result)
        return result

    async def _fcm_access_token(self, client: httpx.AsyncClient, fcm: FcmCredentials) -> str:
        """An OAuth access token for FCM, from the service account; Google's last an hour."""
        if self._fcm_token and self._fcm_token[1] - 60 > self.now():
            return self._fcm_token[0]
        issued_at = int(self.now())
        assertion = sign_jwt(
            {"alg": "RS256", "typ": "JWT"},
            {
                "iss": fcm.client_email,
                "scope": FCM_SCOPE,
                "aud": GOOGLE_TOKEN_URL,
                "iat": issued_at,
                "exp": issued_at + 3_600,
            },
            fcm.private_key,
        )
        response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
                "assertion": assertion,
            },
        )
        if response.is_error:
            raise NativePushError(
                f"Google refused the FCM service account ({response.status_code}):"
                " check FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY."
            )
        body = response.json()
        self._fcm_token = (str(body["access_token"]), self.now() + float(body["expires_in"]))
        return self._fcm_token[0]

    async def _send_fcm(
        self,
        fcm: FcmCredentials,
        devices: list[PushDevice],
        message: PushMessage,
        result: PushResult,
    ) -> None:
        project = quote(fcm.project_id, safe="")
        url = f"https://fcm.googleapis.com/v1/projects/{project}/messages:send"
        async with httpx.AsyncClient(transport=self.transport, timeout=15) as client:
            authorization = f"Bearer {await self._fcm_access_token(client, fcm)}"

            async def send(device: PushDevice) -> None:
                response = await client.post(
                    url,
                    headers={"authorization": authorization},
                    json={
                        "message": {
                            "token": device["token"],
                            "notification": {"title": message.title, "body": message.body},
                            "data": _app_data(message, "fcm"),
                            "android": {"priority": "HIGH"},
                        }
                    },
                )
                if response.is_success:
                    result.sent += 1
                    return
                code = _fcm_error_code(response)
                # Uninstalled or expired (UNREGISTERED), or another Firebase project's token
                # (SENDER_ID_MISMATCH): it will never work here again.
                if code in ("UNREGISTERED", "SENDER_ID_MISMATCH") or response.status_code == 404:
                    result.invalid_tokens.append(device["token"])
                elif response.status_code in (401, 403):
                    raise NativePushError(
                        f"FCM refused the request ({code or response.status_code}): check that the"
                        " service account belongs to FCM_PROJECT_ID, whose Firebase Cloud"
                        " Messaging API is on."
                    )

            await _each_limited(devices, send)

    def _apns_provider_token(self, apns: ApnsCredentials) -> str:
        """The provider token APNs checks. It takes one for up to an hour, and refuses one renewed
        more often than every 20 minutes, so it is kept for 50."""
        if self._apns_token and self.now() - self._apns_token[1] < 50 * 60:
            return self._apns_token[0]
        issued_at = self.now()
        token = sign_jwt(
            {"alg": "ES256", "kid": apns.key_id},
            {"iss": apns.team_id, "iat": int(issued_at)},
            apns.private_key,
        )
        self._apns_token = (token, issued_at)
        return token

    async def _send_apns(
        self,
        apns: ApnsCredentials,
        devices: list[PushDevice],
        message: PushMessage,
        result: PushResult,
    ) -> None:
        origin = self.apns_origin or (APNS_PRODUCTION if apns.production else APNS_SANDBOX)
        headers = {
            "authorization": f"bearer {self._apns_provider_token(apns)}",
            "apns-topic": apns.topic,
            "apns-push-type": "alert",
            "apns-priority": "10",
        }
        payload = {
            "aps": {"alert": {"title": message.title, "body": message.body}, "sound": "default"},
            **_app_data(message, "apns"),
        }
        # APNs answers over HTTP/2 only (h2, in the push-native dependency group).
        async with httpx.AsyncClient(http2=True, transport=self.transport, timeout=15) as client:

            async def send(device: PushDevice) -> None:
                response = await client.post(
                    f"{origin}/3/device/{device['token']}", headers=headers, json=payload
                )
                if response.is_success:
                    result.sent += 1
                    return
                try:
                    reason = str(response.json().get("reason") or "")
                except ValueError:
                    reason = ""
                # Uninstalled (410), or not a token of this app in this environment.
                if response.status_code == 410 or reason in ("BadDeviceToken", "Unregistered"):
                    result.invalid_tokens.append(device["token"])
                elif response.status_code == 403:
                    raise NativePushError(
                        f"APNs refused the key ({reason or 403}): check APNS_KEY_ID, APNS_TEAM_ID,"
                        " and APNS_PRIVATE_KEY."
                    )

            await _each_limited(devices, send)


def native_push(env: Mapping[str, str] = os.environ) -> NativePush:
    """FCM and APNs, from FCM_* and APNS_*: each needs all of its variables."""

    def value(name: str) -> str:
        return env.get(name, "").strip()

    fcm = (
        FcmCredentials(
            project_id=value("FCM_PROJECT_ID"),
            client_email=value("FCM_CLIENT_EMAIL"),
            private_key=value("FCM_PRIVATE_KEY"),
        )
        if all(value(name) for name in FCM_VARIABLES)
        else None
    )
    apns = (
        ApnsCredentials(
            key_id=value("APNS_KEY_ID"),
            team_id=value("APNS_TEAM_ID"),
            private_key=value("APNS_PRIVATE_KEY"),
            topic=value("APNS_TOPIC"),
            production=value("APNS_ENVIRONMENT") != "development",
        )
        if all(value(name) for name in APNS_VARIABLES)
        else None
    )
    return NativePush(fcm, apns)
