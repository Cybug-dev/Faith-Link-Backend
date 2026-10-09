import { z } from "zod";

export const createChurchSchema = z.object({
  name: z
    .string({ message: "Church name must be a string" })
    .trim()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be at most 255 characters"),
  slug: z
    .string({ message: "Church slug must be a string" })
    .trim()
    .toLowerCase()
    .min(2, "Slug must be at least 2 characters")
    .max(100, "Slug must be at most 100 characters")
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Slug must contain only lowercase alphanumeric characters and single hyphens"
    ),
  description: z.string().trim().max(2000, "Description must be at most 2000 characters").optional().nullable(),
  logoUrl: z.string().trim().url("Logo URL must be a valid URL").max(1000).optional().nullable(),
  address: z.string().trim().max(500, "Address must be at most 500 characters").optional().nullable(),
  city: z.string().trim().max(100, "City must be at most 100 characters").optional().nullable(),
  country: z.string().trim().max(100, "Country must be at most 100 characters").optional().nullable(),
});

export const churchIdParamSchema = z.object({
  id: z.string({ message: "Church ID must be a string" }).uuid("Invalid church ID format (must be a valid UUID)"),
});

export type CreateChurchInput = z.infer<typeof createChurchSchema>;
