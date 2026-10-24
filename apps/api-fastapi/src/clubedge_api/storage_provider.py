"""What every file storage provider offers the API's routes, as packages/storage does for the
TypeScript apps. Routes depend on StorageProvider, never on a provider's SDK."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class UploadResult:
    key: str
    # The object's public address, when the storage serves objects publicly (STORAGE_PUBLIC_URL).
    url: str | None = None


class StorageProvider(Protocol):
    """Objects by key, such as "avatars/user-1.png". Keys and bodies are not checked: the route
    checks the user, the file's size and type, and the key before calling it."""

    async def upload(self, key: str, body: bytes, content_type: str) -> UploadResult: ...

    async def download(self, key: str) -> bytes: ...

    async def delete(self, key: str) -> None: ...

    async def exists(self, key: str) -> bool: ...

    async def get_signed_url(self, key: str, expires_in_seconds: int = 300) -> str:
        """A temporary URL anyone can download the object from, until it expires."""
        ...
