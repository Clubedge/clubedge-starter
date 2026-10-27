# Production image for the API. Build it from the repository root.
# Generated projects keep the API in apps/api; the starter repository builds it with
#   docker build -f apps/api-fastapi/Dockerfile --build-arg APP_DIR=apps/api-fastapi .
# The database schema and its migrations live in packages/db; the image bundles their Node
# migrator (node /app/migrate.mjs), so run it before a new version starts.
ARG APP_DIR=apps/api

# Build the shared migrator in a Node workspace that has esbuild and the database packages.
FROM node:22-slim AS migrator-builder
RUN corepack enable
WORKDIR /workspace
COPY . .
RUN pnpm install --frozen-lockfile \
    && node scripts/build-migrator.mjs /tmp/.migrator

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends libatomic1 libstdc++6 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=migrator-builder /usr/local/bin/node /usr/local/bin/node
COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /uvx /bin/
ARG APP_DIR
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=never

# Dependencies first, so their layers stay cached until pyproject.toml (or uv.lock) changes: the
# API's own, then the dependency group (pyproject.toml) of each module option the project uses.
# The development tools stay out of the image.
COPY ${APP_DIR}/pyproject.toml ${APP_DIR}/uv.lock ./
RUN uv sync --locked --no-default-groups --no-install-project
RUN uv sync --locked --no-default-groups --group storage-s3 --inexact --no-install-project # clubedge:only storage=s3
RUN uv sync --locked --no-default-groups --group cache-redis --inexact --no-install-project # clubedge:only cache=redis
RUN uv sync --locked --no-default-groups --group email-smtp --inexact --no-install-project # clubedge:only email=smtp
RUN uv sync --locked --no-default-groups --group observability-otel --inexact --no-install-project # clubedge:only observability=otel
RUN uv sync --locked --no-default-groups --group observability-sentry --inexact --no-install-project # clubedge:only observability=sentry
RUN uv sync --locked --no-default-groups --group payments-stripe --inexact --no-install-project # clubedge:only payments=stripe
RUN uv sync --locked --no-default-groups --group jobs-bullmq --inexact --no-install-project # clubedge:only jobs=bullmq
RUN uv sync --locked --no-default-groups --group jobs-inngest --inexact --no-install-project # clubedge:only jobs=inngest
RUN uv sync --locked --no-default-groups --group push-native --inexact --no-install-project # clubedge:only push=native
COPY ${APP_DIR}/src ./src
# --inexact keeps the groups installed above.
RUN uv sync --locked --no-default-groups --inexact

# Bundle the shared Node migrator so deploy platforms can run it before release.
COPY --from=migrator-builder /tmp/.migrator/ ./

RUN useradd --system --uid 1001 app
USER app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001 PATH="/app/.venv/bin:$PATH"
EXPOSE 3001
CMD ["python", "-m", "clubedge_api"]
