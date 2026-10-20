# syntax=docker/dockerfile:1
# Local Jenkins controller for SplitSmart CI (ADR-010). Everything the pipeline needs is baked in
# from official images at pinned versions, and Jenkins itself is configured from casc.yaml.

FROM node:24.18.0-bookworm-slim AS node
FROM docker:29.8.1-cli AS docker-cli
FROM aquasec/trivy:0.75.0 AS trivy

FROM jenkins/jenkins:2.580.1-lts-jdk21

USER root
# Node.js + npm (same version as local dev and the app images; glibc build to match this Debian base)
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm
RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
 && node --version && npm --version
# Docker CLI + buildx (talks to Docker Desktop through the mounted socket) and Trivy (image/repo scanning)
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker-cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/libexec/docker/cli-plugins/docker-buildx
COPY --from=trivy /usr/local/bin/trivy /usr/local/bin/trivy
USER jenkins

# Plugins: top-level versions pinned in plugins.txt; dependencies resolved for this exact core version.
COPY --chown=jenkins:jenkins plugins.txt /usr/share/jenkins/ref/plugins.txt
RUN jenkins-plugin-cli --plugin-file /usr/share/jenkins/ref/plugins.txt --jenkins-version 2.580.1

# Configuration as Code: no setup wizard, no click-ops. The admin password comes from a Docker secret.
COPY casc.yaml /etc/jenkins/casc.yaml
ENV CASC_JENKINS_CONFIG=/etc/jenkins/casc.yaml \
    JAVA_OPTS="-Djenkins.install.runSetupWizard=false"
