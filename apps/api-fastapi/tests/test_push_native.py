"""FCM and APNs, against stand-ins for Google's and Apple's APIs, with keys made for the test."""

import asyncio
import base64
import json
from urllib.parse import parse_qs

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec, padding, rsa
from cryptography.hazmat.primitives.asymmetric.utils import encode_dss_signature

from clubedge_api.push import PushDevice, PushMessage, PushResult
from clubedge_api.push_native import (
    ApnsCredentials,
    FcmCredentials,
    NativePush,
    NativePushError,
    native_push,
    sign_jwt,
)

RSA_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
EC_KEY = ec.generate_private_key(ec.SECP256R1())


def pem(key: rsa.RSAPrivateKey | ec.EllipticCurvePrivateKey) -> str:
    return key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()


FCM = FcmCredentials("my-product", "push@my-product.iam.gserviceaccount.com", pem(RSA_KEY))
APNS = ApnsCredentials("KEY123", "TEAM456", pem(EC_KEY), "com.example.app")
MESSAGE = PushMessage("Hello", "From the test", {"url": "/settings"})
# The data each service carries: FCM takes only strings, so its `body` is JSON.
FCM_DATA = {"url": "/settings", "body": '{"url":"/settings"}'}
APNS_DATA = {"url": "/settings", "body": {"url": "/settings"}}


def android(token: str) -> PushDevice:
    return {"token": token, "service": "fcm", "platform": "android"}


def iphone(token: str) -> PushDevice:
    return {"token": token.ljust(64, "0"), "service": "apns", "platform": "ios"}


def unpadded(part: str) -> bytes:
    return base64.urlsafe_b64decode(part + "=" * (-len(part) % 4))


def decode(part: str) -> dict[str, object]:
    decoded: dict[str, object] = json.loads(unpadded(part))
    return decoded


class Services:
    """Google's token endpoint, FCM, and APNs, which refuse tokens starting with "gone"."""

    def __init__(self) -> None:
        self.requests: list[httpx.Request] = []

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "access", "expires_in": 3600})
        if request.url.host == "fcm.googleapis.com":
            token = json.loads(request.content)["message"]["token"]
            if token.startswith("gone"):
                error = {"status": "NOT_FOUND", "details": [{"errorCode": "UNREGISTERED"}]}
                return httpx.Response(404, json={"error": error})
            return httpx.Response(200, json={"name": "projects/my-product/messages/1"})
        if request.url.path.startswith("/3/device/gone"):
            return httpx.Response(410, json={"reason": "Unregistered"})
        return httpx.Response(200)

    def to(self, host: str) -> list[httpx.Request]:
        return [request for request in self.requests if request.url.host == host]


def test_signs_with_rs256_for_google_and_es256_for_apple() -> None:
    header, claims, signature = sign_jwt({"alg": "RS256"}, {"iss": "me"}, pem(RSA_KEY)).split(".")
    RSA_KEY.public_key().verify(
        unpadded(signature), f"{header}.{claims}".encode(), padding.PKCS1v15(), hashes.SHA256()
    )
    token = sign_jwt({"alg": "ES256", "kid": "K"}, {"iat": 1}, pem(EC_KEY))
    header, claims, signature = token.split(".")
    raw = unpadded(signature)
    # A raw signature, r and s side by side, as JSON Web Tokens hold it.
    assert len(raw) == 64
    der = encode_dss_signature(int.from_bytes(raw[:32], "big"), int.from_bytes(raw[32:], "big"))
    EC_KEY.public_key().verify(der, f"{header}.{claims}".encode(), ec.ECDSA(hashes.SHA256()))
    assert decode(header) == {"alg": "ES256", "kid": "K"}


def test_reads_a_key_whose_line_breaks_are_written_as_backslash_n() -> None:
    flat = pem(RSA_KEY).replace("\n", "\\n")
    assert sign_jwt({"alg": "RS256"}, {"iss": "me"}, flat).count(".") == 2


