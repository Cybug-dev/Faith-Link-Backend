import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "../db/index.js";
import { churches, churchMembers, profiles } from "../db/schema.js";
import { requireAuth, type AuthContext } from "../middleware/auth.js";
import { requireTenantRole, type TenantContext } from "../middleware/tenant.js";
import { createChurchSchema, churchIdParamSchema } from "../validation/church.js";

export const churchRouter = new Hono<AuthContext>();

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

/**
 * POST /api/churches
 * Creates a new church and assigns the authenticated creator as admin (atomic transaction).
 */
churchRouter.post("/", requireAuth, async (c) => {
  const userId = c.get("userId");
  const rawBody = await c.req.json().catch(() => null);

  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = createChurchSchema.safeParse(rawBody);
  if (!validation.success) {
    return c.json(
      {
        error: "Validation Error: Invalid church payload",
        details: validation.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      400
    );
  }

  const { name, slug, description, logoUrl, address, city, country } = validation.data;

  // Check slug availability prior to transaction
  const [existingSlug] = await db
    .select({ id: churches.id })
    .from(churches)
    .where(eq(churches.slug, slug))
    .limit(1);

  if (existingSlug) {
    return c.json({ error: "Conflict: A church with this slug already exists" }, 409);
  }

  const now = new Date();
  const jwtPayload = c.get("jwtPayload");
  const defaultDisplayName =
    (jwtPayload?.name as string) ||
    ((jwtPayload?.email as string)?.split("@")[0] ?? "User");

  try {
    const result = await db.transaction(async (tx) => {
      // 1. Ensure creator profile exists to satisfy foreign key constraint
      await tx
        .insert(profiles)
        .values({
          userId,
          displayName: defaultDisplayName,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();

      // 2. Create the church
      const [newChurch] = await tx
        .insert(churches)
        .values({
          name,
          slug,
          description: description || null,
          logoUrl: logoUrl || null,
          address: address || null,
          city: city || null,
          country: country || null,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // 3. Establish creator as admin member
      const [adminMembership] = await tx
        .insert(churchMembers)
        .values({
          churchId: newChurch.id,
          userId,
          role: "admin",
          status: "active",
          joinedAt: now,
        })
        .returning();

      return {
        church: newChurch,
        membership: adminMembership,
      };
    });

    return c.json(
      {
        message: "Church created successfully",
        church: result.church,
        membership: result.membership,
      },
      201
    );
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return c.json({ error: "Conflict: A church with this slug already exists" }, 409);
    }
    console.error("Failed to create church:", err);
    return c.json({ error: "Internal Server Error: Could not create church" }, 500);
  }
});

/**
 * GET /api/churches/:id
 * Fetches church information, distinguishing public-safe view from member view.
 */
churchRouter.get("/:id", async (c) => {
  const paramValidation = churchIdParamSchema.safeParse({ id: c.req.param("id") });
  if (!paramValidation.success) {
    return c.json({ error: "Bad Request: Invalid church ID format (must be a valid UUID)" }, 400);
  }

  const churchId = paramValidation.data.id;

  const [church] = await db
    .select()
    .from(churches)
    .where(eq(churches.id, churchId))
    .limit(1);

  if (!church) {
    return c.json({ error: "Not Found: Church not found" }, 404);
  }

  // Check if caller is authenticated and a member
  const optionalUserId = await resolveOptionalUserId(c.req.header("authorization"));
  let memberDetails: { isMember: boolean; role?: string; joinedAt?: Date } = { isMember: false };

  if (optionalUserId) {
    const [membership] = await db
      .select({
        role: churchMembers.role,
        status: churchMembers.status,
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
      memberDetails = {
        isMember: true,
        role: membership.role,
        joinedAt: membership.joinedAt,
      };
    }
  }

  // If member, return full details including address and member context
  if (memberDetails.isMember) {
    return c.json({
      church,
      viewer: memberDetails,
    });
  }

  // Public-safe view for non-members / unauthenticated visitors
  return c.json({
    church: {
      id: church.id,
      name: church.name,
      slug: church.slug,
      description: church.description,
      logoUrl: church.logoUrl,
      city: church.city,
      country: church.country,
      createdAt: church.createdAt,
    },
    viewer: {
      isMember: false,
    },
  });
});

/**
 * POST /api/churches/:id/join
 * Joins an existing church as a standard member (role cannot be client-specified).
 */
churchRouter.post("/:id/join", requireAuth, async (c) => {
  const userId = c.get("userId");
  const paramValidation = churchIdParamSchema.safeParse({ id: c.req.param("id") });

  if (!paramValidation.success) {
    return c.json({ error: "Bad Request: Invalid church ID format (must be a valid UUID)" }, 400);
  }

  const churchId = paramValidation.data.id;

  // 1. Verify church existence
  const [church] = await db
    .select({ id: churches.id, name: churches.name })
    .from(churches)
    .where(eq(churches.id, churchId))
    .limit(1);

  if (!church) {
    return c.json({ error: "Not Found: Church not found" }, 404);
  }

  // 2. Check for duplicate membership
  const [existingMembership] = await db
    .select()
    .from(churchMembers)
    .where(
      and(
        eq(churchMembers.churchId, churchId),
        eq(churchMembers.userId, userId)
      )
    )
    .limit(1);

  if (existingMembership) {
    return c.json(
      {
        error: "Conflict: You are already a member of this church",
        membership: {
          role: existingMembership.role,
          status: existingMembership.status,
          joinedAt: existingMembership.joinedAt,
        },
      },
      409
    );
  }

  const now = new Date();
  const jwtPayload = c.get("jwtPayload");
  const defaultDisplayName =
    (jwtPayload?.name as string) ||
    ((jwtPayload?.email as string)?.split("@")[0] ?? "User");

  try {
    // 3. Ensure profile exists for the user
    await db
      .insert(profiles)
      .values({
        userId,
        displayName: defaultDisplayName,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();

    // 4. Create membership strictly with role 'member'
    const [newMembership] = await db
      .insert(churchMembers)
      .values({
        churchId,
        userId,
        role: "member",
        status: "active",
        joinedAt: now,
      })
      .returning();

    return c.json(
      {
        message: `Successfully joined ${church.name}`,
        membership: newMembership,
      },
      201
    );
  } catch (err: unknown) {
    const pgError = err as { code?: string };
    if (pgError.code === "23505") {
      return c.json({ error: "Conflict: You are already a member of this church" }, 409);
    }
    console.error("Failed to join church:", err);
    return c.json({ error: "Internal Server Error: Could not join church" }, 500);
  }
});

/**
 * GET /api/churches/:id/members
 * Protected endpoint returning member directory, restricted to active church members.
 */
churchRouter.get(
  "/:id/members",
  requireAuth,
  requireTenantRole(["admin", "pastor", "leader", "member"]),
  async (c) => {
    const churchId = c.req.param("id");

    const memberList = await db
      .select({
        membershipId: churchMembers.id,
        role: churchMembers.role,
        status: churchMembers.status,
        joinedAt: churchMembers.joinedAt,
        user: {
          userId: profiles.userId,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        },
      })
      .from(churchMembers)
      .innerJoin(profiles, eq(churchMembers.userId, profiles.userId))
      .where(
        and(
          eq(churchMembers.churchId, churchId),
          eq(churchMembers.status, "active")
        )
      );

    return c.json({
      churchId,
      membersCount: memberList.length,
      members: memberList,
    });
  }
);
