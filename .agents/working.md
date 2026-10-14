# Working Log — Faith-Link-Backend

## Current State
Auth hardening ⚠️ partly done. Waiting on user: Google client ID/secret, frontend origin(s) for trusted domains. Then Phase 7.

## Handoff
- ✅ Neon Auth production (br-soft-butterfly-b482q79w): OTP verification required, sent on sign-up/sign-in, auto sign-in after verify (CLI `neon neon-auth config email-password update`).
- ✅ `src/middleware/auth.ts:requireAuth` 403s unless JWT `emailVerified === true` (Zod `verifiedClaimSchema`). `tsc --noEmit` clean. Not deployed (`neon deploy` pending).
- ⚠️ Unverified: `emailVerified` claim name/presence in a real Neon JWT (only seen in docs example). If absent, all users get 403. Check with a real token before deploy.
- ✅ Google: own client ID/secret set via MCP (type standard). Secret was pasted in chat; never written to files. Redirect URI `{NEON_AUTH_BASE_URL}/callback/google` must be registered in Google Cloud (user to confirm).
- ⏳ Trusted domains empty, allow_localhost on. Frontend not built/hosted yet; add origin(s) when known; turn off localhost for prod. `list_auth_trusted_domains` 404'd with branch name; use branch id.
- ✅ Frontend auth contract documented in auth-and-profile.md.
- ✅ Docs: auth-and-profile.md, DECISIONS (ADR 006-007), CHANGELOG, PROJECT_CONTEXT doc map. AGENTS.md §2 "locate, don't browse" rule added.
- Do not re-read: managed-auth.md, email-verification docs (done).
- Last completed: Phase 6 (achievements, streaks, stats endpoints; deployed).
- Do not re-read: Phases 0–6 areas (live, tested, deployed).
- Next action: grep `docs/AI/FAITHLINK_MVP_ARCHITECTURE_PLAN.md` for the Phase 7 heading; read that section only.

## Open risks
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
