"""Validate a Better Auth session cookie against the auth service."""

import os

import httpx
from fastapi import Request

from clubedge_api.app import User


async def get_current_user(request: Request, *_: str | None) -> User | None:
    auth_url = os.environ.get("BETTER_AUTH_URL")
    cookie = request.headers.get("cookie")
    if not auth_url or not cookie:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"{auth_url.rstrip('/')}/api/auth/get-session",
                headers={"cookie": cookie},
            )
        if response.status_code != 200:
            return None
        user = response.json().get("user")
        if not isinstance(user, dict):
            return None
        user_id, email = user.get("id"), user.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            return None
        name = user.get("name")
        return {
            "id": user_id,
            "email": email,
            "displayName": name if isinstance(name, str) else None,
        }
    except (httpx.HTTPError, ValueError):
        return None
