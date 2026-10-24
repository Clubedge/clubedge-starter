"""File storage for the API's routes: `get_storage(request)`, then upload, download, delete, check,
or sign a URL for an object by key.

Supabase Storage, acting as the user whose access token the request carries, so bucket policies
can use the signed-in user.
"""

import os
import re

from fastapi import Request

from clubedge_api.settings import get_settings
from clubedge_api.storage_provider import StorageProvider, UploadResult
from clubedge_api.storage_supabase import SupabaseStorage

__all__ = ["StorageProvider", "UploadResult", "get_storage"]

_BEARER = re.compile(r"^Bearer\s+(.+)$", re.IGNORECASE)


def _bearer_token(request: Request) -> str | None:
    """The browser's Supabase access token, sent as `Authorization: Bearer <token>`."""
    match = _BEARER.match(request.headers.get("authorization", ""))
    return match.group(1) if match else None


def get_storage(request: Request) -> StorageProvider:
    """File storage for a route, acting as the request's user: Storage row-level security policies
    apply, and a request without a token is anonymous."""
    settings = get_settings()
    return SupabaseStorage(
        url=settings.supabase_url,
        publishable_key=settings.supabase_publishable_key,
        bucket=os.environ.get("SUPABASE_STORAGE_BUCKET", "").strip() or None,
        token=_bearer_token(request),
    )
