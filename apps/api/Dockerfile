# syntax=docker/dockerfile:1
# SplitSmart API. Build from the repo root (npm workspaces share one lockfile):
#   docker build -f apps/api/Dockerfile -t splitsmart-api .

ARG NODE_IMAGE=node:24.18.0-alpine

# ---- build: all dependencies + TypeScript compile ----
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/api --no-audit --no-fund
COPY apps/api apps/api
RUN npm run build --workspace apps/api

# ---- prod-deps: runtime dependencies only (no TypeScript, Vitest, ESLint…) ----
FROM ${NODE_IMAGE} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/api --omit=dev --no-audit --no-fund \
 && mkdir -p apps/api/node_modules

# ---- runtime ----
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production PORT=3000
# The app is started with `node` directly, so the package managers are dead weight at runtime
# and a common source of scanner findings (they bundle many dependencies of their own).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/lib/node_modules/corepack /opt/yarn-* /usr/local/bin/yarn /usr/local/bin/yarnpkg
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/package.json apps/api/
COPY apps/api/migrations apps/api/migrations
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api

# Files stay root-owned and read-only to the app; it runs as the unprivileged `node` user.
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
# Run node directly (not `npm start`) so it receives SIGTERM and shuts down gracefully.
CMD ["node", "dist/server.js"]
