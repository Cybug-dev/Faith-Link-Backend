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

### Behavior verified on a test branch (2026-10-14)
- JWT payload carries camelCase `emailVerified` (boolean) plus `sub`, `email`, `name`, `role`; it expires ~15 min after issue (re-call `token()`).
- Unverified sign-in → `403 { code: "EMAIL_NOT_VERIFIED" }`; frontend should route to the OTP screen.
- Sign-up returns `token: null` until the email is verified.
- Duplicate email sign-up returns `200` with a decoy user (anti-enumeration) and creates nothing; the existing password is untouched. Do not treat a 200 sign-up as "account created", show "check your email for a code".
- DB guarantees: `neon_auth.user.email` is UNIQUE; sign-in methods are rows in `neon_auth.account` (`credential`, `google`) under one user, so one email = one user = one `profiles` row.
- Google sign-in on a password-registered email: if that email is verified it links to the same user (tested: one user, `credential`+`google` accounts); if unverified it is refused with `?error=account_not_linked` and nothing is linked. Frontend: show "verify your email first or sign in with your password". Google never uses the password, so passwords can't conflict. A Google-only user adds a password via reset-password.

### Login screen UX guidance (Google-only users have no app password)
Neon returns the same "invalid credentials" error for an unknown email and for an email with no password, so the backend cannot (and must not) reveal which. Handle it in the frontend:
1. Remember the last successful method (`google` | `email`) in local storage; show that button first with a "Last used" tag.
2. On failed email login show: "Wrong email or password. Signed up with Google? Use Continue with Google, or reset your password."
3. Put "Continue with Google" above the email/password form.
4. Optional: offer "Add a password" in settings for Google users via the reset-password flow (untested). Never force a password at Google sign-up.

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
- `CORS_ALLOWED_ORIGINS`: comma-separated exact browser origins, set in `neon.ts` (not a secret). Unset = no cross-origin access. Currently `https://faithlinkwebapp.vercel.app` + `http://localhost:5173`. Same Vercel origin is a Neon Auth trusted domain (production). Password reset is OTP-based (`emailOtp.sendVerificationOtp` type `forget-password`, then `emailOtp.resetPassword`).

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
