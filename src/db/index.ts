import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path, { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

declare global {
  var __drizzleMigrated: boolean | undefined;
}

const databasePath =
  process.env.DATABASE_PATH ?? join(process.cwd(), "data", "english.db");
mkdirSync(dirname(databasePath), { recursive: true });

const sqlite = new Database(databasePath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

if (!globalThis.__drizzleMigrated) {
  const migrationsFolder = path.join(process.cwd(), "drizzle");

  try {
    migrate(db, { migrationsFolder });
    globalThis.__drizzleMigrated = true;
  } catch (error) {
    if (error instanceof Error && /already exists/i.test(error.message)) {
      console.warn(
        "Drizzle migrations were skipped because a table already exists. This database may have been initialized with drizzle-kit push; run `pnpm exec drizzle-kit migrate` after reconciling its migration history.",
        error,
      );
      globalThis.__drizzleMigrated = true;
    } else {
      throw error;
    }
  }
}
