FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Reduce the workspace to the web app and the packages it depends on, split into manifests
# (for a cacheable install layer) and full sources. New packages are picked up automatically.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.5.0 prune @clubedge/web --docker

# Install in the stage that builds: copying node_modules from a separate install stage (many
# small files) took minutes on some builders, and timed out a Railway build. The manifests come
# first, so the install layer is still cached until a dependency changes.
FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./
# Next.js compiles NEXT_PUBLIC_* values into the build, server code included (sign-in email links,
# Stripe return URLs), so the public URL is a build argument. Railway and Render pass it from the
# service's variables; elsewhere, --build-arg NEXT_PUBLIC_APP_URL=https://your.domain. Unset, the
# app falls back to http://localhost:3000.
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
RUN pnpm build
# The production migrator (node /app/migrate.mjs): one bundled file plus every package's
# migrations, so release commands can migrate before a new version starts.
COPY scripts/migrate.mjs scripts/build-migrator.mjs ./scripts/
RUN node scripts/build-migrator.mjs /app/.migrator

FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.migrator ./
WORKDIR /app/apps/web
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
