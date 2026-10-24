"""File storage in a local folder: objects as files, and keys kept inside the folder."""

import asyncio
import os
from pathlib import Path

import pytest

from clubedge_api.storage_local import FileSystemStorage


def test_stores_objects_as_files_in_a_folder_it_creates(tmp_path: Path) -> None:
    folder = FileSystemStorage(tmp_path / "storage")

    async def round_trip() -> tuple[bytes, bool, bool]:
        result = await folder.upload("avatars/ada.png", b"image", "image/png")
        assert (result.key, result.url) == ("avatars/ada.png", None)
        data = await folder.download("avatars/ada.png")
        existed = await folder.exists("avatars/ada.png")
        await folder.delete("avatars/ada.png")
        await folder.delete("avatars/ada.png")
        return data, existed, await folder.exists("avatars/ada.png")

    assert asyncio.run(round_trip()) == (b"image", True, False)
    assert (tmp_path / "storage" / "avatars").is_dir()


def test_answers_for_a_folder_that_does_not_exist_yet(tmp_path: Path) -> None:
    folder = FileSystemStorage(tmp_path / "missing")
    assert not asyncio.run(folder.exists("a.txt"))
    asyncio.run(folder.delete("a.txt"))
    with pytest.raises(FileNotFoundError, match="Object not found: a.txt"):
        asyncio.run(folder.download("a.txt"))
    assert not (tmp_path / "missing").exists()


def test_refuses_keys_that_leave_the_folder(tmp_path: Path) -> None:
    folder = FileSystemStorage(tmp_path / "storage")
    for key in ["", ".", "../outside.txt", "a/../../outside.txt", str(tmp_path / "outside.txt")]:
        with pytest.raises(ValueError, match="Invalid storage key"):
            asyncio.run(folder.upload(key, b"x", "text/plain"))
        with pytest.raises(ValueError, match="Invalid storage key"):
            asyncio.run(folder.exists(key))
    assert not (tmp_path / "outside.txt").exists()


def test_refuses_symbolic_links_out_of_the_folder(tmp_path: Path) -> None:
    root = tmp_path / "storage"
    outside = tmp_path / "outside"
    root.mkdir()
    outside.mkdir()
    (outside / "secret.txt").write_bytes(b"secret")
    try:
        os.symlink(outside, root / "linked", target_is_directory=True)
        os.symlink(outside / "secret.txt", root / "secret.txt")
    except OSError:
        pytest.skip("this system does not let tests create symbolic links")
    folder = FileSystemStorage(root)
    with pytest.raises(ValueError, match="Invalid storage key"):
        asyncio.run(folder.upload("linked/new.txt", b"x", "text/plain"))
    with pytest.raises(ValueError, match="Invalid storage key"):
        asyncio.run(folder.download("linked/secret.txt"))
    with pytest.raises(ValueError, match="Invalid storage key"):
        asyncio.run(folder.download("secret.txt"))
    assert not (outside / "new.txt").exists()


def test_leaves_nothing_behind_when_an_upload_fails(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fail(self: Path, target: Path) -> Path:
        raise OSError("disk full")

    monkeypatch.setattr(Path, "replace", fail)
    with pytest.raises(OSError, match="disk full"):
        asyncio.run(FileSystemStorage(tmp_path).upload("a/b.txt", b"x", "text/plain"))
    assert list((tmp_path / "a").iterdir()) == []


def test_cannot_sign_urls(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="serve the files through your app"):
        asyncio.run(FileSystemStorage(tmp_path).get_signed_url("a.txt"))
