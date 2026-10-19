# Production image for the API. Build it from the repository root.
# Generated projects keep the API in apps/api; the starter repository builds it with
#   docker build -f apps/api-fastapi/Dockerfile --build-arg APP_DIR=apps/api-fastapi .
# The database schema and its migrations live in packages/db: run `pnpm db:migrate` against
# the production database before a new version starts.
ARG APP_DIR=apps/api

FROM node:22-slim AS node-runtime

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /uvx /bin/
ARG APP_DIR
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# Dependencies first, so their layer stays cached until pyproject.toml (or uv.lock) changes.
COPY ${APP_DIR}/pyproject.toml ${APP_DIR}/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY ${APP_DIR}/src ./src
RUN uv sync --locked --no-dev

# Railway runs migrations before switching API deployments. Bundle the shared Node migrator in
# this Python image too, so the generated Railway configuration can use the same release command.
COPY scripts/migrate.mjs scripts/build-migrator.mjs ./scripts/
RUN node scripts/build-migrator.mjs /tmp/.migrator && cp -R /tmp/.migrator/. /app/

RUN useradd --system --uid 1001 app
USER app
ENV HOST=0.0.0.0 PORT=3001 PATH="/app/.venv/bin:$PATH"
EXPOSE 3001
CMD ["python", "-m", "clubedge_api"]
