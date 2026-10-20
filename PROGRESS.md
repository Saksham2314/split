# SplitSmart — Progress Tracker

_Last updated: 2026-10-20_

Legend: ✅ Implemented & verified · 🟡 Implemented, not yet verified · 📄 Documented only · ⛔ Blocked

## Current phase
**Phase 1 — Local application.** Code complete. All tests pass against a real PostgreSQL (Docker).
UI redesigned (dark, animated, emoji-rich) and Google sign-in added. Everything verified in headless Chrome, committed locally. Remaining: push.

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery & setup | ✅ Done | Commits `f5f62cd`, `2d09f88` pushed |
| 1 Local application | 🟡 Verified + committed; push pending | |
| 2 Docker | ⏳ Not started | |
| 3 AWS + Terraform | ⏳ Not started | Terraform, AWS CLI, AWS account not set up |
| 4 Deploy to EC2 | ⏳ Not started | |
| 5 Jenkins CI | ⏳ Not started | |
| 6 CD + rollback | ⏳ Not started | |
| 7 Security & ops | ⏳ Not started | |
| 8 Final review | ⏳ Not started | |

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
- [ ] Push

## Test results (2026-10-20)
- `apps/api` unit: **9/9 passed**
- `apps/web` unit: **26/26 passed**
- `apps/api` API tests: **23/23 passed** (Postgres 16 in Docker)

## Last verified commit
`2d09f88` docs: record move out of OneDrive and last verified commit (pushed)

## Deployment status
No cloud resources exist. **Current AWS spend from this project: USD 0.**

## Blockers / manual actions
None. (WSL 2 installed; Docker engine running.)
