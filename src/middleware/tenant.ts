import { createMiddleware } from "hono/factory";
import { eq, and } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import { churchMembers, type ChurchMember } from "../db/schema.js";
import type { AuthContext } from "./auth.js";
import { CHURCH_PERMISSIONS, type ChurchPermission } from "../services/church-permissions.js";

const uuidSchema = z.string().uuid();

export type TenantContext = AuthContext & {
  Variables: AuthContext["Variables"] & {
    churchId: string;
    memberRole: string;
    membership: ChurchMember;
  };
};

/**
 * Reusable tenant authorization guard.
 * Verifies that the authenticated user is an active member of the target church
 * and holds one of the required roles (e.g. ['admin', 'pastor', 'leader']).
 */
export function requireTenantRole(allowedRoles: string[]) {
  return createMiddleware<TenantContext>(async (c, next) => {
    const userId = c.get("userId");
    if (!userId) {
      return c.json({ error: "Unauthorized: Missing authentication context" }, 401);
    }

    const churchId = c.req.param("id") || c.req.param("churchId");
    if (!churchId) {
      return c.json({ error: "Bad Request: Missing church identifier parameter" }, 400);
    }

    const uuidValidation = uuidSchema.safeParse(churchId);
    if (!uuidValidation.success) {
      return c.json({ error: "Bad Request: Invalid church ID format (must be a valid UUID)" }, 400);
    }

    const [membership] = await db
      .select()
      .from(churchMembers)
      .where(
        and(
          eq(churchMembers.churchId, churchId),
          eq(churchMembers.userId, userId),
          eq(churchMembers.status, "active")
        )
      )
      .limit(1);

    if (!membership) {
      return c.json(
        { error: "Forbidden: You are not an active member of this church" },
        403
      );
    }

    if (!allowedRoles.includes(membership.role)) {
      return c.json(
        {
          error: "Forbidden: Insufficient church permissions",
          requiredRoles: allowedRoles,
          currentRole: membership.role,
        },
        403
      );
    }

    c.set("churchId", churchId);
    c.set("memberRole", membership.role);
    c.set("membership", membership);

    await next();
  });
}

/** Tenant guard by named action, so routes never hardcode role lists. */
export function requireChurchPermission(permission: ChurchPermission) {
  return requireTenantRole([...CHURCH_PERMISSIONS[permission]]);
}
