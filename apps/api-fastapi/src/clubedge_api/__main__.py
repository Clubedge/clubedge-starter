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
        # Uvicorn would otherwise put an X-Forwarded-For entry of its choosing in request.client;
        # rate limits read that header themselves, as TRUSTED_PROXY_HOPS says (rate_limit.py).
        proxy_headers=False,
    )
