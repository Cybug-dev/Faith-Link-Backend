import { z } from "zod";

export const createLessonSchema = z.object({
  title: z
    .string({ message: "Lesson title must be a string" })
    .trim()
    .min(2, "Title must be at least 2 characters")
    .max(255, "Title must be at most 255 characters"),
  slug: z
    .string({ message: "Lesson slug must be a string" })
    .trim()
    .toLowerCase()
    .min(2, "Slug must be at least 2 characters")
    .max(100, "Slug must be at most 100 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase alphanumeric characters and single hyphens"
    ),
  summary: z.string().trim().max(1000, "Summary must be at most 1000 characters").optional().nullable(),
  content: z
    .string({ message: "Lesson content must be a string" })
    .min(1, "Lesson content cannot be empty")
    .max(100000, "Lesson content exceeds 100,000 characters limit"),
  status: z.enum(["draft", "published", "archived"]).optional().default("draft"),
  orderIndex: z.number().int("Order index must be an integer").min(0).optional().default(0),
});

export const updateLessonSchema = z
  .object({
    title: z
      .string({ message: "Lesson title must be a string" })
      .trim()
      .min(2, "Title must be at least 2 characters")
      .max(255, "Title must be at most 255 characters")
      .optional(),
    slug: z
      .string({ message: "Lesson slug must be a string" })
      .trim()
      .toLowerCase()
      .min(2, "Slug must be at least 2 characters")
      .max(100, "Slug must be at most 100 characters")
      .regex(
        /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
        "Slug must contain only lowercase alphanumeric characters and single hyphens"
      )
      .optional(),
    summary: z.string().trim().max(1000, "Summary must be at most 1000 characters").optional().nullable(),
    content: z
      .string({ message: "Lesson content must be a string" })
      .min(1, "Lesson content cannot be empty")
      .max(100000, "Lesson content exceeds 100,000 characters limit")
      .optional(),
    status: z.enum(["draft", "published", "archived"]).optional(),
    orderIndex: z.number().int("Order index must be an integer").min(0).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided for update",
  });

export const lessonIdParamSchema = z.object({
  id: z.string({ message: "Church ID must be a string" }).uuid("Invalid church ID format (must be a valid UUID)"),
  lessonId: z.string({ message: "Lesson ID must be a string" }).uuid("Invalid lesson ID format (must be a valid UUID)"),
});

export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type UpdateLessonInput = z.infer<typeof updateLessonSchema>;
