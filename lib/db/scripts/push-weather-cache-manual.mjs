// One-off manual DDL script for `weather_cache` (PRD_Mobull_Weather_Coverage.md
// FR-6), NOT a permanent part of this package's build/push pipeline (unlike
// `apply-rls.mjs`, which IS chained into `pnpm run push`).
//
// Why this exists instead of just running `drizzle-kit push`: this repo's live Neon
// DB currently has THREE orphaned enum types (`billing_status`, `invoice_status`,
// `plan_tier`) and three orphaned tables (`billing_accounts`, `billing_invoices`,
// `billing_webhook_events`) that exist in the database but are NOT exported from
// `../src/schema/index.ts` — see that file's git history ("Fix: revert accidental
// billing-export lines swept into prior commit"): the export was deliberately
// reverted, but the already-pushed DB objects were left in place. Because of that,
// `drizzle-kit push`'s enum-conflict resolver sees 3 "missing" enums and 1 "new" one
// (`weather_condition`) and requires an interactive choice (create vs. rename) with
// no non-interactive flag to answer it safely. Worse: whichever way that prompt is
// answered, any enum NOT explicitly chosen as a rename target ends up in `result.deleted`
// (per drizzle-kit's own `promptNamedWithSchemasConflict` — see `enumsResolver` in
// `drizzle-kit`'s source), which would emit `DROP TYPE billing_status/invoice_status/
// plan_tier`. Since real tables (`billing_accounts` etc.) already depend on those
// types, that DROP would fail outright or (if ever cascaded) destroy those tables'
// columns — not an acceptable side effect of shipping the weather feature.
//
// This script therefore applies ONLY the exact DDL `drizzle-kit push` would have
// generated for `weather_cache`/`weather_condition` (see `../src/schema/
// weather-cache.ts` for the source of truth this was hand-derived from), and touches
// nothing else. It is idempotent (`IF NOT EXISTS` / a `DO $$ ... EXCEPTION duplicate_object`
// guard for the enum, which has no `IF NOT EXISTS` form in Postgres) and safe to
// re-run.
//
// Whoever eventually resolves the billing-export drift (re-exporting those files for
// real, or formally dropping the orphaned objects on purpose) should delete this
// script afterward and let a normal `pnpm run push` own `weather_cache` going
// forward — this is a one-time unblock, not a new permanent pattern.
import pg from "pg";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error("MIGRATION_DATABASE_URL must be set. Did you forget to provision a database?");
}

const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });

try {
  await pool.query(`
    DO $$ BEGIN
      CREATE TYPE "weather_condition" AS ENUM ('clear','cloudy','windy','rain','sleet','snow','hail','storm','unknown');
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END $$;
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS "weather_cache" (
      "id" serial PRIMARY KEY NOT NULL,
      "rounded_lat" numeric(5,2) NOT NULL,
      "rounded_lng" numeric(6,2) NOT NULL,
      "date" date NOT NULL,
      "condition" "weather_condition" NOT NULL,
      "description" text,
      "temp_high_f" numeric(5,1) NOT NULL,
      "temp_low_f" numeric(5,1) NOT NULL,
      "precipitation_chance" integer NOT NULL,
      "computed_at" timestamp DEFAULT now() NOT NULL
    );
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS "weather_cache_lat_lng_date_idx"
      ON "weather_cache" ("rounded_lat", "rounded_lng", "date");
  `);

  // eslint-disable-next-line no-console -- standalone ops script, not app request logging
  console.log("[push-weather-cache-manual] weather_condition enum + weather_cache table (+ unique index) applied");
} finally {
  await pool.end();
}
