"""Default auth implementation for an API without an auth provider."""

from fastapi import Request

from clubedge_api.contract import User


async def get_current_user(
    request: Request,
    supabase_url: str | None = None,
    supabase_publishable_key: str | None = None,
) -> User | None:
    return None
