"""Firebase ID token validation through the Identity Toolkit API."""

import os

import httpx
from fastapi import Request

from clubedge_api.app import User


async def get_current_user(request: Request, *_: str | None) -> User | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    api_key = os.environ.get("FIREBASE_API_KEY")
    if scheme.lower() != "bearer" or not token or not api_key:
        return None
    emulator = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")
    base_url = (
        f"http://{emulator}/identitytoolkit.googleapis.com/v1"
        if emulator
        else "https://identitytoolkit.googleapis.com/v1"
    )
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"{base_url}/accounts:lookup",
                params={"key": api_key},
                json={"idToken": token},
            )
        if response.status_code != 200:
            return None
        payload = response.json()
        if not isinstance(payload, dict):
            return None
        users = payload.get("users")
        if not isinstance(users, list) or not users:
            return None
        record = users[0]
        if not isinstance(record, dict):
            return None
        uid, email = record.get("localId"), record.get("email")
        if (
            not isinstance(uid, str)
            or not isinstance(email, str)
            or record.get("emailVerified") is not True
        ):
            return None
        name = record.get("displayName")
        return {"id": uid, "email": email, "displayName": name if isinstance(name, str) else None}
    except (httpx.HTTPError, ValueError):
        return None
