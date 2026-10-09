import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { profileRouter } from "./routes/profile.js";
import { churchRouter } from "./routes/church.js";

const app = new Hono();

// Global middleware
app.use("*", logger());
app.use(
  "*",
  cors({
    origin: "*",
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
