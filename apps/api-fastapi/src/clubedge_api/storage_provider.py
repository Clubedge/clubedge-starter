"""What every file storage provider offers the API's routes, as packages/storage does for the
TypeScript apps. Routes depend on StorageProvider, never on a provider's SDK."""

from dataclasses import dataclass
from typing import Protocol


@dataclass(frozen=True)
class UploadResult:
    key: str
    # The object's public address, when the storage serves objects publicly (STORAGE_PUBLIC_URL).
    url: str | None = None


@dataclass(frozen=True)
class ByteRange:
    """Part of an object: bytes `start` to `end`, both included, as an HTTP Range names them."""

    start: int
    # The last byte; the object's last when None.
    end: int | None = None

    def header(self) -> str:
        """The range as a Range header's value, such as "bytes=0-499" or "bytes=500-"."""
        return f"bytes={self.start}-{'' if self.end is None else self.end}"


class StorageProvider(Protocol):
    """Objects by key, such as "avatars/user-1.png". Keys and bodies are not checked: the route
    checks the user, the file's size and type, and the key before calling it."""

    async def upload(self, key: str, body: bytes, content_type: str) -> UploadResult: ...

    async def download(self, key: str, byte_range: ByteRange | None = None) -> bytes:
        """The object's bytes, or only those of `byte_range`, as a browser asks for a video's."""
        ...

    async def delete(self, key: str) -> None: ...

    async def exists(self, key: str) -> bool: ...

    async def get_signed_url(self, key: str, expires_in_seconds: int = 300) -> str:
        """A temporary URL anyone can download the object from, until it expires."""
        ...
