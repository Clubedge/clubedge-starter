"""File storage in a local folder, for development without an object storage service."""

import asyncio
import os
import uuid
from pathlib import Path

from clubedge_api.storage_provider import UploadResult


def _is_inside(root: Path, path: Path) -> bool:
    return path != root and path.is_relative_to(root)


class FileSystemStorage:
    """Stores objects as files in a local folder, created on the first upload. Keys map to paths
    inside the folder. Keys that would leave it are refused, including through symbolic links
    inside the folder."""

    def __init__(self, directory: str | os.PathLike[str]) -> None:
        self._root = Path(os.path.abspath(directory))

    def _lexical_path(self, key: str) -> Path:
        path = Path(os.path.normpath(os.path.join(self._root, key)))
        if not key or not _is_inside(self._root, path):
            raise ValueError(f"Invalid storage key: {key}")
        return path

    def _assert_no_link_escape(self, path: Path) -> None:
        """Raises unless the deepest existing folder on the way to `path` is inside the root, and
        `path` itself is not a symbolic link. FileNotFoundError: the root does not exist."""
        real_root = self._root.resolve(strict=True)
        folder = path.parent
        while True:
            try:
                real_folder = folder.resolve(strict=True)
            except FileNotFoundError:
                folder = folder.parent
                continue
            if real_folder != real_root and not _is_inside(real_root, real_folder):
                raise ValueError(f"Invalid storage key: {path.relative_to(self._root)}")
            break
        if path.is_symlink():
            raise ValueError(f"Invalid storage key: {path.relative_to(self._root)}")

    def _existing_path(self, key: str) -> Path | None:
        """The file for `key`, checked against the root; None when the root does not exist."""
        path = self._lexical_path(key)
        try:
            self._assert_no_link_escape(path)
        except FileNotFoundError:
            return None
        return path

    def _write(self, key: str, body: bytes) -> None:
        path = self._lexical_path(key)
        self._root.mkdir(parents=True, exist_ok=True)
        self._assert_no_link_escape(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        self._assert_no_link_escape(path)
        # Write a temporary file, then rename it, so a failed upload leaves nothing behind.
        partial = path.with_name(f"{path.name}.{uuid.uuid4().hex}.partial")
        try:
            with partial.open("xb") as file:
                file.write(body)
            partial.replace(path)
        except BaseException:
            partial.unlink(missing_ok=True)
            raise

    def _read(self, key: str) -> bytes:
        path = self._existing_path(key)
        if path is None or not path.is_file():
            raise FileNotFoundError(f"Object not found: {key}")
        return path.read_bytes()

    def _delete(self, key: str) -> None:
        path = self._existing_path(key)
        if path is not None:
            path.unlink(missing_ok=True)

    def _exists(self, key: str) -> bool:
        path = self._existing_path(key)
        return path is not None and path.is_file()

    async def upload(self, key: str, body: bytes, content_type: str) -> UploadResult:
        await asyncio.to_thread(self._write, key, body)
        return UploadResult(key)

    async def download(self, key: str) -> bytes:
        return await asyncio.to_thread(self._read, key)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._delete, key)

    async def exists(self, key: str) -> bool:
        return await asyncio.to_thread(self._exists, key)

    async def get_signed_url(self, key: str, expires_in_seconds: int = 300) -> str:
        raise RuntimeError(
            "Local folder storage cannot create URLs; serve the files through your app."
        )
