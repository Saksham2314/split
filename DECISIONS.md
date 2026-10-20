# Architecture Decision Log

Each entry: **context → decision → alternatives considered → consequences.** New decisions are appended;
superseded ones are marked, not deleted. "Proposed" means agreed in planning but not yet implemented.

---

## ADR-001 — Modular monolith, not microservices
- **Status:** Accepted (Phase 0)
- **Context:** Small app with one team (one person). The goal is to show DevOps depth, not service sprawl.
- **Decision:** One API process with internal modules (`auth`, `groups`, `expenses`, `settlements`).
- **Alternatives:** Microservices (each module its own service + DB). Rejected: adds network calls,
  distributed transactions, and many more pipelines for no real benefit at this scale.
- **Consequences:** Simple deploys and transactions. If one module needed independent scaling later,
  clean module boundaries make extraction possible.

## ADR-002 — npm workspaces monorepo
- **Status:** Accepted (Phase 0)
- **Decision:** One repo with `apps/api` and `apps/web`, managed by npm workspaces, plus `infra/`, `deploy/`, `jenkins/`.
- **Alternatives:** Separate repos (harder to keep API and UI in sync); pnpm/Turborepo/Nx (good, but extra
  tools to learn and install on the CI host).
- **Consequences:** One commit SHA identifies a consistent version of the whole system. That fits SHA image tags.

## ADR-003 — Authentication: JWT in an httpOnly cookie, same-origin
- **Status:** Proposed (implemented in Phase 1)
- **Decision:** On login the API signs a short-lived JWT (HS256, 12 h) and sets it as a cookie with
  `HttpOnly`, `Secure` (in production), `SameSite=Lax`. Frontend and API share one origin through the
  reverse proxy. Passwords are hashed with **bcrypt** (cost 12).
- **Why:** An `HttpOnly` cookie can't be read by JavaScript, so an XSS bug can't steal the token
  (unlike `localStorage`). Same-origin removes the need for CORS. `SameSite=Lax` blocks the cookie on
  cross-site POSTs, which is the main CSRF protection here.
- **Alternatives:**
  - *Server-side sessions* (express-session + Postgres store): easy revocation, but a DB lookup on every request.
  - *JWT in localStorage + `Authorization` header*: simple, but exposed to XSS.
  - *OAuth / Amazon Cognito / Auth0*: best for real products, but outsources the part interviewers ask you to explain.
  - *Argon2id* instead of bcrypt: newer, memory-hard, slightly stronger, but needs a native module. bcrypt is still an accepted standard.
- **Consequences:** Logout clears the cookie, but a stolen token stays valid until it expires (we don't keep a
  denylist). The short expiry limits that window.

## ADR-004 — Money stored as integer paise
- **Status:** Proposed (Phase 1)
- **Decision:** All amounts are `BIGINT` paise (₹1 = 100). Equal splits put the remainder paise on the
  first participants in a fixed order, so the shares always add up exactly to the total.
- **Alternatives:** `NUMERIC(12,2)` in Postgres (correct in the DB, but JS turns it into a float); JS floats (`0.1 + 0.2 !== 0.3`).

## ADR-005 — Plain SQL via `pg` + node-pg-migrate (no ORM)
- **Status:** Proposed (Phase 1)
- **Alternatives:** Prisma (great DX, but generated client + engine binary complicate slim images), Drizzle, Knex, TypeORM.
- **Why:** Explicit SQL makes transactions, constraints and indexes easy to explain in an interview.
- **Validation:** **zod** schemas on every request body.

## ADR-006 — Caddy as reverse proxy with automatic HTTPS
- **Status:** Proposed (Phase 2/4)
- **Alternatives:** Nginx + Certbot (more common in industry, more manual renewal setup); AWS ALB + ACM
  (managed, but an ALB costs roughly USD 16+/month); Traefik.
- **HTTPS without a domain:** use `<elastic-ip-with-dashes>.sslip.io`, a free wildcard DNS name that resolves to
  the IP, so Let's Encrypt can issue a real certificate. If a real domain becomes available, only the hostname changes.

## ADR-007 — Single EC2 + Docker Compose (not ECS/EKS)
- **Status:** Proposed (Phase 3/4)
- **Alternatives:** ECS Fargate (no servers, but an ALB is needed in practice → extra cost); EKS (around USD 73/month
  for the control plane alone, overkill); Elastic Beanstalk / App Runner / Lightsail (hide the concepts we want to learn).
- **Consequences:** Cheap and every layer is visible. It's a single point of failure (see ARCHITECTURE §7).

## ADR-008 — Dedicated VPC with one public subnet, no NAT Gateway
- **Status:** Proposed (Phase 3)
- **Alternatives:** Default VPC (works, teaches less); private subnet + NAT (around USD 30+/month extra, mainly useful with a load balancer).

## ADR-009 — SSM Run Command for deploys; no SSH
- **Status:** Proposed (Phase 4/6)
- **Alternatives:** SSH from Jenkins (needs port 22 open + a private key in Jenkins); AWS CodeDeploy (another
  service and agent); pull-based agent like Watchtower (deploys can't be tied to pipeline checks).
- **Consequences:** Every command is authorized by IAM and logged in AWS. Jenkins needs an IAM user whose policy allows only
  `ssm:SendCommand` on this instance and the `AWS-RunShellScript` document, plus reading the command result.

## ADR-010 — Jenkins runs locally in Docker; SCM polling instead of webhooks
- **Status:** Proposed (Phase 5)
- **Context:** A laptop is behind NAT and often off, so GitHub can't call it.
- **Decision:** Run `jenkins/jenkins:lts` in Docker Desktop, bound to `127.0.0.1:8080` only. The job polls GitHub every few minutes.
- **Alternatives:** Jenkins on its own EC2 (always-on, but more cost and another server to secure); exposing it with ngrok
  for webhooks (risky: puts a powerful server on the internet); GitHub Actions (simpler, but the brief requires Jenkins).
- **Consequences:** CI/CD only runs while the laptop is on. This is fine for a portfolio and should be stated honestly in the interview.

## ADR-011 — Secrets in SSM Parameter Store (SecureString)
- **Status:** Proposed (Phase 4)
- **Decision:** DB password, JWT secret and a GHCR read-only token are created **by hand** (CLI), never in Terraform code or
  state. The instance role may read only `/splitsmart/prod/*`. The deploy script writes them to a root-only `.env` on the host.
- **Alternatives:** Secrets Manager (rotation, but USD 0.40/secret/month); Terraform-managed secrets (end up in state in plain text).

## ADR-012 — Image tags are Git commit SHAs; Trivy for scanning
- **Status:** Proposed (Phase 5)
- **Alternatives for scanning:** Grype, Snyk (account needed), Docker Scout. Trivy is free, offline-capable and common in pipelines.

## ADR-013 — AWS region ap-south-1 (Mumbai)
- **Status:** Proposed. Change it in `terraform.tfvars` if you prefer another region.
- **Why:** Lowest latency for users in India. Prices differ slightly by region.

## ADR-014 — Terraform local state (for now)
- **Status:** Proposed (Phase 3)
- **Decision:** Local state file, git-ignored, backed up manually. Remote S3 state (with native S3 locking) is documented as
  the production upgrade and can be added if requested.
- **Risk:** Losing the state file means Terraform "forgets" the resources. They keep running and billing, and you'd have to import or delete them by hand.
