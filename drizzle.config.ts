import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { defineConfig } from "drizzle-kit";

const dataDirectory = join(process.cwd(), "data");
mkdirSync(dataDirectory, { recursive: true });

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: join(dataDirectory, "english.db"),
  },
});
