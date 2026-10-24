"""S3-compatible file storage: AWS S3, Cloudflare R2, MinIO, s3mock, and similar services.

boto3 is synchronous, so each call runs in a worker thread and never blocks the event loop.
"""

import asyncio
import threading
from typing import Any, Protocol, cast

import boto3  # type: ignore[import-untyped, unused-ignore]
from botocore.config import Config  # type: ignore[import-untyped, unused-ignore]

from clubedge_api.storage_provider import UploadResult


class S3Client(Protocol):
    """The calls S3Storage makes on a boto3 S3 client, so tests can pass a stand-in."""

    def put_object(self, **kwargs: Any) -> Any: ...

    def get_object(self, **kwargs: Any) -> Any: ...

    def head_object(self, **kwargs: Any) -> Any: ...

    def delete_object(self, **kwargs: Any) -> Any: ...

    def generate_presigned_url(self, client_method: str, /, **kwargs: Any) -> Any: ...


def _is_not_found(error: Exception) -> bool:
    """Whether boto3 raised for a missing object (HEAD answers a bare 404)."""
    response = getattr(error, "response", None)
    code = response.get("Error", {}).get("Code") if isinstance(response, dict) else None
    return code in ("404", "NoSuchKey", "NotFound")


class S3Storage:
    """Works with AWS S3 and S3-compatible services such as Cloudflare R2, MinIO, and s3mock."""

    def __init__(
        self,
        *,
        bucket: str | None,
        region: str = "auto",
        endpoint: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        public_url: str | None = None,
        force_path_style: bool | None = None,
        client: S3Client | None = None,
    ) -> None:
        """`bucket` is optional so the API starts without storage; calls fail until it is set.
        `public_url` is the public base URL of uploaded objects, such as a CDN or an R2 public
        bucket. `force_path_style` addresses buckets as https://endpoint/bucket rather than
        https://bucket.endpoint; it defaults to true with a custom endpoint, which local servers
        (s3mock), MinIO, and R2 all accept."""
        self._bucket_name = bucket
        self._region = region
        self._endpoint = endpoint
        # Without both keys, boto3 finds credentials itself, as on AWS with an IAM role.
        has_keys = bool(access_key_id and secret_access_key)
        self._access_key_id = access_key_id if has_keys else None
        self._secret_access_key = secret_access_key if has_keys else None
        self._public_url = public_url
        self._path_style = bool(endpoint) if force_path_style is None else force_path_style
        self._client_instance = client
        self._lock = threading.Lock()

    def _client(self) -> S3Client:
        # Made on first use, in a worker thread: boto3 reads its configuration from disk.
        with self._lock:
            if self._client_instance is None:
                config = Config(
                    signature_version="s3v4",
                    s3={"addressing_style": "path" if self._path_style else "auto"},
                    # Checksums only where S3 requires them, which every S3-compatible service
                    # accepts.
                    request_checksum_calculation="when_required",
                    response_checksum_validation="when_required",
                )
                self._client_instance = cast(
                    S3Client,
                    boto3.Session().client(
                        "s3",
                        region_name=self._region,
                        endpoint_url=self._endpoint,
                        aws_access_key_id=self._access_key_id,
                        aws_secret_access_key=self._secret_access_key,
                        config=config,
                    ),
                )
            return self._client_instance

    def _bucket(self) -> str:
        if not self._bucket_name:
            raise RuntimeError("STORAGE_BUCKET must be configured for S3 storage.")
        return self._bucket_name

    async def upload(self, key: str, body: bytes, content_type: str) -> UploadResult:
        def put() -> None:
            self._client().put_object(
                Bucket=self._bucket(), Key=key, Body=body, ContentType=content_type
            )

        await asyncio.to_thread(put)
        url = f"{self._public_url.rstrip('/')}/{key}" if self._public_url else None
        return UploadResult(key, url)

    async def download(self, key: str) -> bytes:
        def get() -> bytes:
            response = self._client().get_object(Bucket=self._bucket(), Key=key)
            body: bytes = response["Body"].read()
            return body

        return await asyncio.to_thread(get)

    async def delete(self, key: str) -> None:
        def delete() -> None:
            self._client().delete_object(Bucket=self._bucket(), Key=key)

        await asyncio.to_thread(delete)

    async def exists(self, key: str) -> bool:
        def head() -> bool:
            try:
                self._client().head_object(Bucket=self._bucket(), Key=key)
            except Exception as error:
                if _is_not_found(error):
                    return False
                raise
            return True

        return await asyncio.to_thread(head)

    async def get_signed_url(self, key: str, expires_in_seconds: int = 300) -> str:
        def sign() -> str:
            url: str = self._client().generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket(), "Key": key},
                ExpiresIn=expires_in_seconds,
            )
            return url

        return await asyncio.to_thread(sign)
