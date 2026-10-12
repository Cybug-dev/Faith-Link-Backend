# Changelog — FaithLink Backend

## [2026-10-12] Phase 5 — Quizzes & Question Engine
- Extended `src/db/schema.ts` with `quizzes`, `quiz_questions`, `quiz_options` tables (soft-delete, scoring seams for Phase 6).
- Applied migration directly to Neon `production` branch via MCP `run_sql_transaction`.
- Created Zod validation in `src/validation/quiz.ts` (createQuizSchema, updateQuizSchema, quizIdParamSchema).
- Created service layer `src/services/quiz.ts` with transactional create, full-replace update, soft-delete.
- Created `src/routes/quiz.ts` with GET list, GET detail, POST create, PUT update, DELETE (soft) — all guarded by `requireAuth` + `requireTenantRole`.
- Mounted `quizRouter` at `/api/churches` in `src/index.ts`.
- All 14 integration tests passing (`test/quiz.test.ts`). `tsc --noEmit` clean (exit 0).
- Deployed to Neon Serverless Cloud; live endpoints verified.

## [2026-09-28]
- Initialized Neon project `crimson-forest-33142254` (branch `production`).
- Enabled Neon Auth and deployed initial `api` serverless function.
- Pulled branch connection strings and credentials into `.env.local`.

## [2026-09-30]
- Aligned architecture to TypeScript + Neon Functions + Neon Auth.
- Selected Drizzle ORM + `node-postgres` as primary data layer (ADR 005).
- Created core AI documentation under `docs/AI/`.

## [2026-10-07]
- Installed and configured Drizzle ORM, `pg`, `@neon/functions`, `hono`, and `jose`.
- Created multi-tenant database schema (`profiles`, `churches`, `church_members`) in `public`.
- Pushed schema migrations to Neon PostgreSQL `production` branch.
- Replaced `hello.ts` with structured Hono API router in `src/index.ts` with CORS, logging, and global error handling.
- Implemented JWT authentication middleware (`src/middleware/auth.ts`) validating against `NEON_AUTH_JWKS_URL`.
- Implemented profile and membership routes (`src/routes/profile.ts` with `GET /api/me` and `PUT /api/me`).
- Successfully deployed updated `api` function to Neon Cloud.

## [2026-10-09]
- Added `zod` validation schemas for church creation and UUID parameter parsing (`src/validation/church.ts`).
- Implemented reusable multi-tenant authorization middleware `requireTenantRole` in `src/middleware/tenant.ts` with UUID validation and database membership/role checks.
- Implemented core church management endpoints in `src/routes/church.ts`:
  - `POST /api/churches`: Atomic transaction creating church and registering creator as `admin` in `church_members`. Handles slug collisions (409 Conflict).
  - `GET /api/churches/:id`: UUID validated, distinguishes public info from member-scoped details.
  - `POST /api/churches/:id/join`: Joins church with role strictly defaulted to `member`; duplicate join cleanly returns 409 Conflict.
  - `GET /api/churches/:id/members`: Returns roster for authorized church leaders using `requireTenantRole(['admin', 'pastor', 'leader'])`.
- Scoped `profileRouter.use("/me", requireAuth)` in `src/routes/profile.ts` to prevent middleware collision with public church endpoints.
- Added test suite `test/church.test.ts` with 9 automated integration checks covering unauthenticated requests, UUID format checks, not found errors, and tenant role authorization guards.
- Deployed to Neon Serverless Cloud (`production` branch) and verified live endpoints.

## [2026-10-12]
- Implemented Phase 4: Learning Content (Lessons & Progress Engine).
- Added `lessons` and `lesson_completions` tables to Drizzle schema (`src/db/schema.ts`) with multi-tenant foreign keys and composite unique indexes.
- Applied schema migration to Neon Postgres `production` branch.
- Added strict Zod schemas in `src/validation/lesson.ts` (`createLessonSchema`, `updateLessonSchema`, `lessonIdParamSchema`).
- Created lesson routes in `src/routes/lesson.ts`:
  - `GET /api/churches/:id/lessons`: Lists lessons for church members, enriches with user completion state, filters drafts for non-leaders.
  - `GET /api/churches/:id/lessons/:lessonId`: Fetches single lesson with completion state.
  - `POST /api/churches/:id/lessons`: Authoring endpoint guarded by `requireTenantRole(['admin', 'pastor', 'leader'])`.
  - `PUT /api/churches/:id/lessons/:lessonId`: Update endpoint guarded by `requireTenantRole(['admin', 'pastor', 'leader'])`.
  - `POST /api/churches/:id/lessons/:lessonId/complete`: Idempotent lesson completion tracking for church members.
- Added `GET /api/me/progress` in `src/routes/profile.ts` returning user learning completions across all churches.
- Scoped profile router auth with `profileRouter.use("/me/*", requireAuth)`.
- Created automated integration test suite in `test/lesson.test.ts` (10 tests passing).
- Deployed updated serverless function to Neon Cloud and verified live endpoints.


