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
- **Status:** Accepted (implemented Phase 1)
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
- **Status:** Accepted (implemented Phase 1)
- **Decision:** All amounts are `BIGINT` paise (₹1 = 100). Equal splits put the remainder paise on the
  first participants in a fixed order, so the shares always add up exactly to the total.
- **Alternatives:** `NUMERIC(12,2)` in Postgres (correct in the DB, but JS turns it into a float); JS floats (`0.1 + 0.2 !== 0.3`).

## ADR-005 — Plain SQL via `pg` + node-pg-migrate (no ORM)
- **Status:** Accepted (implemented Phase 1)
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

## ADR-015 — Express 5, zod 4, Vitest projects, React Router
- **Status:** Accepted (Phase 1)
- **Decision:** Express 5 (async errors reach the error handler without wrappers), zod 4 for request validation,
  Vitest with two projects (`unit` needs nothing; `api` runs Supertest against a real Postgres test database),
  React Router for the SPA, `express-rate-limit` on login/register.
- **Why a real database in API tests:** mocking the DB would skip constraints, foreign keys, transactions and SQL
  bugs, which are exactly what we want to catch. The test setup wipes `splitsmart_test` and replays all migrations, which also
  proves migrations work on a clean database.

## ADR-016 — Authorization: membership check, 404 for outsiders, plus DB-level guarantees
- **Status:** Accepted (Phase 1)
- **Decision:** Every `/groups/:id/...` handler first loads the member list and returns 404 if the caller isn't in it.
  Composite foreign keys (`(group_id, user_id) → group_members`) make Postgres itself reject a payer, participant or
  settlement party who isn't a member. Deletes are scoped by `group_id` as well as `id`, which prevents IDOR
  (insecure direct object reference) attacks.
- **Trade-off:** 404 instead of 403 hides whether a group exists, but makes debugging slightly less obvious.

## ADR-017 — Liveness vs readiness health endpoints
- **Status:** Accepted (Phase 1)
- **Decision:** `/api/health/live` answers if the process runs; `/api/health` also runs `SELECT 1` and returns 503 if the
  DB is unreachable. Docker health checks and the deploy script (Phases 2/6) gate releases on readiness.

## ADR-018 — Sign in with Google: server-side code flow + PKCE, no automatic account linking
- **Status:** Accepted (Phase 1)
- **Decision:** `/api/auth/google` redirects to Google with a random `state` and a PKCE S256 challenge, both kept in a
  10-minute signed HttpOnly cookie scoped to `/api/auth/google`. The callback checks `state` (constant-time compare),
  exchanges the code server-side, validates the ID token claims (`iss`, `aud`, `exp`, `email_verified`) and issues the
  normal session cookie. Users are matched on Google's stable `sub` (new `users.google_sub` column), never on email alone.
  The feature turns on only when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. No new dependencies.
- **ID token signature:** not verified against Google's JWKS. The token comes straight from Google's token endpoint over
  TLS, which OpenID Connect Core §3.1.3.7 accepts as authenticating the issuer.
- **No auto-linking:** if a *password* account already uses the same email, Google sign-in is refused (`email_exists`).
  SplitSmart doesn't verify emails at sign-up, so someone could pre-register a victim's address with a password they
  know. Auto-linking would then let them into the victim's account ("account pre-hijacking").
- **Trade-off:** someone who signed up with a password can't later switch to Google for the same email. An
  explicit "link Google" action while logged in would be the safe way to add that.

## ADR-019 — UI motion: `motion` library, one shared vocabulary, reduced-motion aware
- **Status:** Accepted (Phase 1)
- **Decision:** `motion` (formerly Framer Motion), pinned to exactly 13.5.1. 14.x was only weeks old and changing fast,
  so I picked a release that had been out a while (supply-chain caution). All animations draw from `apps/web/src/lib/motion.ts`:
  three springs (snappy for presses, smooth for layout, bouncy for celebrations), a staggered "rise" entrance and a list
  item enter/exit. Exits are faster than entrances. `<MotionConfig reducedMotion="user">` plus a CSS media query switch off
  movement for users who ask their OS for reduced motion. Particles and click sparks are skipped entirely for them.
- **Emojis are derived, not stored:** expense, group and avatar emojis come from keyword rules and id hashes
  (`lib/emoji.ts`, unit-tested), so no schema change was needed.
- **Cost:** about 100 kB more JS (157 kB gzipped in total). Acceptable for now. `LazyMotion` can cut it if load time matters later.

## ADR-020 — Container layout: Caddy serves the web app and proxies the API; migrations as a one-off job
- **Status:** Accepted (Phase 2). Refines ADR-006 and ADR-007.
- **Decision:** Four Compose services: `db`, `migrate`, `api` and `web`. `web` is Caddy with the built React files baked in.
  It serves them, reverse-proxies `/api/*` to `api:3000` and terminates HTTPS. `migrate` runs the API image with
  `node dist/migrate.js up` and must exit 0 before `api` starts. Images are built from the repo root because the npm
  workspaces share one lockfile.
- **Alternatives:** separate nginx "web" and Caddy "proxy" containers (one more image and hop for no benefit). Running
  migrations inside API start-up (every replica races to migrate, and a bad migration crash-loops the API).
- **Isolation:** `backend` network is `internal: true` (db + api + migrate); `edge` network has Caddy + api. Only Caddy
  publishes ports. The API keeps outbound internet (via `edge`) for Google's token endpoint. The DB has none.
- **Hardening:** non-root API, read-only root filesystems, `cap_drop: ALL` (Caddy gets back only `NET_BIND_SERVICE`),
  `no-new-privileges`, memory limits sized for a 1 GB instance, rotated json-file logs, npm/yarn deleted from the
  runtime image. CSP allows `'unsafe-inline'` **styles only**, because Motion animates via inline style attributes. Scripts stay `'self'`.
- **Known gaps:** base images pinned by tag, not digest (Phase 5 adds Trivy scanning and SHA-tagged app images).
  Deleting npm doesn't shrink the image, because the files still exist in the base layer.
