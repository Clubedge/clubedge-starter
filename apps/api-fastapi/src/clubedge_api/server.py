"""The composition root: the only place that reads the environment and picks providers."""

import json
from pathlib import Path
from typing import Any

from fastapi import Request

from clubedge_api import auth
from clubedge_api.account import AccountSettings  # clubedge:only auth!=none
from clubedge_api.app import ApiDependencies
from clubedge_api.app_version import app_version
from clubedge_api.background_jobs import background_jobs  # clubedge:only jobs!=none
from clubedge_api.cache import create_rate_limiter
from clubedge_api.contract import User
from clubedge_api.db import is_database_ready
from clubedge_api.payments_stripe import stripe_billing  # clubedge:only payments=stripe
from clubedge_api.push_service import push_notifications  # clubedge:only push!=none
from clubedge_api.settings import get_settings

# create-clubedge-app names the project here, like the frontend's site config.
SITE_CONFIG = Path(__file__).resolve().parents[1] / "config" / "site.json"


def site_config() -> dict[str, Any]:
    config: dict[str, Any] = json.loads(SITE_CONFIG.read_text(encoding="utf-8"))
    return config


def dependencies() -> ApiDependencies:
    settings = get_settings()
    # clubedge:if observability!=none
    from clubedge_api.observability import browser_error_reporting, start_observability

    # Before the first request, so the provider traces and reports from the start.
    observability = start_observability(str(site_config()["serviceId"]))
    # clubedge:end

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
        create_rate_limiter=create_rate_limiter,
        app_version=app_version,
        client_ip_settings=settings.client_ip_settings,
        account=AccountSettings(),  # clubedge:only auth!=none
        # clubedge:if observability!=none
        browser_error_reporting=browser_error_reporting,
        observability=observability,
        # clubedge:end
        jobs=background_jobs,  # clubedge:only jobs!=none
        # clubedge:if payments=stripe
        payments=stripe_billing(settings.database_url, settings.frontend_origin),
        # clubedge:end
        # clubedge:if push!=none
        push=push_notifications(),
        site_name=str(site_config()["name"]),
        # clubedge:end
    )
