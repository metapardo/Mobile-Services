import { Router, type IRouter } from "express";
import { ComputeRouteBody, ComputeRouteResponse, ComputeRouteMatrixBody, ComputeRouteMatrixResponse } from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { rateLimitMiddleware } from "../middlewares/rate-limit";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";
import { computeRoute, computeRouteMatrix, GoogleMapsConfigError, GoogleMapsUpstreamError, NoRouteFoundError } from "../integrations/google-maps";

const router: IRouter = Router();

/**
 * POST /routes/compute — PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-1 through FR-6,
 * Section 9.1. Proxies Routes API `computeRoutes` with `travelMode: DRIVE`,
 * `routingPreference: TRAFFIC_AWARE`, and the given `departureTime` (see
 * `../integrations/google-maps.ts` for the exact upstream request/response contract).
 * Returns ONE-WAY distance/time — round-trip doubling is the Fuel Gauge calculation
 * layer's job (PRD §6.1), not this proxy's.
 *
 * FR-5: a routing failure (upstream 4xx/5xx/malformed response) and "Google
 * successfully found no route" are distinguished — 502 vs 422 — so the frontend can
 * always land on Unknown-with-retry rather than ever fabricate a grade, regardless of
 * which one happened.
 *
 * FR-21a: rate-limited (bucket `"routing"`, shared with `POST /routes/matrix` below).
 * This route has no cache layer to fall back on (unlike the matrix route), so a
 * limit-exceeded organization gets a plain 429 rather than a degraded 200 — PRD §10's
 * "cached-only results with a notice" behavior only applies to `/routes/matrix`.
 */
router.post("/routes/compute", requireOrgSession, rateLimitMiddleware("routing"), async (req, res) => {
  if (req.underRateLimit === false) {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many route lookups right now. Try again shortly.",
    });
    return;
  }
  const parsedBody = ComputeRouteBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const result = await computeRoute({
      originPlaceId: body.originPlaceId,
      destinationPlaceId: body.destinationPlaceId,
      // `departureTime` round-trips as a `Date` at this layer (zod `coerce.date()` —
      // same reasoning as `bookings.ts`'s `date`/`toWire` comments), converted back to
      // an RFC3339 string for Google here.
      departureTime: body.departureTime.toISOString(),
    });
    const data = ComputeRouteResponse.parse(result);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof NoRouteFoundError) {
      logger.warn({ err }, "POST /routes/compute: no route between these places");
      res.status(422).json({ error: "no_route_found", message: "No drivable route was found between these two addresses." });
      return;
    }
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /routes/compute: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      logger.warn({ err }, "POST /routes/compute: Routes API request failed");
      res.status(502).json({ error: "route_compute_failed", message: "Couldn't get drive time right now." });
      return;
    }
    logger.error({ err }, "POST /routes/compute: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /routes/matrix — PRD_Mobull_Appointment_Optimizer_v1.0.md FR-18a/FR-20, the
 * batch sibling of `POST /routes/compute` (1 origin x N destinations, one Route
 * Matrix element batch per search rather than N separate `/routes/compute` calls in
 * a loop — see that PRD's §9 cost mitigations).
 *
 * FR-21/FR-21a: cache-aside and rate limiting both live inside `computeRouteMatrix`
 * (cache) and this handler (rate limit), sharing the `"routing"` bucket with
 * `POST /routes/compute` above. PRD §10 "Rate limit hit mid-search -> return
 * cached-only results with a notice, not an error": unlike `/routes/compute`, a
 * limit-exceeded organization here still gets a `200` — `allowUpstreamCall: false`
 * tells `computeRouteMatrix` to skip Google entirely and return cache hits plus
 * `error: "rate_limited"` for every cache miss, never a 429.
 */
router.post("/routes/matrix", requireOrgSession, rateLimitMiddleware("routing"), async (req, res) => {
  const parsedBody = ComputeRouteMatrixBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;
  try {
    const result = await computeRouteMatrix({
      originPlaceId: body.originPlaceId,
      destinationPlaceIds: body.destinationPlaceIds,
      departureTime: body.departureTime.toISOString(),
      allowUpstreamCall: req.underRateLimit !== false,
    });
    const data = ComputeRouteMatrixResponse.parse(result);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /routes/matrix: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      logger.warn({ err }, "POST /routes/matrix: Route Matrix request failed");
      res.status(502).json({ error: "route_matrix_failed", message: "Couldn't get drive times right now." });
      return;
    }
    logger.error({ err }, "POST /routes/matrix: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
