# Feature: Quizzes & Question Engine (Phase 5)

## Summary
Tenant-scoped quiz authoring and delivery engine for FaithLink. Supports
multi-question quizzes with ordered answer options, role-based authoring,
draft/published/archived status, and optional lesson linkage.

## Scope
- Church-scoped quizzes with optional link to a parent lesson
- Ordered questions with ordered answer options per question
- Soft-delete on quizzes and questions (hard-delete on options)
- Role-based authoring guard: `admin`, `pastor`, `leader` only
- Members (all roles) can browse and read published quizzes
- Scoring seams prepared for Phase 6: `passingScore`, `pointValue`, `isCorrect`

## Database Tables
| Table | Notes |
|---|---|
| `quizzes` | Church-scoped, `lessonId` optional FK, `deletedAt` soft-delete |
| `quiz_questions` | `quizId` FK cascade, `pointValue`, `deletedAt` soft-delete |
| `quiz_options` | `questionId` FK cascade, `isCorrect` flag, hard-deleted with parent |

## API Endpoints
| Method | Path | Auth | Roles |
|---|---|---|---|
| GET | `/api/churches/:id/quizzes` | JWT | All members |
| GET | `/api/churches/:id/quizzes/:quizId` | JWT | All members |
| POST | `/api/churches/:id/quizzes` | JWT | admin / pastor / leader |
| PUT | `/api/churches/:id/quizzes/:quizId` | JWT | admin / pastor / leader |
| DELETE | `/api/churches/:id/quizzes/:quizId` | JWT | admin / pastor / leader |

## Files Created / Modified
- `src/db/schema.ts` — added `quizzes`, `quizQuestions`, `quizOptions` tables + types
- `src/validation/quiz.ts` — Zod schemas: `createQuizSchema`, `updateQuizSchema`, `quizIdParamSchema`
- `src/services/quiz.ts` — service layer: `listQuizzes`, `getQuiz`, `createQuiz`, `updateQuiz`, `softDeleteQuiz`
- `src/routes/quiz.ts` — Hono router with all 5 endpoints
- `src/index.ts` — mounted `quizRouter` at `/api/churches`
- `test/quiz.test.ts` — 14 integration + unit tests (all passing)

## Design Decisions
- **Service layer introduced** (new pattern vs. Phase 4): quiz creation/update
  involves 3 tables in a transaction; inline route logic would exceed the
  single-purpose unit rule. Service is thin — no interface — just functions.
- **Full-replace strategy for question updates**: client sends the complete
  desired question set; missing questions are soft-deleted. Simpler than
  a patch-by-ID API for a nested resource.
- **Options hard-replaced per question on update**: options have no stable
  client-visible identity; replace-on-update is safe and simpler.
- **Soft-delete on quizzes and questions**: Phase 6 attempt records will
  reference quiz/question IDs; hard-deleting them would orphan those records.
- **`lessonId` optional FK with `ON DELETE SET NULL`**: deleting a lesson
  does not cascade-delete quizzes; quizzes remain usable independently.

## Phase 6 Seams
| Field | Location | Purpose |
|---|---|---|
| `passingScore` | `quizzes` | % threshold for pass/fail scoring |
| `pointValue` | `quiz_questions` | Weighted scoring per question |
| `isCorrect` | `quiz_options` | Answer validation for scoring |
| `deletedAt` | `quizzes`, `quiz_questions` | Preserves rows for attempt audit |
