/**
 * Server-side proxy calls to Google's Weather API, for
 * `PRD_Mobull_Weather_Coverage.md` Section 3 (FR-1, FR-2).
 *
 * This is the ONLY module in the codebase allowed to read `GOOGLE_WEATHER_API_KEY` —
 * a separate key from `GOOGLE_MAPS_API_KEY` (see the PRD's Section 4 for why: the Maps
 * key is restricted to exactly Places API (New) + Routes API, and adding Weather to
 * that same key would mean loosening that restriction). The key is never logged (not
 * even at `debug` level) and never appears in any value returned to a route handler's
 * caller. Every Google call here happens server-side only.
 *
 * FR-2 / this file's live-docs research: this product is genuinely called the
 * **"Weather API"** (Google Maps Platform, "Environment" product family) — NOT the
 * "Places API (New)"/"Routes API (New)" pattern `google-maps.ts` follows. Confirmed
 * against Google's live docs as of 2026-09-11:
 *   - Overview: `developers.google.com/maps/documentation/weather/overview` — four
 *     query types (current conditions, hourly forecast up to 240h, **daily forecast up
 *     to 10 days**, hourly history up to 24h).
 *   - Daily forecast reference:
 *     `developers.google.com/maps/documentation/weather/reference/rest/v1/forecast.days/lookup`
 *     — `GET https://weather.googleapis.com/v1/forecast/days:lookup`.
 *   - **Auth differs from `google-maps.ts`'s convention.** Places (New)/Routes (New)
 *     take the key via an `X-Goog-Api-Key` header; the Weather API's own documented
 *     example request (`developers.google.com/maps/documentation/weather/current-conditions`)
 *     is `curl -X GET ".../v1/currentConditions:lookup?key=YOUR_API_KEY&location.latitude=...&location.longitude=..."`
 *     — the key is a **`key` query parameter**, and the `LatLng`-typed `location`
 *     field is flattened to `location.latitude`/`location.longitude` query params (the
 *     same flattening convention, confirmed on that same example URL). `forecast.days:lookup`
 *     takes the identical `location` (`LatLng`) field per its own reference page, so
 *     the same flattening is used here — not separately confirmed with its own
 *     worked curl example (the `current-conditions` guide page is the one with a
 *     literal worked example; `forecast.days`'s own how-to guide page 404'd when
 *     checked, only its bare REST reference page resolved), but this follows directly
 *     from both endpoints sharing Google's own `LatLng` message type and one endpoint's
 *     confirmed serialization of it. Flagged here as the one inference in this file
 *     that isn't a word-for-word worked example, in case it needs re-verification.
 *   - Confirmed query params on `forecast.days:lookup`: `location` (required,
 *     `LatLng`), `days` (1-10, default 10 — "Limits total days fetched from current
 *     day"), `pageSize` (1-10, default **5**), `pageToken`, `unitsSystem`
 *     (`METRIC`/`IMPERIAL`, default `METRIC`), `languageCode`. Requested below with
 *     `days=10&pageSize=10&unitsSystem=IMPERIAL` explicitly — `pageSize`'s default of 5
 *     would otherwise silently truncate a 10-day response across two pages, which
 *     would break PRD FR-5's "single call returns the full available forecast
 *     horizon" contract; `unitsSystem=IMPERIAL` gets Fahrenheit directly from Google
 *     rather than doing an F/C conversion in this codebase, matching this app's
 *     US-only convention elsewhere (`google-maps.ts`'s `regionCode: "US"`,
 *     miles-only distances).
 *   - Confirmed response shape (`LookupForecastDaysResponse`): `forecastDays[]`, each
 *     with `displayDate: {year, month, day}` (Google's `Date` type, not an ISO
 *     string — built into one below), `maxTemperature`/`minTemperature`
 *     (`Temperature: {degrees, unit}` — `unit` will be `FAHRENHEIT` given the
 *     `unitsSystem=IMPERIAL` request param above), and `daytimeForecast`/
 *     `nighttimeForecast` (`ForecastDayPart`), each of which nests
 *     `weatherCondition: {type, description: {text}, iconBaseUri}` and
 *     `precipitation: {probability: {type, percent}, qpf, snowQpf}`. This module
 *     reads `daytimeForecast` for both condition and precipitation chance (falling
 *     back to `nighttimeForecast` only if daytime is absent) since daytime conditions
 *     are what matter for an outdoor job. `weatherCondition.type`'s full enum (41
 *     values, confirmed via `.../reference/rest/v1/WeatherCondition`, e.g. `CLEAR`,
 *     `MOSTLY_CLOUDY`, `LIGHT_RAIN`, `HEAVY_SNOW`, `HAIL`, `THUNDERSTORM`,
 *     `RAIN_AND_SNOW`, `WINDY`, ...) is normalized down to this module's own small,
 *     stable `WeatherCondition` union below — callers of this module never need to
 *     know Google's raw taxonomy.
 *   - **Forecast horizon confirmed: 10 days**, both on the overview page ("Returns up
 *     to 10 days of daily forecasts at a given location, starting from the current
 *     day") and the `days`/`pageSize` param docs (both capped at 10) — matches
 *     PRD FR-10's "commonly ~10 days" guess exactly, no surprise here.
 *   - NOT separately confirmed with certainty: whether `forecastDays[0]` is always
 *     literally "today" in the location's local timezone vs. UTC-relative — the
 *     response includes a top-level `timeZone` field alongside `forecastDays[]` that
 *     this module does not currently read or account for for `displayDate` conversion.
 *     `displayDate` is a plain `{year, month, day}` triple with no timezone attached in
 *     the type itself, so the ISO date string built from it below should be
 *     timezone-safe on its own, but this is called out for whoever builds the caching
 *     route (FR-6/FR-8) in case Google's day boundaries ever appear off-by-one against
 *     wall-clock expectations in production.
 */

