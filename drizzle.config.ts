import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defineConfig } from "drizzle-kit";

const databasePath =
  process.env.DATABASE_PATH ?? join(process.cwd(), "data", "english.db");
mkdirSync(dirname(databasePath), { recursive: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: databasePath,
  },
});
