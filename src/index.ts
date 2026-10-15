import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { profileRouter } from "./routes/profile.js";
import { churchRouter } from "./routes/church.js";
import { lessonRouter } from "./routes/lesson.js";
import { quizRouter } from "./routes/quiz.js";
import { parseAllowedOrigins } from "./config/cors.js";

const app = new Hono();
const allowedOrigins = parseAllowedOrigins(process.env.CORS_ALLOWED_ORIGINS);

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    // Echo the origin only when allowlisted; otherwise no CORS headers, so the browser blocks it.
    origin: (origin) => (allowedOrigins.has(origin) ? origin : null),
    allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400,
  })
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    service: "faith-link-backend",
    timestamp: new Date().toISOString(),
  });
});

app.get("/", (c) => {
  return c.text("FaithLink Backend API — Running on Neon Serverless Functions");
});

// Mount domain routes
app.route("/api", profileRouter);
app.route("/api/churches", churchRouter);
app.route("/api/churches", lessonRouter);
app.route("/api/churches", quizRouter);


// Global safe error handler
app.onError((err, c) => {
  console.error("Unhandled error:", err);
  return c.json(
    {
      error: "Internal Server Error",
      message: process.env.NODE_ENV === "development" ? err.message : "An unexpected error occurred",
    },
    500
  );
});

// 404 handler
app.notFound((c) => {
  return c.json({ error: "Not Found", path: c.req.path }, 404);
});

export default app;
