"""Supabase Storage through its REST API (https://supabase.com/docs/reference/api), without an
SDK, acting as the user whose access token a request carries."""

from typing import Any
from urllib.parse import quote

import httpx

from clubedge_api.storage_provider import UploadResult

# The characters JavaScript's encodeURI leaves as they are, besides letters, digits, and "-_.~".
_URI_SAFE = ";,/?:@&=+$!*'()#"


class StorageError(Exception):
    """Supabase Storage refused a request, such as a bucket policy refusing the user."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.status = status


class SupabaseStorage:
    def __init__(
        self,
        *,
        url: str | None,
        publishable_key: str | None,
        bucket: str | None,
        token: str | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        """Requests carry `token`, the user's Supabase access token, so Storage's row-level
        security policies apply to that user; without one they are anonymous. The settings are
        optional so the API starts without storage; calls fail until they are set. `transport`
        is for tests."""
        self._url = url
        self._publishable_key = publishable_key
        self._bucket_name = bucket
        self._token = token
        self._transport = transport

    def _base_url(self) -> str:
        if not self._url or not self._publishable_key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be configured.")
        return f"{self._url.rstrip('/')}/storage/v1"

    def _bucket(self) -> str:
        if not self._bucket_name:
            raise RuntimeError("SUPABASE_STORAGE_BUCKET must be configured.")
        return quote(self._bucket_name, safe="")

    def _object(self, key: str) -> str:
        return f"{self._bucket()}/{quote(key.lstrip('/'), safe='/')}"

    async def _request(self, action: str, method: str, path: str, **options: Any) -> httpx.Response:
        base_url = self._base_url()
        key = self._publishable_key or ""
        headers = {"apikey": key, "Authorization": f"Bearer {self._token or key}"}
        async with httpx.AsyncClient(
            base_url=base_url, headers=headers, transport=self._transport, timeout=30
        ) as client:
            response = await client.request(method, path, **options)
        if response.is_error:
            raise StorageError(
                f"Supabase Storage could not {action} ({response.status_code}): "
                f"{response.text[:300]}",
                response.status_code,
            )
        return response

    async def upload(self, key: str, body: bytes, content_type: str) -> UploadResult:
        await self._request(
            "upload the object",
            "POST",
            f"/object/{self._object(key)}",
            content=body,
            headers={
                "Content-Type": content_type,
                "Cache-Control": "max-age=3600",
                "x-upsert": "false",
            },
        )
        return UploadResult(key)

    async def download(self, key: str) -> bytes:
        response = await self._request("download the object", "GET", f"/object/{self._object(key)}")
        return response.content

    async def delete(self, key: str) -> None:
        await self._request(
            "delete the object", "DELETE", f"/object/{self._bucket()}", json={"prefixes": [key]}
        )

    async def exists(self, key: str) -> bool:
        folder, _, name = key.rpartition("/")
        response = await self._request(
            "list the objects",
            "POST",
            f"/object/list/{self._bucket()}",
            json={
                "prefix": folder,
                "search": name,
                "limit": 100,
                "offset": 0,
                "sortBy": {"column": "name", "order": "asc"},
            },
        )
        files = response.json()
        return isinstance(files, list) and any(
            isinstance(file, dict) and file.get("name") == name for file in files
        )

    async def get_signed_url(self, key: str, expires_in_seconds: int = 300) -> str:
        response = await self._request(
            "sign a URL",
            "POST",
            f"/object/sign/{self._object(key)}",
            json={"expiresIn": expires_in_seconds},
        )
        data = response.json()
        signed = data.get("signedURL") if isinstance(data, dict) else None
        if not isinstance(signed, str):
            raise StorageError("Supabase Storage answered without a signed URL.", 502)
        # As supabase-js does: the object's path comes back unencoded.
        return quote(f"{self._base_url()}{signed}", safe=_URI_SAFE)
