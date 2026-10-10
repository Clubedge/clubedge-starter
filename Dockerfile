FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# Reduce the workspace to the web app and the packages it depends on, split into manifests
# (for a cacheable install layer) and full sources. New packages are picked up automatically.
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@^2.5.0 prune @clubedge/web --docker

FROM base AS deps
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile

FROM base AS builder
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/ .
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./
RUN pnpm build

FROM node:22-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
WORKDIR /app
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
WORKDIR /app/apps/web
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
