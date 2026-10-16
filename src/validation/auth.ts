import { z } from "zod";

/** Same rule as the web app's create account and reset password forms. */
export const MIN_PASSWORD_LENGTH = 8;

export const passwordResetSchema = z.object({
  email: z.string({ message: "Email must be a string" }).trim().toLowerCase().email("Enter a valid email address").max(254),
  otp: z.string({ message: "Code must be a string" }).regex(/^\d{6}$/, "Enter the 6-digit code"),
  password: z
    .string({ message: "Password must be a string" })
    .min(MIN_PASSWORD_LENGTH, `Use at least ${MIN_PASSWORD_LENGTH} characters`)
    .max(128, "Use 128 characters or fewer")
    .regex(/\d/, "Add at least one number")
    .regex(/[^A-Za-z0-9]/, "Add at least one symbol"),
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
