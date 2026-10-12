import { Hono } from "hono";
import { eq, and, ne, asc } from "drizzle-orm";
import { db } from "../db/index.js";
import { lessons, lessonCompletions } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { requireTenantRole, type TenantContext } from "../middleware/tenant.js";
import {
  createLessonSchema,
  updateLessonSchema,
  lessonIdParamSchema,
} from "../validation/lesson.js";

export const lessonRouter = new Hono<TenantContext>();

const ALL_MEMBER_ROLES = ["admin", "pastor", "leader", "member"];
const LEADER_ROLES = ["admin", "pastor", "leader"];

/**
 * GET /api/churches/:id/lessons
 * Lists lessons for a church tenant.
 * - Regular members only see 'published' lessons.
 * - Church leaders see all lessons (including drafts).
 * - Enriches each lesson with completion status for the requesting user.
 */
lessonRouter.get("/:id/lessons", requireAuth, requireTenantRole(ALL_MEMBER_ROLES), async (c) => {
  const churchId = c.get("churchId");
  const memberRole = c.get("memberRole");
  const userId = c.get("userId");

  try {
    // 1. Fetch lessons
    const isLeader = LEADER_ROLES.includes(memberRole);
    const lessonList = await db
      .select()
      .from(lessons)
      .where(
        isLeader
          ? eq(lessons.churchId, churchId)
          : and(eq(lessons.churchId, churchId), eq(lessons.status, "published"))
      )
      .orderBy(asc(lessons.orderIndex), asc(lessons.createdAt));

    // 2. Fetch completions for this user in this church
    const userCompletions = await db
      .select({
        lessonId: lessonCompletions.lessonId,
        completedAt: lessonCompletions.completedAt,
      })
      .from(lessonCompletions)
      .where(and(eq(lessonCompletions.churchId, churchId), eq(lessonCompletions.userId, userId)));

    const completionMap = new Map<string, Date>();
    for (const comp of userCompletions) {
      completionMap.set(comp.lessonId, comp.completedAt);
    }

    const mappedLessons = lessonList.map((lesson) => {
      const completedAt = completionMap.get(lesson.id);
      return {
        ...lesson,
        isCompleted: Boolean(completedAt),
        completedAt: completedAt ? completedAt.toISOString() : null,
      };
    });

    return c.json({
      churchId,
      total: mappedLessons.length,
      lessons: mappedLessons,
    });
  } catch (err) {
    console.error("Error retrieving lessons:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve lessons" }, 500);
  }
});

/**
 * GET /api/churches/:id/lessons/:lessonId
 * Retrieves a single lesson's details with completion status.
 */
lessonRouter.get("/:id/lessons/:lessonId", requireAuth, requireTenantRole(ALL_MEMBER_ROLES), async (c) => {
  const churchId = c.get("churchId");
  const lessonId = c.req.param("lessonId");
  const memberRole = c.get("memberRole");
  const userId = c.get("userId");

  const paramValidation = lessonIdParamSchema.safeParse({ id: churchId, lessonId });
  if (!paramValidation.success) {
    return c.json(
      { error: `Bad Request: ${paramValidation.error.issues[0]?.message}` },
      400
    );
  }

  try {
    const [lesson] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), eq(lessons.churchId, churchId)))
      .limit(1);

    if (!lesson) {
      return c.json({ error: "Not Found: Lesson not found in this church" }, 404);
    }

    const isLeader = LEADER_ROLES.includes(memberRole);
    if (!isLeader && lesson.status !== "published") {
      return c.json({ error: "Not Found: Lesson not found in this church" }, 404);
    }

    const [completion] = await db
      .select()
      .from(lessonCompletions)
      .where(
        and(
          eq(lessonCompletions.lessonId, lessonId),
          eq(lessonCompletions.userId, userId)
        )
      )
      .limit(1);

    return c.json({
      lesson,
      isCompleted: Boolean(completion),
      completedAt: completion?.completedAt ? completion.completedAt.toISOString() : null,
    });
  } catch (err) {
    console.error("Error retrieving lesson:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve lesson" }, 500);
  }
});

/**
 * POST /api/churches/:id/lessons
 * Creates a new lesson within a church.
 * Guarded by requireTenantRole(['admin', 'pastor', 'leader']).
 */
