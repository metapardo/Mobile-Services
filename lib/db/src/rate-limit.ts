import { sql } from "drizzle-orm";
import { rateLimitCounterTable } from "./schema";
import { withOrganization } from "./tenant";

/**
 * FR-21a starting-guess limits — the PRD explicitly does not specify numbers for
 * this ("the PRD doesn't specify numbers"). These are placeholders pending real
 * usage data, not values confirmed against Google Maps Platform's actual quotas.
 * Revisit once this feature has real production traffic to look at. Routing and
 * places are limited independently per FR-21a, hence two separate buckets/limits
 * rather than one shared number.
 */
export const RATE_LIMIT_DEFAULTS = {
  routing: { limit: 200, windowMinutes: 60 },
  places: { limit: 500, windowMinutes: 60 },
} as const;

/**
 * Atomically checks-and-increments a fixed-window rate-limit counter for
 * `(organizationId, bucket)`. Returns `true` if the caller is still under `limit`
 * counting this call, `false` if this call pushed it over.
 *
 * Fixed-window (not sliding-window) by design — this pass's explicit scope is "just
 * the storage plus a check-and-increment helper", not "a fully-implemented
 * sliding-window limiter". `windowStart` is floored to the start of the current
 * `windowMinutes`-sized window (e.g. `windowMinutes: 60` floors to the top of the
 * current clock hour); a new row starts (count starting at 1) whenever the window
 * rolls over.
 *
 * The increment is a single `INSERT ... ON CONFLICT (organizationId, bucket,
 * windowStart) DO UPDATE SET count = count + 1 RETURNING count` — atomic under
 * concurrent callers because Postgres serializes conflicting upserts against the same
 * unique key, so two simultaneous requests can't both read the same pre-increment
 * count and both wrongly conclude they're under the limit.
 *
 * Storage-layer only — no caller exists yet in `artifacts/api-server`. Wiring this
 * into `routing.ts`'s/`places.ts`'s request path as real middleware (using
 * `RATE_LIMIT_DEFAULTS` above, or values the org's own settings override) is a later
 * integrations pass's job.
 */
export async function checkAndIncrement(
  organizationId: string,
  bucket: string,
  limit: number,
  windowMinutes: number,
): Promise<boolean> {
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  return withOrganization(organizationId, async (tx) => {
    const rows = await tx
      .insert(rateLimitCounterTable)
      .values({ organizationId, bucket, windowStart, count: 1 })
      .onConflictDoUpdate({
        target: [rateLimitCounterTable.organizationId, rateLimitCounterTable.bucket, rateLimitCounterTable.windowStart],
        set: { count: sql`${rateLimitCounterTable.count} + 1` },
      })
      .returning({ count: rateLimitCounterTable.count });
    const count = rows[0]?.count ?? 0;
    return count <= limit;
  });
}
