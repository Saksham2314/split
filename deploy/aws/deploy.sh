#!/usr/bin/env bash
# Deploys a branch or commit of SplitSmart to the server through SSM (no SSH).
# The server clones the public GitHub repo, builds the images and restarts the stack.
#
#   bash deploy/aws/deploy.sh            # deploy origin/main
#   bash deploy/aws/deploy.sh a4a51df    # deploy a specific commit
set -euo pipefail
. "$(dirname "$0")/lib.sh"
load_state

REF="${1:-main}"
REPO="${REPO:-https://github.com/Saksham2314/split.git}"
case "$REF" in *[!A-Za-z0-9._/-]*) die "invalid ref: $REF" ;; esac

script="$(mktemp)"
{
  echo "REF='$REF'"
  echo "SITE_HOST='$SITE_HOST'"
  echo "REPO='$REPO'"
  cat "$HERE/remote-deploy.sh"
} > "$script"

log "Deploying $REF to $INSTANCE_ID ($SITE_HOST). The first build takes several minutes on a t3.micro."
if ssm_run "$script" 3600; then
  rm -f "$script"
  log "Live at https://$SITE_HOST"
else
  rm -f "$script"
  die "Deploy failed (output above). The previous containers keep running if the build failed."
fi