def test_sends_android_devices_their_notification_with_the_service_accounts_token() -> None:
    services = Services()
    provider = NativePush(FCM, transport=httpx.MockTransport(services))
    assert provider.services == ("fcm",)
    result = asyncio.run(provider.send([android("one"), android("gone")], MESSAGE))
    assert result == PushResult(sent=1, invalid_tokens=["gone"])

    [token_request] = services.to("oauth2.googleapis.com")
    assertion = parse_qs(token_request.content.decode())["assertion"][0]
    assert decode(assertion.split(".")[1]) == {
        "iss": FCM.client_email,
        "scope": "https://www.googleapis.com/auth/firebase.messaging",
        "aud": "https://oauth2.googleapis.com/token",
        "iat": decode(assertion.split(".")[1])["iat"],
        "exp": decode(assertion.split(".")[1])["exp"],
    }
    sent = services.to("fcm.googleapis.com")[0]
    assert str(sent.url) == "https://fcm.googleapis.com/v1/projects/my-product/messages:send"
    assert sent.headers["authorization"] == "Bearer access"
    assert json.loads(sent.content) == {
        "message": {
            "token": "one",
            "notification": {"title": "Hello", "body": "From the test"},
            "data": FCM_DATA,
            "android": {"priority": "HIGH"},
        }
    }


def test_keeps_googles_access_token_until_it_nearly_expires() -> None:
    clock = [0.0]
    services = Services()
    provider = NativePush(FCM, transport=httpx.MockTransport(services), now=lambda: clock[0])
    asyncio.run(provider.send([android("one")], MESSAGE))
    clock[0] = 30 * 60
    asyncio.run(provider.send([android("one")], MESSAGE))
    assert len(services.to("oauth2.googleapis.com")) == 1
    clock[0] = 59.5 * 60
    asyncio.run(provider.send([android("one")], MESSAGE))
    assert len(services.to("oauth2.googleapis.com")) == 2


def test_fails_clearly_when_google_refuses_the_service_account() -> None:
    def refuse(request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"error": "invalid_grant"})

    provider = NativePush(FCM, transport=httpx.MockTransport(refuse))
    with pytest.raises(NativePushError, match="check FCM_CLIENT_EMAIL and FCM_PRIVATE_KEY"):
        asyncio.run(provider.send([android("one")], MESSAGE))


def test_sends_apple_devices_an_alert_for_the_app_with_the_keys_token() -> None:
    services = Services()
    provider = NativePush(apns=APNS, transport=httpx.MockTransport(services))
    assert provider.services == ("apns",)
    result = asyncio.run(provider.send([iphone("abc"), iphone("gone")], MESSAGE))
    assert result == PushResult(sent=1, invalid_tokens=[iphone("gone")["token"]])

    path = f"/3/device/{iphone('abc')['token']}"
    sent = next(request for request in services.requests if request.url.path == path)
    assert sent.url.host == "api.push.apple.com"
    assert sent.headers["apns-topic"] == "com.example.app"
    assert sent.headers["apns-push-type"] == "alert"
    header, claims, _ = sent.headers["authorization"].removeprefix("bearer ").split(".")
    assert decode(header) == {"alg": "ES256", "kid": "KEY123"}
    assert decode(claims)["iss"] == "TEAM456"
    assert json.loads(sent.content) == {
        "aps": {"alert": {"title": "Hello", "body": "From the test"}, "sound": "default"},
        **APNS_DATA,
    }


def test_sends_development_builds_through_apples_sandbox() -> None:
    services = Services()
    sandbox = ApnsCredentials("KEY123", "TEAM456", pem(EC_KEY), "com.example.app", False)
    provider = NativePush(apns=sandbox, transport=httpx.MockTransport(services))
    asyncio.run(provider.send([iphone("abc")], MESSAGE))
    assert services.requests[0].url.host == "api.sandbox.push.apple.com"


def test_reads_each_services_credentials_whole_or_not_at_all() -> None:
    fcm_env = {
        "FCM_PROJECT_ID": "my-product",
        "FCM_CLIENT_EMAIL": FCM.client_email,
        "FCM_PRIVATE_KEY": FCM.private_key,
    }
    assert native_push(fcm_env).services == ("fcm",)
    assert native_push({**fcm_env, "FCM_PRIVATE_KEY": ""}).services == ()
    apns_env = {
        "APNS_KEY_ID": "KEY123",
        "APNS_TEAM_ID": "TEAM456",
        "APNS_PRIVATE_KEY": APNS.private_key,
        "APNS_TOPIC": "com.example.app",
        "APNS_ENVIRONMENT": "development",
    }
    both = native_push({**fcm_env, **apns_env})
    assert both.services == ("fcm", "apns")
    assert both.apns is not None and both.apns.production is False
