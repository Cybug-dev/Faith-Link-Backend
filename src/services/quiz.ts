import { eq, and, isNull, inArray, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  quizzes,
  quizQuestions,
  quizOptions,
  quizAttempts,
  quizAnswers,
  type Quiz,
  type QuizQuestion,
  type QuizOption,
  type QuizAttempt,
  type QuizAnswer,
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
 * If sanitizeForTaking is true, strips isCorrect from options so members cannot cheat.
 *
 * @param quizId   - UUID of the quiz
 * @param churchId - UUID of the tenant church (tenant isolation guard)
 * @param sanitizeForTaking - whether to hide isCorrect
 */
export async function getQuiz(
  quizId: string,
  churchId: string,
  sanitizeForTaking = false
): Promise<QuizWithQuestions | null> {
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(and(eq(quizzes.id, quizId), eq(quizzes.churchId, churchId), isNull(quizzes.deletedAt)))
    .limit(1);

  if (!quiz) return null;

  const questions = await fetchQuestionsWithOptions(quizId);

  if (sanitizeForTaking) {
    const sanitizedQuestions = questions.map((q) => ({
      ...q,
      options: q.options.map(({ isCorrect, ...opt }) => opt as QuizOption),
    }));
    return { ...quiz, questions: sanitizedQuestions };
  }

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

// ---------------------------------------------------------------------------
// Attempt & Answer Service Functions
// ---------------------------------------------------------------------------

export type AttemptWithAnswers = QuizAttempt & {
  quizTitle: string;
  answers: QuizAnswer[];
};

/**
 * Starts a new quiz attempt for a member.
 * If an active in_progress attempt already exists for this user and quiz, returns it.
 */
export async function startQuizAttempt(
  churchId: string,
  quizId: string,
  userId: string,
  isLeader: boolean
): Promise<{ attempt: QuizAttempt; questions: (QuizQuestion & { options: QuizOption[] })[] }> {
  // 1. Verify quiz exists and is available
  const [quiz] = await db
    .select()
    .from(quizzes)
    .where(
      and(
        eq(quizzes.id, quizId),
        eq(quizzes.churchId, churchId),
        isNull(quizzes.deletedAt),
        isLeader ? undefined : eq(quizzes.status, "published")
      )
    )
    .limit(1);

  if (!quiz) {
    throw new Error("NOT_FOUND: Quiz not found or not available");
  }

  // 2. Fetch questions
  const questions = await fetchQuestionsWithOptions(quizId);
  if (questions.length === 0) {
    throw new Error("BAD_REQUEST: Quiz has no questions available");
  }

  // Sanitize options to avoid leaking isCorrect to members
  const sanitizedQuestions = isLeader
    ? questions
    : questions.map((q) => ({
        ...q,
        options: q.options.map(({ isCorrect, ...opt }) => opt as QuizOption),
      }));

  // 3. Check for existing in_progress attempt
  const [existingAttempt] = await db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.churchId, churchId),
        eq(quizAttempts.quizId, quizId),
        eq(quizAttempts.userId, userId),
        eq(quizAttempts.status, "in_progress")
      )
    )
    .limit(1);

  if (existingAttempt) {
    return { attempt: existingAttempt, questions: sanitizedQuestions };
  }

  // 4. Calculate total possible points
  const maxScore = questions.reduce((sum, q) => sum + (q.pointValue || 1), 0);

  // 5. Create new attempt
  const [newAttempt] = await db
    .insert(quizAttempts)
    .values({
      churchId,
      quizId,
      userId,
      status: "in_progress",
      maxScore,
      totalQuestions: questions.length,
      startedAt: new Date(),
    })
    .returning();

  return { attempt: newAttempt, questions: sanitizedQuestions };
}

/**
 * Fetches an attempt by ID with tenant and ownership guards.
 */
export async function getQuizAttempt(
  attemptId: string,
  churchId: string,
  userId: string,
  isLeader: boolean
): Promise<AttemptWithAnswers | null> {
  const [attempt] = await db
    .select({
      attempt: quizAttempts,
      quizTitle: quizzes.title,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        eq(quizAttempts.id, attemptId),
        eq(quizAttempts.churchId, churchId),
        isLeader ? undefined : eq(quizAttempts.userId, userId)
      )
    )
    .limit(1);

  if (!attempt) return null;

  const answers = await db
    .select()
    .from(quizAnswers)
    .where(eq(quizAnswers.attemptId, attemptId));

  // If in_progress and not leader, sanitize isCorrect & pointsAwarded on answers
  const sanitizedAnswers =
    !isLeader && attempt.attempt.status === "in_progress"
      ? answers.map(({ isCorrect, pointsAwarded, ...ans }) => ans as QuizAnswer)
      : answers;

  return {
    ...attempt.attempt,
    quizTitle: attempt.quizTitle,
    answers: sanitizedAnswers,
  };
}

/**
 * Submits an answer for a question in an active attempt.
 * Evaluates correctness server-side and stores points.
 */
