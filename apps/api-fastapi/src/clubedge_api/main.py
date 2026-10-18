"""The ASGI app uvicorn serves: clubedge_api.main:app."""

from clubedge_api.app import create_app
from clubedge_api.server import dependencies

app = create_app(dependencies())
