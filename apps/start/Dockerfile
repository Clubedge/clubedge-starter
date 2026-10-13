# Production image for the TanStack Start app. Build it from the repository root.
# Generated projects keep the app in apps/web; the starter repository builds it with
#   docker build -f apps/start/Dockerfile --build-arg APP_DIR=apps/start \
#     --build-arg APP_PACKAGE=@clubedge/start .
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

# Install in the stage that builds: copying node_modules from a separate install stage (many
# small files) took minutes on some builders, and timed out a Railway build. The manifests come
# first, so the install layer is still cached until a dependency changes.
FROM base AS builder
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./
RUN pnpm build
# The production migrator (node /app/migrate.mjs): one bundled file plus every package's
# migrations, so release commands can migrate before a new version starts.
COPY scripts/migrate.mjs scripts/build-migrator.mjs ./scripts/
RUN node scripts/build-migrator.mjs /app/.migrator

# Nitro bundles the server and its dependencies into .output, so no node_modules are needed.
FROM node:22-alpine AS runner
ARG APP_DIR
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 app
COPY --from=builder --chown=app:nodejs /app/${APP_DIR}/.output ./.output
COPY --from=builder --chown=app:nodejs /app/.migrator ./
USER app
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
