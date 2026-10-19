# Feature: Membership Hierarchy & Church Authorization

## Status
Built and verified on a temporary migration branch (2026-10-19). **Not yet on production**: migration `drizzle/0002_membership_hierarchy.sql` and `neon deploy` both wait for the user's approval.

## Model
- **Account** (Neon Auth + `profiles`) is personal and exists before any church role.
- **Membership** (`church_members`) holds one role per church: `admin` | `pastor` | `leader` | `member`. A role in one church grants nothing in another.
- **Primary admin** (`church_members.is_primary_admin`) is a protection flag, not a role. Exactly one per church (partial unique index), and it must be an active admin (CHECK). The church creator gets it.
- **Role labels** (`churches.role_labels`, jsonb) are display-only renames such as `{ "leader": "Deacon" }`. Permissions always follow the system role.

## Permissions
Single source: `src/services/church-permissions.ts` (`CHURCH_PERMISSIONS`, `canAssignRole`, `canRemoveMember`, `canLeave`). Routes use `requireChurchPermission(action)` (`src/middleware/tenant.ts`).

| Action | Roles |
|---|---|
| church.update | admin |
| members.view | all |
| members.remove | admin (never the primary admin or yourself) |
| roles.assign | admin: any role; pastor: member↔leader only. Nobody changes their own role or the primary admin's |
| lessons.manage | admin, pastor |
| quizzes.manage | admin, pastor, leader |
| primary.transfer | primary admin only |

## API
- `GET /api/churches?q=&limit=&offset=` is the public directory. `q` searches name and city as a literal, case-insensitive match. Results include `memberCount`.
- `POST /api/churches` makes the creator admin + primary admin. Limit: primary admin of at most 3 churches (`MAX_PRIMARY_ADMIN_CHURCHES`), past which it returns 409 `CHURCH_LIMIT_REACHED`.
- `GET /api/churches/:id`: `viewer` includes `role`, `isPrimaryAdmin`, `permissions[]`, and `pendingPrimaryTransfer`. `roleLabels` is always included.
- `PATCH /api/churches/:id` edits the profile fields and `roleLabels` (the label map is replaced in full). Slug is not editable.
- `GET /api/churches/:id/members?limit=&offset=` is paginated and lists the primary admin first. Response includes `total`.
- `PATCH /api/churches/:id/members/:membershipId/role` takes `{ role }`.
- `DELETE /api/churches/:id/members/:membershipId` sets status to `removed`. Removed users cannot rejoin on their own (403 `REMOVED_FROM_CHURCH`).
- `POST /api/churches/:id/leave` sets status to `left`. The primary admin gets 409 `PRIMARY_ADMIN_MUST_TRANSFER`. `/join` reactivates a `left` row as `member`.
- `POST /api/churches/:id/primary-transfer` `{ membershipId }` → `/accept` (recipient) or `/cancel` (either party). Offers expire after 7 days, and only one can be pending per church. On accept, the flags swap in one transaction and the former primary admin stays an admin.
- Errors: `{ error, code }`. `/api/me` memberships list active rows only and include `isPrimaryAdmin` and `roleLabels`.

## Limitations
- LIMITATION: lost-account recovery for a primary admin is a manual FaithLink-support action, not in the app. An in-app successor claim for an inactive owner is deferred.
- LIMITATION: a removed user can only come back through a future invitation/approval flow, which does not exist yet.
- Deferred: approval-based joining, invite codes, groups/departments with group-level roles.

## Tests & Verification
- `test/church-permissions.test.ts` (rule unit tests) and `test/church.test.ts` (11 checks, including auth and validation on the new routes).
- All existing suites pass against the migrated schema.
- DB constraints were exercised on the temporary branch: second primary admin, non-admin primary admin, inactive primary admin, unknown role or status, and a second pending transfer were all rejected. The backfill picks the earliest admin.
- An end-to-end service run on the temporary branch passed (13 checks): self-promotion, primary-admin protection, tenant isolation, transfer flow, leave/rejoin/removed, directory, pagination, church limit, concurrent join.
