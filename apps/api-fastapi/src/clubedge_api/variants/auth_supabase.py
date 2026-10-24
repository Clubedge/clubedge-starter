"""Supabase bearer-token validation for a decoupled API."""

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
    if scheme.lower() != "bearer" or not token or not supabase_url or not supabase_publishable_key:
        return None

    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"{supabase_url.rstrip('/')}/auth/v1/user",
                headers={"apikey": supabase_publishable_key, "Authorization": f"Bearer {token}"},
            )
        if response.status_code != 200:
            return None
        user = response.json()
        user_id = user.get("id")
        email = user.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            return None
        metadata = user.get("user_metadata") or {}
        display_name = metadata.get("full_name") or metadata.get("name")
        return {
            "id": user_id,
            "email": email,
            "displayName": display_name if isinstance(display_name, str) else None,
        }
    except (httpx.HTTPError, ValueError):
        return None


def can_delete_account() -> bool:
    """Deleting a user is an admin operation, so it needs the project's secret key."""
    keys = ("SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY")
    return all(os.environ.get(key) for key in keys)


def _signed_in_user_id(response: httpx.Response) -> object:
    """The id of the user a password sign-in answered with."""
    try:
        session = response.json()
    except ValueError:
        return None
    user = session.get("user") if isinstance(session, dict) else None
    return user.get("id") if isinstance(user, dict) else None


async def delete_account(deletion: ProviderAccountDeletion) -> AccountDeletionResult:
    url = os.environ.get("SUPABASE_URL")
    publishable_key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    secret_key = os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not publishable_key or not secret_key:
        return "not-supported"
    auth_url = f"{url.rstrip('/')}/auth/v1"
    user = deletion.user
    async with httpx.AsyncClient(timeout=15) as client:
        # Signing in checks the password; the session it creates ends with the user below.
        response = await client.post(
            f"{auth_url}/token",
            params={"grant_type": "password"},
            headers={"apikey": publishable_key},
            json={"email": user["email"], "password": deletion.password},
        )
        if response.status_code == 429:
            return "rate-limited"
        # An outage is not a wrong password: it answers 500, as the other providers do.
        if response.status_code >= 500:
            response.raise_for_status()
        if response.status_code != 200 or _signed_in_user_id(response) != user["id"]:
            return "invalid-password"
        await deletion.before_delete()
        deleted = await client.request(
            "DELETE",
            f"{auth_url}/admin/users/{quote(user['id'], safe='')}",
            headers={"apikey": secret_key, "Authorization": f"Bearer {secret_key}"},
            json={"should_soft_delete": False},
        )
        deleted.raise_for_status()
    return "deleted"
