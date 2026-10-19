"""The composition root: the only place that reads the environment and picks providers."""

import json
from pathlib import Path
from typing import Any

from fastapi import Request

from clubedge_api import auth
from clubedge_api.app import ApiDependencies, User
from clubedge_api.db import is_database_ready
from clubedge_api.settings import get_settings

# create-clubedge-app names the project here, like the frontend's site config.
SITE_CONFIG = Path(__file__).resolve().parents[1] / "config" / "site.json"


def site_config() -> dict[str, Any]:
    config: dict[str, Any] = json.loads(SITE_CONFIG.read_text(encoding="utf-8"))
    return config


def dependencies() -> ApiDependencies:
    settings = get_settings()

    async def is_ready() -> bool:
        return await is_database_ready(settings.database_url)

    async def get_current_user(request: Request) -> User | None:
        return await auth.get_current_user(
            request,
            settings.supabase_url,
            settings.supabase_publishable_key,
        )

    return ApiDependencies(
        service_id=str(site_config()["serviceId"]),
        is_ready=is_ready,
        get_current_user=get_current_user,
        frontend_origin=settings.frontend_origin,
    )
