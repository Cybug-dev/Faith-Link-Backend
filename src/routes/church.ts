import { Hono, type Context } from "hono";
import { eq, and } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { z } from "zod";
import { db } from "../db/index.js";
import { churches, churchMembers } from "../db/schema.js";
import { requireAuth, type AuthContext } from "../middleware/auth.js";
import { requireChurchPermission, requireTenantRole } from "../middleware/tenant.js";
import {
  createChurchSchema,
  churchIdParamSchema,
  updateChurchSchema,
  listChurchesQuerySchema,
  paginationQuerySchema,
  membershipIdParamSchema,
  updateMemberRoleSchema,
  primaryTransferSchema,
} from "../validation/church.js";
import { CHURCH_ROLES, permissionsFor } from "../services/church-permissions.js";
import {
  acceptPrimaryTransfer,
  cancelPrimaryTransfer,
  changeMemberRole,
  createChurch,
  defaultDisplayName,
  getPendingTransferFor,
  joinChurch,
  leaveChurch,
  listChurches,
  listMembers,
  offerPrimaryTransfer,
  removeMember,
  updateChurch,
  type ServiceError,
} from "../services/membership.js";

export const churchRouter = new Hono<AuthContext>();

const ALL_MEMBER_ROLES = [...CHURCH_ROLES];

let cachedJWKS: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJWKS() {
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!jwksUrl) return null;
  if (!cachedJWKS) {
    cachedJWKS = createRemoteJWKSet(new URL(jwksUrl));
  }
  return cachedJWKS;
}

/**
 * Helper to optionally verify a Bearer JWT without throwing 401 if unauthenticated.
 */
async function resolveOptionalUserId(authHeader?: string | null): Promise<string | null> {
  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  const token = authHeader.slice(7).trim();
  if (!token) return null;

  try {
    const keySet = getJWKS();
    if (!keySet) return null;
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const issuer = baseUrl ? new URL(baseUrl).origin : undefined;
    const { payload } = await jwtVerify(token, keySet, { issuer: issuer || undefined });
    return payload.sub || null;
  } catch {
    return null;
  }
}

const STATUS_PREFIX: Record<ServiceError["status"], string> = {
  400: "Bad Request",
  403: "Forbidden",
  404: "Not Found",
  409: "Conflict",
};

function serviceError(c: Context, e: ServiceError) {
  return c.json({ error: `${STATUS_PREFIX[e.status]}: ${e.message}`, code: e.code }, e.status);
}

function validationError(c: Context, what: string, error: z.ZodError) {
  return c.json(
    {
      error: `Validation Error: Invalid ${what}`,
      details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    },
    400
  );
}

async function readJsonBody(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/**
 * GET /api/churches
 * Public church directory. Optional `q` (name/city search), `limit` (≤50), `offset`.
 */
churchRouter.get("/", async (c) => {
  const query = listChurchesQuerySchema.safeParse(c.req.query());
  if (!query.success) return validationError(c, "query parameters", query.error);
  return c.json(await listChurches(query.data));
});

/**
 * POST /api/churches
 * Creates a church; the creator becomes admin + primary admin (atomic). Limited per user.
 */
churchRouter.post("/", requireAuth, async (c) => {
  const rawBody = await readJsonBody(c);
  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = createChurchSchema.safeParse(rawBody);
  if (!validation.success) return validationError(c, "church payload", validation.error);

  const result = await createChurch(c.get("userId"), defaultDisplayName(c.get("jwtPayload")), validation.data);
  if (!result.ok) return serviceError(c, result);

  return c.json({ message: "Church created successfully", ...result.data }, 201);
});

/**
 * GET /api/churches/:id
 * Public-safe view for visitors; full view for members, plus the viewer's role,
 * permissions, and any pending primary transfer involving them.
 */
churchRouter.get("/:id", async (c) => {
  const paramValidation = churchIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!paramValidation.success) {
    return c.json({ error: "Bad Request: Invalid church ID format (must be a valid UUID)" }, 400);
  }

  const churchId = paramValidation.data.id;

  const [church] = await db.select().from(churches).where(eq(churches.id, churchId)).limit(1);

  if (!church) {
    return c.json({ error: "Not Found: Church not found" }, 404);
  }

  const optionalUserId = await resolveOptionalUserId(c.req.header("authorization"));

  if (optionalUserId) {
    const [membership] = await db
      .select({
        role: churchMembers.role,
        isPrimaryAdmin: churchMembers.isPrimaryAdmin,
        joinedAt: churchMembers.joinedAt,
      })
      .from(churchMembers)
      .where(
        and(
          eq(churchMembers.churchId, churchId),
          eq(churchMembers.userId, optionalUserId),
          eq(churchMembers.status, "active")
        )
      )
      .limit(1);

    if (membership) {
      return c.json({
        church,
        viewer: {
          isMember: true,
          role: membership.role,
          isPrimaryAdmin: membership.isPrimaryAdmin,
          joinedAt: membership.joinedAt,
          permissions: permissionsFor(membership.role, membership.isPrimaryAdmin),
          pendingPrimaryTransfer: await getPendingTransferFor(churchId, optionalUserId),
        },
      });
    }
  }

  return c.json({
    church: {
      id: church.id,
      name: church.name,
      slug: church.slug,
      description: church.description,
      logoUrl: church.logoUrl,
      city: church.city,
      country: church.country,
      roleLabels: church.roleLabels,
      createdAt: church.createdAt,
    },
    viewer: {
      isMember: false,
    },
  });
});

