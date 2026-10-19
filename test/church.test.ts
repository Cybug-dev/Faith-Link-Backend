import assert from "node:assert/strict";
import { Hono } from "hono";
import app from "../src/index.js";
import { requireTenantRole, type TenantContext } from "../src/middleware/tenant.js";

async function runTests() {
  console.log("Starting Church Tenant Foundation Tests...\n");

  // 1. Health check
  {
    const res = await app.request("/health");
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.status, "ok");
    console.log("✓ GET /health returns 200 OK");
  }

  // 2. POST /api/churches without auth -> 401
  {
    const res = await app.request("/api/churches", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Grace Chapel", slug: "grace-chapel" }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ POST /api/churches rejects unauthenticated request (401)");
  }

  // 3. GET /api/churches/:id with invalid UUID -> 400
  {
    const res = await app.request("/api/churches/not-a-valid-uuid");
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.match(body.error, /Invalid church ID format/i);
    console.log("✓ GET /api/churches/:id rejects invalid UUID (400)");
  }

  // 4. GET /api/churches/:id with non-existent UUID -> 404
  {
    const res = await app.request("/api/churches/00000000-0000-0000-0000-000000000000");
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /Church not found/i);
    console.log("✓ GET /api/churches/:id returns 404 for non-existent church");
  }

  // 5. POST /api/churches/:id/join without auth -> 401
  {
    const res = await app.request("/api/churches/00000000-0000-0000-0000-000000000000/join", {
      method: "POST",
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ POST /api/churches/:id/join rejects unauthenticated request (401)");
  }

  // 6. POST /api/churches/:id/join with invalid UUID -> 400 or 401
  {
    const res = await app.request("/api/churches/bad-id/join", {
      method: "POST",
      headers: { Authorization: "Bearer bad-token" },
    });
    assert.ok(res.status === 400 || res.status === 401);
    console.log("✓ POST /api/churches/:id/join rejects bad UUID / bad auth safely");
  }

  // 7. GET /api/churches/:id/members without auth -> 401
  {
    const res = await app.request("/api/churches/00000000-0000-0000-0000-000000000000/members");
    assert.equal(res.status, 401);
    console.log("✓ GET /api/churches/:id/members rejects unauthenticated request (401)");
  }

  // 8. Validation testing with Zod schema directly
  {
    const { createChurchSchema } = await import("../src/validation/church.js");

    const invalidSlug = createChurchSchema.safeParse({
      name: "St. John",
      slug: "St John Church!",
    });
    assert.equal(invalidSlug.success, false);
    console.log("✓ Zod schema rejects invalid slug with spaces/symbols");

    const validSlug = createChurchSchema.safeParse({
      name: "St. John Youth Church",
      slug: "st-john-youth",
      city: "Lagos",
    });
    assert.equal(validSlug.success, true);
    console.log("✓ Zod schema accepts valid church payload");
  }

  // 9. Direct unit testing of requireTenantRole guard
  {
    const testApp = new Hono<TenantContext>();
    testApp.use("*", async (c, next) => {
      c.set("userId", "non-member-uuid");
      await next();
    });
    testApp.get("/test/:id", requireTenantRole(["admin", "pastor"]), (c) => c.text("authorized"));

    const resInvalid = await testApp.request("/test/not-a-uuid");
    assert.equal(resInvalid.status, 400);
    console.log("✓ requireTenantRole rejects invalid church UUID format (400)");

    const resNonMember = await testApp.request("/test/00000000-0000-0000-0000-000000000000");
    assert.equal(resNonMember.status, 403);
    const bodyNonMember = await resNonMember.json();
    assert.match(bodyNonMember.error, /not an active member/i);
    console.log("✓ requireTenantRole rejects non-members with 403 Forbidden");
  }

  // 10. New membership routes reject unauthenticated requests
  {
    const id = "00000000-0000-0000-0000-000000000000";
    const mid = "11111111-1111-1111-1111-111111111111";
    const cases: [string, string][] = [
      ["PATCH", `/api/churches/${id}`],
      ["POST", `/api/churches/${id}/leave`],
      ["PATCH", `/api/churches/${id}/members/${mid}/role`],
      ["DELETE", `/api/churches/${id}/members/${mid}`],
      ["POST", `/api/churches/${id}/primary-transfer`],
      ["POST", `/api/churches/${id}/primary-transfer/accept`],
      ["POST", `/api/churches/${id}/primary-transfer/cancel`],
    ];
    for (const [method, path] of cases) {
      const res = await app.request(path, { method });
      assert.equal(res.status, 401, `${method} ${path} should require auth`);
    }
    console.log("✓ Membership management routes reject unauthenticated requests (401)");
  }

  // 11. Membership validation schemas
  {
    const { updateChurchSchema, updateMemberRoleSchema, listChurchesQuerySchema } = await import(
      "../src/validation/church.js"
    );

    assert.equal(updateChurchSchema.safeParse({}).success, false);
    assert.equal(updateChurchSchema.safeParse({ slug: "new-slug" }).success, false);
    assert.equal(updateChurchSchema.safeParse({ roleLabels: { owner: "Boss" } }).success, false);
    assert.equal(updateChurchSchema.safeParse({ roleLabels: { leader: "   " } }).success, false);
    assert.equal(updateChurchSchema.safeParse({ roleLabels: { leader: "Deacon" } }).success, true);
    console.log("✓ Church update rejects empty/slug/unknown-role/blank-label payloads, accepts labels");

    assert.equal(updateMemberRoleSchema.safeParse({ role: "owner" }).success, false);
    assert.equal(updateMemberRoleSchema.safeParse({ role: "admin", isPrimaryAdmin: true }).success, false);
    assert.equal(updateMemberRoleSchema.safeParse({ role: "leader" }).success, true);
    console.log("✓ Role payload accepts only a known role and nothing else (no primary flag smuggling)");

    assert.equal(listChurchesQuerySchema.safeParse({ limit: "500" }).success, false);
    const defaults = listChurchesQuerySchema.parse({});
    assert.equal(defaults.limit, 20);
    assert.equal(defaults.offset, 0);
    console.log("✓ Directory query caps limit at 50 and defaults paging");
  }

  console.log("\nAll 11 unit and router integration checks passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
