#!/bin/bash
# First-boot setup for the SplitSmart server (Amazon Linux 2023). Passed as EC2 user data by
# create-server.sh and run once, as root, by cloud-init.
# Log: /var/log/splitsmart-bootstrap.log   Done-marker: /var/lib/splitsmart-bootstrap-done
set -euo pipefail
exec > >(tee -a /var/log/splitsmart-bootstrap.log) 2>&1
echo "bootstrap start: $(date -Is)"

# Pinned releases, verified by SHA-256 (Amazon Linux doesn't package these two Docker plugins).
COMPOSE_VERSION=v5.6.0
COMPOSE_SHA256=40343e21ca777173e69cff5dbafeb37c6f81f3b0d57d9e597f036e95eb63e76a
BUILDX_VERSION=v0.37.2
BUILDX_SHA256=982ca20490b45ed1ec8d99795974d3d874a358f75938c9c237305010e6b7e548
SWAP_MB=2048

# Docker engine and git from the Amazon Linux repos, plus automatic security updates.
dnf -y install docker git dnf-automatic
sed -i 's/^upgrade_type.*/upgrade_type = security/; s/^apply_updates.*/apply_updates = yes/' /etc/dnf/automatic.conf
systemctl enable --now dnf-automatic.timer

# Default log rotation for every container; live-restore keeps containers up while dockerd restarts.
mkdir -p /etc/docker
cat > /etc/docker/daemon.json <<'JSON'
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "live-restore": true
}
JSON
systemctl enable --now docker

install_plugin() { # name url sha256
  curl -fsSL --retry 5 -o "/tmp/$1" "$2"
  echo "$3  /tmp/$1" | sha256sum -c -
  install -D -m 0755 "/tmp/$1" "/usr/local/lib/docker/cli-plugins/$1"
  rm -f "/tmp/$1"
}
install_plugin docker-compose \
  "https://github.com/docker/compose/releases/download/$COMPOSE_VERSION/docker-compose-linux-x86_64" "$COMPOSE_SHA256"
install_plugin docker-buildx \
  "https://github.com/docker/buildx/releases/download/$BUILDX_VERSION/buildx-$BUILDX_VERSION.linux-amd64" "$BUILDX_SHA256"
docker compose version
docker buildx version

# Swap: a 1 GiB instance needs headroom to build the images and absorb memory spikes.
if ! swapon --show | grep -q /swapfile; then
  dd if=/dev/zero of=/swapfile bs=1M count="$SWAP_MB" status=none
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap defaults 0 0' >> /etc/fstab
fi
echo 'vm.swappiness = 10' > /etc/sysctl.d/90-splitsmart.conf
sysctl --system > /dev/null

# No SSH: port 22 is closed in the security group and admin access goes through SSM Session Manager.
# Masking sshd (not just disabling: cloud-init starts disabled sshd at boot) means a firewall mistake can't expose it.
systemctl mask --now sshd.service sshd.socket

# deploy.sh keeps the source checkout and the root-only .env with the secrets here.
install -d -m 0700 /opt/splitsmart

touch /var/lib/splitsmart-bootstrap-done
echo "bootstrap done: $(date -Is)"
