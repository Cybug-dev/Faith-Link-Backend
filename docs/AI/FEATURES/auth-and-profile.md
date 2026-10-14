# Feature: Authentication, Multi-Tenancy & User Profile Foundation

## Status
Implemented & Verified

## Goal
Establish the foundational multi-tenant data layer and profile schema in PostgreSQL for FaithLink, linking application profiles to Neon Auth identities and setting up Drizzle ORM with connection pooling.

## User Experience / Behavior
- Users authenticate via Neon Auth: Google sign-in, or email/password with mandatory OTP email verification (cannot sign in until verified).
- Authenticated users access protected endpoints via Bearer JWT; `requireAuth` returns 403 if the JWT `emailVerified` claim is not `true`.
- Sign-up, sign-in, OTP and Google flows run on Neon-managed Auth (client SDK); the backend only verifies JWTs.
- Each user has a profile in `public.profiles`.
- Users belong to churches (`public.churches`) with specific roles (`member`, `leader`, `pastor`, `admin`) via `public.church_members`.

## Architecture
- **Identity Layer**: Neon Auth (`neon_auth` schema).
- **Compute Layer**: Neon Serverless Functions running Node.js 24 with Hono web-standard router.
- **Data Layer**: Drizzle ORM + `node-postgres` (`pg`) with module-scoped pool attached via `@neon/functions`.
- **Application Schema**: `public` schema contains `profiles`, `churches`, and `church_members`.

## Frontend Auth Contract (Neon Managed Auth — no custom backend auth endpoints)
Frontend uses `@neondatabase/auth` (`createAuthClient(NEON_AUTH_BASE_URL)`; env `NEON_AUTH_BASE_URL` from `neon env pull`). Calls return `{ data, error }`.
- Sign up: `signUp.email({ email, password, name })` → OTP emailed.
- Verify: `emailOtp.verifyEmail({ email, otp })`; resend: `sendVerificationEmail({ email, callbackURL })`. Codes expire in 15 min.
- Sign in: `signIn.email({ email, password })` (blocked until verified); Google: `signIn.social({ provider: "google", callbackURL })`.
- Session / out: `getSession()`, `signOut()`. API token: `token()` → send as `Authorization: Bearer <data.token>` to `/api/*`.
- Google redirect URI (registered in Google Cloud): `{NEON_AUTH_BASE_URL}/callback/google`. `callbackURL` origins must be in Neon trusted domains.

## API Endpoints
- `GET /health`: Health check endpoint returning status and service timestamp.
- `GET /api/me`: Returns authenticated user identity, profile, and church memberships.
- `PUT /api/me`: Upserts current user profile.

## Database Changes (Applied to Neon Production)
- `public.profiles`:
  - `user_id`: text (PK, references `neon_auth.user.id`)
  - `display_name`: varchar(100)
  - `bio`: text
  - `avatar_url`: text
  - `phone_number`: varchar(25)
  - `created_at`: timestamp with timezone
  - `updated_at`: timestamp with timezone
- `public.churches`:
  - `id`: uuid (PK)
  - `name`: varchar(255)
  - `slug`: varchar(100) (unique)
  - `description`: text
  - `logo_url`: text
  - `address`: text
  - `city`: varchar(100)
  - `country`: varchar(100)
  - `created_at`: timestamp with timezone
  - `updated_at`: timestamp with timezone
- `public.church_members`:
  - `id`: uuid (PK)
  - `church_id`: uuid (FK -> `churches.id`, cascade)
  - `user_id`: text (FK -> `profiles.user_id`, cascade)
  - `role`: varchar(50) (default 'member')
  - `status`: varchar(50) (default 'active')
  - `joined_at`: timestamp with timezone
  - Composite unique constraint on `(church_id, user_id)`

## Environment / Secrets
- `DATABASE_URL`: Injected pooled connection string for queries.
- `DATABASE_URL_UNPOOLED`: Injected direct connection string for migrations.
- `NEON_AUTH_JWKS_URL`: Injected JWKS URL for JWT verification.
- `NEON_AUTH_BASE_URL`: Injected base URL for Neon Auth.

## Files / Modules
- `src/db/schema.ts`: Drizzle schema definition.
- `src/db/index.ts`: Database connection & pool initialization.
- `src/middleware/auth.ts`: JWT verification middleware via `jose`.
- `src/routes/profile.ts`: Profile and session endpoints.
- `src/index.ts`: Main Hono application and global middleware.
- `drizzle.config.ts`: Drizzle kit migration configuration.
- `neon.ts`: Neon IaC linking `api` function to `src/index.ts`.

## Validation & Security
- Strict multi-tenancy: Composite index on `(church_id, user_id)` ensures unique memberships.
- Bearer JWT verification against remote JWKS (`NEON_AUTH_JWKS_URL`).
- Connection pool limits (`max: 5`) to prevent Postgres connection exhaustion in serverless isolates.

## Tests & Verification
- `GET /health` verified live returning `{ status: "ok", service: "faith-link-backend" }`.
- `GET /api/me` verified returning `401 Unauthorized` when called without token.
- TypeScript typecheck passed with zero errors (`tsc --noEmit`).

## Current State
Deployed and verified on branch `production`.

## Next Steps
1. Church tenant CRUD and joining endpoints (`/api/churches`).
2. Role-based authorization middleware for leaders and pastors.
