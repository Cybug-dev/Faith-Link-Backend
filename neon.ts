import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  auth: true,
  functions: {
    api: {
      name: "api",
      source: "./src/index.ts",
      // Function env is static across branches (local dev and deploy). Origins are public,
      // not secrets. Drop localhost before public launch.
      env: { CORS_ALLOWED_ORIGINS: "https://faithlinkwebapp.vercel.app,http://localhost:5173" },
      // Fixed port so the frontend's VITE_API_BASE_URL stays stable.
      dev: { port: 8787 },
    },
  },
});
