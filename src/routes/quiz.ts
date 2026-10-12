import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { requireTenantRole, type TenantContext } from "../middleware/tenant.js";
import {
  createQuizSchema,
  updateQuizSchema,
  quizIdParamSchema,
} from "../validation/quiz.js";
import {
  listQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  softDeleteQuiz,
} from "../services/quiz.js";

export const quizRouter = new Hono<TenantContext>();

const ALL_MEMBER_ROLES = ["admin", "pastor", "leader", "member"] as const;
const LEADER_ROLES = ["admin", "pastor", "leader"] as const;

/**
 * GET /api/churches/:id/quizzes
 * Lists all non-deleted quizzes for a church tenant.
 * - Members only see published quizzes.
 * - Leaders (admin/pastor/leader) see all statuses including drafts.
 */
quizRouter.get("/:id/quizzes", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const memberRole = c.get("memberRole");
  const isLeader = LEADER_ROLES.includes(memberRole as typeof LEADER_ROLES[number]);

  try {
    const quizList = await listQuizzes(churchId, isLeader);
    return c.json({ churchId, total: quizList.length, quizzes: quizList });
  } catch (err) {
    console.error("Error listing quizzes:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve quizzes" }, 500);
  }
});

/**
 * GET /api/churches/:id/quizzes/:quizId
 * Returns a single quiz with all its non-deleted questions and options.
 * - Members only see published quizzes.
 * - Leaders see drafts and archived quizzes too.
 */
quizRouter.get("/:id/quizzes/:quizId", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const memberRole = c.get("memberRole");
  const quizId = c.req.param("quizId");

  const paramValidation = quizIdParamSchema.safeParse({ id: churchId, quizId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  try {
    const quiz = await getQuiz(quizId, churchId);
    if (!quiz) {
      return c.json({ error: "Not Found: Quiz not found in this church" }, 404);
    }

    const isLeader = LEADER_ROLES.includes(memberRole as typeof LEADER_ROLES[number]);
    if (!isLeader && quiz.status !== "published") {
      // Return 404 (not 403) to avoid leaking draft existence to members
      return c.json({ error: "Not Found: Quiz not found in this church" }, 404);
    }

    return c.json({ quiz });
  } catch (err) {
    console.error("Error retrieving quiz:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve quiz" }, 500);
  }
});

/**
 * POST /api/churches/:id/quizzes
 * Creates a new quiz with its questions and options in one request.
 * Guarded by requireTenantRole(['admin', 'pastor', 'leader']).
 */
quizRouter.post("/:id/quizzes", requireAuth, requireTenantRole([...LEADER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const userId = c.get("userId");

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = createQuizSchema.safeParse(rawBody);
  if (!validation.success) {
    return c.json(
      {
        error: "Validation Error: Invalid quiz payload",
        details: validation.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      400
    );
  }

  try {
    const quiz = await createQuiz(churchId, userId, validation.data);
    return c.json({ message: "Quiz created successfully", quiz }, 201);
  } catch (err) {
    console.error("Error creating quiz:", err);
    return c.json({ error: "Internal Server Error: Failed to create quiz" }, 500);
  }
});

/**
 * PUT /api/churches/:id/quizzes/:quizId
 * Updates quiz metadata and optionally replaces its question set.
 * When questions are supplied, the full-replace strategy applies (see quiz service).
 * Guarded by requireTenantRole(['admin', 'pastor', 'leader']).
 */
quizRouter.put("/:id/quizzes/:quizId", requireAuth, requireTenantRole([...LEADER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const quizId = c.req.param("quizId");

  const paramValidation = quizIdParamSchema.safeParse({ id: churchId, quizId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = updateQuizSchema.safeParse(rawBody);
  if (!validation.success) {
    return c.json(
      {
        error: "Validation Error: Invalid update payload",
        details: validation.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      400
    );
  }

  try {
    const existing = await getQuiz(quizId, churchId);
    if (!existing) {
      return c.json({ error: "Not Found: Quiz not found in this church" }, 404);
    }

    const updated = await updateQuiz(existing, validation.data);
    return c.json({ message: "Quiz updated successfully", quiz: updated });
  } catch (err) {
    console.error("Error updating quiz:", err);
    return c.json({ error: "Internal Server Error: Failed to update quiz" }, 500);
  }
});

/**
 * DELETE /api/churches/:id/quizzes/:quizId
 * Soft-deletes a quiz (sets deletedAt). Questions and options are preserved
 * for Phase 6 historical attempt lookups.
 * Guarded by requireTenantRole(['admin', 'pastor', 'leader']).
 */
quizRouter.delete("/:id/quizzes/:quizId", requireAuth, requireTenantRole([...LEADER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const quizId = c.req.param("quizId");

  const paramValidation = quizIdParamSchema.safeParse({ id: churchId, quizId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  try {
    const existing = await getQuiz(quizId, churchId);
    if (!existing) {
      return c.json({ error: "Not Found: Quiz not found in this church" }, 404);
    }

    await softDeleteQuiz(quizId);
    return c.json({ message: "Quiz deleted successfully", quizId });
  } catch (err) {
    console.error("Error deleting quiz:", err);
    return c.json({ error: "Internal Server Error: Failed to delete quiz" }, 500);
  }
});
