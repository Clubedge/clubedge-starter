"""The app's users row, with a stand-in for the database that answers each statement in turn."""

import asyncio

import pytest

from clubedge_api import users
from tests.fakes import USER, FakeDatabase


def database(monkeypatch: pytest.MonkeyPatch, *rows: tuple[object, ...] | None) -> FakeDatabase:
    db = FakeDatabase(list(rows))
    monkeypatch.setattr(users, "connect", db.connect)
    return db


def test_finds_the_users_row_without_writing(monkeypatch: pytest.MonkeyPatch) -> None:
    db = database(monkeypatch, ("row-1",))
    assert asyncio.run(users.ensure_user_id(USER)) == "row-1"
    assert db.statements == [
        ("select id from users where auth_user_id = %s limit 1", ("user-1",)),
    ]


def test_creates_the_users_row_when_it_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    db = database(monkeypatch, None, ("row-2",))
    assert asyncio.run(users.ensure_user_id(USER)) == "row-2"
    [_, (insert, params)] = db.statements
    assert insert.startswith("insert into users (auth_user_id, email) values (%s, %s)")
    assert "on conflict (auth_user_id) do update" in insert
    assert params == ("user-1", "ada@example.com")


def test_reads_and_writes_the_display_name(monkeypatch: pytest.MonkeyPatch) -> None:
    db = database(monkeypatch, ("Ada",), None)
    assert asyncio.run(users.get_display_name("row-1")) == "Ada"
    assert asyncio.run(users.get_display_name("row-1")) is None
    asyncio.run(users.set_display_name("row-1", None))
    assert db.statements[-1] == (
        "update users set display_name = %s, updated_at = now() where id = %s",
        (None, "row-1"),
    )


def test_deletes_the_users_row_of_an_auth_user(monkeypatch: pytest.MonkeyPatch) -> None:
    db = database(monkeypatch)
    asyncio.run(users.delete_user_profile("user-1"))
    assert db.statements == [("delete from users where auth_user_id = %s", ("user-1",))]
