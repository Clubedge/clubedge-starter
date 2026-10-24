"""Appwrite JWT validation using the project's public Account endpoint."""

import os
from urllib.parse import quote

import httpx
from fastapi import Request

from clubedge_api.contract import User
from clubedge_api.routes.account import AccountDeletionResult, ProviderAccountDeletion


async def get_current_user(
    request: Request,
    supabase_url: str | None = None,
    supabase_publishable_key: str | None = None,
) -> User | None:
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    endpoint = os.environ.get("APPWRITE_ENDPOINT")
    project_id = os.environ.get("APPWRITE_PROJECT_ID")
    if scheme.lower() != "bearer" or not token or not endpoint or not project_id:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"{endpoint.rstrip('/')}/account",
                headers={"X-Appwrite-Project": project_id, "X-Appwrite-JWT": token},
            )
        if response.status_code != 200:
            return None
        account = response.json()
        if not isinstance(account, dict) or account.get("emailVerification") is not True:
            return None
        user_id, email = account.get("$id"), account.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            return None
        name = account.get("name")
        return {
            "id": user_id,
            "email": email,
            "displayName": name if isinstance(name, str) else None,
        }
    except (httpx.HTTPError, ValueError):
        return None


# A wrong password, an unknown address, or a blocked account: one answer for all.
BAD_CREDENTIALS = frozenset({"user_invalid_credentials", "user_blocked", "user_not_found"})


def can_delete_account() -> bool:
    """Deleting a user needs an API key with the sessions.write and users.write scopes."""
    keys = ("APPWRITE_ENDPOINT", "APPWRITE_PROJECT_ID", "APPWRITE_API_KEY")
    return all(os.environ.get(key) for key in keys)


def _json_object(response: httpx.Response) -> dict[str, object]:
    try:
        body = response.json()
    except ValueError:
        return {}
    return body if isinstance(body, dict) else {}


async def delete_account(deletion: ProviderAccountDeletion) -> AccountDeletionResult:
    endpoint = os.environ.get("APPWRITE_ENDPOINT")
    project_id = os.environ.get("APPWRITE_PROJECT_ID")
    api_key = os.environ.get("APPWRITE_API_KEY")
    if not endpoint or not project_id or not api_key:
        return "not-supported"
    base_url = endpoint.rstrip("/")
    admin = {"X-Appwrite-Project": project_id, "X-Appwrite-Key": api_key}
    user = deletion.user
    async with httpx.AsyncClient(timeout=15, headers=admin) as client:
        # Creating a session checks the password; the session is deleted straight away.
        response = await client.post(
            f"{base_url}/account/sessions/email",
            json={"email": user["email"], "password": deletion.password},
        )
        session = _json_object(response)
        if response.is_error:
            if session.get("type") in BAD_CREDENTIALS:
                return "invalid-password"
            if response.status_code == 429:
                return "rate-limited"
            response.raise_for_status()
        session_id, user_id = session.get("$id"), session.get("userId")
        if not isinstance(session_id, str) or not isinstance(user_id, str):
            raise RuntimeError("Appwrite checked the password without returning a session.")
        ended = await client.delete(
            f"{base_url}/users/{quote(user_id, safe='')}/sessions/{quote(session_id, safe='')}"
        )
        ended.raise_for_status()
        if user_id != user["id"]:
            return "invalid-password"
        await deletion.before_delete()
        deleted = await client.delete(f"{base_url}/users/{quote(user['id'], safe='')}")
        deleted.raise_for_status()
    return "deleted"
