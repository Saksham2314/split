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

# ---- caddy: same Caddy release, recompiled with a patched Go toolchain and x/net ----
# The official 2.11.7 binary was built with Go 1.26.8 and golang.org/x/net 0.59.0, which have HTTP/2
# denial-of-service CVEs (CVE-2026-78667, CVE-2026-78669, flagged by Trivy). The builder image's Go 1.27.3
# includes the stdlib fixes; x/net is pinned to the fixed 0.60.0. Drop this stage once upstream ships a fixed build.
FROM caddy:2.11.7-builder-alpine AS caddy
# Module cache: retries and rebuilds reuse downloads instead of fetching ~200 modules again.
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    xcaddy build v2.11.7 --replace golang.org/x/net=golang.org/x/net@v0.60.0 --output /usr/bin/caddy \
 && /usr/bin/caddy version

# ---- runtime: Caddy + static files ----
FROM caddy:2.11.7-alpine AS runtime
# Pick up Alpine security fixes released after the base image was published.
RUN apk upgrade --no-cache
COPY --from=caddy /usr/bin/caddy /usr/bin/caddy
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
RUN caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
EXPOSE 80 443
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD ["wget", "-q", "--spider", "http://127.0.0.1:2019/config/"]
