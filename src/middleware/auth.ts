import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";

const verifiedClaimSchema = z.object({ emailVerified: z.boolean() });

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getJWKS() {
  const jwksUrl = process.env.NEON_AUTH_JWKS_URL;
  if (!jwksUrl) {
    throw new Error("NEON_AUTH_JWKS_URL environment variable is missing.");
  }
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(jwksUrl));
  }
  return jwks;
}

export type AuthContext = {
  Variables: {
    userId: string;
    jwtPayload: Record<string, unknown>;
  };
};

/**
 * Middleware that strictly verifies incoming Bearer JWT against Neon Auth JWKS.
 */
export const requireAuth = createMiddleware<AuthContext>(async (c, next) => {
  const authHeader = c.req.header("authorization");

  if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
    return c.json({ error: "Unauthorized: Missing or invalid Authorization header" }, 401);
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return c.json({ error: "Unauthorized: Empty bearer token" }, 401);
  }

  try {
    const keySet = getJWKS();
    const baseUrl = process.env.NEON_AUTH_BASE_URL;
    const issuer = baseUrl ? new URL(baseUrl).origin : undefined;

    const { payload } = await jwtVerify(token, keySet, {
      issuer: issuer || undefined,
    });

    if (!payload.sub) {
      return c.json({ error: "Unauthorized: Missing subject identifier" }, 401);
    }

    // Defense in depth: Neon blocks unverified sign-in, but a loosened config must not open the API.
    // Neon's JWT carries camelCase `emailVerified`; a missing/non-boolean claim is treated as unverified.
    const claims = verifiedClaimSchema.safeParse(payload);
    if (!claims.success || !claims.data.emailVerified) {
      return c.json({ error: "Forbidden: Email address is not verified" }, 403);
    }

    c.set("userId", payload.sub);
    c.set("jwtPayload", payload);

    await next();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Token validation failed";
    return c.json({ error: `Unauthorized: ${message}` }, 401);
  }
});
