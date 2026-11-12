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
    # No conflict target: every unique index, the email's too, settles a race.
    assert insert.endswith(" on conflict do nothing returning id")
    assert params == ("user-1", "ada@example.com")


def test_reads_the_row_another_first_request_created(monkeypatch: pytest.MonkeyPatch) -> None:
    # Two first requests at once: the insert does nothing, and the other request's row is read.
    db = database(monkeypatch, None, None, ("row-3",))
    assert asyncio.run(users.ensure_user_id(USER)) == "row-3"
    assert [statement for statement, _ in db.statements] == [
        users.FIND_USER,
        db.statements[1][0],
        users.FIND_USER,
    ]


def test_says_so_when_another_users_row_has_the_email(monkeypatch: pytest.MonkeyPatch) -> None:
    database(monkeypatch, None, None, None)
    with pytest.raises(RuntimeError, match="Another users row has this user's email address"):
        asyncio.run(users.ensure_user_id(USER))


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
