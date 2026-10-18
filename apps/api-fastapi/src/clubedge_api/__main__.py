"""Runs the API: `python -m clubedge_api`, with `--reload` in development."""

import sys

import uvicorn

from clubedge_api.settings import get_settings

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "clubedge_api.main:app",
        host=settings.host,
        port=settings.port,
        reload="--reload" in sys.argv,
    )
