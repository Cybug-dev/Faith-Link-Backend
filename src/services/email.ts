/**
 * Transactional email through Resend's REST API (no SDK dependency).
 *
 * Config: RESEND_API_KEY (required to send), RESEND_FROM (optional).
 * LIMITATION: without a verified domain the default sandbox sender
 * `onboarding@resend.dev` only delivers to the Resend account owner's address.
 */
const RESEND_URL = "https://api.resend.com/emails";
const DEFAULT_FROM = "FaithLink <onboarding@resend.dev>";

type Email = { to: string; subject: string; text: string; html: string };

/**
 * Sends one email. Throws with Resend's status on failure so callers decide
 * whether it is fatal; never logs the API key.
 */
export async function sendEmail({ to, subject, text, html }: Email): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is not set");

  const response = await fetch(RESEND_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.RESEND_FROM || DEFAULT_FROM, to: [to], subject, text, html }),
  });
  if (!response.ok) {
    throw new Error(`Resend rejected the email (status ${response.status})`);
  }
}

/** Security notice after a successful password reset, so an unexpected change is noticed quickly. */
export function sendPasswordChangedEmail(to: string): Promise<void> {
  const text =
    "Your FaithLink password was just changed.\n\n" +
    "If this was you, there's nothing else to do.\n" +
    "If it wasn't you, reset your password right away from the FaithLink sign-in page and tell your church leader.";
  const html = `<p>Your FaithLink password was just changed.</p>
<p>If this was you, there's nothing else to do.</p>
<p>If it wasn't you, reset your password right away from the FaithLink sign-in page and tell your church leader.</p>`;
  return sendEmail({ to, subject: "Your FaithLink password was changed", text, html });
}
