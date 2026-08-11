// Makes the row-level-security setup on every business-owned table actually airtight.
// Closes TWO separate gaps that `drizzle-kit push` alone does not close:
//
// 1. drizzle-kit push's policy-predicate bug (confirmed empirically against the real
//    Neon DB while building this): `pgPolicy(...)` + `.enableRLS()` in the schema
//    correctly produce a full `CREATE POLICY ... USING (...) WITH CHECK (...)`
//    statement when you run `drizzle-kit generate` (migration-file mode) — but
//    `drizzle-kit push` (the declarative diff mode this package actually uses) creates
//    the policy *without* the USING/WITH CHECK predicate (`pg_policy.polqual` /
//    `polwithcheck` both come back NULL after a push). A policy with no USING/WITH
//    CHECK defaults to `true` for both — i.e. push silently creates an "allow every
//    row" policy instead of the tenant-scoped one the schema declares. Worse: push's
//    own introspection doesn't detect this drift either, so a second `drizzle-kit
//    push` reports "No changes detected" and never fixes it. This was caught by
//    querying `pg_policy`/`pg_policies` directly against the live DB after a push, not
//    by reading drizzle-kit's docs/source — see the report for the reproduction.
//
//    Workaround: DROP + CREATE (not ALTER, not "IF NOT EXISTS" — Postgres has neither
//    for policies, and ALTER POLICY can't safely be assumed idempotent-correct given
//    the above) the policy here with the exact predicate, every time this script runs.
//
// 2. The Postgres RLS owner-bypass gap: Postgres does not apply RLS policies to a
//    table's *owning* role by default, even with a correct policy in place — only
//    `ALTER TABLE ... FORCE ROW LEVEL SECURITY` makes it apply to the owner too. This
//    still doesn't help for `neondb_owner` specifically (confirmed via `pg_roles`:
//    `neondb_owner` has `rolbypassrls = true`, inherited via Neon's `neon_superuser` —
//    real BYPASSRLS roles skip RLS unconditionally, FORCE has no effect on them). That's
//    why the runtime app connection (`DATABASE_URL`) does NOT use `neondb_owner` — it
//    uses `app_runtime2`, a role created via raw SQL through `MIGRATION_DATABASE_URL`
//    specifically to avoid Neon's Console/API/CLI role-creation flow, which always
//    attaches `neon_superuser` (and therefore BYPASSRLS) regardless of what you ask for.
//    `app_runtime2` has `rolbypassrls = false` and no `neon_superuser` membership,
//    verified directly — FORCE is what makes RLS actually bind for that role. drizzle-kit
//    has no schema-level way to express FORCE ROW LEVEL SECURITY at all (confirmed by
//    inspecting the installed drizzle-kit@0.31.10 output — it only ever emits
//    `ENABLE ROW LEVEL SECURITY`), hence this script.
//
// This script is chained into `pnpm run push` / `pnpm run push-force` (see
// package.json) so a single `pnpm run push` stays sufficient in normal use — you
// should not need to run this file directly. It's a plain idempotent script rather
// than a numbered migration file because this package uses `drizzle-kit push`
// (declarative diffing against live DB state), not `drizzle-kit generate`/`migrate`
// (which track a migration journal) — there is no migration-file mechanism here for
// it to slot into.
//
// Safe to re-run any number of times: every statement here is either idempotent
// (`FORCE ROW LEVEL SECURITY`, `ENABLE ROW LEVEL SECURITY`) or a drop-then-recreate
// (the policy itself). None of it touches table structure, so it can never be
// "clobbered" by a future `drizzle-kit push` — drizzle-kit's schema diffing doesn't
// manage the FORCE flag at all, and (per the bug above) doesn't manage policy
// predicates correctly either, so it will never revert what this script does.
import pg from "pg";
import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;

// .env lives at the repo root, not here — load it explicitly rather than relying on
// this being invoked with it already exported (see drizzle.config.ts for the same).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "../../../.env") });

// DROP/CREATE POLICY and ALTER TABLE ... FORCE ROW LEVEL SECURITY are DDL/policy-
// management statements — needs the owner connection, same reasoning as
// drizzle.config.ts. The restricted runtime role (DATABASE_URL / app_runtime2) is
// deliberately not granted rights for any of this.
if (!process.env.MIGRATION_DATABASE_URL) {
  throw new Error("MIGRATION_DATABASE_URL must be set. Did you forget to provision a database?");
}

// Every business-owned table that has a `tenantIsolationPolicy(...)` + `.enableRLS()`
// in lib/db/src/schema/*.ts. Keep this list in sync with that set — auth tables
// (user, session, account, verification, organization, member, invitation) are
// intentionally excluded, they don't carry organizationId and aren't RLS-scoped.
const BUSINESS_TABLES = [
  "employees",
  "employee_roles",
  "time_logs",
  "time_off_requests",
  "payroll_runs",
  "clients",
  "packages",
  "bookings",
  "booking_packages",
  "employee_splits",
  "settings",
];

const pool = new Pool({ connectionString: process.env.MIGRATION_DATABASE_URL });

try {
  for (const table of BUSINESS_TABLES) {
    const policyName = `${table}_tenant_isolation`;
    const predicate = `"${table}"."organization_id" = current_setting('app.organization_id', true)`;

    await pool.query(`DROP POLICY IF EXISTS "${policyName}" ON "${table}";`);
    await pool.query(
      `CREATE POLICY "${policyName}" ON "${table}" AS PERMISSIVE FOR ALL TO public USING (${predicate}) WITH CHECK (${predicate});`,
    );
    await pool.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY;`);
    await pool.query(`ALTER TABLE "${table}" FORCE ROW LEVEL SECURITY;`);

    // eslint-disable-next-line no-console -- standalone ops script, not app request logging
    console.log(`[apply-rls] tenant isolation policy + FORCE RLS applied on "${table}"`);
  }
} finally {
  await pool.end();
}
