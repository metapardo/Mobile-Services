import { and, eq, gt } from "drizzle-orm";
import { db } from "./client";
import { routeCacheTable } from "./schema";

/** FR-21's 30-day TTL, enforced here (read-time filter) rather than at the DB level. */
const CACHE_TTL_DAYS = 30;

export type CachedRoute = { miles: number; minutes: number };

/**
 * Reads a cached route for `(originPlaceId, destinationPlaceId, hourOfWeek)`, or
 * `null` on a miss — either no row exists, or the row exists but is older than the
 * 30-day TTL (FR-21).
 *
 * Deliberately NOT run through `withOrganization`/RLS — `route_cache` is a genuinely
 * global cache (see `./schema/route-cache.ts`'s doc comment), so there is no
 * `organizationId` to scope by here, by design.
 *
 * Storage layer only — nothing in this codebase calls this yet. The next
 * integrations pass wires this into `artifacts/api-server/src/integrations/
 * google-maps.ts`'s real `computeRoute`/`computeRouteMatrix` calls: check the cache
 * before calling Google, write through it (via `setCachedRoute`) after a successful
 * call.
 */
export async function getCachedRoute(
  originPlaceId: string,
  destinationPlaceId: string,
  hourOfWeek: number,
): Promise<CachedRoute | null> {
  const cutoff = new Date(Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({ miles: routeCacheTable.miles, minutes: routeCacheTable.minutes })
    .from(routeCacheTable)
    .where(
      and(
        eq(routeCacheTable.originPlaceId, originPlaceId),
        eq(routeCacheTable.destinationPlaceId, destinationPlaceId),
        eq(routeCacheTable.hourOfWeek, hourOfWeek),
        gt(routeCacheTable.computedAt, cutoff),
      ),
    );
  if (!row) return null;
  return { miles: Number(row.miles), minutes: Number(row.minutes) };
}

/**
 * Upserts a route into the cache for `(originPlaceId, destinationPlaceId,
 * hourOfWeek)` — `onConflictDoUpdate` against the unique index defined in
 * `./schema/route-cache.ts`, so a repeat write (Google's answer changed since the
 * last write, or two concurrent requests raced on the same key) replaces the stale
 * row instead of erroring or duplicating it. `computedAt` is reset to `now()` on
 * every write, restarting the 30-day TTL clock from this write.
 */
export async function setCachedRoute(
  originPlaceId: string,
  destinationPlaceId: string,
  hourOfWeek: number,
  route: CachedRoute,
): Promise<void> {
  const now = new Date();
  await db
    .insert(routeCacheTable)
    .values({
      originPlaceId,
      destinationPlaceId,
      hourOfWeek,
      miles: String(route.miles),
      minutes: String(route.minutes),
      computedAt: now,
    })
    .onConflictDoUpdate({
      target: [routeCacheTable.originPlaceId, routeCacheTable.destinationPlaceId, routeCacheTable.hourOfWeek],
      set: { miles: String(route.miles), minutes: String(route.minutes), computedAt: now },
    });
}