import { logger } from "../lib/logger";

const FORECAST_DAYS_URL = "https://weather.googleapis.com/v1/forecast/days:lookup";

/** Google returns up to this many days per `forecast.days:lookup` call (confirmed via
 *  live docs — see this file's header comment). Requested explicitly as both `days`
 *  and `pageSize` below so one call returns the entire available horizon, per PRD
 *  FR-5/FR-8. */
const MAX_FORECAST_DAYS = 10;

export class GoogleWeatherConfigError extends Error {}

/** Google responded with a non-2xx status, or a 2xx body missing fields this code depends on. */
export class GoogleWeatherUpstreamError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Reads the key lazily (per call, not at module load) so importing this module never
 * throws — only actually calling Google without a key configured does. Mirrors
 * `google-maps.ts`'s `getApiKey`. `GOOGLE_WEATHER_API_KEY` is a separate key from
 * `GOOGLE_MAPS_API_KEY` — see this file's header comment and PRD §4 for why — and is
 * expected to be provisioned in the environment (Vercel env vars in
 * production/preview, `.env` locally) by whoever owns the Google Cloud project; this
 * module does not create, enable, or otherwise manage that key.
 */
function getApiKey(): string {
  const key = process.env["GOOGLE_WEATHER_API_KEY"];
  if (!key) {
    throw new GoogleWeatherConfigError("GOOGLE_WEATHER_API_KEY is not set");
  }
  return key;
}

async function safeReadText(res: Response): Promise<string | undefined> {
  try {
    return await res.text();
  } catch {
    return undefined;
  }
}

