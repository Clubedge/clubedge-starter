"""S3-compatible storage through a stand-in for boto3's client, the provider the API picks, and
its `pnpm check:services` round trip."""

import asyncio
from collections.abc import Iterator
from typing import Any

import pytest
from fastapi import Request

from clubedge_api import storage
from clubedge_api.check_services import service_checks
from clubedge_api.settings import get_settings
from clubedge_api.storage_s3 import S3Storage

STORAGE_VARIABLES = [
    "STORAGE_BUCKET",
    "STORAGE_REGION",
    "STORAGE_ENDPOINT",
    "STORAGE_ACCESS_KEY_ID",
    "STORAGE_SECRET_ACCESS_KEY",
    "STORAGE_PUBLIC_URL",
    "STORAGE_DIRECTORY",
]


class ClientError(Exception):
    """What boto3 raises for an error answer, with the code S3 sent."""

    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.response = {"Error": {"Code": code}}


class Body:
    def __init__(self, data: bytes) -> None:
        self.data = data

    def read(self) -> bytes:
        return self.data


class FakeS3:
    """Buckets in memory, answering the calls S3Storage makes as boto3's client does."""

    def __init__(self) -> None:
        self.objects: dict[tuple[str, str], bytes] = {}
        self.uploads: list[dict[str, Any]] = []
        self.head_error: str | None = None

    def put_object(self, **kwargs: Any) -> Any:
        self.uploads.append(kwargs)
        self.objects[(kwargs["Bucket"], kwargs["Key"])] = kwargs["Body"]
        return {}

    def get_object(self, **kwargs: Any) -> Any:
        data = self.objects.get((kwargs["Bucket"], kwargs["Key"]))
        if data is None:
            raise ClientError("NoSuchKey")
        return {"Body": Body(data)}

    def head_object(self, **kwargs: Any) -> Any:
        if self.head_error:
            raise ClientError(self.head_error)
        if (kwargs["Bucket"], kwargs["Key"]) not in self.objects:
            raise ClientError("404")
        return {}

    def delete_object(self, **kwargs: Any) -> Any:
        self.objects.pop((kwargs["Bucket"], kwargs["Key"]), None)
        return {}

    def generate_presigned_url(self, client_method: str, /, **kwargs: Any) -> Any:
        params = kwargs["Params"]
        return f"https://s3.test/{params['Bucket']}/{params['Key']}?expires={kwargs['ExpiresIn']}"


