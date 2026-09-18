import { sql } from "drizzle-orm";
import { db } from "./client";
import { publicRateLimitCounterTable } from "./schema";

/**
 * `PRD_Mobull_Public_Calculator.md` §5, FR-2 — rate limits for the new
 * unauthenticated `/public/places/*` / `/public/routes/compute` routes, keyed on IP
 * address rather than `organizationId` (an anonymous visitor has no organization).
 *
 * Sized roughly an order of magnitude below the equivalent per-organization buckets
 * in `./rate-limit.ts` (`places: 500/hr`, `routing: 200/hr`) — a single anonymous IP
 * is a materially smaller unit of legitimate traffic than an entire paying
 * organization's usage, so the same absolute ceiling would be far too generous here:
 *
 *   - `public_places: 30/hr` — one calculator visitor filling in Start + Client
 *     Address generates maybe 10-20 autocomplete calls (a few keystrokes' worth per
 *     field, debounced client-side) plus 2 details calls to resolve the selections.
 *     30/hr comfortably covers a visitor who re-types an address or redoes the
 *     calculation a couple of times in one sitting, while keeping a scripted scraper
 *     hammering this endpoint from one IP to a trivial fraction of the per-org limit.
 *   - `public_routing: 10/hr` — this is the endpoint that spends a real, priced
 *     Google Routes API call per hit (no cache layer, unlike `/routes/matrix`), so
 *     it's the tighter of the two. 10/hr covers a visitor iterating on their price/
 *     MPG/gas-price inputs and re-running "Calculate Route" several times, while
 *     capping a single bad actor's worst-case cost exposure to 1/20th of the
 *     per-organization `routing` bucket. Paired with `/public/routes/compute`'s
 *     honeypot/timing bot check (FR-3) as defense in depth, not the only line of
 *     defense.
 *
 * Both are placeholder guesses pending real public-traffic data, same caveat as
 * `./rate-limit.ts`'s `RATE_LIMIT_DEFAULTS` — revisit once `/calculator` has actual
 * organic traffic to look at.
 */
export const PUBLIC_RATE_LIMIT_DEFAULTS = {
  public_places: { limit: 30, windowMinutes: 60 },
  public_routing: { limit: 10, windowMinutes: 60 },
} as const;

/**
 * Atomically checks-and-increments a fixed-window rate-limit counter for
 * `(ipAddress, bucket)` — the IP-keyed sibling of `./rate-limit.ts`'s
 * `checkAndIncrement`. No `withOrganization`/RLS involved: `public_rate_limit_counters`
 * has no `organizationId` column at all (see that table's doc comment), so this runs
 * as a plain query against `db` directly rather than inside a
 * `set_config('app.organization_id', ...)` transaction.
 *
 * Returns `true` if the caller is still under `limit` counting this call, `false` if
 * this call pushed it over. Fixed-window, same tradeoff as `checkAndIncrement`.
 */
export async function checkAndIncrementPublic(
  ipAddress: string,
  bucket: string,
  limit: number,
  windowMinutes: number,
): Promise<boolean> {
  const windowMs = windowMinutes * 60 * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs);

  const rows = await db
    .insert(publicRateLimitCounterTable)
    .values({ ipAddress, bucket, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [publicRateLimitCounterTable.ipAddress, publicRateLimitCounterTable.bucket, publicRateLimitCounterTable.windowStart],
      set: { count: sql`${publicRateLimitCounterTable.count} + 1` },
    })
    .returning({ count: publicRateLimitCounterTable.count });
  const count = rows[0]?.count ?? 0;
  return count <= limit;
}
