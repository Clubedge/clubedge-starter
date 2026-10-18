# Production image for the API. Build it from the repository root.
# Generated projects keep the API in apps/api:
#   docker build -f apps/api/Dockerfile .
ARG APP_DIR=apps/api
ARG APP_PACKAGE=@clubedge/api

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Reduce the workspace to the API and the packages it depends on, split into manifests (for a
# cacheable install layer) and full sources.
FROM base AS pruner
ARG APP_PACKAGE
COPY . .
RUN pnpm dlx turbo@^2.5.0 prune ${APP_PACKAGE} --docker

FROM base AS builder
ARG APP_PACKAGE
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./
RUN pnpm --filter ${APP_PACKAGE} build
# The production migrator (node /app/migrate.mjs), so release commands can migrate first.
COPY scripts/migrate.mjs scripts/build-migrator.mjs ./scripts/
RUN node scripts/build-migrator.mjs /app/.migrator

# esbuild bundles the API and its dependencies into dist, so no node_modules are needed.
FROM node:22-alpine AS runner
ARG APP_DIR
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3001
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 app
COPY --from=builder --chown=app:nodejs /app/${APP_DIR}/dist ./dist
COPY --from=builder --chown=app:nodejs /app/.migrator ./
USER app
EXPOSE 3001
CMD ["node", "dist/index.mjs"]
