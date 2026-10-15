/**
 * Parses the browser origins allowed to call the API cross-origin.
 *
 * Input: `CORS_ALLOWED_ORIGINS`, a comma-separated list of exact origins
 * (e.g. "http://localhost:5173,https://app.faithlink.example").
 * Output: a set of normalized origins (scheme + host + port, no trailing slash).
 *
 * Fails closed: unset or empty means no cross-origin browser access. Same-origin
 * and non-browser clients are unaffected, since CORS is enforced by browsers only.
 * Throws at startup on a malformed entry or "*" so a typo can't silently
 * lock the frontend out or open the API to every site.
 */
export function parseAllowedOrigins(raw: string | undefined): ReadonlySet<string> {
  const origins = new Set<string>();
  if (!raw) return origins;

  for (const entry of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    if (entry === "*") {
      throw new Error('CORS_ALLOWED_ORIGINS must list exact origins; "*" is not allowed.');
    }
    let url: URL;
    try {
      url = new URL(entry);
    } catch {
      throw new Error(`CORS_ALLOWED_ORIGINS has an invalid origin: "${entry}"`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`CORS_ALLOWED_ORIGINS origin must be http(s): "${entry}"`);
    }
    origins.add(url.origin);
  }
  return origins;
}
