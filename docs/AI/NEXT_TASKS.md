# Next Tasks — FaithLink Backend

## Completed Work
- [x] Initialized Drizzle ORM dependencies (`drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@neon/functions`).
- [x] Created multi-tenant database schema in `src/db/schema.ts` (`profiles`, `churches`, `church_members`).
- [x] Pushed database schema to Neon Postgres `production` branch.
- [x] Implemented Hono API router and JWT auth guard verifying `NEON_AUTH_JWKS_URL`.
- [x] Implemented MVP endpoints: `GET /health`, `GET /api/me`, `PUT /api/me`.
- [x] Deployed and verified function on Neon Cloud.

## Active & Upcoming Work
- [ ] Implement church tenant endpoints (`POST /api/churches`, `GET /api/churches/:id`, `GET /api/churches/:id/members`).
- [ ] Implement church membership joining and role authorization guard (`requireRole(['admin', 'pastor', 'leader'])`).
- [ ] Add input validation schemas (Zod or Valibot) for request payloads.
- [ ] Integrate test harness (Vitest) for endpoint integration tests.
