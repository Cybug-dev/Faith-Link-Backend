import { Hono } from "hono";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { profiles, churchMembers, churches, lessonCompletions, lessons } from "../db/schema.js";
import { requireAuth, type AuthContext } from "../middleware/auth.js";
import { getUserQuizHistory } from "../services/quiz.js";
import {
  getUserProgress,
  getUserAchievements,
  getUserStats,
} from "../services/progress.js";

export const profileRouter = new Hono<AuthContext>();

profileRouter.use("/me", requireAuth);
profileRouter.use("/me/*", requireAuth);

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
      isPrimaryAdmin: churchMembers.isPrimaryAdmin,
      status: churchMembers.status,
      joinedAt: churchMembers.joinedAt,
      church: {
        id: churches.id,
        name: churches.name,
        slug: churches.slug,
        logoUrl: churches.logoUrl,
        roleLabels: churches.roleLabels,
      },
    })
    .from(churchMembers)
    .innerJoin(churches, eq(churchMembers.churchId, churches.id))
    // Left/removed rows are history, not memberships.
    .where(and(eq(churchMembers.userId, userId), eq(churchMembers.status, "active")));

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

/**
 * GET /api/me/progress
 * Retrieves comprehensive learning and quiz progress, streaks, best scores, and recent activity.
 */
profileRouter.get("/me/progress", async (c) => {
  const userId = c.get("userId");
  const churchId = c.req.query("churchId");

  try {
    const progress = await getUserProgress(userId, churchId);
    return c.json(progress);
  } catch (err) {
    console.error("Error retrieving user progress:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve user progress" }, 500);
  }
});

/**
 * GET /api/me/achievements
 * Retrieves list of achievements and unlocked status for the authenticated user.
 */
profileRouter.get("/me/achievements", async (c) => {
  const userId = c.get("userId");

  try {
    const achievements = await getUserAchievements(userId);
    return c.json(achievements);
  } catch (err) {
    console.error("Error retrieving user achievements:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve user achievements" }, 500);
  }
});

/**
 * GET /api/me/stats
 * Retrieves aggregated learning and assessment metrics for the authenticated user.
 */
profileRouter.get("/me/stats", async (c) => {
  const userId = c.get("userId");
  const churchId = c.req.query("churchId");

  try {
    const stats = await getUserStats(userId, churchId);
    return c.json(stats);
  } catch (err) {
    console.error("Error retrieving user stats:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve user stats" }, 500);
  }
});

/**
 * GET /api/me/quiz-history
 * Retrieves all quiz attempts and results for the authenticated user.
 */
profileRouter.get("/me/quiz-history", async (c) => {
  const userId = c.get("userId");
  const churchId = c.req.query("churchId");

  try {
    const history = await getUserQuizHistory(userId, churchId);
    return c.json({
      userId,
      totalAttempts: history.length,
      attempts: history,
    });
  } catch (err) {
    console.error("Error retrieving user quiz history:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve quiz history" }, 500);
  }
});


