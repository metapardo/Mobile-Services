import { sql } from "drizzle-orm";
import { db } from "./client";

/**
 * The session-variable mechanism every query against a business-owned table needs
 * to go through. RLS policies on those tables (see `./schema/rls.ts`) compare each
 * row's `organization_id` column against `current_setting('app.organization_id', true)`.
 * This helper is how that Postgres session variable actually gets set.
 *
 * No call sites exist yet — there are no real data routes in `artifacts/api-server`
 * yet, only `/healthz`. This establishes the correct pattern for whoever builds the
 * first real route next; it is not wired into any middleware or route today.
 *
 * Correctness notes (both matter given Neon's pooled `DATABASE_URL` in `.env`):
 *
 * 1. Uses `select set_config('app.organization_id', $1, true)` rather than
 *    `SET LOCAL app.organization_id = $1`. Postgres's `SET` statement is a utility
 *    statement, not a regular parameterized SQL command — it does not accept bind
 *    parameters at all, so `SET LOCAL ... = $1` is a syntax error over the extended
 *    (parameterized) query protocol that `pg`/drizzle use. `set_config(name, value,
 *    is_local)` is an ordinary function call that *does* accept a bind parameter for
 *    `value`, and its third argument (`true`) gives the same transaction-scoped
 *    behavior as `SET LOCAL` — the setting is unset again on COMMIT/ROLLBACK.
 *
 * 2. Runs inside `db.transaction(...)`, i.e. a single checked-out connection held for
 *    the lifetime of the transaction. A bare (non-local) `SET`, or a `SET LOCAL` run
 *    outside a transaction, would either leak across statements on a pooled
 *    connection or silently apply to nothing — both are real risks with Neon's
 *    pooled connection string, where the same physical connection can be reused
 *    across unrelated requests once returned to the pool.
 *
 * Usage (once real routes exist):
 *
 *   await withOrganization(organizationId, async (tx) => {
 *     return tx.select().from(clientsTable);
 *   });
 */
export async function withOrganization<T>(
  organizationId: string,
  fn: (tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.organization_id', ${organizationId}, true)`);
    return fn(tx);
  });
}
