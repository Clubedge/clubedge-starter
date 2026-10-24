"""Appwrite JWT validation using the project's public Account endpoint."""

import os

import httpx
from fastapi import Request

from clubedge_api.contract import User


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