/**
 * This module's own small, stable condition taxonomy, normalized from Google's raw
 * 41-value `WeatherCondition.type` enum (see this file's header comment) so callers
 * never need to know Google's field names. `"unknown"` covers `TYPE_UNSPECIFIED` and
 * any value Google adds in the future that isn't in the mapping below yet — deliberately
 * fails open to a neutral state rather than throwing, since an unrecognized condition
 * string is not an upstream failure (PRD FR-13's `unknown` UI state exists for exactly
 * this).
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

const RAW_CONDITION_TO_NORMALIZED: Record<string, WeatherCondition> = {
  TYPE_UNSPECIFIED: "unknown",
  CLEAR: "clear",
  MOSTLY_CLEAR: "clear",
  PARTLY_CLOUDY: "cloudy",
  MOSTLY_CLOUDY: "cloudy",
  CLOUDY: "cloudy",
  WINDY: "windy",
  WIND_AND_RAIN: "rain",
  LIGHT_RAIN_SHOWERS: "rain",
  CHANCE_OF_SHOWERS: "rain",
  SCATTERED_SHOWERS: "rain",
  RAIN_SHOWERS: "rain",
  HEAVY_RAIN_SHOWERS: "rain",
  LIGHT_TO_MODERATE_RAIN: "rain",
  MODERATE_TO_HEAVY_RAIN: "rain",
  RAIN: "rain",
  LIGHT_RAIN: "rain",
  HEAVY_RAIN: "rain",
  RAIN_PERIODICALLY_HEAVY: "rain",
  LIGHT_SNOW_SHOWERS: "snow",
  CHANCE_OF_SNOW_SHOWERS: "snow",
  SCATTERED_SNOW_SHOWERS: "snow",
  SNOW_SHOWERS: "snow",
  HEAVY_SNOW_SHOWERS: "snow",
  LIGHT_TO_MODERATE_SNOW: "snow",
  MODERATE_TO_HEAVY_SNOW: "snow",
  SNOW: "snow",
  LIGHT_SNOW: "snow",
  HEAVY_SNOW: "snow",
  SNOWSTORM: "snow",
  SNOW_PERIODICALLY_HEAVY: "snow",
  HEAVY_SNOW_STORM: "snow",
  BLOWING_SNOW: "snow",
  RAIN_AND_SNOW: "sleet",
  HAIL: "hail",
  HAIL_SHOWERS: "hail",
  THUNDERSTORM: "storm",
  THUNDERSHOWER: "storm",
  LIGHT_THUNDERSTORM_RAIN: "storm",
  SCATTERED_THUNDERSTORMS: "storm",
  HEAVY_THUNDERSTORM: "storm",
};

function normalizeCondition(rawType: string | undefined): WeatherCondition {
  if (!rawType) {
    return "unknown";
  }
  return RAW_CONDITION_TO_NORMALIZED[rawType] ?? "unknown";
}

export interface DailyForecast {
  /** ISO date string, `YYYY-MM-DD`, built from Google's `displayDate.{year,month,day}`
   *  (no time-of-day component — see this file's header comment re: timezone caveat). */
  date: string;
  /** Normalized from `daytimeForecast.weatherCondition.type` (falls back to
   *  `nighttimeForecast` only if daytime is absent). See `WeatherCondition` above. */
  condition: WeatherCondition;
  /** Google's raw human-readable condition text (`weatherCondition.description.text`),
   *  e.g. "Mostly cloudy" — passed through as-is for display, alongside (not instead
   *  of) the normalized `condition` enum. */
  description: string | undefined;
  /** Degrees Fahrenheit — this module requests `unitsSystem=IMPERIAL` from Google so
   *  no client-side C-to-F conversion happens here. */
  tempHighF: number;
  /** Degrees Fahrenheit, see `tempHighF`. */
  tempLowF: number;
  /** 0-100 integer, Google's own `precipitation.probability.percent` passed through
   *  unchanged (not normalized to a 0-1 fraction). */
  precipitationChance: number;
}

interface RawTemperature {
  degrees?: number;
  unit?: string;
}

interface RawWeatherCondition {
  type?: string;
  description?: { text?: string };
}

interface RawPrecipitation {
  probability?: { percent?: number };
}

interface RawForecastDayPart {
  weatherCondition?: RawWeatherCondition;
  precipitation?: RawPrecipitation;
}

