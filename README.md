# SplitSmart — Cloud-Deployed Expense Splitter

SplitSmart lets a group of people record shared expenses, see who owes whom, and settle up with the fewest
payments. The app is intentionally simple. The project's focus is on **how it is built, tested, shipped and
run in the cloud**: Docker, Terraform on AWS, a Jenkins CI/CD pipeline, HTTPS, monitoring and rollback.

> **Status:** Phase 0 (planning). No application code or cloud resources exist yet. See [PROGRESS.md](PROGRESS.md).

## Features (planned)
- Register / log in (bcrypt-hashed passwords, httpOnly cookie session)
- Create groups and add members by email
- Record expenses: payer, participants, equal split (amounts stored in integer paise)
- Per-member balances and a simplified "who pays whom" settlement plan
- Record settlements; full expense history
- Strict authorization: you only see groups you belong to

## Tech stack
| Area | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Node.js, Express, TypeScript, zod, node-pg-migrate |
| Database | PostgreSQL 16 |
| Testing | Vitest, Supertest |
| Containers | Docker (multi-stage), Docker Compose, Caddy |
| CI/CD | Jenkins Declarative Pipeline, GitHub, GHCR, Trivy |
| Cloud / IaC | AWS EC2, VPC, IAM, Security Groups, Systems Manager, CloudWatch, Terraform |

## Documentation
| Doc | What's in it |
|---|---|
| [ARCHITECTURE.md](ARCHITECTURE.md) | Diagrams, request & deploy flows, network design, limitations, production evolution |
| [PROJECT_PLAN.md](PROJECT_PLAN.md) | Phases, prerequisites, cost estimate, risks |
| [DECISIONS.md](DECISIONS.md) | Why each technology was chosen and what alternatives were rejected |
| [PROGRESS.md](PROGRESS.md) | Current phase, test results, blockers |

## Quick start
_Added in Phase 1 (local) and Phase 2 (Docker)._
