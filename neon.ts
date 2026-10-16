import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    api: {
      name: "api",
      source: "./src/index.ts",
      // Function env is static across branches (local dev and deploy). Origins are public,
      // not secrets. Drop localhost before public launch.
      // RESEND_* are secrets: read from the shell running `neon dev` / `neon deploy`
      // (e.g. exported from .env.local), never written in this file.
      env: {
        CORS_ALLOWED_ORIGINS: "https://faithlinkwebapp.vercel.app,http://localhost:5173",
        RESEND_API_KEY: process.env.RESEND_API_KEY ?? "",
        RESEND_FROM: process.env.RESEND_FROM ?? "",
      },
      // Fixed port so the frontend's VITE_API_BASE_URL stays stable.
      dev: { port: 8787 },
    },
  },
});
