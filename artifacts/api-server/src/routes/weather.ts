import { Router, type IRouter } from "express";
import { WeatherForecastBody, WeatherForecastResponse } from "@workspace/api-zod";
import { getCachedForecast, upsertForecastDays, roundCoordinate } from "@workspace/db";
import { requireOrgSession } from "../middlewares/require-org-session";
import { rateLimitMiddleware } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";
import { getDailyForecast, GoogleWeatherConfigError, GoogleWeatherUpstreamError } from "../integrations/google-weather";

const router: IRouter = Router();

/**
 * POST /weather/forecast — PRD_Mobull_Weather_Coverage.md Sections 5-7 (FR-3 through
 * FR-10). Mirrors `POST /places/autocomplete` (`./places.ts`) exactly for the
 * middleware/error-handling shape: `requireOrgSession` + `rateLimitMiddleware`, the
 * same `req.underRateLimit === false` -> 429 check, the same
 * ConfigError -> 500 (logged + Sentry) / UpstreamError -> 502 mapping.
 *
 * Business logic (FR-6-FR-8): round the request's lat/lng to ~2 decimal places
 * (`roundCoordinate`, `@workspace/db`), check `weather_cache` for that rounded
 * location. On a cache hit for every day Google would return anyway there's nothing
 * to gain by calling Google again, but this route can't know in advance how many days
 * Google would return for a location it hasn't cached yet — so the actual rule is
 * simpler and matches FR-8's own framing ("one upstream call hydrates many cache
 * rows"): if there's ANY cached data for this rounded location, serve it straight
 * from the cache (no upstream call); only call `getDailyForecast` when the cache is
 * completely empty for this location. That single call's full response (up to 10
 * days, FR-10) is then upserted into `weather_cache` in one bulk write and returned.
 *
 * This means a location's cache is refreshed at most once per `WEATHER_CACHE_TTL_HOURS`
 * (a stale-but-present row is still served, not silently refreshed early) — simpler
 * than a per-date freshness check, and correct given FR-8's one-call-covers-everything
 * shape: there is no scenario where some of a location's cached days are fresh and
 * others are stale, since they were all written in the same upsert.
 */
router.post("/weather/forecast", requireOrgSession, rateLimitMiddleware("weather"), async (req, res) => {
  if (req.underRateLimit === false) {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many weather lookups right now. Try again shortly.",
    });
    return;
  }
  const parsedBody = WeatherForecastBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const roundedLat = roundCoordinate(parsedBody.data.latitude);
    const roundedLng = roundCoordinate(parsedBody.data.longitude);

    let forecastDays = await getCachedForecast(roundedLat, roundedLng);

    if (forecastDays.length === 0) {
      const freshDays = await getDailyForecast({
        latitude: parsedBody.data.latitude,
        longitude: parsedBody.data.longitude,
      });
      await upsertForecastDays(roundedLat, roundedLng, freshDays);
      forecastDays = freshDays;
    }

    const data = WeatherForecastResponse.parse(forecastDays);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleWeatherConfigError) {
      logger.error({ err }, "POST /weather/forecast: GOOGLE_WEATHER_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleWeatherUpstreamError) {
      logger.warn({ err }, "POST /weather/forecast: Weather API (New) request failed");
      res.status(502).json({ error: "weather_forecast_failed", message: "Weather forecast is unavailable right now." });
      return;
    }
    logger.error({ err }, "POST /weather/forecast: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
