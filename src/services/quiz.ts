import { eq, and, isNull, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  type Quiz,
  type QuizQuestion,
  type QuizOption,
} from "../db/schema.js";
import type { CreateQuizInput, UpdateQuizInput } from "../validation/quiz.js";

// ---------------------------------------------------------------------------
// Read types
// ---------------------------------------------------------------------------

export type QuizWithQuestions = Quiz & {
  questions: (QuizQuestion & { options: QuizOption[] })[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Fetches all non-deleted questions with their options for a quiz.
 * Used internally and by the GET detail endpoint.
 */
async function fetchQuestionsWithOptions(quizId: string): Promise<(QuizQuestion & { options: QuizOption[] })[]> {
  const questions = await db
    .select()
    .from(quizQuestions)
    .where(and(eq(quizQuestions.quizId, quizId), isNull(quizQuestions.deletedAt)));

  if (questions.length === 0) return [];

  const questionIds = questions.map((q) => q.id);
  const options = await db
    .select()
    .from(quizOptions)
    .where(inArray(quizOptions.questionId, questionIds));

  // Group options by questionId
  const optionsByQuestion = new Map<string, QuizOption[]>();
  for (const opt of options) {
    const bucket = optionsByQuestion.get(opt.questionId) ?? [];
    bucket.push(opt);
    optionsByQuestion.set(opt.questionId, bucket);
  }

  return questions.map((q) => ({
    ...q,
    options: (optionsByQuestion.get(q.id) ?? []).sort((a, b) => a.orderIndex - b.orderIndex),
  }));
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Lists all non-deleted quizzes for a church, without nested questions.
 * Leaders see all statuses; members only see 'published'.
 *
 * @param churchId  - UUID of the tenant church
 * @param isLeader  - true for admin/pastor/leader roles
 */
export async function listQuizzes(churchId: string, isLeader: boolean): Promise<Quiz[]> {
  return db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.churchId, churchId),
        isNull(quizzes.deletedAt),
        isLeader ? undefined : eq(quizzes.status, "published")
      )
    );
}

/**
 * Fetches a single quiz with all its non-deleted questions and options.
 * Returns null when not found or soft-deleted.
 *
 * @param quizId   - UUID of the quiz
 * @param churchId - UUID of the tenant church (tenant isolation guard)
 */
export async function getQuiz(quizId: string, churchId: string): Promise<QuizWithQuestions | null> {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.churchId, churchId), isNull(quizzes.deletedAt)))
    .limit(1);

  if (!quiz) return null;

  const questions = await fetchQuestionsWithOptions(quizId);
  return { ...quiz, questions };
}

/**
 * Creates a quiz with its questions and options in a single transaction.
 * Options are inserted immediately after each question so FKs are satisfied
 * inside the same transaction.
 *
 * @param churchId - UUID of the tenant church
 * @param userId   - ID of the authoring user
 * @param input    - Validated create payload
 */
export async function createQuiz(
  churchId: string,
  userId: string,
  input: CreateQuizInput
): Promise<QuizWithQuestions> {
  return db.transaction(async (tx) => {
    // 1. Insert the quiz row
    const [quiz] = await tx
      .insert(quizzes)
      .values({
        churchId,
        lessonId: input.lessonId ?? null,
        title: input.title,
        description: input.description ?? null,
        status: input.status,
        passingScore: input.passingScore ?? null,
        orderIndex: input.orderIndex,
        createdBy: userId,
      })
      .returning();

    // 2. Insert questions and their options sequentially within the transaction
    const createdQuestions: (QuizQuestion & { options: QuizOption[] })[] = [];

    for (const qInput of input.questions) {
      const [question] = await tx
        .insert(quizQuestions)
        .values({
          quizId: quiz.id,
          text: qInput.text,
          pointValue: qInput.pointValue,
          orderIndex: qInput.orderIndex,
        })
        .returning();

      const createdOptions = await tx
        .insert(quizOptions)
        .values(
          qInput.options.map((opt) => ({
            questionId: question.id,
            text: opt.text,
            isCorrect: opt.isCorrect,
            orderIndex: opt.orderIndex,
          }))
        )
        .returning();

      createdQuestions.push({ ...question, options: createdOptions });
    }

    return { ...quiz, questions: createdQuestions };
  });
}

/**
 * Updates quiz metadata and optionally replaces its question set.
 *
 * When `input.questions` is provided the full replace strategy is used:
 * - Questions in the payload that carry an `id` are updated in-place.
 * - Questions without an `id` are inserted as new rows.
 * - Existing questions whose `id` is absent from the payload are soft-deleted
 *   (deletedAt = now). Their options remain intact for Phase 6 audit.
 * - Options are always hard-replaced per question (delete + re-insert)
 *   because quiz options are not independently identified by the client.
 *
 * @param quiz    - Existing quiz row (already fetched and tenant-verified)
 * @param input   - Validated update payload
 */
