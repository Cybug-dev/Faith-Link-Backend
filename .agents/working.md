# Working Log — Faith-Link-Backend

## Current State
✅ Membership hierarchy built + verified on temp branch. Next: user OK to apply migration to production (pending Neon migration id e8e84bb7-cb24-4665-8b59-3085010708e1, temp branch br-weathered-voice-b4n16spe) + `neon deploy`; then frontend wiring. Older pending: Vercel env vars + FE redeploy (needs user OK).

## Handoff
- ✅ [2026-10-19] Verified: tsc clean; all 7 suites pass on temp branch; DB constraint + backfill checks; 13-step e2e service run (scratch script, not in repo). Fixed during verification: Drizzle wraps pg errors (`membership.ts:isUniqueViolation`), directory memberCount subquery bound to wrong `id`. Placed permissions in `src/services/church-permissions.ts` (plan said `src/auth/`). Do not re-read: church-permissions.ts, membership.ts, church.ts (verified).
- (done) [2026-10-19] Membership hardening. Files: `src/db/schema.ts`, `drizzle/0002_membership_hierarchy.sql`, `src/auth/church-permissions.ts` (new), `src/middleware/tenant.ts:requireChurchPermission`, `src/services/membership.ts` (new), `src/routes/church.ts`, `src/validation/church.ts`, `src/routes/lesson.ts|quiz.ts` (named permissions), `src/routes/profile.ts` (isPrimaryAdmin), `src/index.ts` (CORS PATCH), tests. Change: primary-admin flag, role labels, role/remove/leave/rejoin, directory, PATCH church, primary transfer. Prod migration + deploy need user OK.
- ✅ [2026-10-16] POST /api/auth/password-reset (`src/routes/auth.ts`): Zod body + password rule (`src/validation/auth.ts`), proxies Neon Auth `/email-otp/reset-password` with a trusted Origin, maps errors to FE codes, then best-effort Resend email (`src/services/email.ts`, REST, no SDK). `neon.ts` env RESEND_API_KEY/RESEND_FROM read from the deploy shell. Verified: tsc clean, `test/auth.test.ts` 4/4 (fetch mocked). Not deployed: run `neon deploy` with RESEND_API_KEY exported (needs user OK). Sandbox sender delivers only to the Resend account owner.
- ✅ [2026-10-15] Prod Neon Auth trusted domain `https://faithlinkwebapp.vercel.app` added (verified: origin accepted, others INVALID_ORIGIN). `neon.ts` CORS now Vercel + localhost. FE `auth-client.ts` uses `@neondatabase/auth` (sign up/in, email OTP verify+resend, Google, OTP password reset via `emailOtp.sendVerificationOtp(type forget-password)` + `emailOtp.resetPassword`). SDK throws AuthApiError (not {data,error}); OTP errors = `validation_failed` + message. 55 FE tests, build OK.
- ✅ [2026-10-14] FE↔BE local wiring: CORS allowlist `src/config/cors.ts:parseAllowedOrigins` + `src/index.ts` cors origin fn; value in `neon.ts` functions.api.env (`neon dev` ignores `.env.local` custom vars) + `dev.port` 8787; `npm run dev` = `neon dev`. FE: Vite strictPort 5173, `.env.example`, `.env.local` (VITE_API_BASE_URL, VITE_NEON_AUTH_URL). Verified: tsc clean; curl preflight from 5173 → allow-origin, other origin → none; 401 carries allow-origin; parser edge cases throw. `neon deploy` not run (prod still `*` until deployed).
- ✅ Neon Auth production (br-soft-butterfly-b482q79w): OTP verification required, sent on sign-up/sign-in, auto sign-in after verify (CLI `neon neon-auth config email-password update`).
- ✅ `src/middleware/auth.ts:requireAuth` 403s unless JWT `emailVerified === true` (Zod `verifiedClaimSchema`). `tsc --noEmit` clean. Not deployed (`neon deploy` pending).
- ✅ Verified on test branch `auth-link-test` (br-gentle-hill-b40xewcx, base ep-winter-moon-b4ngz6hr): real JWT has `emailVerified`; unverified sign-in 403; duplicate sign-up creates no row. Test users authtest1/2@example.com live only on that branch.
- ✅ Added login-screen UX guidance (Google-only users) to auth-and-profile.md.
- ✅ Google-link tested live (ecybug@gmail.com): verified→links (credential+google, 1 user); unverified→`account_not_linked`, no takeover. Docs updated. Remaining: ask user before deleting branch auth-link-test; `neon deploy` not run.
- (done, kept for context) Google-link leg (needs user's Gmail; user must add `https://ep-winter-moon-b4ngz6hr.neonauth.c-6.us-east-2.aws.neon.tech/neondb/auth/callback/google` to Google Cloud redirect URIs) + pre-hijack test. Then ask user before deleting the test branch.
- ✅ Google: own client ID/secret set via MCP (type standard). Secret was pasted in chat; never written to files. Redirect URI `{NEON_AUTH_BASE_URL}/callback/google` must be registered in Google Cloud (user to confirm).
- (superseded 2026-10-15: Vercel domain added) Trusted domains empty, allow_localhost on. Frontend not built/hosted yet; add origin(s) when known; turn off localhost for prod. `list_auth_trusted_domains` 404'd with branch name; use branch id.
- ✅ Frontend auth contract documented in auth-and-profile.md.
- ✅ Docs: auth-and-profile.md, DECISIONS (ADR 006-007), CHANGELOG, PROJECT_CONTEXT doc map. AGENTS.md §2 "locate, don't browse" rule added.
- Do not re-read: managed-auth.md, email-verification docs (done).
- Last completed: Phase 6 (achievements, streaks, stats endpoints; deployed).
- Do not re-read: Phases 0–6 areas (live, tested, deployed).
- Next action: grep `docs/AI/FAITHLINK_MVP_ARCHITECTURE_PLAN.md` for the Phase 7 heading; read that section only.

## Open risks
- `localhost:5173` will ship in the deployed CORS allowlist (neon.ts env is static per branch). Low risk (Bearer auth, no cookies); replace with hosted origin before launch, same time as turning off Neon Auth allow_localhost. | needs decision at launch
- NEXT_TASKS cites plan "§13" for Phase 7; plan numbering unverified. Plan wins. | needs decision
- PROJECT_CONTEXT Doc Map says NEXT_TASKS has "Phase 6–7 upcoming"; Phase 6 is done. | needs doc fix
- DECISIONS.md uses ADR format, not AGENTS §3 one-line format. | needs decision
- Not a git repo; PROJECT_CONTEXT's mandatory `git diff` check can't run. | needs decision

## Tasks
### [2026-10-13 00:12–00:26] Phase 6 — Results, Progress & Achievements
- **Files:** `src/db/schema.ts`, `src/services/progress.ts`, `src/routes/profile.ts`, `src/services/quiz.ts`, `src/routes/lesson.ts`, `test/progress-achievements.test.ts`, `docs/AI/*`
- **Goal:** Progress tracking, server-authoritative achievements, streak calculator, aggregated stats
- **Change:** `user_achievements` schema + migration, `progress.ts` with 5 milestones, `GET /api/me/progress|achievements|stats`
- **Status:** ✅ 6 tests passing, deployed to Neon Cloud

### Older
- ✅ Phase 5: Bible Quiz Engine (authoring + attempts/scoring, 25 tests)
- ✅ Phase 4: Learning Content (lessons + completions)
- ✅ Phases 1–3: Auth, tenancy, profiles, RBAC

## Edge cases
| Case | Impact | Status |
| :--- | :--- | :--- |
| Duplicate achievement unlock | Duplicate DB rows | Handled (unique index user_id, achievement_key) |
| Streak date gaps | Wrong streak count | Handled (diff over distinct activity dates) |
| User with zero activity | Null / divide-by-zero | Handled (safe defaults) |
| Duplicate working.md at project root | Stale-log risk | Handled (merged here, root copy removed) |
| Church with no active admin at backfill | No primary admin for that church | Unhandled (impossible today: creation always adds an admin; prod had 0 churches) |
| Primary admin loses account access | Church unmanageable for transfers | Manual support action (LIMITATION, ADR 013) |
| Removed user wants back in | Cannot self-rejoin; no invite flow yet | Needs future invite/approval flow |
| Leaders lose lesson authoring | Behavior change for existing leader accounts | Handled (ADR 011, user role split) |
