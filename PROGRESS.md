# SplitSmart — Progress Tracker

_Last updated: 2026-10-21_

Legend: ✅ Implemented & verified · 🟡 Implemented, not yet verified · 📄 Documented only · ⛔ Blocked

## Current phase
**Phases 3–4 done: SplitSmart is live at https://13-54-188-209.sslip.io** (EC2 `t3.micro`, Sydney, AWS Free plan credits).
Created and deployed with the AWS CLI scripts in `deploy/aws/` (no Terraform, ADR-021). Next: Phase 5, CI (Jenkins).

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery & setup | ✅ Done | Commits `f5f62cd`, `2d09f88` pushed |
| 1 Local application | ✅ Done | Commit `120e879` pushed |
| 2 Docker | ✅ Done | Verified locally (see checklist) |
| 3 AWS server | ✅ Done | `i-0334e62541a7e45f1`, EIP 13.54.188.209, ap-southeast-2. Terraform dropped (ADR-021) |
| 4 Deploy to EC2 | ✅ Done | Built on the server from GitHub `main`; Let's Encrypt HTTPS |
| 5 Jenkins CI | ⏳ Not started | |
| 6 CD + rollback | ⏳ Not started | |
| 7 Security & ops | ⏳ Not started | |
| 8 Final review | ⏳ Not started | |

## Phase 3–4 checklist (verified 2026-10-21 against the live server)

| Item | Status |
|---|---|
| Identity is IAM user `splitsmart-admin` (AdministratorAccess), not root | ✅ |
| Region: SCP allows EC2 only in ap-southeast-2; scripts use it | ✅ |
| Free plan: $100 credits until 2027-04-20; `t3.micro` free-tier eligible | ✅ |
| Budget `splitsmart-monthly`: usage before credits > 80% of $15, or forecast > $15 | ✅ created |
| Security group: 80/443 only; 22, 3000, 5432 unreachable from internet | ✅ probed |
| sshd masked on host (cloud-init started it even when disabled) | ✅ inactive after reboot fix |
| IMDSv2 only (IMDSv1 returns 401), hop limit 1 | ✅ |
| Bootstrap: Docker 25, Compose v5.6.0 + buildx v0.37.2 (SHA-256 verified), 2 GB swap, dnf-automatic | ✅ |
| Deploy via SSM: clone `main`, build on host, db → migrate → api → web all healthy | ✅ |
| HTTPS: Let's Encrypt cert for 13-54-188-209.sslip.io (valid to 2027-01-18, auto-renew); HTTP → 308 → HTTPS | ✅ |
| Security headers + cookie `HttpOnly; Secure; SameSite=Lax` | ✅ |
| Headless-Chrome flow against the live URL: renders, animates, no CSP violations | ✅ |
| Reboot: containers come back on their own in ~30 s; data intact | ✅ |
| Secrets generated on the server, `/opt/splitsmart/.env` mode 600 | ✅ |
| Login brute-force limit active (429 after ~20 attempts / 15 min) | ✅ |
| Test data on prod: user `smoke-test-…@example.com` with a "Smoke test" group | ℹ️ left in place (no delete-user feature) |

## Phase 2 checklist

| Item | Status |
|---|---|
| API image: multi-stage, prod deps only, non-root (uid 1000), npm/yarn removed, HEALTHCHECK | ✅ 270 MB (app layers ~32 MB; rest is the Node base) |
| Web image: Vite build served by Caddy 2.11.7, which also proxies `/api` and does HTTPS | ✅ 94 MB, Caddyfile validated at build time |
| One-off `migrate` service gates the API (`service_completed_successfully`) | ✅ applied both migrations on a fresh DB; "No migrations to run" on restart |
| DB on an internal network with no published port and no internet route | ✅ verified: no host port; `wget google.com` from db fails |
| API: read-only root FS, `/tmp` tmpfs, all capabilities dropped, no-new-privileges, init, memory limits | ✅ verified: write to /app fails, CapEff = 0 |
| Security headers (CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy); no `Server`/`X-Powered-By` | ✅ verified with curl |
| CSP doesn't break the UI | ✅ full headless-Chrome flow on http://localhost: no CSP violations, screenshots fully styled |
| Caching: hashed assets `immutable` 1 year, `index.html` `no-cache`; zstd/gzip | ✅ |
| Graceful shutdown on SIGTERM | ✅ API stopped in 0.66 s after "SIGTERM received" |
| Data survives `down` / `up` (named volumes) | ✅ |
| No secrets or session cookies in container logs | ✅ 0 matches (Caddy redacts Cookie headers) |
| Image vulnerability scan (Trivy) | ⏳ Phase 5 (in the pipeline, pinned version) |

