"""The app versions the API serves, for apps installed on phones: they keep calling the API long
after a release, so they ask here whether they must update, or may."""

from collections.abc import Callable

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from clubedge_api.app_version import APP_PLATFORM_HEADER, app_platform
from clubedge_api.contract import AppVersion
from clubedge_api.http import NO_STORE

# No version set: no app is asked to update.
_UNSET: AppVersion = {
    "minimumVersion": None,
    "latestVersion": None,
    "updateUrl": None,
    "nextMinimumVersion": None,
    "nextMinimumFrom": None,
}


def app_version_router(*, app_version: Callable[[str | None], AppVersion] | None) -> APIRouter:
    """GET /api/app-version, from `app_version` for the platform the app names (every version
    None without it)."""
    router = APIRouter()

    @router.get("/api/app-version")
    async def versions(request: Request) -> JSONResponse:
        # Never cached, so a new minimum version applies on the app's next check.
        platform = app_platform(request.headers.get(APP_PLATFORM_HEADER))
        body = _UNSET if app_version is None else app_version(platform)
        return JSONResponse(body, headers=NO_STORE)

    return router