lessonRouter.post("/:id/lessons", requireAuth, requireTenantRole(LEADER_ROLES), async (c) => {
  const churchId = c.get("churchId");
  const userId = c.get("userId");
  const rawBody = await c.req.json().catch(() => null);

  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = createLessonSchema.safeParse(rawBody);
  if (!validation.success) {
    return c.json(
      {
        error: "Validation Error: Invalid lesson payload",
        details: validation.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      400
    );
  }

  const { title, slug, summary, content, status, orderIndex } = validation.data;

  try {
    // Check if slug is unique in this church
    const [existing] = await db
      .select({ id: lessons.id })
      .from(lessons)
      .where(and(eq(lessons.churchId, churchId), eq(lessons.slug, slug)))
      .limit(1);

    if (existing) {
      return c.json(
        { error: `Conflict: A lesson with slug '${slug}' already exists in this church` },
        409
      );
    }

    const [newLesson] = await db
      .insert(lessons)
      .values({
        churchId,
        title,
        slug,
        summary: summary || null,
        content,
        status,
        orderIndex,
        createdBy: userId,
      })
      .returning();

    return c.json(
      {
        message: "Lesson created successfully",
        lesson: newLesson,
      },
      201
    );
  } catch (err) {
    console.error("Error creating lesson:", err);
    return c.json({ error: "Internal Server Error: Failed to create lesson" }, 500);
  }
});

/**
 * PUT /api/churches/:id/lessons/:lessonId
 * Updates an existing lesson.
 * Guarded by requireTenantRole(['admin', 'pastor', 'leader']).
 */
lessonRouter.put("/:id/lessons/:lessonId", requireAuth, requireTenantRole(LEADER_ROLES), async (c) => {
  const churchId = c.get("churchId");
  const lessonId = c.req.param("lessonId");
  const rawBody = await c.req.json().catch(() => null);

  const paramValidation = lessonIdParamSchema.safeParse({ id: churchId, lessonId });
  if (!paramValidation.success) {
    return c.json(
      { error: `Bad Request: ${paramValidation.error.issues[0]?.message}` },
      400
    );
  }

  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = updateLessonSchema.safeParse(rawBody);
  if (!validation.success) {
    return c.json(
      {
        error: "Validation Error: Invalid update payload",
        details: validation.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      400
    );
  }

  const updateData = validation.data;

  try {
    const [existing] = await db
      .select()
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), eq(lessons.churchId, churchId)))
      .limit(1);

    if (!existing) {
      return c.json({ error: "Not Found: Lesson not found in this church" }, 404);
    }

    if (updateData.slug && updateData.slug !== existing.slug) {
      const [slugConflict] = await db
        .select({ id: lessons.id })
        .from(lessons)
        .where(
          and(
            eq(lessons.churchId, churchId),
            eq(lessons.slug, updateData.slug),
            ne(lessons.id, lessonId)
          )
        )
        .limit(1);

      if (slugConflict) {
        return c.json(
          { error: `Conflict: Another lesson with slug '${updateData.slug}' already exists in this church` },
          409
        );
      }
    }

    const [updatedLesson] = await db
      .update(lessons)
      .set({
        ...(updateData.title !== undefined ? { title: updateData.title } : {}),
        ...(updateData.slug !== undefined ? { slug: updateData.slug } : {}),
        ...(updateData.summary !== undefined ? { summary: updateData.summary } : {}),
        ...(updateData.content !== undefined ? { content: updateData.content } : {}),
        ...(updateData.status !== undefined ? { status: updateData.status } : {}),
        ...(updateData.orderIndex !== undefined ? { orderIndex: updateData.orderIndex } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(lessons.id, lessonId), eq(lessons.churchId, churchId)))
      .returning();

    return c.json({
      message: "Lesson updated successfully",
      lesson: updatedLesson,
    });
  } catch (err) {
    console.error("Error updating lesson:", err);
    return c.json({ error: "Internal Server Error: Failed to update lesson" }, 500);
  }
});

/**
 * POST /api/churches/:id/lessons/:lessonId/complete
 * Records lesson completion for the authenticated member.
 * Idempotent: duplicate submissions return success without error.
 */
lessonRouter.post("/:id/lessons/:lessonId/complete", requireAuth, requireTenantRole(ALL_MEMBER_ROLES), async (c) => {
  const churchId = c.get("churchId");
  const lessonId = c.req.param("lessonId");
  const userId = c.get("userId");
  const memberRole = c.get("memberRole");

  const paramValidation = lessonIdParamSchema.safeParse({ id: churchId, lessonId });
  if (!paramValidation.success) {
    return c.json(
      { error: `Bad Request: ${paramValidation.error.issues[0]?.message}` },
      400
    );
  }

  try {
    const [lesson] = await db
      .select({ id: lessons.id, status: lessons.status })
      .from(lessons)
      .where(and(eq(lessons.id, lessonId), eq(lessons.churchId, churchId)))
      .limit(1);

    if (!lesson) {
      return c.json({ error: "Not Found: Lesson not found in this church" }, 404);
    }

    const isLeader = LEADER_ROLES.includes(memberRole);
    if (!isLeader && lesson.status !== "published") {
      return c.json({ error: "Not Found: Lesson not found in this church" }, 404);
    }

    const [inserted] = await db
      .insert(lessonCompletions)
      .values({
        lessonId,
        userId,
        churchId,
        completedAt: new Date(),
      })
      .onConflictDoNothing({
        target: [lessonCompletions.lessonId, lessonCompletions.userId],
      })
      .returning();

    if (!inserted) {
      const [existing] = await db
        .select()
        .from(lessonCompletions)
        .where(
          and(
            eq(lessonCompletions.lessonId, lessonId),
            eq(lessonCompletions.userId, userId)
          )
        )
        .limit(1);

      return c.json({
        message: "Lesson was already completed",
        lessonId,
        isCompleted: true,
        completedAt: existing?.completedAt ? existing.completedAt.toISOString() : null,
      });
    }

    return c.json(
      {
        message: "Lesson marked as completed successfully",
        lessonId,
        isCompleted: true,
        completedAt: inserted.completedAt.toISOString(),
      },
      201
    );
  } catch (err) {
    console.error("Error recording lesson completion:", err);
    return c.json({ error: "Internal Server Error: Failed to record lesson completion" }, 500);
  }
});
