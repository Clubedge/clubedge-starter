"""The API's environment, read once. Locally, .env.local fills in what the shell doesn't set."""

import os
from dataclasses import dataclass
from functools import cache
from pathlib import Path


def load_env_file(path: Path) -> None:
    """Sets KEY=value lines from `path` that the environment doesn't already have."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        key, sep, value = line.strip().partition("=")
        if not sep or key.startswith("#"):
            continue
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


@dataclass(frozen=True)
class Settings:
    # The frontend proxies /api here in development; containers listen on every interface.
    host: str
    port: int
    database_url: str | None
    frontend_origin: str
    supabase_url: str | None
    supabase_publishable_key: str | None


@cache
def get_settings() -> Settings:
    load_env_file(Path(".env.local"))
    return Settings(
        host=os.environ.get("HOST") or "127.0.0.1",
        port=int(os.environ.get("PORT") or "3001"),
        database_url=os.environ.get("DATABASE_URL") or None,
        frontend_origin=os.environ.get("FRONTEND_URL") or "http://localhost:3000",
        supabase_url=os.environ.get("SUPABASE_URL") or None,
        supabase_publishable_key=os.environ.get("SUPABASE_PUBLISHABLE_KEY") or None,
    )
