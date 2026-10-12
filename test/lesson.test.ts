import assert from "node:assert/strict";
import { Hono } from "hono";
import app from "../src/index.js";
import { requireTenantRole, type TenantContext } from "../src/middleware/tenant.js";
import {
  createLessonSchema,
  updateLessonSchema,
  lessonIdParamSchema,
} from "../src/validation/lesson.js";

async function runTests() {
  console.log("Starting Phase 4 Learning Content Tests...\n");

  // 1. GET /api/churches/:id/lessons without auth -> 401
  {
    const res = await app.request("/api/churches/00000000-0000-0000-0000-000000000000/lessons");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ GET /api/churches/:id/lessons rejects unauthenticated request (401)");
  }

  // 2. POST /api/churches/:id/lessons without auth -> 401
  {
    const res = await app.request("/api/churches/00000000-0000-0000-0000-000000000000/lessons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Faith Fundamentals",
        slug: "faith-fundamentals",
        content: "Lesson content",
      }),
    });
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ POST /api/churches/:id/lessons rejects unauthenticated request (401)");
  }

  // 3. GET /api/churches/:id/lessons/:lessonId without auth -> 401
  {
    const res = await app.request(
      "/api/churches/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-4111-a111-111111111111"
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ GET /api/churches/:id/lessons/:lessonId rejects unauthenticated request (401)");
  }

  // 4. PUT /api/churches/:id/lessons/:lessonId without auth -> 401
  {
    const res = await app.request(
      "/api/churches/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-4111-a111-111111111111",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated Title" }),
      }
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ PUT /api/churches/:id/lessons/:lessonId rejects unauthenticated request (401)");
  }

  // 5. POST /api/churches/:id/lessons/:lessonId/complete without auth -> 401
  {
    const res = await app.request(
      "/api/churches/00000000-0000-0000-0000-000000000000/lessons/11111111-1111-4111-a111-111111111111/complete",
      { method: "POST" }
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ POST /api/churches/:id/lessons/:lessonId/complete rejects unauthenticated request (401)");
  }

  // 6. GET /api/me/progress without auth -> 401
  {
    const res = await app.request("/api/me/progress");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ GET /api/me/progress rejects unauthenticated request (401)");
  }

  // 7. Zod Schema Unit Tests: createLessonSchema
  {
    // Invalid slug with spaces and capital letters
    const invalidSlug = createLessonSchema.safeParse({
      title: "Introduction",
      slug: "Intro Lesson",
      content: "Sample text",
    });
    assert.equal(invalidSlug.success, false);

    // Empty content
    const emptyContent = createLessonSchema.safeParse({
      title: "Introduction",
      slug: "intro-lesson",
      content: "",
    });
    assert.equal(emptyContent.success, false);

    // Valid payload
    const valid = createLessonSchema.safeParse({
      title: "Introduction to Faith",
      slug: "intro-to-faith",
      summary: "A foundational overview",
      content: "# Chapter 1\nFaith is...",
      status: "published",
      orderIndex: 1,
    });
    assert.equal(valid.success, true);
    assert.equal(valid.data.status, "published");
    console.log("✓ createLessonSchema validates slug, content, and optional fields");
  }

  // 8. Zod Schema Unit Tests: updateLessonSchema
  {
    // Empty update object fails refine check
    const emptyUpdate = updateLessonSchema.safeParse({});
    assert.equal(emptyUpdate.success, false);

    // Valid partial update
    const validUpdate = updateLessonSchema.safeParse({
      title: "New Title",
      status: "published",
    });
    assert.equal(validUpdate.success, true);
    console.log("✓ updateLessonSchema requires at least one field and allows partial updates");
  }

  // 9. Zod Schema Unit Tests: lessonIdParamSchema
  {
    const invalidParam = lessonIdParamSchema.safeParse({
      id: "not-a-uuid",
      lessonId: "11111111-1111-4111-a111-111111111111",
    });
    assert.equal(invalidParam.success, false);

    const validParam = lessonIdParamSchema.safeParse({
      id: "00000000-0000-0000-0000-000000000000",
      lessonId: "11111111-1111-4111-a111-111111111111",
    });
    assert.equal(validParam.success, true);
    console.log("✓ lessonIdParamSchema validates churchId and lessonId UUIDs");
  }

  // 10. Tenant Authorization Guard Check on Lesson Routes
  {
    const mockApp = new Hono<TenantContext>();
    mockApp.use("/api/churches/:id/lessons", async (c, next) => {
      c.set("userId", "test-user-nonmember");
      await next();
    });
    mockApp.use("/api/churches/:id/lessons", requireTenantRole(["admin", "pastor", "leader"]));
    mockApp.post("/api/churches/:id/lessons", (c) => c.json({ success: true }));

    const res = await mockApp.request("/api/churches/00000000-0000-0000-0000-000000000000/lessons", {
      method: "POST",
    });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.error, /Forbidden/i);
    console.log("✓ requireTenantRole blocks non-members from lesson creation with 403 Forbidden");
  }

  console.log("\nAll 10 Phase 4 Learning Content tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
