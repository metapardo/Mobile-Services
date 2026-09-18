import { Router, type IRouter } from "express";
import {
  AutocompletePublicPlacesBody,
  AutocompletePublicPlacesResponse,
  GetPublicPlaceDetailsBody,
  GetPublicPlaceDetailsResponse,
  ComputePublicRouteBody,
  ComputePublicRouteResponse,
} from "@workspace/api-zod";
import { publicRateLimitMiddleware } from "../middlewares/public-rate-limit";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";
import { autocompletePlaces, getPlaceDetails, computeRoute, GoogleMapsConfigError, GoogleMapsUpstreamError, NoRouteFoundError } from "../integrations/google-maps";

/**
 * `PRD_Mobull_Public_Calculator.md` Section 5 — unauthenticated counterparts to
 * `routes/places.ts` / `routes/routing.ts` for the no-login `mobull.app/calculator`
 * marketing page. Deliberately a SEPARATE router/file rather than added directly to
 * `places.ts`/`routing.ts` (route-layer duplication, not a rewrite): those files stay
 * mounted behind `requireOrgSession` for paying customers, unmodified; every route in
 * THIS file is intentionally unauthenticated (no `requireOrgSession` anywhere below)
 * and proxies the exact same `../integrations/google-maps.ts` functions those files
 * call, so the two never drift apart on the actual Google request/response handling.
 *
 * FR-2: rate-limited on `publicRateLimitMiddleware` (IP-keyed, `@workspace/db`'s
 * `public_rate_limit_counters`) instead of `rateLimitMiddleware`
 * (`organizationId`-keyed) — see that middleware's doc comment for why the two can't
 * share a bucket. FR-4: `GOOGLE_MAPS_API_KEY` is read only inside
 * `../integrations/google-maps.ts`, exactly as it is for the authenticated routes —
 * nothing in this file touches it directly.
 */

const router: IRouter = Router();

/**
 * POST /public/places/autocomplete — see this file's header comment and
 * `routes/places.ts`'s `POST /places/autocomplete` (same underlying proxy call).
 * Bucket `"public_places"`, shared with `/public/places/details` below.
 */
router.post("/public/places/autocomplete", publicRateLimitMiddleware("public_places"), async (req, res) => {
  if (req.underPublicRateLimit === false) {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many address lookups right now. Try again shortly.",
    });
    return;
  }
  const parsedBody = AutocompletePublicPlacesBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const suggestions = await autocompletePlaces(parsedBody.data);
    const data = AutocompletePublicPlacesResponse.parse({ suggestions });
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /public/places/autocomplete: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      logger.warn({ err }, "POST /public/places/autocomplete: Places API (New) request failed");
      res.status(502).json({ error: "places_autocomplete_failed", message: "Address suggestions are unavailable right now." });
      return;
    }
    logger.error({ err }, "POST /public/places/autocomplete: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /public/places/details — see this file's header comment and
 * `routes/places.ts`'s `POST /places/details` (same underlying proxy call). Bucket
 * `"public_places"`, shared with `/public/places/autocomplete` above.
 */
router.post("/public/places/details", publicRateLimitMiddleware("public_places"), async (req, res) => {
  if (req.underPublicRateLimit === false) {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many address lookups right now. Try again shortly.",
    });
    return;
  }
  const parsedBody = GetPublicPlaceDetailsBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const result = await getPlaceDetails(parsedBody.data);
    if (!result) {
      res.status(404).json({ error: "place_not_found" });
      return;
    }
    const data = GetPublicPlaceDetailsResponse.parse(result);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /public/places/details: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      logger.warn({ err }, "POST /public/places/details: Place Details (New) request failed");
      res.status(502).json({ error: "place_details_failed", message: "Couldn't resolve that address right now." });
      return;
    }
    logger.error({ err }, "POST /public/places/details: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * FR-3 bot mitigation for `POST /public/routes/compute` specifically — the one
 * public route that spends a real, priced Google API call with no cache to fall
 * back on. Two checks, both "at minimum a honeypot/timing check" per the PRD (a real
 * CAPTCHA vendor is explicitly out of scope — no site key/account exists yet):
 *
 *   1. Honeypot: `website` must be blank. Real visitors never see this field (it's
 *      hidden from the rendered form by the frontend); a filled-in value means
 *      whatever submitted this request filled in every field it could find, which a
 *      human never does for a field that isn't visible.
 *   2. Timing: `formRenderedAt` must be far enough in the past. A human filling in a
 *      price and selecting two addresses via autocomplete takes several seconds at
 *      an absolute minimum; a request arriving faster than that is far more likely a
 *      script replaying/constructing the request than a real visitor. Threshold
 *      picked generously LOW (3s) specifically to avoid false-positiving a fast
 *      human on a pre-filled/returning-visitor flow — this is a coarse bot filter,
 *      not a strict human-speed benchmark.
 *
 * Both failures return the exact same `400 invalid_request` shape an ordinary zod
 * validation failure would — deliberately indistinguishable, so a scripted caller
 * probing this endpoint can't learn which check it tripped.
 */
const MIN_FORM_FILL_TIME_MS = 3_000;

function looksLikeBot(body: { website?: string; formRenderedAt: Date }): boolean {
  if (body.website && body.website.trim().length > 0) {
    return true;
  }
  const elapsedMs = Date.now() - body.formRenderedAt.getTime();
  // A negative/absurdly large elapsed time (clock skew, a stale/replayed
  // `formRenderedAt`) is also treated as suspicious rather than silently allowed —
  // only a plausible, positive, "took at least MIN_FORM_FILL_TIME_MS" gap passes.
  return !(elapsedMs >= MIN_FORM_FILL_TIME_MS);
}

/**
 * POST /public/routes/compute — see this file's header comment and
 * `routes/routing.ts`'s `POST /routes/compute` (same underlying proxy call, same
 * one-way response, same `no_route_found` 422 / upstream 502 error-shape
 * conventions). Bucket `"public_routing"` (FR-2), plus the FR-3 bot check above,
 * unique to this route among the three in this file.
 */
router.post("/public/routes/compute", publicRateLimitMiddleware("public_routing"), async (req, res) => {
  if (req.underPublicRateLimit === false) {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many route lookups right now. Try again shortly.",
    });
    return;
  }
  const parsedBody = ComputePublicRouteBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;

  if (looksLikeBot(body)) {
    // FR-3: logged at `warn` (not `error`/Sentry) — an expected, regular occurrence
    // on a public, indexable, crawler-reachable page, not an application bug.
    logger.warn({ hadHoneypotValue: !!body.website }, "POST /public/routes/compute: rejected by bot-mitigation check");
    res.status(400).json({ error: "invalid_request", message: "Unable to process this request." });
    return;
  }

  try {
    const result = await computeRoute({
      originPlaceId: body.originPlaceId,
      destinationPlaceId: body.destinationPlaceId,
      departureTime: body.departureTime.toISOString(),
    });
    const data = ComputePublicRouteResponse.parse(result);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof NoRouteFoundError) {
      logger.warn({ err }, "POST /public/routes/compute: no route between these places");
      res.status(422).json({ error: "no_route_found", message: "No drivable route was found between these two addresses." });
      return;
    }
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /public/routes/compute: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      logger.warn({ err }, "POST /public/routes/compute: Routes API request failed");
      res.status(502).json({ error: "route_compute_failed", message: "Couldn't get drive time right now." });
      return;
    }
    logger.error({ err }, "POST /public/routes/compute: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
