"""The app's own row for each user: packages/db's users table, which keeps what the app knows
about a user (its display name), while the auth provider keeps the credentials. Tables that
reference it, such as subscriptions, delete their rows with it."""

from clubedge_api.contract import User
from clubedge_api.db import connect


async def ensure_user_id(user: User) -> str:
    """The users row id for the signed-in user. Reads first, so requests that only need the id
    don't write; creates the row when it is missing."""
    async with connect() as db:
        cursor = await db.execute(
            "select id from users where auth_user_id = %s limit 1", (user["id"],)
        )
        row = await cursor.fetchone()
        if row is None:
            cursor = await db.execute(
                "insert into users (auth_user_id, email) values (%s, %s)"
                " on conflict (auth_user_id) do update"
                " set email = excluded.email, updated_at = now()"
                " returning id",
                (user["id"], user["email"]),
            )
            row = await cursor.fetchone()
    if row is None:
        raise RuntimeError("The users row was not created.")
    return str(row[0])


async def get_display_name(user_id: str) -> str | None:
    """The display name the user chose, or None."""
    async with connect() as db:
        cursor = await db.execute(
            "select display_name from users where id = %s limit 1", (user_id,)
        )
        row = await cursor.fetchone()
    return row[0] if row is not None and isinstance(row[0], str) else None


async def set_display_name(user_id: str, display_name: str | None) -> None:
    """Sets the display name, or clears it with None."""
    async with connect() as db:
        await db.execute(
            "update users set display_name = %s, updated_at = now() where id = %s",
            (display_name, user_id),
        )


async def delete_user_profile(auth_user_id: str) -> None:
    """Deletes the users row of an auth provider's user, and the rows that reference it."""
    async with connect() as db:
        await db.execute("delete from users where auth_user_id = %s", (auth_user_id,))
