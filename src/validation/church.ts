import { z } from "zod";
import { CHURCH_ROLES } from "../services/church-permissions.js";

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

const roleLabel = z
  .string({ message: "Role label must be a string" })
  .trim()
  .min(1, "Role label cannot be empty")
  .max(40, "Role label must be at most 40 characters");

/** Display-only renames; unknown role keys are rejected. The map replaces the stored one in full. */
export const roleLabelsSchema = z
  .object({
    admin: roleLabel.optional(),
    pastor: roleLabel.optional(),
    leader: roleLabel.optional(),
    member: roleLabel.optional(),
  })
  .strict();

/** Slug is deliberately not editable: it is the church's stable public identifier. */
export const updateChurchSchema = createChurchSchema
  .omit({ slug: true })
  .partial()
  .extend({ roleLabels: roleLabelsSchema.optional() })
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: "Provide at least one field to update" });

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
});

export const listChurchesQuerySchema = paginationQuerySchema.extend({
  q: z.string().trim().max(100, "Search must be at most 100 characters").optional(),
});

export const membershipIdParamSchema = z.object({
  membershipId: z.string().uuid("Invalid membership ID format (must be a valid UUID)"),
});

export const updateMemberRoleSchema = z
  .object({
    role: z.enum(CHURCH_ROLES, { message: `Role must be one of: ${CHURCH_ROLES.join(", ")}` }),
  })
  .strict();

export const primaryTransferSchema = z
  .object({
    membershipId: z.string().uuid("Invalid membership ID format (must be a valid UUID)"),
  })
  .strict();

export type CreateChurchInput = z.infer<typeof createChurchSchema>;
export type UpdateChurchInput = z.infer<typeof updateChurchSchema>;
