# Next Tasks — FaithLink Backend

## Completed Work
- [x] Phases 1–3: Auth, tenancy, profiles, church CRUD, membership, JWT middleware.
- [x] Phase 4: Learning Content — `lessons`, `lesson_completions`, CRUD routes, completion tracking, `GET /api/me/progress`, 10 tests, deployed.
- [x] Phase 5: Bible Quiz Engine
  - Authoring: `quizzes`, `quiz_questions`, `quiz_options` (soft-delete, `passingScore`, `pointValue`, `isCorrect`).
  - Attempts & Answers: `quiz_attempts`, `quiz_answers` (tenant-scoped, foreign keys, timestamps, attempt states).
  - Anti-cheating: sensitive `isCorrect` hidden on member preview.
  - Endpoints: `POST /api/churches/:id/quizzes/:quizId/attempts`, `GET /api/churches/:id/attempts/:attemptId`, `POST /api/churches/:id/attempts/:attemptId/answers`, `POST /api/churches/:id/attempts/:attemptId/complete`, `GET /api/me/quiz-history`, `GET /api/churches/:id/quizzes/:quizId/attempts`.
  - Service layer with transactional scoring, 25 tests passing (14 quiz + 11 attempts), deployed to Neon Cloud.

- [x] Phase 6: Results, Progress & Achievements
  - Schema: `user_achievements` (unlocked milestones per user).
  - Service: `src/services/progress.ts` (achievement evaluation, streak calculation, unified activity).
  - Endpoints: `GET /api/me/progress`, `GET /api/me/achievements`, `GET /api/me/stats`.
  - Automated test suite `test/progress-achievements.test.ts` (6 tests passing), deployed to Neon Cloud.

## Active & Upcoming Work (FaithLink MVP Roadmap)
- [x] Membership hierarchy: migration applied to production and deployed (2026-10-19).
- [ ] Frontend: wire My Church to `/api/me`, `GET /api/churches`, church view `viewer.permissions`, members list, role labels.
- [ ] Later membership work: approval-based joining / invite codes, groups & departments with group-level roles, inactive-owner succession.
- [ ] Phase 7: Leaderboard / Scoreboard (per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §13)
  - Church & community leaderboard aggregation.
  - Endpoint: `GET /api/churches/:id/leaderboard` (timeframes: all-time, monthly, weekly; points/percentage ranking).
  - Privacy & teen safety rules: display names only, option to opt out or show initials.
- [ ] Phase 8: Activities & Events (per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §14)
- [ ] Phase 9: MVP Integration & Hardening (per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §15)




