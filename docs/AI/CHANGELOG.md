# Changelog — FaithLink Backend

## [2026-10-14] Auth Hardening — Email Verification & Google OAuth
- Neon Auth (branch `production`): email/password now requires OTP email verification before sign-in (`neon neon-auth config email-password update`).
- `src/middleware/auth.ts`: `requireAuth` returns 403 when JWT `emailVerified` is not `true` (Zod-validated claim).
- Google OAuth switched to our own Google client ID/secret on `production` (see DECISIONS ADR 007).
- Documented frontend auth contract in `FEATURES/auth-and-profile.md`.
- Verified on a test branch: real JWT has `emailVerified`; unverified sign-in returns 403 `EMAIL_NOT_VERIFIED`; duplicate email creates no second user (ADR 008).

## [2026-10-13] Phase 6 — Results, Progress & Achievements
- Added `user_achievements` table in Drizzle schema with unique index `(user_id, achievement_key)` and applied migration to Neon PostgreSQL.
- Implemented `src/services/progress.ts` with:
  - 5 deterministic MVP achievement definitions (`first_lesson_completed`, `first_quiz_completed`, `perfect_score`, `completed_5_lessons`, `completed_10_quizzes`).
  - Learning streak calculation tracking consecutive active days with date normalization.
  - Server-authoritative achievement evaluation triggered on quiz/lesson completions and progress reads.
  - Chronological unified recent activity feed across lessons and quizzes.
- Implemented and mounted endpoints:
  - `GET /api/me/progress` (unified lessons + quizzes + streak + best scores + recent activity)
  - `GET /api/me/achievements` (unlocked state and available badges)
  - `GET /api/me/stats` (aggregated user learning metrics)
- Created integration test suite `test/progress-achievements.test.ts` (all 6 tests passing).
- Deployed updated serverless function to Neon Cloud.

## [2026-10-12] Phase 5 — Bible Quiz Engine (Authoring + Attempts & Scoring)
- Part 1 (Authoring): Created `quizzes`, `quiz_questions`, `quiz_options` with Zod validation, transactional service layer, role guards, and endpoints under `/api/churches/:id/quizzes`.
- Part 2 (Attempts & Scoring):
  - Created `quiz_attempts` and `quiz_answers` tables in Drizzle schema and pushed migration to Neon PostgreSQL.
  - Implemented anti-cheating sanitization removing `isCorrect` from member-facing quiz views.
  - Added attempt lifecycle endpoints:
    - `POST /api/churches/:id/quizzes/:quizId/attempts` (start attempt)
    - `GET /api/churches/:id/attempts/:attemptId` (inspect attempt & answers)
    - `POST /api/churches/:id/attempts/:attemptId/answers` (record/upsert answer idempotently)
    - `POST /api/churches/:id/attempts/:attemptId/complete` (authoritative scoring & threshold check)
    - `GET /api/me/quiz-history` (member attempt history)
    - `GET /api/churches/:id/quizzes/:quizId/attempts` (leader attempt oversight)
  - Added 11 integration tests in `test/quiz-attempts.test.ts` (all passing).
  - Deployed to Neon Serverless Cloud (`production` branch).

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



## [2026-10-14]
- CORS: `origin: "*"` replaced by exact-origin allowlist (`src/config/cors.ts`, `neon.ts` env `CORS_ALLOWED_ORIGINS=http://localhost:5173`). ADR 008.
- Local dev: `npm run dev` runs `neon dev` on port 8787. Verified preflight allow/block and 401 carrying CORS headers. Not deployed yet.
