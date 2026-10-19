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

## ADR 006: Mandatory Email Verification (OTP) + Backend Enforcement
* **Decision**: Email/password sign-in requires OTP email verification (Neon config). `requireAuth` additionally rejects JWTs whose `emailVerified` claim is not `true` (403).
* **Reason**: OTP works on shared and custom SMTP; backend check is defense in depth if Neon config is loosened. Google sign-ins arrive verified.

## ADR 007: Auth Email & Google OAuth Providers
* **Decision**: Shared Neon SMTP (`auth@mail.myneon.app`) for now; switch to custom SMTP before production launch. Google OAuth uses our own Google Cloud client ID/secret (configured 2026-10-14; secret held only in Neon).
* **Reason**: Neon requires custom SMTP and own OAuth apps for production; verification links also need custom SMTP.

## ADR 008: One Identity per Email (Implicit Google Linking)
* **Decision**: Rely on Neon Auth defaults: unique `user.email`, multiple `account` rows per user, Google sign-in links to the existing same-email user. No custom linking code.
* **Reason**: Verified live (duplicate sign-up creates nothing). Safe only because email/password requires verified email (ADR 006). Live-tested 2026-10-14: verified email + Google links to the same user (credential + google accounts); unverified email + Google is refused with `account_not_linked` (no takeover).

## ADR 008: Env-Driven CORS Allowlist in `neon.ts`
* **Decision**: Replace `origin: "*"` with an exact-origin allowlist (`CORS_ALLOWED_ORIGINS`, declared in `neon.ts` function `env`, parsed in `src/config/cors.ts`, fails closed). No credentials mode: the API uses Bearer tokens, not cookies. Local API on fixed port 8787 (`dev.port`), frontend pinned to 5173 (`strictPort`).
* **Reason**: `neon dev` injects only Neon-managed vars plus `neon.ts` env (not `.env.local`), and function env is static across branches, so `neon.ts` is the one place that drives both local and deployed CORS. Add the hosted frontend origin there and drop localhost before launch.

## ADR 008: Password reset completes through the backend
* **Decision**: The final reset call (email + code + new password) goes through `POST /api/auth/password-reset`, which calls Neon Auth and then sends a "password changed" email via Resend. Resend is called over REST (no SDK). Neon's own sender still delivers sign-up and reset codes until a domain is verified.
* **Reason**: Neon Auth has no webhook/event for a finished reset; the Resend sandbox sender only reaches the account owner, so it can't replace Neon's sender yet.

## ADR 009: Four fixed church roles + one protected primary admin (2026-10-19, user-approved)
* **Decision**: Roles stay `admin | pastor | leader | member`, enforced by DB CHECK. The church creator is an `admin` with `church_members.is_primary_admin = true`: exactly one per church (partial unique index), and it must be an active admin (CHECK). Nobody, including other admins, can demote, remove, or take this flag except through a two-step transfer (offer → recipient accepts). The primary admin cannot leave without transferring first.
* **Reason**: User chose 4 roles over a separate "owner" role. A flag gives founder protection without a 5th role and guarantees every church keeps an admin. The name is "primary", not "founder", because after a transfer the holder is not the founder.

## ADR 010: Church role labels are display-only
* **Decision**: `churches.role_labels` (jsonb, e.g. `{"leader":"Deacon"}`), edited by admins via `PATCH /api/churches/:id`. Authorization always uses the system role.
* **Reason**: User instruction: churches may rename roles, but each role's functions stay the same.

## ADR 011: Named permission map as the single authorization source
* **Decision**: `src/services/church-permissions.ts` maps actions to roles; routes use `requireChurchPermission(action)`. Lessons are managed by admin + pastor only (leaders lose lesson authoring); quizzes by admin + pastor + leader. Pastors may assign only member↔leader. `GET /api/churches/:id` returns `viewer.permissions` so the frontend renders from backend rules.
* **Reason**: User's role split: pastors handle Bible lessons, leaders handle quizzes. One map avoids role lists drifting apart across routes.

## ADR 012: Anti-spam on church creation is a per-user cap, not verification
* **Decision**: A user may be primary admin of at most 3 churches (`MAX_PRIMARY_ADMIN_CHURCHES`). No manual review or extra verification (email is already verified, ADR 006). Slug stays unique and non-editable.
* **Reason**: Least burdensome safeguard that stops mass creation. Review/verification can be added later if abuse appears.

## ADR 013: Membership hardening ahead of Phase 7
* **Decision**: Extend Phases 2–3 (membership/authorization) before starting Phase 7 (leaderboard). Status values `active | left | removed`: `left` users can rejoin as `member`, `removed` users cannot self-rejoin. Lost-account recovery for a primary admin is a manual support action for now.
* **Reason**: User instruction (2026-10-19). Leaderboards and church content depend on a sound membership model.
