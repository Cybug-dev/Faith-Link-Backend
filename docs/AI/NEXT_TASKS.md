# Next Tasks — FaithLink Backend

## Active Work
- [ ] Initialize Drizzle ORM dependencies (`drizzle-orm`, `drizzle-kit`, `pg`, `@types/pg`, `@neon/functions`).
- [ ] Create initial schema in `src/db/schema.ts` (`profiles`, `churches`, `church_members`).
- [ ] Setup Neon Function router and JWT auth guard verifying `NEON_AUTH_JWKS_URL`.
- [ ] Implement MVP endpoint: `GET /api/me` (authenticated user session and profile).
