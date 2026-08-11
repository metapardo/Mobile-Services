import { pgPolicy, type AnyPgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Standard multi-tenant RLS policy for every business-owned table in this schema.
 * Scopes all rows (select/insert/update/delete, via `for: "all"`) to the organization
 * set in the current transaction's `app.organization_id` Postgres session variable.
 * See `../tenant.ts` for how that variable is actually set (`select set_config(...)`
 * inside a `SET LOCAL`-equivalent transaction scope) — there are no route call sites
 * for that helper yet (no real data routes exist), but the mechanism is established
 * here so whoever builds those routes next wires into it rather than inventing their own.
 *
 * Default-deny, not default-allow: if `app.organization_id` is never set,
 * `current_setting(..., true)` (the `true` = "missing_ok") returns SQL NULL, and
 * `organization_id = NULL` is NULL (never TRUE) in a `USING`/`WITH CHECK` clause —
 * so an unset session variable hides all rows rather than exposing all rows.
 *
 * IMPORTANT — this `using`/`withCheck` definition is accurate documentation of intent
 * and is exactly what `drizzle-kit generate` (migration-file mode) serializes into a
 * real `CREATE POLICY ... USING (...) WITH CHECK (...)` statement. But this package
 * uses `drizzle-kit push` (declarative diff mode), and push has a confirmed bug: it
 * creates the policy WITHOUT the USING/WITH CHECK predicate (verified empirically
 * against the real Neon DB — `pg_policy.polqual`/`polwithcheck` come back NULL after a
 * push, meaning the policy silently defaults to allowing every row), and push's own
 * introspection doesn't detect that drift on a second run either. So this schema
 * definition alone, run through `push`, is NOT sufficient — `../scripts/apply-rls.mjs`
 * drops and recreates every policy with the correct predicate via raw SQL after every
 * push, specifically to close this gap. Do not run `drizzle-kit push` directly against
 * the real database without it (it's chained into `pnpm run push`, so normal use is fine).
 *
 * IMPORTANT (separate, Postgres-level gotcha, also handled by `apply-rls.mjs`):
 * defining this policy and calling `.enableRLS()` on a table is NOT sufficient by
 * itself even if the predicate is correct. Postgres does not apply RLS policies to a
 * table's *owning* role unless `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is also
 * run — and drizzle-kit (confirmed against the installed drizzle-kit@0.31.10 /
 * drizzle-orm@0.45.2, see report) has no schema-level way to express
 * `FORCE ROW LEVEL SECURITY` at all.
 *
 * This matters even though the runtime app connection (`DATABASE_URL`) is NOT
 * `neondb_owner` — `drizzle-kit push` itself runs as the owner (`MIGRATION_DATABASE_URL`),
 * since it needs DDL rights the runtime role deliberately doesn't have, and the owner
 * role owns every table it creates. `neondb_owner` also happens to have
 * `rolbypassrls = true` (inherited via Neon's `neon_superuser`), so FORCE doesn't
 * actually bind RLS for that specific role either — but that's fine, because the
 * runtime connection uses `app_runtime2` instead, a role created via raw SQL through
 * `MIGRATION_DATABASE_URL` specifically to get `rolbypassrls = false` with no
 * `neon_superuser` membership (Neon's Console/API/CLI role-creation flow always attaches
 * `neon_superuser`, which was the actual root cause of an earlier failed attempt at this
 * — see git history). FORCE is what makes these policies bind for `app_runtime2`.
 */
export function tenantIsolationPolicy(tableName: string, table: { organizationId: AnyPgColumn }) {
  return pgPolicy(`${tableName}_tenant_isolation`, {
    for: "all",
    to: "public",
    using: sql`${table.organizationId} = current_setting('app.organization_id', true)`,
    withCheck: sql`${table.organizationId} = current_setting('app.organization_id', true)`,
  });
}
