/**
 * Church-scoped authorization rules — the single source of truth for what each
 * system role may do inside one church. Pure functions only (no DB), so routes,
 * middleware, and tests all share the same rules.
 *
 * Roles are fixed; churches may rename them for display (`churches.role_labels`)
 * without changing anything here.
 */

export const CHURCH_ROLES = ["admin", "pastor", "leader", "member"] as const;
export type ChurchRole = (typeof CHURCH_ROLES)[number];

const ALL_ROLES: readonly ChurchRole[] = CHURCH_ROLES;

export const CHURCH_PERMISSIONS = {
  "church.update": ["admin"],
  "members.view": ALL_ROLES,
  "members.remove": ["admin"],
  "roles.assign": ["admin", "pastor"],
  "lessons.manage": ["admin", "pastor"],
  "quizzes.manage": ["admin", "pastor", "leader"],
} as const satisfies Record<string, readonly ChurchRole[]>;

export type ChurchPermission = keyof typeof CHURCH_PERMISSIONS;

/** Granted only to the church's primary admin, never through a role. */
export const PRIMARY_ADMIN_PERMISSION = "primary.transfer";

/** Roles a pastor may move people between. */
const PASTOR_ASSIGNABLE: readonly ChurchRole[] = ["member", "leader"];

export type MemberRef = {
  userId: string;
  role: string;
  isPrimaryAdmin: boolean;
};

export type RuleResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "INVALID_ROLE"
        | "SELF_CHANGE_NOT_ALLOWED"
        | "PRIMARY_ADMIN_PROTECTED"
        | "NOT_PERMITTED"
        | "USE_LEAVE"
        | "PRIMARY_ADMIN_MUST_TRANSFER";
      message: string;
    };

const allow: RuleResult = { ok: true };

export function isChurchRole(value: unknown): value is ChurchRole {
  return typeof value === "string" && (CHURCH_ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: string, permission: ChurchPermission): boolean {
  return (CHURCH_PERMISSIONS[permission] as readonly string[]).includes(role);
}

/** Every permission the viewer holds in this church, for the frontend to render from. */
export function permissionsFor(role: string, isPrimaryAdmin: boolean): string[] {
  const granted: string[] = (Object.keys(CHURCH_PERMISSIONS) as ChurchPermission[]).filter((p) =>
    hasPermission(role, p)
  );
  if (isPrimaryAdmin) granted.push(PRIMARY_ADMIN_PERMISSION);
  return granted;
}

/**
 * Can `actor` change `target`'s role to `newRole`? Both must already be active
 * members of the same church (the caller guarantees this).
 * Rules: nobody changes their own role; the primary admin's role is untouchable;
 * admins may assign any role; pastors only move people between member and leader.
 */
export function canAssignRole(actor: MemberRef, target: MemberRef, newRole: string): RuleResult {
  if (!isChurchRole(newRole)) {
    return { ok: false, code: "INVALID_ROLE", message: `Role must be one of: ${CHURCH_ROLES.join(", ")}` };
  }
  if (actor.userId === target.userId) {
    return { ok: false, code: "SELF_CHANGE_NOT_ALLOWED", message: "You cannot change your own role" };
  }
  if (target.isPrimaryAdmin) {
    return {
      ok: false,
      code: "PRIMARY_ADMIN_PROTECTED",
      message: "The primary admin's role can only change through a primary admin transfer",
    };
  }
  if (actor.role === "admin") return allow;
  if (
    actor.role === "pastor" &&
    PASTOR_ASSIGNABLE.includes(target.role as ChurchRole) &&
    PASTOR_ASSIGNABLE.includes(newRole)
  ) {
    return allow;
  }
  return { ok: false, code: "NOT_PERMITTED", message: "You do not have permission to assign this role" };
}

/** Can `actor` remove `target` from the church? Admins only; never the primary admin or yourself. */
export function canRemoveMember(actor: MemberRef, target: MemberRef): RuleResult {
  if (actor.userId === target.userId) {
    return { ok: false, code: "USE_LEAVE", message: "Use the leave endpoint to leave a church yourself" };
  }
  if (target.isPrimaryAdmin) {
    return { ok: false, code: "PRIMARY_ADMIN_PROTECTED", message: "The primary admin cannot be removed" };
  }
  if (!hasPermission(actor.role, "members.remove")) {
    return { ok: false, code: "NOT_PERMITTED", message: "You do not have permission to remove members" };
  }
  return allow;
}

/** The primary admin must hand the role over before leaving, so a church is never left without one. */
export function canLeave(member: MemberRef): RuleResult {
  if (member.isPrimaryAdmin) {
    return {
      ok: false,
      code: "PRIMARY_ADMIN_MUST_TRANSFER",
      message: "Transfer the primary admin role to another member before leaving",
    };
  }
  return allow;
}
