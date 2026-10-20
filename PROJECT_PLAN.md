# SplitSmart — Project Plan

## Goal
A working, reproducible, cloud-deployed expense splitter, plus the understanding needed to explain
every decision in a Cloud/DevOps interview. The app is kept simple on purpose; the depth is in
deployment, infrastructure as code, security, CI/CD, monitoring and recovery.

## Repository layout (target)

```
splitsmart/
├── apps/
│   ├── api/                 # Express + TypeScript REST API, migrations, tests
│   └── web/                 # React + Vite + TypeScript + Tailwind SPA
├── deploy/
│   ├── docker-compose.yml   # local dev stack
│   ├── docker-compose.prod.yml
│   ├── Caddyfile
│   └── scripts/             # deploy.sh, rollback.sh, backup.sh (run on EC2)
├── infra/terraform/         # VPC, SG, IAM, EC2, EIP, CloudWatch
├── jenkins/                 # local Jenkins controller setup (Dockerfile, compose)
├── Jenkinsfile
├── docs/                    # Phase 8 guides (interview, troubleshooting, ...)
└── README.md, ARCHITECTURE.md, DECISIONS.md, PROGRESS.md, PROJECT_PLAN.md
```

## Phases

Each phase ends with tests/validation → docs update → interview Q&A → a verified commit.

| # | Phase | Main deliverables | Done when |
|---|---|---|---|
| 0 | Discovery & setup | Plan, architecture, decisions, progress tracker, `.gitignore`, git repo | Docs reviewed, first commit made |
| 1 | Local application | API (auth, groups, members, expenses, balances, settlements), web UI, migrations, tests | App runs locally against Postgres; migrations work on a clean DB; tests pass |
| 2 | Docker | Multi-stage Dockerfiles, Compose with Postgres volume, health checks, non-root users | `docker compose up` from clean works; data survives restart; no secrets in images |
| 3 | AWS + Terraform | VPC, subnet, IGW, SG, IAM role (SSM + CloudWatch + scoped Parameter Store), EC2, EIP | `fmt` + `validate` pass; plan reviewed and **approved by you** before `apply` |
| 4 | Deploy to EC2 | Prod compose, Caddy HTTPS, secrets from Parameter Store, deploy via SSM | Site works over verified HTTPS; health endpoint OK; data persists |
| 5 | Jenkins CI | Local Jenkins in Docker, Jenkinsfile: install → lint → typecheck → test → build → image → Trivy → push to GHCR | Pipeline green end-to-end; failing test stops later stages; images tagged by SHA |
| 6 | CD + rollback | Deploy stage via SSM, health-gated, records last-known-good, auto + manual rollback | A commit goes from push to live; a broken build can't deploy; rollback proven |
| 7 | Security & ops | CloudWatch agent (logs + memory/disk), alarms, backups (pg_dump → S3), runbooks, cost guide | Logs are searchable; alarms fire on a test; backup restored successfully once |
| 8 | Final review & interview prep | INTERVIEW_PREPARATION, TROUBLESHOOTING, DEPLOYMENT_GUIDE, SECURITY_REVIEW, COST_AND_CLEANUP | Full re-verification; every claim in the docs matches reality |

## Prerequisites

| Needed by | Item | Status (2026-10-20) | Action |
|---|---|---|---|
| Phase 0 | Git identity (`user.name`, `user.email`) | ⛔ not set | Set it (commands in PROGRESS.md) |
| Phase 0 | GitHub account + empty repo | ❓ unknown | Create the repo on github.com (no README), tell me the URL |
| Phase 0 | GitHub auth for push | ❓ | Git Credential Manager (ships with Git for Windows) opens a browser login on first push |
| Phase 1 | Node.js 20+ / npm | ✅ Node 24.18.0, npm 11.16.0 | — |
| Phase 1 | PostgreSQL for local dev | ⛔ | Use Docker (recommended) instead of installing Postgres natively |
| Phase 2 | Docker Desktop (WSL 2 backend) | ⛔ not installed | `winget install -e --id Docker.DockerDesktop`, then restart |
| Phase 3 | Terraform ≥ 1.9 | ⛔ | `winget install -e --id Hashicorp.Terraform` |
| Phase 3 | AWS CLI v2 | ⛔ | `winget install -e --id Amazon.AWSCLI` |
| Phase 3 | AWS account + **non-root** IAM admin identity for Terraform | ❓ | Guide given in Phase 3 (IAM Identity Center or an IAM user + MFA) |
| Phase 3 | AWS Budget alert | ❓ | Create before any `apply` (guide in Phase 3) |
| Phase 4 | Domain name (optional) | ❓ | Not required; we can use `sslip.io` |
| Phase 5 | Jenkins + Java | ⛔ | Runs in Docker, so **no local Java install needed** |
| Phase 5 | GHCR token (fine-grained / classic PAT with `write:packages`) | ❓ | Stored only in Jenkins credentials, never in chat or Git |
| Optional | GitHub CLI | ⛔ | `winget install -e --id GitHub.cli` |

## Cost estimate (AWS, ap-south-1, if left running 24×7)

These are **approximate list prices, verify with the AWS Pricing Calculator and your Billing console.** Free-tier
eligibility depends on your account's age and plan. Since mid-2025, new accounts get a credit-based Free plan,
and older accounts may still have the legacy 12-month tier. Don't assume either applies until you've checked.

| Item | Size | Approx. USD / month | Notes |
|---|---|---|---|
| EC2 `t3.micro` (2 vCPU burst, 1 GiB) | 1 instance | ~8 | Tight but workable with swap; `t3.small` (2 GiB) is ~16 |
| Public IPv4 (Elastic IP, attached) | 1 | ~3.6 | AWS charges for every public IPv4 address, at about USD 0.005/hour |
| EBS gp3 root volume | 20 GiB | ~1.8 | Holds OS, images and the Postgres volume |
| EBS snapshots / S3 backups | a few GiB | < 0.5 | |
| CloudWatch Logs | < 1 GiB ingest | ~0–1 | Short retention (7–14 days) keeps this low |
| CloudWatch alarms | ≤ 10 | ~0–1 | First 10 standard alarms are free |
| SSM Run Command, Parameter Store (standard) | — | 0 | |
| Data transfer out | small | ~0 | First 100 GB/month to internet is free across AWS |
| **Total** | | **≈ USD 14/month** (≈ USD 0.47/day) | `terraform destroy` brings this to ~0 |

**Deliberately avoided:** NAT Gateway (~USD 30+), Application Load Balancer (~USD 16+), RDS (~USD 15+),
EKS (~USD 73 control plane), Secrets Manager per-secret fees.

**Cost controls:** AWS Budget with email alerts at USD 5 / 10 / 20 (alerts warn you, **they don't stop spending**), resource tags
`Project=splitsmart`, and the instance can be stopped when unused (EIP + EBS still bill while stopped).

## Risk register

| Risk | Mitigation |
|---|---|
| ~~Project in a OneDrive-synced folder~~ | Resolved 2026-10-20: moved to `C:\dev\splitsmart` |
| Secrets leak to Git | `.gitignore`, `.env.example` only, pre-commit review of every diff, secret scan in Phase 8 |
| Surprise AWS bill | Budget alerts, no NAT/ALB, explicit approval before every `apply`, teardown guide |
| Losing Terraform state | Keep backups of `terraform.tfstate`; document S3 remote state |
| 1 GiB RAM too small | Swap file in bootstrap; images built in CI (never on the instance); upgrade to `t3.small` if needed |
| Laptop Jenkins offline | Documented limitation; manual deploy script works without Jenkins |
