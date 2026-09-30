# Architecture Decisions Record (ADR) — FaithLink Backend

## ADR 001: TypeScript & Neon Serverless Functions
* **Decision**: Build with TypeScript deployed as Neon Serverless Functions in `neon.ts`.
* **Reason**: Co-located with PostgreSQL, auto-scaling, fast cold starts, and automated branch deployment.

## ADR 002: Neon Auth for Identity Management
* **Decision**: Use Neon Auth (Managed Better Auth) for core auth and session handling.
* **Reason**: Production-ready security, isolated branch data, and built-in email handling in `neon_auth`.

## ADR 003: Strict Schema Separation (`neon_auth` vs `public`)
* **Decision**: Keep application tables in `public` referencing `neon_auth.user(id)`.
* **Reason**: Protects managed auth schema integrity while allowing flexible domain modeling.

## ADR 004: Neon Object Storage for Media
* **Decision**: Use Neon Object Storage instead of external providers (Cloudinary).
* **Reason**: Zero third-party dependency, branches with the database.

## ADR 005: Drizzle ORM + `node-postgres` (`pg`)
* **Decision**: Choose Drizzle ORM over Prisma 7.x for database access and migrations.
* **Reason**: Zero engine overhead, sub-millisecond query compilation, minimal memory (<5MB vs 30-60MB per isolate), native Neon connection pooling via `@neon/functions`, and first-class atomic SQL support for concurrency.
