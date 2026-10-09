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

## Active & Upcoming Work (FaithLink MVP Roadmap)
- [ ] Phase 4: Learning Content / Lessons
  - Schema for `lessons`, `lesson_completions` scoped to church tenant.
  - Endpoints: `GET /api/churches/:id/lessons`, `GET /api/churches/:id/lessons/:lessonId`.
  - Admin/Pastor/Leader authoring: `POST /api/churches/:id/lessons`, `PUT /api/churches/:id/lessons/:lessonId`.
  - Member lesson completion tracking: `POST /api/churches/:id/lessons/:lessonId/complete`.
- [ ] Phase 5: Quizzes & Question Engine
  - Schema for `quizzes`, `quiz_questions`, `quiz_options`.
  - Authoring and retrieval endpoints for quizzes.
- [ ] Phase 6: Submissions & Scoring
  - Student quiz submission processing, answer scoring, and feedback.
- [ ] Phase 7: Progress & Gamification (Leaderboards & Points).

