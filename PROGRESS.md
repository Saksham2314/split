# SplitSmart — Progress Tracker

_Last updated: 2026-10-20_

## Current phase
**Phase 0 — Discovery, planning and repository setup.** Docs written; remote `origin` = https://github.com/Saksham2314/split.git (branch `main`).

## Phase status

| Phase | Status | Notes |
|---|---|---|
| 0 Discovery & setup | 🟡 Docs done, first commit pending | Needs git identity + GitHub remote |
| 1 Local application | ⏳ Not started | |
| 2 Docker | ⏳ Not started | Docker Desktop not installed |
| 3 AWS + Terraform | ⏳ Not started | Terraform, AWS CLI, AWS account not set up |
| 4 Deploy to EC2 | ⏳ Not started | |
| 5 Jenkins CI | ⏳ Not started | |
| 6 CD + rollback | ⏳ Not started | |
| 7 Security & ops | ⏳ Not started | |
| 8 Final review | ⏳ Not started | |

## Environment check (2026-10-20, Windows 11)

| Tool | Result |
|---|---|
| Git | ✅ 2.55.0.windows.2 (no global `user.name`/`user.email`) |
| Node.js / npm | ✅ v24.18.0 / 11.16.0 |
| Docker | ⛔ not installed |
| Terraform | ⛔ not installed |
| AWS CLI | ⛔ not installed; no credentials file or env vars present |
| Java / Jenkins | ⛔ not installed (Jenkins will run in Docker, so Java isn't needed on the host) |
| GitHub CLI | ⛔ not installed (optional) |
| WSL / winget | ✅ available |

## Pending tasks
- [x] Git identity set repo-locally (`git config user.name` / `user.email`); change it if you prefer
- [x] GitHub repo created: `Saksham2314/split`
- [x] First commit + push (`chore: initialize project structure and planning docs`)
- [ ] You (before Phase 2): install Docker Desktop
- [ ] Recommended: move project out of OneDrive to `C:\dev\splitsmart`

## Test results
_None yet (no code in Phase 0)._

## Last verified commit
_None yet._

## Deployment status
No cloud resources exist. **Current AWS spend from this project: USD 0.**

## Blockers / manual actions
- Install **Docker Desktop** before Phase 2: `winget install -e --id Docker.DockerDesktop` (then restart).
- Recommended: move the project out of OneDrive to `C:\dev\splitsmart`.
