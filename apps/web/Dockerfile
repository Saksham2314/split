# syntax=docker/dockerfile:1
# SplitSmart web: the built React app served by Caddy, which also reverse-proxies /api to the API
# and handles HTTPS. Build from the repo root:
#   docker build -f apps/web/Dockerfile -t splitsmart-web .

# ---- build: Vite production bundle ----
FROM node:24.18.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/web --no-audit --no-fund
COPY apps/web apps/web
RUN npm run build --workspace apps/web

# ---- runtime: Caddy + static files ----
FROM caddy:2.11.7-alpine AS runtime
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:2019/config/"]