## Phase 1 checklist

| Item | Status |
|---|---|
| API: auth (register/login/logout/me), groups, members, expenses, balances, settlements | ✅ covered by API tests against Postgres |
| Google sign-in (OAuth 2.0 + PKCE, no auto-linking) | ✅ 8 API tests (Google stubbed). ⏳ not tried against real Google: needs your OAuth client ID |
| SQL migration (users, groups, group_members, expenses, expense_shares, settlements) | ✅ 2 migrations applied to local Postgres 16 |
| Split maths in integer paise + debt simplification | ✅ 9 unit tests pass |
| Web UI: login/register, groups list, group page (add expense, balances, settle, members, history) | ✅ redesigned with Motion; driven in headless Chrome (login error, Google toast, login, groups, add expense, settle, history expand, mobile 390px): no console errors, nothing past the screen edge |
| Web money parsing + emoji rules | ✅ 26 unit tests pass |
| ESLint + TypeScript (both apps) | ✅ clean |
| Production builds (`tsc`, `vite build`) | ✅ succeed |
| Health endpoints: `/api/health/live` = 200; `/api/health` = 200 with DB, 503 without | ✅ verified with curl |
| API tests (Supertest, 23 cases incl. authorization + OAuth) | ✅ 23/23 pass |

## Environment check

| Tool | Result |
|---|---|
| Git | ✅ 2.55.0 |
| Node.js / npm | ✅ v24.18.0 / 11.16.0 |
| Docker CLI / Compose | ✅ 29.9.1 / v5.6.0, engine running on WSL 2 |
| Terraform / AWS CLI | ⛔ not installed (needed in Phase 3) |

## Pending tasks
- [x] Install WSL 2, start Docker Desktop
- [x] `docker compose -f deploy/docker-compose.yml up -d`, migrations, full test suite
- [x] End-to-end flow through the dev servers (API-level, via Vite proxy)
- [x] UI redesign with motion + Google sign-in
- [ ] **You (optional):** create a Google OAuth client to try real Google sign-in (README → "Sign in with Google")
- [x] Commit Phase 1
- [x] Push Phase 1
- [x] Phase 2: images, prod compose, verification
- [x] AWS CLI 2.38.1 installed (Terraform installed but no longer used)
- [x] IAM user + access key configured (`aws configure`)
- [x] `create-server.sh`, `deploy.sh`, live verification
- [ ] **You (recommended):** add MFA to `splitsmart-admin` and the root user
- [ ] Phase 5: CI pipeline

## Test results (2026-10-20)
- `apps/api` unit: **12/12 passed**
- `apps/web` unit: **26/26 passed**
- `apps/api` API tests: **23/23 passed** (Postgres 16 in Docker)

## Last verified commit
`120e879` feat: Phase 1 app with animated UI and Google sign-in (pushed). Phase 2 commit follows.

## Deployment status
Live: https://13-54-188-209.sslip.io — EC2 `i-0334e62541a7e45f1` (t3.micro), EIP 13.54.188.209, ap-southeast-2.
**Out-of-pocket cost: USD 0** (Free plan; ≈ USD 13/month of the $100 credits). `bash deploy/aws/destroy-server.sh` removes it all.

## Blockers / manual actions
None blocking. Recommended: MFA on `splitsmart-admin` (the CLI uses a long-lived access key; rotate it if it ever leaks:
IAM → Users → splitsmart-admin → Security credentials).
