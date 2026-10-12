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

## Active & Upcoming Work (FaithLink MVP Roadmap)
- [ ] Phase 6: Results, Progress & Achievements (per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §12)
  - Results: Enriched score, correct/incorrect summary, completion status, basic performance feedback, optional explanations.
  - Progress: Aggregated learning activity (lessons completed, quizzes completed, best quiz scores, recent activity).
  - Achievements: Server-trusted awards (`First Lesson Completed`, `First Quiz Completed`, `Perfect Score`, `Completed 5 Lessons`, `Completed 10 Quizzes`).
  - Endpoints:
    - `GET /api/me/progress` (unified learning & quiz progress)
    - `GET /api/me/achievements` (user achievements list & unlocked state)
    - `GET /api/me/stats` (summary stats)
- [ ] Phase 7: Leaderboard / Scoreboard (`GET /api/churches/:id/leaderboard`, per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §13)
- [ ] Phase 8: Activities & Events (per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §14)
- [ ] Phase 9: MVP Integration & Hardening (per FAITHLINK_MVP_ARCHITECTURE_PLAN.md §15)




