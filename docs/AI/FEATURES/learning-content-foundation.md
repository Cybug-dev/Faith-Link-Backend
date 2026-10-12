# Feature: Learning Content & Progress Engine (Phase 4)

## Status
Completed & Verified

## Goal
Provide church-scoped spiritual learning content with role-based authoring, member progress/completion tracking, and global user progress retrieval for FaithLink MVP.

## User Experience / Behavior
- **Discover & List Lessons**: Members of a church can list published spiritual lessons. Church leaders (admin, pastor, leader) can also view draft and archived lessons.
- **View Lesson**: Members can retrieve lesson content and see whether they have completed it. Draft lessons cannot be viewed by standard members.
- **Author Lessons**: Church leaders can create lessons with title, unique slug within church, markdown content, summary, and ordering.
- **Edit Lessons**: Church leaders can update lesson metadata, content, and publishing status (`draft`, `published`, `archived`).
- **Complete Lessons**: Members can mark a lesson as completed. Subsequent completions are idempotent.
- **User Progress**: Authenticated users can retrieve all completed lessons across churches via `GET /api/me/progress`.

## Architecture
- **Framework**: Hono on Neon Serverless Functions (Node.js 24).
- **ORM**: Drizzle ORM on PostgreSQL with connection pooling.
- **Multi-Tenancy Guard**: `requireTenantRole` middleware enforcing church boundary isolation.
- **Validation**: Strict Zod schemas for lesson creation, updating, and route parameters.

## API Endpoints
- `GET /api/churches/:id/lessons`: Lists lessons for church members, enriched with user completion state.
- `GET /api/churches/:id/lessons/:lessonId`: Retrieves single lesson details and completion state.
- `POST /api/churches/:id/lessons`: Creates a lesson (guarded by `requireTenantRole(['admin', 'pastor', 'leader'])`).
- `PUT /api/churches/:id/lessons/:lessonId`: Updates a lesson (guarded by `requireTenantRole(['admin', 'pastor', 'leader'])`).
- `POST /api/churches/:id/lessons/:lessonId/complete`: Marks a lesson as completed for the authenticated user.
- `GET /api/me/progress`: Retrieves global lesson completions and progress for the authenticated user.

## Database Schema Usage
- `public.lessons`: `id`, `church_id`, `title`, `slug`, `summary`, `content`, `status`, `order_index`, `created_by`, `created_at`, `updated_at`.
  - Composite unique index on `(church_id, slug)`.
- `public.lesson_completions`: `id`, `lesson_id`, `user_id`, `church_id`, `completed_at`.
  - Composite unique index on `(lesson_id, user_id)`.

## Tests & Verification
- Unit & integration tests in `test/lesson.test.ts` (10 passing tests):
  - 401 Unauthorized verification on unauthenticated access across all endpoints.
  - Zod validation tests on payloads and RFC 4122 UUID parameters.
  - Multi-tenant role rejection on non-members (403 Forbidden).
- Regression suite `test/church.test.ts` (9 passing tests).
- Compilation verified with `tsc --noEmit` (exit code 0).
- Live deployment verified on Neon Cloud (`https://br-soft-butterfly-b482q79w-api.compute.c-6.us-east-2.aws.neon.tech/`).
