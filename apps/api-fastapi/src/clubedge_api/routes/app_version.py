"""The app versions the API serves, for apps installed on phones: they keep calling the API long
after a release, so they ask here whether they must update, or may."""

from collections.abc import Callable

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from clubedge_api.contract import AppVersion
from clubedge_api.http import NO_STORE

# No version set: no app is asked to update.
_UNSET: AppVersion = {"minimumVersion": None, "latestVersion": None, "updateUrl": None}


def app_version_router(*, app_version: Callable[[], AppVersion] | None) -> APIRouter:
    """GET /api/app-version, from `app_version` (every version None without it)."""
    router = APIRouter()

    @router.get("/api/app-version")
    async def versions() -> JSONResponse:
        # Never cached, so a new minimum version applies on the app's next check.
        body = _UNSET if app_version is None else app_version()
        return JSONResponse(body, headers=NO_STORE)

    return router
