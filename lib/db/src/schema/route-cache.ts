import { pgTable, serial, text, integer, numeric, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `PRD_Mobull_Appointment_Optimizer_v1.0.md` FR-21 (shared with
 * `PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md` §9.2 — "Phase 1 in both PRDs") — a
 * shared route cache on `(origin_place_id, destination_place_id, hour_of_week)`, 30-day
 * TTL, so both features (and every organization) hit the same cached numbers.
 *
 * DELIBERATELY NOT ORGANIZATION-SCOPED — the ONE exception to "every table in this
 * schema is org-scoped with RLS" in the whole codebase, and that's intentional, not an
 * oversight: Google's drive time between two fixed places at a given hour-of-week
 * doesn't depend on which organization asked for it, so gating this table by
 * `organizationId`/`tenantIsolationPolicy`/`.enableRLS()` would only fragment a cache
 * that should be shared across every tenant hitting the same two addresses (and the
 * PRD says as much: "living in the routing proxy so both features hit it"). Do not add
 * organization scoping here without re-reading this comment and FR-21 first.
 *
 * `hourOfWeek` is `dayOfWeek * 24 + hourOfDay` (0-167), collapsing "drive time at a
 * given hour" into 168 weekly buckets rather than caching per exact timestamp (which
 * would almost never hit) — matches the PRD's own cache-key wording verbatim. Callers
 * computing this bucket should settle on one `dayOfWeek` convention (e.g. JS's
 * `Date#getDay()`, Sunday=0) and use it consistently on both write and read; this
 * schema doesn't enforce which one.
 *
 * 30-day TTL is enforced by CALLERS filtering `computedAt > now() - interval '30
 * days'` on read (see `getCachedRoute` in `../route-cache.ts`) — there is no DB-level
 * expiry/cron job here, just a read-time filter. `miles`/`minutes` are `numeric`
 * (string-typed at the JS layer, same convention as every other money/measurement
 * column in this schema — see `bookings.ts`'s `depositAmount` etc.) rather than
 * `doublePrecision`, for consistency, not because sub-cent precision matters here.
 */
export const routeCacheTable = pgTable(
  "route_cache",
  {
    id: serial("id").primaryKey(),
    originPlaceId: text("origin_place_id").notNull(),
    destinationPlaceId: text("destination_place_id").notNull(),
    hourOfWeek: integer("hour_of_week").notNull(),
    miles: numeric("miles", { precision: 10, scale: 3 }).notNull(),
    minutes: numeric("minutes", { precision: 10, scale: 2 }).notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("route_cache_origin_destination_hour_idx").on(
      table.originPlaceId,
      table.destinationPlaceId,
      table.hourOfWeek,
    ),
  ],
  // No `.enableRLS()` call — see the doc comment above. This is the one table in this
  // schema that intentionally has no row-level security.
);

export const insertRouteCacheSchema = createInsertSchema(routeCacheTable).omit({
  id: true,
  computedAt: true,
});
export type InsertRouteCache = z.infer<typeof insertRouteCacheSchema>;
export type RouteCacheRow = typeof routeCacheTable.$inferSelect;
