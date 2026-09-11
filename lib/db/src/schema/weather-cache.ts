import { pgTable, serial, numeric, date, text, integer, pgEnum, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `PRD_Mobull_Weather_Coverage.md` Section 6 (FR-6 through FR-9) — a shared daily-
 * forecast cache on `(rounded_lat, rounded_lng, date)`, short TTL (see
 * `../weather-cache.ts`'s `WEATHER_CACHE_TTL_HOURS`), populated one upstream call at a
 * time (FR-8: a single `getDailyForecast` call returns up to 10 days, and every day in
 * that response gets its own row here).
 *
 * DELIBERATELY NOT ORGANIZATION-SCOPED — same exception as `./route-cache.ts` (see
 * that file's own doc comment, and FR-9 here, which points straight back at it): the
 * forecast for a given place and date doesn't depend on which organization asked, so
 * adding `organizationId`/`tenantIsolationPolicy`/`.enableRLS()` here would only
 * fragment a cache that should be shared across every tenant asking about the same
 * rounded coordinates (e.g. every org's calendar view hitting its own HQ, or two
 * different orgs' bookings landing in the same city block). Do not add organization
 * scoping here without re-reading this comment, `route-cache.ts`'s, and FR-9 first.
 *
 * **Rounding happens in application code before a row is ever written**, not at query
 * time — `../weather-cache.ts`'s `roundCoordinate` rounds a raw lat/lng to 2 decimal
 * places (~1km) before every read and write, so `roundedLat`/`roundedLng` below are
 * always already-rounded values, never raw GPS coordinates. This is what FR-6 means by
 * "nearby bookings ... share a cache hit": two addresses 200m apart round to the same
 * `(roundedLat, roundedLng)` pair and therefore the same cache row. `numeric(5,2)` /
 * `numeric(6,2)` (rather than `route-cache.ts`'s `numeric(10,3)`-style precision, or
 * `bookings.ts`'s raw `numeric(10,7)` lat/lng) is sized for exactly a 2-decimal-place
 * rounded value: latitude's range (-90.00..90.00) needs at most 4 significant digits,
 * longitude's (-180.00..180.00) at most 5 — both given one extra digit of headroom.
 *
 * `date` is a bare calendar date (Postgres `date` type, no time-of-day/timezone
 * component) — matches `bookings.ts`'s own `date` column convention for "a calendar
 * date with no clock time attached", and lines up with `DailyForecast.date`
 * (`../../artifacts/api-server/src/integrations/google-weather.ts`), which is built
 * from Google's `displayDate: {year, month, day}` triple, not a timestamp.
 *
 * `condition` is a Postgres enum, not free text, even though nothing user-supplied
 * ever reaches this column — the write path is always
 * `google-weather.ts`'s own `normalizeCondition`, which already collapses Google's raw
 * 41-value taxonomy down to this exact 9-value set. Enforcing it at the DB level too
 * catches a drift bug (e.g. someone changing `WeatherCondition` in `google-weather.ts`
 * without updating this enum) at insert time instead of silently. **Keep this enum's
 * values in sync with `WeatherCondition` in `google-weather.ts` if that union ever
 * changes.**
 *
 * TTL (FR-7) is enforced by CALLERS filtering `computed_at > now() - interval
 * 'N hours'` on read (see `getCachedForecast` in `../weather-cache.ts`) — same
 * read-time-filter pattern as `route-cache.ts`'s 30-day TTL, just a much shorter
 * window, since (unlike drive time) a forecast actually changes day to day.
 */
export const weatherConditionEnum = pgEnum("weather_condition", [
  "clear",
  "cloudy",
  "windy",
  "rain",
  "sleet",
  "snow",
  "hail",
  "storm",
  "unknown",
]);

export const weatherCacheTable = pgTable(
  "weather_cache",
  {
    id: serial("id").primaryKey(),
    roundedLat: numeric("rounded_lat", { precision: 5, scale: 2 }).notNull(),
    roundedLng: numeric("rounded_lng", { precision: 6, scale: 2 }).notNull(),
    date: date("date").notNull(),
    condition: weatherConditionEnum("condition").notNull(),
    description: text("description"),
    tempHighF: numeric("temp_high_f", { precision: 5, scale: 1 }).notNull(),
    tempLowF: numeric("temp_low_f", { precision: 5, scale: 1 }).notNull(),
    precipitationChance: integer("precipitation_chance").notNull(),
    computedAt: timestamp("computed_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("weather_cache_lat_lng_date_idx").on(table.roundedLat, table.roundedLng, table.date),
  ],
  // No `.enableRLS()` call — see the doc comment above. `route_cache` is the other
  // (and, before this table, only) exception to "every table here is org-scoped with
  // RLS" in this schema.
);

export const insertWeatherCacheSchema = createInsertSchema(weatherCacheTable).omit({
  id: true,
  computedAt: true,
});
export type InsertWeatherCache = z.infer<typeof insertWeatherCacheSchema>;
export type WeatherCacheRow = typeof weatherCacheTable.$inferSelect;
