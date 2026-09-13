// One-off manual DDL script for `settings.onboarding_complete`
// (PRD_Mobull_Onboarding_Flow.md FR-4/FR-5), NOT a permanent part of this package's
// build/push pipeline (unlike `apply-rls.mjs`, which IS chained into `pnpm run push`).
//
// Why this exists instead of just running `drizzle-kit push`: same landmine documented
// in `./push-weather-cache-manual.mjs` — this repo's live Neon DB has orphaned
// `billing_status`/`invoice_status`/`plan_tier` enums and `billing_accounts`/
// `billing_invoices`/`billing_webhook_events` tables left over from a reverted commit,
// none of which are exported from `../src/schema/index.ts`. Any `drizzle-kit push` run
// against this DB re-triggers `drizzle-kit`'s interactive enum-conflict resolver (no
// non-interactive flag answers it safely), and whichever enum isn't explicitly chosen
// as a rename target gets dropped — which would break those still-live billing tables.
// So, per that same script's precedent: apply only the exact, narrow, additive DDL this
// one column needs, by hand, and leave everything else alone.
//
// This script does two things, both idempotent and safe to re-run:
//   1. `ALTER TABLE settings ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT
//      NULL DEFAULT false` — the column itself (mirrors `settingsTable.onboardingComplete`
//      in `../src/schema/settings.ts`).
//   2. A one-time backfill (FR-5): `UPDATE settings SET onboarding_complete = true WHERE
//      onboarding_complete = false` — every settings row that existed before this column
//      existed gets marked as having already completed onboarding (this flow is for new
//      signups only; forcing it retroactively on active accounts would be a regression).
//      Safe to re-run: once every existing row is `true`, the `WHERE` clause matches
//      nothing, so re-running this script post-ship is a no-op, not a repeated
//      retroactive reset of any row a real new signup has legitimately left `false`.
//      (This is why step 2 is a one-time backfill baked into this ship-time script, not
//      a trigger or ongoing job — a row that goes through onboarding for real after this
//      script has already run should stay `false` until Screen 6's `PATCH /settings`
//      call sets it to `true`, and re-running this script won't touch that row again
//      since its value at that point is `false` for a real, current reason. Note this
//      means this script must NOT be re-run blindly after go-live once real onboarding
//      flows are in progress — it's intended as a single ship-time pass immediately
//      after the column is added, per FR-5.)
//
// Whoever eventually resolves the billing-export drift should delete this script
// afterward and let a normal `pnpm run push` own `settings` schema changes going
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
  const { rows: totalRows } = await pool.query(`SELECT count(*)::int AS count FROM settings`);
  // eslint-disable-next-line no-console -- standalone ops script, not app request logging
  console.log(
    `[push-onboarding-complete-manual] before: ${totalRows[0].count} total settings row(s) (column does not exist yet, so every row is implicitly "not onboarded")`,
  );

  await pool.query(`
    ALTER TABLE "settings" ADD COLUMN IF NOT EXISTS "onboarding_complete" boolean NOT NULL DEFAULT false;
  `);

  const { rowCount: backfilled } = await pool.query(
    `UPDATE settings SET onboarding_complete = true WHERE onboarding_complete = false`,
  );

  const { rows: afterRows } = await pool.query(
    `SELECT count(*)::int AS count FROM settings WHERE onboarding_complete = false`,
  );

  // eslint-disable-next-line no-console -- standalone ops script, not app request logging
  console.log(
    `[push-onboarding-complete-manual] onboarding_complete column applied. Backfilled ${backfilled} row(s) to true. Rows still false after backfill: ${afterRows[0].count}`,
  );
} finally {
  await pool.end();
}