interface RawForecastDay {
  displayDate?: { year?: number; month?: number; day?: number };
  maxTemperature?: RawTemperature;
  minTemperature?: RawTemperature;
  daytimeForecast?: RawForecastDayPart;
  nighttimeForecast?: RawForecastDayPart;
}

function formatDisplayDate(displayDate: RawForecastDay["displayDate"]): string | undefined {
  if (!displayDate?.year || !displayDate?.month || !displayDate?.day) {
    return undefined;
  }
  const month = String(displayDate.month).padStart(2, "0");
  const day = String(displayDate.day).padStart(2, "0");
  return `${displayDate.year}-${month}-${day}`;
}

/**
 * Daily forecast lookup — `GET https://weather.googleapis.com/v1/forecast/days:lookup`.
 * See this file's header comment for the full live-docs confirmation this is built
 * against (endpoint, auth, request/response shape, forecast horizon).
 *
 * Per PRD FR-5, this takes only a lat/lng (no `date` param) and returns Google's full
 * available forecast horizon (up to `MAX_FORECAST_DAYS` days, confirmed as 10) in one
 * call — callers/routes are responsible for rounding coordinates (PRD FR-6, ~2 decimal
 * places) and for any caching (PRD §6, a separate `weather_cache` table with its own
 * short TTL — this module does no caching of its own, matching `autocompletePlaces`/
 * `getPlaceDetails`/`computeRoute`'s plain-proxy precedent in `google-maps.ts`, not
 * `computeRouteMatrix`'s cache-owning one).
 */
export async function getDailyForecast(params: {
  latitude: number;
  longitude: number;
}): Promise<DailyForecast[]> {
  const url = new URL(FORECAST_DAYS_URL);
  url.searchParams.set("key", getApiKey());
  url.searchParams.set("location.latitude", String(params.latitude));
  url.searchParams.set("location.longitude", String(params.longitude));
  url.searchParams.set("days", String(MAX_FORECAST_DAYS));
  url.searchParams.set("pageSize", String(MAX_FORECAST_DAYS));
  url.searchParams.set("unitsSystem", "IMPERIAL");

  const res = await fetch(url, { method: "GET" });

  if (!res.ok) {
    logger.warn(
      { status: res.status, body: await safeReadText(res) },
      "Weather API forecast.days:lookup: non-2xx response from Google",
    );
    throw new GoogleWeatherUpstreamError(`Weather forecast.days:lookup failed with status ${res.status}`, res.status);
  }

  const json = (await res.json()) as {
    forecastDays?: RawForecastDay[];
    nextPageToken?: string;
  };

  if (json.nextPageToken) {
    // Should not happen given `days`/`pageSize` are both requested at Google's own max
    // (10) above — flagged rather than silently followed, since chasing a second page
    // would turn this into a multi-call endpoint, breaking PRD FR-5/FR-8's
    // one-upstream-call-per-location contract the caching layer is built around.
    logger.warn(
      { nextPageToken: json.nextPageToken },
      "Weather API forecast.days:lookup: unexpected nextPageToken with days=pageSize=10; not following it",
    );
  }

  const forecastDays: DailyForecast[] = [];
  for (const rawDay of json.forecastDays ?? []) {
    const date = formatDisplayDate(rawDay.displayDate);
    const dayPart = rawDay.daytimeForecast ?? rawDay.nighttimeForecast;
    const tempHighF = rawDay.maxTemperature?.degrees;
    const tempLowF = rawDay.minTemperature?.degrees;
    const precipitationChance = dayPart?.precipitation?.probability?.percent;

    if (date === undefined || tempHighF === undefined || tempLowF === undefined || precipitationChance === undefined) {
      logger.warn({ rawDay }, "Weather API forecast.days:lookup: dropping a forecastDays entry missing required fields");
      continue;
    }

    forecastDays.push({
      date,
      condition: normalizeCondition(dayPart?.weatherCondition?.type),
      description: dayPart?.weatherCondition?.description?.text,
      tempHighF,
      tempLowF,
      precipitationChance,
    });
  }

  return forecastDays;
}
