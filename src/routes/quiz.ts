import { Hono } from "hono";
import { requireAuth } from "../middleware/auth.js";
import { requireTenantRole, requireChurchPermission, type TenantContext } from "../middleware/tenant.js";
import { hasPermission } from "../services/church-permissions.js";
import {
  createQuizSchema,
  updateQuizSchema,
  quizIdParamSchema,
  attemptIdParamSchema,
  submitAnswerSchema,
} from "../validation/quiz.js";
import {
  listQuizzes,
  getQuiz,
  createQuiz,
  updateQuiz,
  softDeleteQuiz,
  startQuizAttempt,
  getQuizAttempt,
  submitQuizAnswer,
  completeQuizAttempt,
  getQuizAttemptsForLeader,
} from "../services/quiz.js";

export const quizRouter = new Hono<TenantContext>();

const ALL_MEMBER_ROLES = ["admin", "pastor", "leader", "member"] as const;

/**
 * GET /api/churches/:id/quizzes
 * Lists all non-deleted quizzes for a church tenant.
 * - Members only see published quizzes.
 * - Leaders (admin/pastor/leader) see all statuses including drafts.
 */
quizRouter.get("/:id/quizzes", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const memberRole = c.get("memberRole");
  const canManage = hasPermission(memberRole, "quizzes.manage");

  try {
    const quizList = await listQuizzes(churchId, canManage);
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
    const canManage = hasPermission(memberRole, "quizzes.manage");
    const quiz = await getQuiz(quizId, churchId, !canManage);
    if (!quiz) {
      return c.json({ error: "Not Found: Quiz not found in this church" }, 404);
    }

    if (!canManage && quiz.status !== "published") {
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
 * Guarded by requireChurchPermission('quizzes.manage').
 */
quizRouter.post("/:id/quizzes", requireAuth, requireChurchPermission("quizzes.manage"), async (c) => {
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
 * Guarded by requireChurchPermission('quizzes.manage').
 */
quizRouter.put("/:id/quizzes/:quizId", requireAuth, requireChurchPermission("quizzes.manage"), async (c) => {
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
 * Guarded by requireChurchPermission('quizzes.manage').
 */
quizRouter.delete("/:id/quizzes/:quizId", requireAuth, requireChurchPermission("quizzes.manage"), async (c) => {
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

/**
 * POST /api/churches/:id/quizzes/:quizId/attempts
 * Starts a new attempt on a published quiz for the authenticated member.
 * Returns the attempt record and sanitized questions (isCorrect omitted).
 */
quizRouter.post("/:id/quizzes/:quizId/attempts", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const userId = c.get("userId");
  const memberRole = c.get("memberRole");
  const quizId = c.req.param("quizId");

  const paramValidation = quizIdParamSchema.safeParse({ id: churchId, quizId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  const canManage = hasPermission(memberRole, "quizzes.manage");

  try {
    const result = await startQuizAttempt(churchId, quizId, userId, canManage);
    return c.json(
      {
        message: "Quiz attempt started successfully",
        attempt: result.attempt,
        questions: result.questions,
      },
      201
    );
  } catch (err: any) {
    const message = err?.message || "";
    if (message.startsWith("NOT_FOUND")) {
      return c.json({ error: "Not Found: Quiz not found or not available" }, 404);
    }
    if (message.startsWith("BAD_REQUEST")) {
      return c.json({ error: `Bad Request: ${message.replace("BAD_REQUEST: ", "")}` }, 400);
    }
    console.error("Error starting quiz attempt:", err);
    return c.json({ error: "Internal Server Error: Failed to start quiz attempt" }, 500);
  }
});

/**
 * GET /api/churches/:id/attempts/:attemptId
 * Retrieves attempt status, answers, and result.
 */
quizRouter.get("/:id/attempts/:attemptId", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const userId = c.get("userId");
  const memberRole = c.get("memberRole");
  const attemptId = c.req.param("attemptId");

  const paramValidation = attemptIdParamSchema.safeParse({ id: churchId, attemptId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  const canManage = hasPermission(memberRole, "quizzes.manage");

  try {
    const attempt = await getQuizAttempt(attemptId, churchId, userId, canManage);
    if (!attempt) {
      return c.json({ error: "Not Found: Quiz attempt not found" }, 404);
    }
    return c.json({ attempt });
  } catch (err) {
    console.error("Error retrieving quiz attempt:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve quiz attempt" }, 500);
  }
});

/**
 * POST /api/churches/:id/attempts/:attemptId/answers
 * Submits or updates an answer to a question in an in-progress attempt.
 */
quizRouter.post("/:id/attempts/:attemptId/answers", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const userId = c.get("userId");
  const attemptId = c.req.param("attemptId");

  const paramValidation = attemptIdParamSchema.safeParse({ id: churchId, attemptId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  const rawBody = await c.req.json().catch(() => null);
  if (!rawBody || typeof rawBody !== "object") {
    return c.json({ error: "Bad Request: Invalid JSON request body" }, 400);
  }

  const validation = submitAnswerSchema.safeParse(rawBody);
  if (!validation.success) {
    return c.json(
      {
        error: "Validation Error: Invalid answer payload",
        details: validation.error.issues.map((i) => ({ field: i.path.join("."), message: i.message })),
      },
      400
    );
  }

  try {
    const { questionId, selectedOptionId } = validation.data;
    const result = await submitQuizAnswer(attemptId, churchId, userId, questionId, selectedOptionId);
    return c.json(result, 200);
  } catch (err: any) {
    const message = err?.message || "";
    if (message.startsWith("NOT_FOUND")) {
      return c.json({ error: "Not Found: Attempt not found" }, 404);
    }
    if (message.startsWith("CONFLICT")) {
      return c.json({ error: `Conflict: ${message.replace("CONFLICT: ", "")}` }, 409);
    }
    if (message.startsWith("BAD_REQUEST")) {
      return c.json({ error: `Bad Request: ${message.replace("BAD_REQUEST: ", "")}` }, 400);
    }
    console.error("Error submitting quiz answer:", err);
    return c.json({ error: "Internal Server Error: Failed to record answer" }, 500);
  }
});

/**
 * POST /api/churches/:id/attempts/:attemptId/complete
 * Authoritatively computes final score, checks pass threshold, and transitions attempt to completed.
 * Idempotent: multiple calls return existing result.
 */
quizRouter.post("/:id/attempts/:attemptId/complete", requireAuth, requireTenantRole([...ALL_MEMBER_ROLES]), async (c) => {
  const churchId = c.get("churchId");
  const userId = c.get("userId");
  const attemptId = c.req.param("attemptId");

  const paramValidation = attemptIdParamSchema.safeParse({ id: churchId, attemptId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  try {
    const completedAttempt = await completeQuizAttempt(attemptId, churchId, userId);
    return c.json({
      message: "Quiz attempt completed successfully",
      attempt: completedAttempt,
    });
  } catch (err: any) {
    const message = err?.message || "";
    if (message.startsWith("NOT_FOUND")) {
      return c.json({ error: "Not Found: Attempt not found" }, 404);
    }
    if (message.startsWith("CONFLICT")) {
      return c.json({ error: `Conflict: ${message.replace("CONFLICT: ", "")}` }, 409);
    }
    console.error("Error completing quiz attempt:", err);
    return c.json({ error: "Internal Server Error: Failed to complete quiz attempt" }, 500);
  }
});

/**
 * GET /api/churches/:id/quizzes/:quizId/attempts
 * Lists all attempts for a quiz. Guarded by leader role.
 */
quizRouter.get("/:id/quizzes/:quizId/attempts", requireAuth, requireChurchPermission("quizzes.manage"), async (c) => {
  const churchId = c.get("churchId");
  const quizId = c.req.param("quizId");

  const paramValidation = quizIdParamSchema.safeParse({ id: churchId, quizId });
  if (!paramValidation.success) {
    return c.json({ error: `Bad Request: ${paramValidation.error.issues[0]?.message}` }, 400);
  }

  try {
    const attempts = await getQuizAttemptsForLeader(quizId, churchId);
    return c.json({
      churchId,
      quizId,
      total: attempts.length,
      attempts,
    });
  } catch (err) {
    console.error("Error retrieving quiz attempts for leader:", err);
    return c.json({ error: "Internal Server Error: Failed to retrieve quiz attempts" }, 500);
  }
});

