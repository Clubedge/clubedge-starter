"""Supabase Storage through its REST API, answered by a stand-in for Supabase."""

import asyncio
import json

import httpx
import pytest

from clubedge_api.storage_supabase import StorageError, SupabaseStorage

SUPABASE_URL = "https://project.supabase.co"


class FakeSupabase:
    """Records each request and answers each with a copy of `response`."""

    def __init__(self, response: httpx.Response | None = None) -> None:
        self.requests: list[httpx.Request] = []
        self.response = response or httpx.Response(200, json={})

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        answer = self.response
        return httpx.Response(answer.status_code, headers=answer.headers, content=answer.content)

    def storage(self, token: str | None = "user-token", bucket: str = "app") -> SupabaseStorage:
        return SupabaseStorage(
            url=SUPABASE_URL,
            publishable_key="sb_publishable_key",
            bucket=bucket,
            token=token,
            transport=httpx.MockTransport(self),
        )


def test_uploads_as_the_requests_user() -> None:
    supabase = FakeSupabase(httpx.Response(200, json={"Key": "app/avatars/a b.png"}))
    result = asyncio.run(supabase.storage().upload("avatars/a b.png", b"image", "image/png"))
    assert (result.key, result.url) == ("avatars/a b.png", None)
    (request,) = supabase.requests
    assert request.method == "POST"
    assert str(request.url) == f"{SUPABASE_URL}/storage/v1/object/app/avatars/a%20b.png"
    assert request.headers["apikey"] == "sb_publishable_key"
    assert request.headers["authorization"] == "Bearer user-token"
    assert request.headers["content-type"] == "image/png"
    assert request.headers["x-upsert"] == "false"
    assert request.content == b"image"


def test_acts_as_anonymous_without_a_token() -> None:
    supabase = FakeSupabase(httpx.Response(200, content=b"image"))
    assert asyncio.run(supabase.storage(token=None).download("a.png")) == b"image"
    (request,) = supabase.requests
    assert request.method == "GET"
    assert str(request.url) == f"{SUPABASE_URL}/storage/v1/object/app/a.png"
    assert request.headers["authorization"] == "Bearer sb_publishable_key"


def test_deletes_and_finds_objects() -> None:
    supabase = FakeSupabase(httpx.Response(200, json=[{"name": "a.png"}, {"name": "b.png"}]))
    asyncio.run(supabase.storage().delete("avatars/a.png"))
    assert asyncio.run(supabase.storage().exists("avatars/a.png"))
    assert not asyncio.run(supabase.storage().exists("avatars/c.png"))
    delete, listing, _ = supabase.requests
    assert (delete.method, str(delete.url)) == ("DELETE", f"{SUPABASE_URL}/storage/v1/object/app")
    assert json.loads(delete.content) == {"prefixes": ["avatars/a.png"]}
    assert str(listing.url) == f"{SUPABASE_URL}/storage/v1/object/list/app"
    body = json.loads(listing.content)
    assert (body["prefix"], body["search"]) == ("avatars", "a.png")


def test_signs_urls_that_expire() -> None:
    signed = "/object/sign/app/a b.png?token=abc"
    supabase = FakeSupabase(httpx.Response(200, json={"signedURL": signed}))
    url = asyncio.run(supabase.storage().get_signed_url("a b.png", 60))
    assert url == f"{SUPABASE_URL}/storage/v1/object/sign/app/a%20b.png?token=abc"
    (request,) = supabase.requests
    assert str(request.url) == f"{SUPABASE_URL}/storage/v1/object/sign/app/a%20b.png"
    assert json.loads(request.content) == {"expiresIn": 60}


def test_reports_what_supabase_refused() -> None:
    refused = httpx.Response(403, json={"message": "new row violates row-level security policy"})
    with pytest.raises(StorageError, match=r"could not upload the object \(403\)") as error:
        asyncio.run(FakeSupabase(refused).storage().upload("a.png", b"", "image/png"))
    assert error.value.status == 403
    assert "row-level security" in str(error.value)


def test_fails_each_call_until_it_is_configured() -> None:
    with pytest.raises(RuntimeError, match="SUPABASE_STORAGE_BUCKET must be configured"):
        asyncio.run(FakeSupabase().storage(bucket="").exists("a.png"))
    unconfigured = SupabaseStorage(url=None, publishable_key=None, bucket="app")
    with pytest.raises(RuntimeError, match="SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY"):
        asyncio.run(unconfigured.download("a.png"))
