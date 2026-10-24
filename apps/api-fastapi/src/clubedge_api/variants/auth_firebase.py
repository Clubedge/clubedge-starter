"""Firebase ID token validation through the Identity Toolkit API."""

import os

import httpx
from fastapi import Request

from clubedge_api.contract import User
from clubedge_api.routes.account import AccountDeletionResult, ProviderAccountDeletion


def identity_toolkit_url() -> str:
    """Identity Toolkit's REST API, or the Auth Emulator's when FIREBASE_AUTH_EMULATOR_HOST is
    set."""
    emulator = os.environ.get("FIREBASE_AUTH_EMULATOR_HOST")
    if emulator:
        return f"http://{emulator}/identitytoolkit.googleapis.com/v1"
    return "https://identitytoolkit.googleapis.com/v1"


async def get_current_user(
    request: Request,
    supabase_url: str | None = None,
    supabase_publishable_key: str | None = None,
) -> User | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    api_key = os.environ.get("FIREBASE_API_KEY")
    if scheme.lower() != "bearer" or not token or not api_key:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.post(
                f"{identity_toolkit_url()}/accounts:lookup",
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


# A wrong password, an unknown address, or a disabled account: one answer for all.
BAD_CREDENTIALS = frozenset(
    {"EMAIL_NOT_FOUND", "INVALID_PASSWORD", "INVALID_LOGIN_CREDENTIALS", "USER_DISABLED"}
)


def can_delete_account() -> bool:
    """Checking the password and deleting the user both go through Identity Toolkit's REST API,
    with the project's Web API key: no service account is needed."""
    return bool(os.environ.get("FIREBASE_API_KEY"))


def _json_object(response: httpx.Response) -> dict[str, object]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


async def delete_account(deletion: ProviderAccountDeletion) -> AccountDeletionResult:
    api_key = os.environ.get("FIREBASE_API_KEY")
    if not api_key:
        return "not-supported"
    identity = identity_toolkit_url()
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            f"{identity}/accounts:signInWithPassword",
            params={"key": api_key},
            json={
                "email": deletion.user["email"],
                "password": deletion.password,
                "returnSecureToken": True,
            },
        )
        body = _json_object(response)
        if response.status_code != 200:
            # Messages look like "INVALID_PASSWORD" or "TOO_MANY_ATTEMPTS_TRY_LATER : ...".
            error = body.get("error")
            message = error.get("message") if isinstance(error, dict) else None
            code = message.split(" ")[0] if isinstance(message, str) else ""
            if code in BAD_CREDENTIALS:
                return "invalid-password"
            if code.startswith("TOO_MANY_ATTEMPTS"):
                return "rate-limited"
            raise RuntimeError(
                f"Firebase could not check the password ({response.status_code} {code})."
            )
        if body.get("localId") != deletion.user["id"]:
            return "invalid-password"
        id_token = body.get("idToken")
        if not isinstance(id_token, str):
            raise RuntimeError("Firebase checked the password without returning an ID token.")
        await deletion.before_delete()
        # The user deletes itself with the ID token the password check gave it, so the API needs
        # no service account. Its refresh tokens stop working with it, which ends its sessions.
        deleted = await client.post(
            f"{identity}/accounts:delete", params={"key": api_key}, json={"idToken": id_token}
        )
        deleted.raise_for_status()
    return "deleted"
