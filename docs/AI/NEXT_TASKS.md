# Next Tasks — FaithLink Backend

## Completed Work
- [x] Phases 1–3: Auth, tenancy, profiles, church CRUD, membership, JWT middleware.
- [x] Phase 4: Learning Content — `lessons`, `lesson_completions`, CRUD routes, completion tracking, `GET /api/me/progress`, 10 tests, deployed.
- [x] Phase 5: Quizzes & Question Engine
  - Schema: `quizzes` (soft-delete, `passingScore` seam), `quiz_questions` (`pointValue` seam, soft-delete), `quiz_options` (`isCorrect` flag).
  - Service layer: `src/services/quiz.ts` (transactional create, full-replace update, soft-delete).
  - Endpoints: `GET /api/churches/:id/quizzes`, `GET …/:quizId`, `POST`, `PUT`, `DELETE` (soft).
  - Authoring guard: `admin / pastor / leader` only.
  - 14 tests passing. `tsc --noEmit` clean. Deployed to Neon Cloud.

## Active & Upcoming Work (FaithLink MVP Roadmap)
- [ ] Phase 6: Submissions & Scoring
  - Schema: `quiz_attempts`, `quiz_answers` (linked to `quizzes` and `quiz_questions`).
  - Endpoint: `POST /api/churches/:id/quizzes/:quizId/submit` — validate answers, compute score vs `passingScore`, record attempt.
  - Endpoint: `GET /api/churches/:id/quizzes/:quizId/attempts` — leader view of all attempts.
  - Endpoint: `GET /api/me/quiz-attempts` — member view of own attempts and scores.
- [ ] Phase 7: Progress & Gamification (Leaderboards & Points).



