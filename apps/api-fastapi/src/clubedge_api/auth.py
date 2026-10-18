"""The signed-in user for a request.

This API has no authentication module yet, so nobody is signed in; an auth provider replaces
this module the way the full-stack apps' variants do.
"""

from fastapi import Request

from clubedge_api.app import User


async def get_current_user(request: Request) -> User | None:
    return None