@pytest.fixture(autouse=True)
def storage_environment(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    """No storage variables, whatever .env.local sets, and a provider made afresh."""
    get_settings()
    for name in STORAGE_VARIABLES:
        monkeypatch.delenv(name, raising=False)
    storage._storage.cache_clear()
    yield
    storage._storage.cache_clear()


def request() -> Request:
    return Request({"type": "http", "headers": []})


def test_uploads_reads_checks_and_deletes_objects() -> None:
    client = FakeS3()
    s3 = S3Storage(bucket="app", client=client)

    async def round_trip() -> tuple[str | None, bytes, bool, bool]:
        result = await s3.upload("avatars/ada.png", b"image", "image/png")
        data = await s3.download("avatars/ada.png")
        existed = await s3.exists("avatars/ada.png")
        await s3.delete("avatars/ada.png")
        return result.url, data, existed, await s3.exists("avatars/ada.png")

    assert asyncio.run(round_trip()) == (None, b"image", True, False)
    expected = {"Bucket": "app", "Key": "avatars/ada.png", "ContentType": "image/png"}
    assert client.uploads == [{**expected, "Body": b"image"}]


def test_gives_the_public_url_and_signs_urls_that_expire() -> None:
    s3 = S3Storage(bucket="app", public_url="https://cdn.example.com/", client=FakeS3())
    result = asyncio.run(s3.upload("a/b.txt", b"ok", "text/plain"))
    assert (result.key, result.url) == ("a/b.txt", "https://cdn.example.com/a/b.txt")
    assert asyncio.run(s3.get_signed_url("a/b.txt")) == "https://s3.test/app/a/b.txt?expires=300"
    assert asyncio.run(s3.get_signed_url("a/b.txt", 60)).endswith("?expires=60")


def test_reports_errors_other_than_a_missing_object() -> None:
    client = FakeS3()
    client.head_error = "AccessDenied"
    with pytest.raises(ClientError, match="AccessDenied"):
        asyncio.run(S3Storage(bucket="app", client=client).exists("a.txt"))


def test_fails_each_call_until_a_bucket_is_configured() -> None:
    s3 = S3Storage(bucket=None, client=FakeS3())
    with pytest.raises(RuntimeError, match="STORAGE_BUCKET must be configured"):
        asyncio.run(s3.upload("a.txt", b"", "text/plain"))


def test_signs_urls_with_boto3_on_a_custom_endpoint_without_a_request() -> None:
    s3 = S3Storage(
        bucket="app",
        region="us-east-1",
        endpoint="http://localhost:9090",
        access_key_id="local",
        secret_access_key="local-secret",
    )
    url = asyncio.run(s3.get_signed_url("folder/a b.txt", 60))
    # Path-style addressing, which local servers, MinIO, and R2 accept.
    assert url.startswith("http://localhost:9090/app/folder/a%20b.txt?")
    assert "X-Amz-Expires=60" in url


def test_every_request_shares_the_s3_provider_the_environment_configures(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("STORAGE_BUCKET", "app")
    monkeypatch.setenv("STORAGE_PUBLIC_URL", "https://cdn.example.com")
    provider = storage.get_storage(request())
    assert isinstance(provider, S3Storage)
    assert storage.get_storage(request()) is provider
    monkeypatch.setattr(S3Storage, "_client", lambda self: FakeS3())
    result = asyncio.run(provider.upload("a.txt", b"", "text/plain"))
    assert result.url == "https://cdn.example.com/a.txt"


# clubedge:if infra=local
def test_a_local_folder_stands_in_for_s3_while_storage_directory_is_set(
    monkeypatch: pytest.MonkeyPatch, tmp_path_factory: pytest.TempPathFactory
) -> None:
    from clubedge_api.storage_local import FileSystemStorage

    directory = tmp_path_factory.mktemp("storage")
    monkeypatch.setenv("STORAGE_BUCKET", "app")
    monkeypatch.setenv("STORAGE_DIRECTORY", str(directory))
    provider = storage.get_storage(request())
    assert isinstance(provider, FileSystemStorage)
    asyncio.run(provider.upload("a/b.txt", b"ok", "text/plain"))
    assert (directory / "a" / "b.txt").read_bytes() == b"ok"


def test_checks_the_local_folder_with_a_round_trip(
    tmp_path_factory: pytest.TempPathFactory,
) -> None:
    unset = {c.name: c for c in service_checks({})}
    assert unset["Local folder storage"].skip == "STORAGE_DIRECTORY is not set"
    directory = tmp_path_factory.mktemp("storage")
    check = {c.name: c for c in service_checks({"STORAGE_DIRECTORY": str(directory)})}
    result = asyncio.run(check["Local folder storage"].run())
    assert result == f"wrote, read back, and deleted a file in {directory}"
    assert list((directory / "check-services").iterdir()) == []


# clubedge:end
def test_checks_file_storage_with_a_round_trip_once_a_bucket_is_set(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    unset = {c.name: c for c in service_checks({})}
    assert unset["File storage"].skip == "STORAGE_BUCKET is not set"
    check = {c.name: c for c in service_checks({"STORAGE_BUCKET": "app"})}["File storage"]
    assert check.skip is None
    client = FakeS3()
    monkeypatch.setattr(S3Storage, "_client", lambda self: client)
    assert asyncio.run(check.run()) == 'uploaded, read back, and deleted an object in "app"'
    assert client.objects == {}
    assert client.uploads[0]["Body"] == b"ok"
