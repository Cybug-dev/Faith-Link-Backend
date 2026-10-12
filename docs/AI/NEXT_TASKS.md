# Next Tasks — FaithLink Backend

## Completed Work
- [x] Initialized Drizzle ORM dependencies (`drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@neon/functions`).
- [x] Created multi-tenant database schema in `src/db/schema.ts` (`profiles`, `churches`, `church_members`).
- [x] Pushed database schema to Neon Postgres `production` branch.
- [x] Implemented Hono API router and JWT auth guard verifying `NEON_AUTH_JWKS_URL`.
- [x] Implemented MVP endpoints: `GET /health`, `GET /api/me`, `PUT /api/me`.
- [x] Deployed and verified function on Neon Cloud.
- [x] Added Zod validation schemas for church payloads and UUID params (`src/validation/church.ts`).
- [x] Implemented church tenant foundation endpoints (`POST /api/churches`, `GET /api/churches/:id`, `POST /api/churches/:id/join`, `GET /api/churches/:id/members`).
- [x] Implemented reusable tenant authorization guard `requireTenantRole` (`src/middleware/tenant.ts`).
- [x] Created and verified 9 automated unit/integration test cases in `test/church.test.ts`.
- [x] Deployed updated `api` function to Neon Cloud compute and verified live endpoints.
- [x] Phase 4: Learning Content / Lessons
  - Schema for `lessons`, `lesson_completions` scoped to church tenant with foreign keys and unique constraints.
  - Endpoints: `GET /api/churches/:id/lessons`, `GET /api/churches/:id/lessons/:lessonId`.
  - Authoring & management: `POST /api/churches/:id/lessons`, `PUT /api/churches/:id/lessons/:lessonId` (guarded by `requireTenantRole(['admin', 'pastor', 'leader'])`).
  - Member lesson completion tracking: `POST /api/churches/:id/lessons/:lessonId/complete` (idempotent).
  - Global progress tracking: `GET /api/me/progress`.
  - Created automated test suite `test/lesson.test.ts` (10 tests passing).
  - Deployed to Neon Serverless Cloud and verified live.

## Active & Upcoming Work (FaithLink MVP Roadmap)
- [ ] Phase 5: Quizzes & Question Engine
  - Schema for `quizzes`, `quiz_questions`, `quiz_options` (scoped to church tenant and optional lesson link).
  - Endpoints: `GET /api/churches/:id/quizzes`, `GET /api/churches/:id/quizzes/:quizId`.
  - Admin/Pastor/Leader quiz authoring: `POST /api/churches/:id/quizzes`, `PUT /api/churches/:id/quizzes/:quizId`.
- [ ] Phase 6: Submissions & Scoring
  - Student quiz submission processing, answer scoring, and feedback.
- [ ] Phase 7: Progress & Gamification (Leaderboards & Points).


