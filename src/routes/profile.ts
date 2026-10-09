import { Hono } from "hono";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { profiles, churchMembers, churches } from "../db/schema.js";
import { requireAuth, type AuthContext } from "../middleware/auth.js";

export const profileRouter = new Hono<AuthContext>();

profileRouter.use("/me", requireAuth);

/**
 * GET /api/me
 * Retrieves authenticated user identity, application profile, and church memberships.
 */
profileRouter.get("/me", async (c) => {
  const userId = c.get("userId");

  // Fetch application profile
  const [userProfile] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  // Fetch church memberships
  const memberships = await db
    .select({
      membershipId: churchMembers.id,
      role: churchMembers.role,
      status: churchMembers.status,
      joinedAt: churchMembers.joinedAt,
      church: {
        id: churches.id,
        name: churches.name,
        slug: churches.slug,
        logoUrl: churches.logoUrl,
      },
    })
    .from(churchMembers)
    .innerJoin(churches, eq(churchMembers.churchId, churches.id))
    .where(eq(churchMembers.userId, userId));

  return c.json({
    user: {
      id: userId,
      ...c.get("jwtPayload"),
    },
    profile: userProfile || null,
    memberships,
  });
});

/**
 * PUT /api/me
 * Upserts profile information for the authenticated user.
 */
profileRouter.put("/me", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body !== "object") {
    return c.json({ error: "Invalid JSON request body" }, 400);
  }

  const { displayName, bio, avatarUrl, phoneNumber } = body as {
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    phoneNumber?: string;
  };

  if (displayName !== undefined && (typeof displayName !== "string" || !displayName.trim())) {
    return c.json({ error: "displayName cannot be empty" }, 400);
  }

  const now = new Date();

  // Upsert profile
  const [updatedProfile] = await db
    .insert(profiles)
    .values({
      userId,
      displayName: displayName?.trim() || "User",
      bio: bio?.trim() || null,
      avatarUrl: avatarUrl?.trim() || null,
      phoneNumber: phoneNumber?.trim() || null,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: profiles.userId,
      set: {
        ...(displayName !== undefined ? { displayName: displayName.trim() } : {}),
        ...(bio !== undefined ? { bio: bio.trim() || null } : {}),
        ...(avatarUrl !== undefined ? { avatarUrl: avatarUrl.trim() || null } : {}),
        ...(phoneNumber !== undefined ? { phoneNumber: phoneNumber.trim() || null } : {}),
        updatedAt: now,
      },
    })
    .returning();

  return c.json({
    message: "Profile updated successfully",
    profile: updatedProfile,
  });
});
