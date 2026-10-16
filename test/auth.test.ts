import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import app from "../src/index.js";

const realFetch = globalThis.fetch;
let calls: string[] = [];

/** Fakes Neon Auth (status + body) and records every outgoing call; Resend always accepts. */
function fakeNeon(status: number, body: unknown = {}) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url.includes("api.resend.com")) return new Response("{}", { status: 200 });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
}

const reset = (body: unknown) =>
  app.request("/api/auth/password-reset", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: "http://localhost:5173" },
    body: JSON.stringify(body),
  });

const valid = { email: "Alex@Gmail.com", otp: "123456", password: "Passw0rd!" };

describe("POST /api/auth/password-reset", () => {
  beforeEach(() => {
    calls = [];
    process.env.NEON_AUTH_BASE_URL = "https://auth.example/neondb/auth";
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    process.env.RESEND_API_KEY = "test-key";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it("rejects a weak password before calling Neon", async () => {
    fakeNeon(200);
    const res = await reset({ ...valid, password: "short" });
    assert.equal(res.status, 400);
    assert.equal(calls.length, 0);
  });

  it("resets with Neon, then sends the password-changed email", async () => {
    fakeNeon(200, { status: true });
    const res = await reset(valid);
    assert.equal(res.status, 200);
    assert.ok(calls[0]?.endsWith("/email-otp/reset-password"));
    assert.ok(calls[1]?.includes("api.resend.com"));
  });

  it("maps Neon's rejections to the web app's codes and sends no email", async () => {
    fakeNeon(400, { code: "INVALID_OTP", message: "Invalid OTP" });
    let res = await reset(valid);
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { error: { code: "INVALID_CODE" } });

    fakeNeon(403, { code: "TOO_MANY_ATTEMPTS", message: "Too many attempts" });
    res = await reset(valid);
    assert.deepEqual(await res.json(), { error: { code: "TOO_MANY_ATTEMPTS" } });
    assert.ok(!calls.some((url) => url.includes("api.resend.com")));
  });

  it("still succeeds when the email can't be sent", async () => {
    delete process.env.RESEND_API_KEY;
    fakeNeon(200, { status: true });
    const res = await reset(valid);
    assert.equal(res.status, 200);
  });
});
