- CRITICAL: Before starting or ending a task execution loop, the agent MUST run `git diff` to ensure no active open editor buffers have silently overwritten disk files with empty strings.

# Project Context — FaithLink Backend

## Purpose
FaithLink is a production-grade, multi-tenant digital engagement platform for churches, youth ministries, and communities.

## Core Tech Stack
- **Language**: TypeScript (Node.js 24)
- **Compute**: Neon Serverless Functions (`neon.ts`, web-standard fetch handlers)
- **Database**: PostgreSQL on Neon (Project: `crimson-forest-33142254`, branch: `production`)
- **ORM / Data Layer**: Drizzle ORM + `node-postgres` (`pg`) with connection pooling
- **Authentication**: Neon Auth (Managed Better Auth in `neon_auth` schema)
- **Storage**: Neon Object Storage (branch-scoped)
- **AI / MCP**: Neon MCP Server (`mcp.neon.tech`) + Neon Agent Skills
- **Validation**: Zod (all route boundaries)
- **Routing**: Hono (CORS + logger middleware, global error handler)

## Excluded Stacks
- No Express server or CommonJS
- No Cloudflare Workers
- No Cloudinary (using Neon Storage)

## Completed Phases
| Phase | Domain | Status |
|---|---|---|
| 0–3 | Auth, Profiles, Churches, Tenant RBAC | ✅ Live |
| 4 | Learning Content (lessons, completions, progress) | ✅ Live |
| 5 | Bible Quiz Engine (quizzes, questions, attempts, answers) | ✅ Live |
| 6 | Results, Progress & Achievements (streaks, stats, milestones) | ✅ Live |

## Active DB Tables (public schema)
`profiles`, `churches`, `church_members`, `lessons`, `lesson_completions`, `quizzes`, `quiz_questions`, `quiz_options`, `quiz_attempts`, `quiz_answers`, `user_achievements`

## Key Conventions
- Routes mounted at `/api/churches` for church-scoped resources
- All auth via `requireAuth` → `requireTenantRole(roles[])` middleware chain
- Service layer (`src/services/`) for multi-table transactions (introduced Phase 5)
- Soft-delete via `deletedAt` on `quizzes` and `quiz_questions`
- Test runner: `npx tsx test/<name>.test.ts`
- Deploy: `neon deploy` (targets `production` branch automatically)

## Doc Map
> Read a file only when the current task needs it. Do not read in full; use headings or line ranges.

### docs/AI/ (root)
| File | What it contains |
|---|---|
| `ARCHITECTURE.md` | Request/compute flow; DB schema boundaries; multi-tenancy & concurrency rules |
| `CHANGELOG.md` | Append-only release history by date (cold) |
| `DECISIONS.md` | ADR 001–007: stack, auth, schema separation, storage, ORM, email verification, auth providers |
| `FAITHLINK_MVP_ARCHITECTURE_PLAN.md` | Full product spec §1–36: phases 0–9, stable API map, data relationships, security model, error categories, boundaries (real-time, media, notifications, admin, safety, performance, retention, scope, expansion), DoD, change control |
| `NEXT_TASKS.md` | Completed phases summary + Phase 6–7 upcoming tasks |
| `PROJECT_CONTEXT.md` | This file — stable facts, conventions, doc map |

### docs/AI/FEATURES/
| File | What it contains |
|---|---|
| `README.md` | Index + status of all feature docs |
| `auth-and-profile.md` | Phase 1–3 auth, profiles, church membership: status, goal, UX, architecture, endpoints, DB schema, env, files, validation, tests, current state |
| `church-tenant-foundation.md` | Phase 2–3 church CRUD + RBAC: status, goal, UX, architecture, endpoints, DB, validation & security, tests |
| `learning-content-foundation.md` | Phase 4 lessons & progress: status, goal, UX, architecture, endpoints, DB, tests |
| `quizzes-question-engine.md` | Phase 5 quiz engine: summary, scope, DB tables, endpoints, files, design decisions, Phase 6 seams |
| `progress-and-achievements.md` | Phase 6 results, progress & achievements: summary, scope, DB tables, endpoints, milestones |
