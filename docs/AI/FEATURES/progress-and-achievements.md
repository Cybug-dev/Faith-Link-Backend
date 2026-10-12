# Feature: Results, Progress & Achievements (Phase 6)

## Summary
Enriches the learning feedback loop by providing unified member progress, engagement streak calculation, and a server-authoritative achievement engine for milestone awards.

## Scope
- Server-authoritative achievement engine with 5 deterministic milestones
- Learning streak calculation tracking consecutive calendar days of active learning
- Unified member progress combining completed lessons, completed quizzes, best scores, and chronological activity
- Aggregated user learning metrics (lessons count, quiz count, average percentage, perfect scores, streak)

## Database Tables
| Table | Description |
|---|---|
| `user_achievements` | Records user badge unlocks (`userId`, `achievementKey`, `unlockedAt`). Enforced with unique composite index `(user_id, achievement_key)`. |

## Predefined Achievements
1. `first_lesson_completed` — Completed your first lesson in FaithLink.
2. `first_quiz_completed` — Completed your first quiz assessment.
3. `perfect_score` — Achieved a 100% score on a quiz.
4. `completed_5_lessons` — Demonstrated diligence by finishing 5 lessons.
5. `completed_10_quizzes` — Demonstrated mastery by finishing 10 quizzes.

## API Endpoints
| Method | Path | Auth | Roles | Description |
|---|---|---|---|---|
| GET | `/api/me/progress` | JWT | Member | Unified learning & quiz progress, streaks, best quiz scores, and recent activity feed |
| GET | `/api/me/achievements` | JWT | Member | List of unlocked and available achievements with criteria and badges |
| GET | `/api/me/stats` | JWT | Member | Summary statistics (total lessons, quizzes, average score, streaks) |

## Verification & Tests
- Automated tests in `test/progress-achievements.test.ts` verifying authentication guards, streak calculation edge cases, achievement criteria, and endpoint security.
