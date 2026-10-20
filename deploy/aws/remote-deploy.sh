# Runs ON the server as root (sent by deploy.sh through SSM). deploy.sh prepends:
#   REF=<git branch or commit>  SITE_HOST=<a-b-c-d.sslip.io>  REPO=<https clone url>
set -eu
# SSM Run Command may start without HOME; git and docker both expect one.
export HOME=/root
cd /opt/splitsmart

if [ ! -f /var/lib/splitsmart-bootstrap-done ]; then
  echo "Server bootstrap hasn't finished yet. Wait a minute and retry. Log tail:"
  tail -n 20 /var/log/splitsmart-bootstrap.log || true
  exit 1
fi

# --- source code at the requested version ---
[ -d src/.git ] || git clone --quiet "$REPO" src
git -C src fetch --quiet --prune origin
if git -C src rev-parse --quiet --verify "origin/$REF" > /dev/null; then target="origin/$REF"; else target="$REF"; fi
git -C src checkout --quiet --force --detach "$target"
echo "Deploying $(git -C src log -1 --format='%h %s')"

# --- secrets: generated here on first deploy, never leave this machine (root-only file) ---
if [ ! -f .env ]; then
  umask 077
  secret() { head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n'; }
  {
    echo "POSTGRES_PASSWORD=$(secret)"
    echo "JWT_SECRET=$(secret)"
    echo "COOKIE_SECURE=true"
    echo "GOOGLE_CLIENT_ID="
    echo "GOOGLE_CLIENT_SECRET="
  } > .env
  echo "Generated new secrets in /opt/splitsmart/.env"
fi
chmod 600 .env
# Hostname-derived settings are refreshed every deploy (they change if the Elastic IP ever does).
sed -i '/^SITE_ADDRESS=/d; /^APP_URL=/d' .env
printf 'SITE_ADDRESS=%s\nAPP_URL=https://%s\n' "$SITE_HOST" "$SITE_HOST" >> .env

# --- build on the server, one image at a time (1 GiB RAM + swap), then swap containers ---
C="docker compose -f src/deploy/docker-compose.prod.yml --env-file .env"
for svc in api web; do
  echo "Building $svc…"
  if ! $C --progress plain build "$svc" > "build-$svc.log" 2>&1; then
    tail -n 60 "build-$svc.log"
    exit 1
  fi
done
echo "Starting containers…"
$C up -d --no-build --remove-orphans --wait --wait-timeout 300
$C ps --format 'table {{.Service}}\t{{.Status}}'
docker image prune -f > /dev/null

# --- smoke test through Caddy over real HTTPS (the certificate may take a few seconds on first run) ---
for i in $(seq 1 24); do
  if curl -fsS --max-time 5 --resolve "$SITE_HOST:443:127.0.0.1" "https://$SITE_HOST/api/health"; then
    echo
    echo "OK: https://$SITE_HOST"
    exit 0
  fi
  sleep 5
done
echo "Health check over HTTPS failed. Recent Caddy logs:"
$C logs --tail 30 web
exit 1
