import { z } from "zod";

// ---------------------------------------------------------------------------
// Option schema — shared between create and update paths
// ---------------------------------------------------------------------------

const createOptionSchema = z.object({
  text: z
    .string({ message: "Option text must be a string" })
    .trim()
    .min(1, "Option text cannot be empty")
    .max(1000, "Option text must be at most 1000 characters"),
  isCorrect: z.boolean({ message: "isCorrect must be a boolean" }).default(false),
  orderIndex: z.number().int("Order index must be an integer").min(0).optional().default(0),
});

const updateOptionSchema = z.object({
  id: z.string().uuid("Option ID must be a valid UUID").optional(),
  text: z
    .string({ message: "Option text must be a string" })
    .trim()
    .min(1, "Option text cannot be empty")
    .max(1000, "Option text must be at most 1000 characters")
    .optional(),
  isCorrect: z.boolean({ message: "isCorrect must be a boolean" }).optional(),
  orderIndex: z.number().int("Order index must be an integer").min(0).optional(),
});

// ---------------------------------------------------------------------------
// Question schema
// ---------------------------------------------------------------------------

const createQuestionSchema = z.object({
  text: z
    .string({ message: "Question text must be a string" })
    .trim()
    .min(1, "Question text cannot be empty")
    .max(5000, "Question text must be at most 5000 characters"),
  pointValue: z.number().int("Point value must be an integer").min(1).optional().default(1),
  orderIndex: z.number().int("Order index must be an integer").min(0).optional().default(0),
  options: z
    .array(createOptionSchema)
    .min(2, "Each question must have at least 2 options")
    .max(10, "A question may have at most 10 options"),
});

const updateQuestionSchema = z.object({
  id: z.string().uuid("Question ID must be a valid UUID").optional(),
  text: z
    .string({ message: "Question text must be a string" })
    .trim()
    .min(1, "Question text cannot be empty")
    .max(5000, "Question text must be at most 5000 characters")
    .optional(),
  pointValue: z.number().int("Point value must be an integer").min(1).optional(),
  orderIndex: z.number().int("Order index must be an integer").min(0).optional(),
  options: z
    .array(updateOptionSchema)
    .min(2, "Each question must have at least 2 options")
    .max(10, "A question may have at most 10 options")
    .optional(),
});

// ---------------------------------------------------------------------------
// Quiz schemas
// ---------------------------------------------------------------------------

/**
 * Payload for creating a quiz with its questions and options in one request.
 * At least one question with at least two options is required.
 */
export const createQuizSchema = z.object({
  title: z
    .string({ message: "Quiz title must be a string" })
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(255, "Title must be at most 255 characters"),
  description: z.string().trim().max(2000, "Description must be at most 2000 characters").optional().nullable(),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  /** Optional link to a parent lesson. */
  lessonId: z.string().uuid("lessonId must be a valid UUID").optional().nullable(),
  /** Phase 6 seam: 0–100 integer threshold; omit or null for ungraded. */
  passingScore: z
    .number()
    .int("Passing score must be an integer")
    .min(0, "Passing score must be >= 0")
    .max(100, "Passing score must be <= 100")
    .optional()
    .nullable(),
  orderIndex: z.number().int("Order index must be an integer").min(0).optional().default(0),
  questions: z
    .array(createQuestionSchema)
    .min(1, "A quiz must have at least one question")
    .max(100, "A quiz may have at most 100 questions"),
});

/**
 * Payload for updating quiz metadata and/or its questions/options.
 * All fields are optional; at least one must be provided.
 * When questions are provided, existing questions not in the list are soft-deleted.
 */
export const updateQuizSchema = z
  .object({
    title: z
      .string({ message: "Quiz title must be a string" })
      .trim()
      .min(2, "Title must be at least 2 characters")
      .max(255, "Title must be at most 255 characters")
      .optional(),
    description: z.string().trim().max(2000, "Description must be at most 2000 characters").optional().nullable(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    lessonId: z.string().uuid("lessonId must be a valid UUID").optional().nullable(),
    passingScore: z
      .number()
      .int("Passing score must be an integer")
      .min(0)
      .max(100)
      .optional()
      .nullable(),
    orderIndex: z.number().int("Order index must be an integer").min(0).optional(),
    questions: z
      .array(updateQuestionSchema)
      .min(1, "At least one question must be provided when updating questions")
      .max(100)
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

/**
 * Path param validation for routes that accept :id (church) and :quizId.
 */
export const quizIdParamSchema = z.object({
  id: z.string({ message: "Church ID must be a string" }).uuid("Invalid church ID format (must be a valid UUID)"),
  quizId: z.string({ message: "Quiz ID must be a string" }).uuid("Invalid quiz ID format (must be a valid UUID)"),
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type CreateOptionInput = z.infer<typeof createOptionSchema>;
export type UpdateOptionInput = z.infer<typeof updateOptionSchema>;
