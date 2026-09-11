import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "./client";
import { weatherCacheTable, type WeatherCacheRow } from "./schema";

/**
 * Mirrors `WeatherCondition` in `artifacts/api-server/src/integrations/
 * google-weather.ts` exactly, and `weatherConditionEnum`'s values in
 * `./schema/weather-cache.ts` — duplicated here (a plain type, not an import) rather
 * than importing across the `@workspace/db` / `@workspace/api-server` package
 * boundary, since `db` is a dependency OF `api-server`, not the other way around.
 * Keep all three in sync if this union ever changes.
 */
export type WeatherCondition =
  | "clear"
  | "cloudy"
  | "windy"
  | "rain"
  | "sleet"
  | "snow"
  | "hail"
  | "storm"
  | "unknown";

/**
 * `PRD_Mobull_Weather_Coverage.md` FR-7: "recommend 3-6 hours as a starting
 * placeholder, same 'pending real data' caveat as FR-4 — needs Bob's or engineering's
 * sign-off." 4 is the midpoint of that recommended range, picked as a placeholder, NOT
 * a confirmed value — same caveat as `RATE_LIMIT_DEFAULTS` in `./rate-limit.ts`.
 * Revisit once there's a real product decision on forecast-accuracy tolerance.
 */
export const WEATHER_CACHE_TTL_HOURS = 4;

/**
 * Rounds a raw lat/lng to 2 decimal places (~1km), per FR-6, so nearby bookings (and
 * every calendar view for the same org's HQ) share one cache row. Applied identically
 * on both the read and write path below — callers should never write
 * `weather_cache` with an un-rounded coordinate, or a read at the "same" location
 * could miss a row written under a slightly different raw value.
 */
export function roundCoordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

export type CachedForecastDay = {
  date: string;
  condition: WeatherCondition;
  description: string | undefined;
  tempHighF: number;
  tempLowF: number;
  precipitationChance: number;
};

function rowToForecastDay(row: Pick<WeatherCacheRow, "date" | "condition" | "description" | "tempHighF" | "tempLowF" | "precipitationChance">): CachedForecastDay {
  return {
    date: row.date,
    condition: row.condition as WeatherCondition,
    description: row.description ?? undefined,
    tempHighF: Number(row.tempHighF),
    tempLowF: Number(row.tempLowF),
    precipitationChance: row.precipitationChance,
  };
}

/**
 * Reads every cached forecast day for a given (already-rounded) `roundedLat`/
 * `roundedLng` pair that's still inside `WEATHER_CACHE_TTL_HOURS` — a location-wide
 * read (not a single-date lookup) since FR-8's whole point is that one upstream call
 * hydrates many dates at once, and the route handler (`POST /weather/forecast`) wants
 * to know the full set of dates it can serve from cache before deciding whether it
 * needs to call `getDailyForecast` at all.
 *
 * Deliberately NOT run through `withOrganization`/RLS — `weather_cache` is a
 * genuinely global cache (see `./schema/weather-cache.ts`'s doc comment), so there is
 * no `organizationId` to scope by here, by design, same as `route-cache.ts`.
 *
 * Callers are responsible for rounding (`roundCoordinate` above) before calling this
 * — it does not round for you, so an un-rounded coordinate here is a caller bug, not
 * something this function silently corrects.
 */
export async function getCachedForecast(roundedLat: number, roundedLng: number): Promise<CachedForecastDay[]> {
  const cutoff = new Date(Date.now() - WEATHER_CACHE_TTL_HOURS * 60 * 60 * 1000);
  const rows = await db
    .select({
      date: weatherCacheTable.date,
      condition: weatherCacheTable.condition,
      description: weatherCacheTable.description,
      tempHighF: weatherCacheTable.tempHighF,
      tempLowF: weatherCacheTable.tempLowF,
      precipitationChance: weatherCacheTable.precipitationChance,
    })
    .from(weatherCacheTable)
    .where(
      and(
        eq(weatherCacheTable.roundedLat, String(roundedLat)),
        eq(weatherCacheTable.roundedLng, String(roundedLng)),
        gt(weatherCacheTable.computedAt, cutoff),
      ),
    );
  return rows.map(rowToForecastDay);
}

/**
 * Bulk-upserts every day of a fresh `getDailyForecast` response into `weather_cache`
 * for one (already-rounded) location — FR-8's "one upstream call hydrates many cache
 * rows", so this always writes the whole batch in one call rather than the route
 * handler looping a single-row upsert helper per day. `onConflictDoUpdate` per row
 * against the `(rounded_lat, rounded_lng, date)` unique index (`./schema/
 * weather-cache.ts`), so a repeat write for a date that's still cached (e.g. two
 * concurrent requests for the same location racing past a cache miss) replaces the
 * row rather than erroring or duplicating it. `computedAt` resets to `now()` on every
 * write, restarting the TTL clock for that date from this write. A no-op (no query at
 * all) when `days` is empty.
 */
export async function upsertForecastDays(roundedLat: number, roundedLng: number, days: CachedForecastDay[]): Promise<void> {
  if (days.length === 0) return;
  const now = new Date();
  const values = days.map((day) => ({
    roundedLat: String(roundedLat),
    roundedLng: String(roundedLng),
    date: day.date,
    condition: day.condition,
    description: day.description ?? null,
    tempHighF: String(day.tempHighF),
    tempLowF: String(day.tempLowF),
    precipitationChance: day.precipitationChance,
    computedAt: now,
  }));
  await db
    .insert(weatherCacheTable)
    .values(values)
    .onConflictDoUpdate({
      target: [weatherCacheTable.roundedLat, weatherCacheTable.roundedLng, weatherCacheTable.date],
      set: {
        condition: sqlExcluded("condition"),
        description: sqlExcluded("description"),
        tempHighF: sqlExcluded("temp_high_f"),
        tempLowF: sqlExcluded("temp_low_f"),
        precipitationChance: sqlExcluded("precipitation_chance"),
        computedAt: sqlExcluded("computed_at"),
      },
    });
}

// Drizzle's `.onConflictDoUpdate` `set` needs each column's value pulled from the
// proposed-insert row when the conflict target matched more than one distinct value
// across the batch (e.g. this batch has 10 different `date`s, only one of which
// conflicts) — `excluded.<column>` is Postgres's own name for that row, same as a
// plain `INSERT ... ON CONFLICT DO UPDATE SET x = excluded.x` would use.
function sqlExcluded(column: string) {
  return sql.raw(`excluded."${column}"`);
}
