"""Supabase bearer-token validation for a decoupled API."""

import httpx
from fastapi import Request

from clubedge_api.app import User


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
