"""File storage for the API's routes: `get_storage(request)`, then upload, download, delete, check,
or sign a URL for an object by key.

S3-compatible storage: AWS S3, Cloudflare R2, MinIO, and similar services.
"""

import os
from functools import cache

from fastapi import Request

from clubedge_api.settings import get_settings
from clubedge_api.storage_local import FileSystemStorage  # clubedge:only infra=local
from clubedge_api.storage_provider import StorageProvider, UploadResult
from clubedge_api.storage_s3 import S3Storage

__all__ = ["StorageProvider", "UploadResult", "get_storage"]


def _env(name: str) -> str | None:
    return os.environ.get(name, "").strip() or None


@cache
def _storage() -> StorageProvider:
    """The provider the environment configures, made on first use so imports read nothing."""
    get_settings()  # Locally, .env.local fills in what the environment doesn't set.
    # clubedge:if infra=local
    # In development without an object storage service, a local folder stands in for S3.
    directory = _env("STORAGE_DIRECTORY")
    if directory:
        return FileSystemStorage(directory)
    # clubedge:end
    return S3Storage(
        bucket=_env("STORAGE_BUCKET"),
        region=_env("STORAGE_REGION") or "auto",
        endpoint=_env("STORAGE_ENDPOINT"),
        access_key_id=_env("STORAGE_ACCESS_KEY_ID"),
        secret_access_key=_env("STORAGE_SECRET_ACCESS_KEY"),
        public_url=_env("STORAGE_PUBLIC_URL"),
    )


def get_storage(request: Request) -> StorageProvider:
    """File storage for a route. S3 credentials belong to the API, so every request shares one
    provider; Supabase Storage's variant acts as the request's user instead."""
    return _storage()
