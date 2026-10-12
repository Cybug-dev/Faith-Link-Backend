import assert from "node:assert/strict";
import app from "../src/index.js";
import {
  calculateStreak,
  ACHIEVEMENTS_REGISTRY,
} from "../src/services/progress.js";

async function runTests() {
  console.log("Starting Phase 6 Results, Progress & Achievements Tests...\n");

  // 1. GET /api/me/progress without auth -> 401
  {
    const res = await app.request("/api/me/progress");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ GET /api/me/progress rejects unauthenticated request (401)");
  }

  // 2. GET /api/me/achievements without auth -> 401
  {
    const res = await app.request("/api/me/achievements");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ GET /api/me/achievements rejects unauthenticated request (401)");
  }

  // 3. GET /api/me/stats without auth -> 401
  {
    const res = await app.request("/api/me/stats");
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.match(body.error, /Unauthorized/i);
    console.log("✓ GET /api/me/stats rejects unauthenticated request (401)");
  }

  // 4. Unit test: calculateStreak
  {
    // Empty array -> 0
    assert.equal(calculateStreak([]), 0);

    const now = new Date();

    // Active today -> 1
    assert.equal(calculateStreak([now]), 1);

    // Active today and yesterday -> 2
    const yesterday = new Date(now);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    assert.equal(calculateStreak([now, yesterday]), 2);

    // Active today, yesterday, and 2 days ago -> 3
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setUTCDate(twoDaysAgo.getUTCDate() - 2);
    assert.equal(calculateStreak([twoDaysAgo, yesterday, now]), 3);

    // Multiple activities on the same day -> counted once (streak = 2)
    const todayMorning = new Date(now);
    todayMorning.setUTCHours(8, 0, 0, 0);
    const todayEvening = new Date(now);
    todayEvening.setUTCHours(20, 0, 0, 0);
    assert.equal(calculateStreak([yesterday, todayMorning, todayEvening]), 2);

    // Broken streak (active 3 days ago only) -> 0
    const threeDaysAgo = new Date(now);
    threeDaysAgo.setUTCDate(threeDaysAgo.getUTCDate() - 3);
    assert.equal(calculateStreak([threeDaysAgo]), 0);

    console.log("✓ calculateStreak correctly calculates consecutive engagement days and handles gaps");
  }

  // 5. Unit test: ACHIEVEMENTS_REGISTRY criteria
  {
    assert.equal(ACHIEVEMENTS_REGISTRY.length, 5);
    const keys = ACHIEVEMENTS_REGISTRY.map((a) => a.key);
    assert.ok(keys.includes("first_lesson_completed"));
    assert.ok(keys.includes("first_quiz_completed"));
    assert.ok(keys.includes("perfect_score"));
    assert.ok(keys.includes("completed_5_lessons"));
    assert.ok(keys.includes("completed_10_quizzes"));

    for (const a of ACHIEVEMENTS_REGISTRY) {
      assert.ok(a.title.length > 0);
      assert.ok(a.description.length > 0);
      assert.ok(a.badge.length > 0);
    }

    console.log("✓ ACHIEVEMENTS_REGISTRY contains all 5 required MVP achievements with descriptions and badges");
  }

  // 6. Regression check: all endpoints are mounted and reachable under /api
  {
    const resProgress = await app.request("/api/me/progress");
    assert.equal(resProgress.status, 401);

    const resAchievements = await app.request("/api/me/achievements");
    assert.equal(resAchievements.status, 401);

    const resStats = await app.request("/api/me/stats");
    assert.equal(resStats.status, 401);

    console.log("✓ All Phase 6 endpoints properly mounted and secured under /api/me");
  }

  console.log("\nAll Phase 6 Results, Progress & Achievements tests passed successfully!");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
