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
