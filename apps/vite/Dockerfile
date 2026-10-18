# Production image for the React + Vite app: Caddy serves the static build and forwards /api
# to the API (see Caddyfile). Build it from the repository root.
# Generated projects keep the app in apps/web; the starter repository builds it with
#   docker build -f apps/vite/Dockerfile --build-arg APP_DIR=apps/vite \
#     --build-arg APP_PACKAGE=@clubedge/vite .
# Run it with API_URL set to the API's address, such as https://api.example.com.
ARG APP_DIR=apps/web
ARG APP_PACKAGE=@clubedge/web

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Reduce the workspace to the app and the packages it depends on, split into manifests
# (for a cacheable install layer) and full sources. New packages are picked up automatically.
FROM base AS pruner
ARG APP_PACKAGE
COPY . .
RUN pnpm dlx turbo@^2.5.0 prune ${APP_PACKAGE} --docker

# The manifests come first, so the install layer is cached until a dependency changes.
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./
RUN pnpm build

# The build is static files, so the runtime needs no Node.js.
FROM caddy:2-alpine AS runner
ARG APP_DIR
ENV PORT=3000
COPY --from=builder /app/${APP_DIR}/Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/${APP_DIR}/dist /srv
EXPOSE 3000