export async function submitQuizAnswer(
  attemptId: string,
  churchId: string,
  userId: string,
  questionId: string,
  selectedOptionId: string
): Promise<{ message: string; answer: Partial<QuizAnswer> }> {
  // 1. Fetch and validate attempt
  const [attempt] = await db
    .select()
    .from(quizAttempts)
    .where(
      and(
        eq(quizAttempts.id, attemptId),
        eq(quizAttempts.churchId, churchId),
        eq(quizAttempts.userId, userId)
      )
    )
    .limit(1);

  if (!attempt) {
    throw new Error("NOT_FOUND: Attempt not found");
  }

  if (attempt.status !== "in_progress") {
    throw new Error(`CONFLICT: Attempt is already ${attempt.status}`);
  }

  // 2. Validate question belongs to this quiz
  const [question] = await db
    .select()
    .from(quizQuestions)
    .where(
      and(
        eq(quizQuestions.id, questionId),
        eq(quizQuestions.quizId, attempt.quizId),
        isNull(quizQuestions.deletedAt)
      )
    )
    .limit(1);

  if (!question) {
    throw new Error("BAD_REQUEST: Invalid question ID for this quiz");
  }

  // 3. Validate option belongs to this question and check correctness
  const [option] = await db
    .select()
    .from(quizOptions)
    .where(
      and(
        eq(quizOptions.id, selectedOptionId),
        eq(quizOptions.questionId, questionId)
      )
    )
    .limit(1);

  if (!option) {
    throw new Error("BAD_REQUEST: Invalid option ID for this question");
  }

  const isCorrect = option.isCorrect;
  const pointsAwarded = isCorrect ? question.pointValue : 0;

  // 4. Upsert answer idempotently
  const [saved] = await db
    .insert(quizAnswers)
    .values({
      attemptId,
      questionId,
      selectedOptionId,
      isCorrect,
      pointsAwarded,
      submittedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [quizAnswers.attemptId, quizAnswers.questionId],
      set: {
        selectedOptionId,
        isCorrect,
        pointsAwarded,
        submittedAt: new Date(),
      },
    })
    .returning();

  return {
    message: "Answer recorded successfully",
    answer: {
      id: saved.id,
      attemptId: saved.attemptId,
      questionId: saved.questionId,
      selectedOptionId: saved.selectedOptionId,
      submittedAt: saved.submittedAt,
    },
  };
}

/**
 * Completes an attempt, authoritatively computing score and pass/fail status.
 * Idempotent: completing an already completed attempt returns existing result.
 */
export async function completeQuizAttempt(
  attemptId: string,
  churchId: string,
  userId: string
): Promise<QuizAttempt> {
  return db.transaction(async (tx) => {
    // 1. Fetch attempt with quiz info
    const [row] = await tx
      .select({
        attempt: quizAttempts,
        passingScore: quizzes.passingScore,
      })
      .from(quizAttempts)
      .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
      .where(
        and(
          eq(quizAttempts.id, attemptId),
          eq(quizAttempts.churchId, churchId),
          eq(quizAttempts.userId, userId)
        )
      )
      .limit(1);

    if (!row) {
      throw new Error("NOT_FOUND: Attempt not found");
    }

    const { attempt, passingScore } = row;

    // Idempotent: return existing completed attempt
    if (attempt.status === "completed") {
      return attempt;
    }

    if (attempt.status !== "in_progress") {
      throw new Error(`CONFLICT: Attempt is already ${attempt.status}`);
    }

    // 2. Fetch all questions for max score calculation
    const questions = await tx
      .select()
      .from(quizQuestions)
      .where(and(eq(quizQuestions.quizId, attempt.quizId), isNull(quizQuestions.deletedAt)));

    const maxScore = questions.reduce((sum, q) => sum + (q.pointValue || 1), 0);

    // 3. Fetch all submitted answers
    const answers = await tx
      .select()
      .from(quizAnswers)
      .where(eq(quizAnswers.attemptId, attemptId));

    const score = answers.reduce((sum, a) => sum + (a.pointsAwarded || 0), 0);
    const correctCount = answers.filter((a) => a.isCorrect).length;
    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const isPassed = passingScore !== null && passingScore !== undefined ? percentage >= passingScore : true;

    const [completed] = await tx
      .update(quizAttempts)
      .set({
        status: "completed",
        score,
        maxScore,
        percentage,
        correctCount,
        totalQuestions: questions.length,
        isPassed,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(quizAttempts.id, attemptId))
      .returning();

    return completed;
  });
}

/**
 * Returns a user's quiz attempt history.
 */
export async function getUserQuizHistory(
  userId: string,
  churchId?: string
): Promise<(QuizAttempt & { quizTitle: string })[]> {
  const rows = await db
    .select({
      attempt: quizAttempts,
      quizTitle: quizzes.title,
    })
    .from(quizAttempts)
    .innerJoin(quizzes, eq(quizAttempts.quizId, quizzes.id))
    .where(
      and(
        eq(quizAttempts.userId, userId),
        churchId ? eq(quizAttempts.churchId, churchId) : undefined
      )
    )
    .orderBy(desc(quizAttempts.startedAt));

  return rows.map((r) => ({
    ...r.attempt,
    quizTitle: r.quizTitle,
  }));
}

/**
 * Returns all attempts for a quiz (leader view).
 */
export async function getQuizAttemptsForLeader(
  quizId: string,
  churchId: string
): Promise<QuizAttempt[]> {
  return db
    .select()
    .from(quizAttempts)
    .where(and(eq(quizAttempts.quizId, quizId), eq(quizAttempts.churchId, churchId)))
    .orderBy(desc(quizAttempts.startedAt));
}

