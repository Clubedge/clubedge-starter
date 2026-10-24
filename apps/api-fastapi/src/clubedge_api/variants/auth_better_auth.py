"""Validate a Better Auth session, from its cookie or bearer token, against the auth service."""

import asyncio
import hashlib
import hmac
import os
import unicodedata

import httpx
from fastapi import Request

from clubedge_api.contract import User
from clubedge_api.db import connect
from clubedge_api.routes.account import AccountDeletionResult, ProviderAccountDeletion


async def get_current_user(
    request: Request,
    supabase_url: str | None = None,
    supabase_publishable_key: str | None = None,
) -> User | None:
    auth_url = os.environ.get("BETTER_AUTH_URL")
    # The session's cookie, or its token as a bearer token from a client without the cookie, such
    # as a mobile app, which Better Auth's bearer plugin takes.
    credentials = ("cookie", "authorization")
    headers = {name: request.headers[name] for name in credentials if request.headers.get(name)}
    if not auth_url or not headers:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            response = await client.get(
                f"{auth_url.rstrip('/')}/api/auth/get-session",
                headers=headers,
            )
        if response.status_code != 200:
            return None
        payload = response.json()
        if not isinstance(payload, dict):
            return None
        user = payload.get("user")
        if not isinstance(user, dict):
            return None
        user_id, email = user.get("id"), user.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            return None
        name = user.get("name")
        return {
            "id": user_id,
            "email": email,
            "displayName": name if isinstance(name, str) else None,
        }
    except (httpx.HTTPError, ValueError):
        return None


# Better Auth runs in the frontend's server, but its tables are in this API's database, so the
# API deletes accounts there, as an admin API would. The frontend's Better Auth server leaves
# its own delete-user endpoint off, so every deletion also removes the app's data.

# Better Auth's password hashes (better-auth/crypto's hashPassword): scrypt with these settings.
SCRYPT_N = 16_384
SCRYPT_R = 16
SCRYPT_P = 1
SCRYPT_KEY_LENGTH = 64
# Better Auth's memory limit, twice what these settings need: OpenSSL's default, 32 MiB, is just
# short of it.
SCRYPT_MAX_MEMORY = 128 * SCRYPT_N * SCRYPT_R * 2


async def verify_password(password_hash: str, password: str) -> bool:
    """Whether `password` matches a hash Better Auth made of it: "<salt>:<key>", where the key
    is the hex scrypt key of the NFKC-normalized password, salted with the salt's hex text."""
    salt, _, rest = password_hash.partition(":")
    key = rest.split(":")[0]
    if not salt or not key:
        raise ValueError("Invalid password hash")
    derived = await asyncio.to_thread(
        hashlib.scrypt,
        unicodedata.normalize("NFKC", password).encode(),
        salt=salt.encode(),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        maxmem=SCRYPT_MAX_MEMORY,
        dklen=SCRYPT_KEY_LENGTH,
    )
    return hmac.compare_digest(derived.hex().encode(), key.encode())


def can_delete_account() -> bool:
    """Deleting needs only the shared database, which the API always has."""
    return True


async def delete_account(deletion: ProviderAccountDeletion) -> AccountDeletionResult:
    user_id = deletion.user["id"]
    async with connect() as db:
        cursor = await db.execute(
            "select password from auth_account"
            " where user_id = %s and provider_id = 'credential' limit 1",
            (user_id,),
        )
        credential = await cursor.fetchone()
    stored = credential[0] if credential is not None else None
    if not isinstance(stored, str) or not stored:
        return "invalid-password"
    if not await verify_password(stored, deletion.password):
        return "invalid-password"
    await deletion.before_delete()
    # Its sessions and accounts go with it (on delete cascade), which signs it out everywhere.
    async with connect() as db:
        await db.execute("delete from auth_user where id = %s", (user_id,))
    return "deleted"
