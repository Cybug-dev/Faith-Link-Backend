import { Hono } from "hono";
import { parseAllowedOrigins } from "../config/cors.js";
import { sendPasswordChangedEmail } from "../services/email.js";
import { passwordResetSchema } from "../validation/auth.js";

export const authRouter = new Hono();

/** Codes the web app already understands (its AuthErrorCode). */
type ResetErrorCode = "INVALID_CODE" | "CODE_EXPIRED" | "TOO_MANY_ATTEMPTS" | "RATE_LIMITED" | "UNKNOWN";

/**
 * Neon Auth (Better Auth email-otp) reports OTP problems with a code and a
 * free-text message that vary by version, so both are checked.
 */
function toResetErrorCode(status: number, body: { code?: unknown; message?: unknown }): ResetErrorCode {
  if (status === 429) return "RATE_LIMITED";
  const text = `${String(body.code ?? "")} ${String(body.message ?? "")}`.toLowerCase();
  if (text.includes("too many") || text.includes("too_many")) return "TOO_MANY_ATTEMPTS";
  if (text.includes("expired")) return "CODE_EXPIRED";
  if (text.includes("otp") || text.includes("invalid")) return "INVALID_CODE";
  return "UNKNOWN";
}

/**
 * POST /api/auth/password-reset  (public; the emailed code is the credential)
 *
 * Body: { email, otp, password }. Completes the reset with Neon Auth, then sends
 * a "your password was changed" email. Neon has no event for a finished reset,
 * which is why this step goes through the backend.
 *
 * Responses: 200 { ok: true } · 400 validation errors · 4xx { error: { code } }
 * mirroring Neon's rejection · 502 when Neon Auth can't be reached.
 * The email is best effort: the password is already changed, so a send failure
 * is logged, not returned.
 */
authRouter.post("/password-reset", async (c) => {
  const parsed = passwordResetSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json({ error: { code: "VALIDATION_FAILED", issues: parsed.error.issues.map((i) => i.message) } }, 400);
  }
  const { email, otp, password } = parsed.data;

  const baseUrl = process.env.NEON_AUTH_BASE_URL;
  if (!baseUrl) throw new Error("NEON_AUTH_BASE_URL is not set");

  // Neon Auth only accepts calls from trusted origins; forward the caller's
  // origin when it is one of ours (CORS already limits browsers to these).
  const allowed = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);
  const requestOrigin = c.req.header("Origin");
  const origin = requestOrigin && allowed.has(requestOrigin) ? requestOrigin : [...allowed][0];

  let neonResponse: Response;
  try {
    neonResponse = await fetch(`${baseUrl}/email-otp/reset-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify({ email, otp, password }),
    });
  } catch (error) {
    console.error("password-reset: Neon Auth unreachable", error);
    return c.json({ error: { code: "UNKNOWN" } }, 502);
  }

  if (!neonResponse.ok) {
    const body = (await neonResponse.json().catch(() => ({}))) as { code?: unknown; message?: unknown };
    const status = neonResponse.status >= 500 ? 502 : neonResponse.status;
    return c.json({ error: { code: toResetErrorCode(neonResponse.status, body) } }, status as 400);
  }

  try {
    await sendPasswordChangedEmail(email);
  } catch (error) {
    console.error("password-reset: password-changed email not sent", error);
  }
  return c.json({ ok: true });
});
