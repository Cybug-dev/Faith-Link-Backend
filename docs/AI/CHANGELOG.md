# Changelog — FaithLink Backend

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

