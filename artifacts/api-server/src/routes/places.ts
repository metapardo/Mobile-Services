import { Router, type IRouter } from "express";
import { AutocompletePlacesBody, AutocompletePlacesResponse, GetPlaceDetailsBody, GetPlaceDetailsResponse } from "@workspace/api-zod";
import { requireOrgSession } from "../middlewares/require-org-session";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";
import { autocompletePlaces, getPlaceDetails, GoogleMapsConfigError, GoogleMapsUpstreamError } from "../integrations/google-maps";

const router: IRouter = Router();

/**
 * POST /places/autocomplete — PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-9 through
 * FR-13, FR-19, Section 9.1. Proxies Places API (New) Autocomplete (see
 * `../integrations/google-maps.ts` for the exact upstream request/response contract).
 * `GOOGLE_MAPS_API_KEY` is read only in that module — never sent to the browser,
 * never logged, never included in this response.
 *
 * FR-2/FR-5: computed only for an address the owner explicitly selects (this route
 * never fires on a keystroke) — that debounce/suppress-under-3-chars/select-only
 * behavior lives entirely in the frontend (Phase 2's job); this route just answers
 * whatever request it's given.
 */
router.post("/places/autocomplete", requireOrgSession, async (req, res) => {
  const parsedBody = AutocompletePlacesBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  try {
    const suggestions = await autocompletePlaces(parsedBody.data);
    const data = AutocompletePlacesResponse.parse({ suggestions });
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /places/autocomplete: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      // FR-19: a failed autocomplete request degrades the frontend field to plain
      // text with a notice — never a blocked form. 502, not 500: this server is fine,
      // the upstream call to Google failed.
      logger.warn({ err }, "POST /places/autocomplete: Places API (New) request failed");
      res.status(502).json({ error: "places_autocomplete_failed", message: "Address suggestions are unavailable right now." });
      return;
    }
    logger.error({ err }, "POST /places/autocomplete: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

/**
 * POST /places/details — FR-14. Resolves a selected suggestion's `placeId` to
 * coordinates/formatted address via Place Details (New), and (per FR-11) implicitly
 * closes the Autocomplete session that `sessionToken` was used for — see
 * `../integrations/google-maps.ts`'s doc comment for the confirmed session-token
 * semantics (a query param on this same call, not a separate request).
 */
router.post("/places/details", requireOrgSession, async (req, res) => {
  const parsedBody = GetPlaceDetailsBody.safeParse(req.body);
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
    const data = GetPlaceDetailsResponse.parse(result);
    res.status(200).json(data);
  } catch (err) {
    if (err instanceof GoogleMapsConfigError) {
      logger.error({ err }, "POST /places/details: GOOGLE_MAPS_API_KEY not configured");
      await captureAndFlush(err);
      res.status(500).json({ error: "internal_error" });
      return;
    }
    if (err instanceof GoogleMapsUpstreamError) {
      logger.warn({ err }, "POST /places/details: Place Details (New) request failed");
      res.status(502).json({ error: "place_details_failed", message: "Couldn't resolve that address right now." });
      return;
    }
    logger.error({ err }, "POST /places/details: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
