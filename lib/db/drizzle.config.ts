import { defineConfig } from "drizzle-kit";
import { config } from "dotenv";
import path from "path";

// .env lives at the repo root, not here — drizzle-kit's own env auto-loading only
// looks in its cwd, which doesn't reliably reach it, so load it explicitly.
config({ path: path.join(__dirname, "../../.env") });

// drizzle-kit push runs DDL (CREATE TABLE, CREATE POLICY, ALTER TABLE ... FORCE ROW
// LEVEL SECURITY) — it needs the owner connection, not the restricted runtime role
// (`DATABASE_URL` / app_runtime2, granted only SELECT/INSERT/UPDATE/DELETE, deliberately
// no DDL rights). See lib/db/src/client.ts for the runtime connection, which correctly
// stays on DATABASE_URL.
if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error("MIGRATION_DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.MIGRATION_DATABASE_URL,
  },
});