/**
 * PATCH /api/churches/:id
 * Edits church profile fields and display-only role labels. Admins only. Slug is not editable.
 */
churchRouter.patch("/:id", requireAuth, requireChurchPermission("church.update"), async (c) => {
  const rawBody = await readJsonBody(c);
  const validation = updateChurchSchema.safeParse(rawBody);
  if (!validation.success) return validationError(c, "church update", validation.error);

  const church = await updateChurch(c.req.param("id"), validation.data);
  return c.json({ church });
});

/**
 * POST /api/churches/:id/join
 * Joins as `member` (role is never client-specified). A user who left is reactivated.
 */
churchRouter.post("/:id/join", requireAuth, async (c) => {
  const paramValidation = churchIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!paramValidation.success) {
    return c.json({ error: "Bad Request: Invalid church ID format (must be a valid UUID)" }, 400);
  }

  const result = await joinChurch(
    paramValidation.data.id,
    c.get("userId"),
    defaultDisplayName(c.get("jwtPayload"))
  );
  if (!result.ok) return serviceError(c, result);

  const { churchName, membership, rejoined } = result.data;
  return c.json(
    { message: `Successfully ${rejoined ? "rejoined" : "joined"} ${churchName}`, membership },
    rejoined ? 200 : 201
  );
});

/**
 * POST /api/churches/:id/leave
 * The caller leaves. The primary admin must transfer the role first (409).
 */
churchRouter.post("/:id/leave", requireAuth, requireTenantRole(ALL_MEMBER_ROLES), async (c) => {
  const result = await leaveChurch(c.req.param("id"), c.get("userId"));
  if (!result.ok) return serviceError(c, result);
  return c.json({ message: "You have left this church", membership: result.data });
});

/**
 * GET /api/churches/:id/members
 * Active member directory for members of this church. Paginated (`limit` ≤50, `offset`).
 */
churchRouter.get("/:id/members", requireAuth, requireChurchPermission("members.view"), async (c) => {
  const query = paginationQuerySchema.safeParse(c.req.query());
  if (!query.success) return validationError(c, "query parameters", query.error);

  const churchId = c.req.param("id");
  const page = await listMembers(churchId, query.data);
  return c.json({ churchId, membersCount: page.total, ...page });
});

/**
 * PATCH /api/churches/:id/members/:membershipId/role
 * Changes a member's role under the hierarchy rules in church-permissions.ts.
 */
churchRouter.patch(
  "/:id/members/:membershipId/role",
  requireAuth,
  requireChurchPermission("roles.assign"),
  async (c) => {
    const param = membershipIdParamSchema.safeParse({ membershipId: c.req.param("membershipId") });
    if (!param.success) return validationError(c, "membership ID", param.error);

    const body = updateMemberRoleSchema.safeParse(await readJsonBody(c));
    if (!body.success) return validationError(c, "role payload", body.error);

    const result = await changeMemberRole(
      c.req.param("id"),
      c.get("userId"),
      param.data.membershipId,
      body.data.role
    );
    if (!result.ok) return serviceError(c, result);
    return c.json({ membership: result.data });
  }
);

/**
 * DELETE /api/churches/:id/members/:membershipId
 * Removes a member (soft: status `removed`). Admins only; never the primary admin.
 */
churchRouter.delete(
  "/:id/members/:membershipId",
  requireAuth,
  requireChurchPermission("members.remove"),
  async (c) => {
    const param = membershipIdParamSchema.safeParse({ membershipId: c.req.param("membershipId") });
    if (!param.success) return validationError(c, "membership ID", param.error);

    const result = await removeMember(c.req.param("id"), c.get("userId"), param.data.membershipId);
    if (!result.ok) return serviceError(c, result);
    return c.json({ message: "Member removed", membership: result.data });
  }
);

/**
 * POST /api/churches/:id/primary-transfer
 * The primary admin offers the role to another active member (expires in 7 days).
 */
churchRouter.post(
  "/:id/primary-transfer",
  requireAuth,
  requireTenantRole(ALL_MEMBER_ROLES),
  async (c) => {
    const body = primaryTransferSchema.safeParse(await readJsonBody(c));
    if (!body.success) return validationError(c, "transfer payload", body.error);

    const result = await offerPrimaryTransfer(c.req.param("id"), c.get("userId"), body.data.membershipId);
    if (!result.ok) return serviceError(c, result);
    return c.json({ transfer: result.data }, 201);
  }
);

/**
 * POST /api/churches/:id/primary-transfer/accept
 * The recipient accepts; flags swap atomically and the former primary admin stays an admin.
 */
churchRouter.post(
  "/:id/primary-transfer/accept",
  requireAuth,
  requireTenantRole(ALL_MEMBER_ROLES),
  async (c) => {
    const result = await acceptPrimaryTransfer(c.req.param("id"), c.get("userId"));
    if (!result.ok) return serviceError(c, result);
    return c.json({ message: "You are now the primary admin of this church", transfer: result.data });
  }
);

/**
 * POST /api/churches/:id/primary-transfer/cancel
 * The primary admin withdraws the offer, or the recipient declines it.
 */
churchRouter.post(
  "/:id/primary-transfer/cancel",
  requireAuth,
  requireTenantRole(ALL_MEMBER_ROLES),
  async (c) => {
    const result = await cancelPrimaryTransfer(c.req.param("id"), c.get("userId"));
    if (!result.ok) return serviceError(c, result);
    return c.json({ message: "Transfer cancelled", transfer: result.data });
  }
);
