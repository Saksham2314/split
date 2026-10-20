# SplitSmart — Cloud-Deployed Expense Splitter

SplitSmart lets a group of people record shared expenses, see who owes whom, and settle up with the fewest
payments. The app is intentionally simple. The project's focus is on **how it is built, tested, shipped and
run in the cloud**: Docker, Terraform on AWS, a Jenkins CI/CD pipeline, HTTPS, monitoring and rollback.

> **Status:** Phase 1 (local application). No cloud resources exist yet. See [PROGRESS.md](PROGRESS.md).

## Features
- Register / log in (bcrypt-hashed passwords, httpOnly cookie session), or **Continue with Google** (OAuth 2.0 + PKCE)
- Create groups and add members by email
- Record expenses: payer, participants, equal split (amounts stored in integer paise)
- Per-member balances and a simplified "who pays whom" settlement plan
- Record settlements; full expense history
- Strict authorization: you only see groups you belong to
- Animated dark UI: springy page transitions, live balance counters, emoji bursts and confetti, toasts and confirm dialogs. Honours the OS "reduce motion" setting

## Tech stack
| Area | Technology |
|---|---|
| Frontend | React, Vite, TypeScript, Tailwind CSS, Motion (animations) |
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

## Quick start (local development, Windows PowerShell)

Prerequisites: Node.js 20+, Docker Desktop (running).

```powershell
# 1. Install all dependencies for both apps (npm workspaces, exact versions from package-lock.json)
npm ci

# 2. Start PostgreSQL in Docker (bound to 127.0.0.1:5432; data kept in a named volume)
docker compose -f deploy/docker-compose.yml up -d

# 3. Create your local API config and give it a random JWT secret
Copy-Item apps/api/.env.example apps/api/.env
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"   # paste into JWT_SECRET in apps/api/.env

# 4. Create the database tables
npm run migrate

# 5. Run the API (http://localhost:3000) and the web app (http://localhost:5173) in two terminals
npm run dev:api
npm run dev:web
```

Open http://localhost:5173, register two accounts (e.g. in a normal and a private window), create a group,
add the second account by email and start adding expenses.

### Optional: Sign in with Google
1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type *Web application*.
2. Add the authorised redirect URI `http://localhost:5173/api/auth/google/callback` (in production: `https://<your-domain>/api/auth/google/callback`).
3. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `apps/api/.env` (and set `APP_URL` if the site isn't on `http://localhost:5173`), then restart the API.

Without these the Google button stays visible, and clicking it explains that Google sign-in isn't enabled on the server.

### Checks (the same ones CI will run)
```powershell
npm run lint        # ESLint, both apps
npm run typecheck   # TypeScript, both apps
npm test            # unit tests + API tests (API tests need the Postgres container running)
npm run build       # production builds
```

## API overview
All routes are under `/api`. Everything except auth and health requires the session cookie.
Non-members get **404** for a group's routes, so the API doesn't reveal that the group exists.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health/live` | Liveness: process is up |
| GET | `/api/health` | Readiness: process + database reachable (503 if not) |
| POST | `/api/auth/register` · `/login` · `/logout` | Account and session |
| GET | `/api/auth/me` | Current user |
| GET | `/api/auth/providers` | Which sign-in options are enabled (`{ google: bool }`) |
| GET | `/api/auth/google` → `/callback` | Google OAuth: redirect to Google, then back with a session cookie |
| GET / POST | `/api/groups` | List my groups / create a group |
| GET | `/api/groups/:id` | Group with members |
| POST | `/api/groups/:id/members` | Add a registered user by email |
| GET / POST | `/api/groups/:id/expenses` | History / add an equal-split expense (amounts in paise) |
| DELETE | `/api/groups/:id/expenses/:expenseId` | Delete an expense |
| GET | `/api/groups/:id/balances` | Net balance per member + suggested settlement transfers |
| GET / POST | `/api/groups/:id/settlements` | List / record a payment between members |
