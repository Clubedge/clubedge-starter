# Production image for the React + Vite app: Node serves the static build and forwards /api
# to the API (see server.mjs). Build it from the repository root.
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
ARG VITE_API_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_FIREBASE_API_KEY
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_AUTH_DOMAIN
ARG VITE_APPWRITE_ENDPOINT
ARG VITE_APPWRITE_PROJECT_ID
ENV VITE_API_URL=${VITE_API_URL} VITE_SUPABASE_URL=${VITE_SUPABASE_URL} VITE_SUPABASE_PUBLISHABLE_KEY=${VITE_SUPABASE_PUBLISHABLE_KEY} \
    VITE_FIREBASE_API_KEY=${VITE_FIREBASE_API_KEY} VITE_FIREBASE_PROJECT_ID=${VITE_FIREBASE_PROJECT_ID} \
    VITE_FIREBASE_AUTH_DOMAIN=${VITE_FIREBASE_AUTH_DOMAIN} VITE_APPWRITE_ENDPOINT=${VITE_APPWRITE_ENDPOINT} \
    VITE_APPWRITE_PROJECT_ID=${VITE_APPWRITE_PROJECT_ID}
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
COPY tsconfig.base.json ./
RUN pnpm build

# Serve static files and proxy API requests from a standard Node runtime.
FROM node:22-alpine AS runner
ARG APP_DIR
ENV PORT=3000
WORKDIR /srv/${APP_DIR}
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 app
COPY --from=builder --chown=app:nodejs /app/${APP_DIR}/dist ./dist
COPY --from=builder --chown=app:nodejs /app/${APP_DIR}/server.mjs ./server.mjs
COPY --from=builder --chown=app:nodejs /app/${APP_DIR}/client-ip.mjs ./client-ip.mjs
USER app
EXPOSE 3000
CMD ["node", "server.mjs"]
