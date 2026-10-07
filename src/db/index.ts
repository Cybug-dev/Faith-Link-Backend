import { Pool } from "pg";
import { attachDatabasePool } from "@neon/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema.js";

const connectionString = process.env.DATABASE_URL;

// Module-scoped pool initialized once per isolate
export const pool = new Pool({
  connectionString,
  max: 5,
});

// Guard against idle connection drops causing uncaughtExceptions in serverless isolate
attachDatabasePool(pool);

export const db = drizzle(pool, { schema });
export { schema };