export async function updateQuiz(
  quiz: Quiz,
  input: UpdateQuizInput
): Promise<QuizWithQuestions> {
  return db.transaction(async (tx) => {
    // 1. Update quiz metadata if any top-level fields changed
    const metaUpdate: Partial<typeof quizzes.$inferInsert> = {};
    if (input.title !== undefined) metaUpdate.title = input.title;
    if (input.description !== undefined) metaUpdate.description = input.description ?? null;
    if (input.status !== undefined) metaUpdate.status = input.status;
    if (input.lessonId !== undefined) metaUpdate.lessonId = input.lessonId ?? null;
    if (input.passingScore !== undefined) metaUpdate.passingScore = input.passingScore ?? null;
    if (input.orderIndex !== undefined) metaUpdate.orderIndex = input.orderIndex;

    let updatedQuiz = quiz;
    if (Object.keys(metaUpdate).length > 0) {
      const [row] = await tx
        .update(quizzes)
        .set({ ...metaUpdate, updatedAt: new Date() })
        .where(eq(quizzes.id, quiz.id))
        .returning();
      updatedQuiz = row;
    }

    // 2. If questions not provided, just reload and return
    if (!input.questions) {
      const questions = await fetchQuestionsWithOptions(quiz.id);
      return { ...updatedQuiz, questions };
    }

    // 3. Full question-set replace
    const incomingIds = input.questions
      .map((q) => q.id)
      .filter((id): id is string => Boolean(id));

    // Fetch currently active question IDs
    const existingRows = await tx
      .select({ id: quizQuestions.id })
      .from(quizQuestions)
      .where(and(eq(quizQuestions.quizId, quiz.id), isNull(quizQuestions.deletedAt)));

    const existingIds = existingRows.map((r) => r.id);
    const toSoftDelete = existingIds.filter((id) => !incomingIds.includes(id));

    if (toSoftDelete.length > 0) {
      await tx
        .update(quizQuestions)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(inArray(quizQuestions.id, toSoftDelete));
    }

    const updatedQuestions: (QuizQuestion & { options: QuizOption[] })[] = [];

    for (const qInput of input.questions) {
      let question: QuizQuestion;

      if (qInput.id) {
        // Update existing question
        const patch: Partial<typeof quizQuestions.$inferInsert> = { updatedAt: new Date() };
        if (qInput.text !== undefined) patch.text = qInput.text;
        if (qInput.pointValue !== undefined) patch.pointValue = qInput.pointValue;
        if (qInput.orderIndex !== undefined) patch.orderIndex = qInput.orderIndex;

        const [updated] = await tx
          .update(quizQuestions)
          .set(patch)
          .where(eq(quizQuestions.id, qInput.id))
          .returning();
        question = updated;
      } else {
        // Insert new question
        const [inserted] = await tx
          .insert(quizQuestions)
          .values({
            quizId: quiz.id,
            text: qInput.text ?? "",
            pointValue: qInput.pointValue ?? 1,
            orderIndex: qInput.orderIndex ?? 0,
          })
          .returning();
        question = inserted;
      }

      // Replace options for this question (hard-replace: simpler for client, options have no stable identity)
      if (qInput.options !== undefined) {
        await tx.delete(quizOptions).where(eq(quizOptions.questionId, question.id));
        const newOptions = await tx
          .insert(quizOptions)
          .values(
            qInput.options.map((opt) => ({
              questionId: question.id,
              text: opt.text ?? "",
              isCorrect: opt.isCorrect ?? false,
              orderIndex: opt.orderIndex ?? 0,
            }))
          )
          .returning();
        updatedQuestions.push({ ...question, options: newOptions });
      } else {
        // Keep existing options unchanged
        const existingOptions = await tx
          .select()
          .from(quizOptions)
          .where(eq(quizOptions.questionId, question.id));
        updatedQuestions.push({ ...question, options: existingOptions });
      }
    }

    return { ...updatedQuiz, questions: updatedQuestions };
  });
}

/**
 * Soft-deletes a quiz. Questions and options remain in the database
 * to support Phase 6 historical attempt lookup.
 *
 * @param quizId - UUID of the quiz to soft-delete
 */
export async function softDeleteQuiz(quizId: string): Promise<void> {
  await db
    .update(quizzes)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(quizzes.id, quizId));
}
