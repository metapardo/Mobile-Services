/**
 * Server-side proxy calls to Google Maps Platform, for
 * `PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md` Phase 1 (Section 5.1, 7.1, 7.2, 9.1).
 *
 * This is the ONLY module in the codebase allowed to read `GOOGLE_MAPS_API_KEY`. The
 * key is sent to Google exclusively via the `X-Goog-Api-Key` header (confirmed from
 * Google's own current docs — see each function's comment below for the specific
 * page/field names checked), is never logged (not even at `debug` level — the
 * `logger.warn`/`logger.error` calls below log response status/body, never request
 * headers), and never appears in any value returned to a route handler's caller. Every
 * Google call here happens server-side only; `artifacts/detail-hub` never talks to
 * these Google endpoints directly.
 *
 * These are the "(New)" API generations — different endpoints/field names than the
 * legacy Maps JavaScript API / Directions API most LLM training data describes. Do not
 * "fix" field names here from memory; re-check Google's live docs first.
 *
 * Explicit Phase 1 scope: no caching (route_cache table is Phase 3, §9.2) and no
 * rate limiting (also Phase 3) live in this file — just the three proxy calls,
 * matching Google's contract precisely. Callers (the route handlers in
 * `../routes/places.ts` and `../routes/routing.ts`) own request validation and HTTP
 * status mapping; this module only talks to Google and throws typed errors.
 */

import { logger } from "../lib/logger";

const PLACES_AUTOCOMPLETE_URL = "https://places.googleapis.com/v1/places:autocomplete";
const PLACES_DETAILS_BASE_URL = "https://places.googleapis.com/v1/places";
const ROUTES_COMPUTE_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

const METERS_PER_MILE = 1609.344;

/**
 * Google's `Circle.radius` maximum, confirmed via the Places API (New) `Circle`
 * reference (`/maps/documentation/places/web-service/reference/rest/v1/Circle`):
 * "Radius measured in meters. The radius must be within [0.0, 50000.0]." FR-12 asks
 * for a 50-mile bias radius (~80,467m), which exceeds this ceiling — clamped to
 * Google's actual max rather than sent as-is (which Google would reject/clamp
 * itself). Flagging this gap explicitly rather than silently rounding it away.
 */
const MAX_LOCATION_BIAS_RADIUS_METERS = 50_000;

export class GoogleMapsConfigError extends Error {}

/** Google responded with a non-2xx status, or a 2xx body missing fields this code depends on. */
export class GoogleMapsUpstreamError extends Error {
  readonly status: number | undefined;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

/** Routes API responded successfully but found no drivable route (FR-5) — distinct
 *  from `GoogleMapsUpstreamError` so callers can 422 rather than 502. */
export class NoRouteFoundError extends Error {}

/**
 * Reads the key lazily (per call, not at module load) so importing this module never
 * throws — only actually calling Google without a key configured does. Confirmed via
 * `vercel env ls` that `GOOGLE_MAPS_API_KEY` is set in this project's Production/
 * Preview environments only, not Development — local `pnpm run dev` will hit this
 * error path until a dev-scoped key is added to `.env` (see
 * `SETUP_Google_Maps_API_Key.md` Step 8).
 */
function getApiKey(): string {
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (!key) {
    throw new GoogleMapsConfigError("GOOGLE_MAPS_API_KEY is not set");
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

export interface PlaceSuggestionMatch {
  startOffset: number;
  endOffset: number;
}

export interface PlaceSuggestion {
  placeId: string;
  text: string;
  matches: PlaceSuggestionMatch[];
}

/**
 * Places API (New) Autocomplete — `POST https://places.googleapis.com/v1/places:autocomplete`.
 *
 * Confirmed via Google's live docs
 * (`/maps/documentation/places/web-service/place-autocomplete` and the REST reference
 * under `.../reference/rest/v1/places/autocomplete`):
 *   - Auth header is `X-Goog-Api-Key` (not a query param).
 *   - Optional `X-Goog-FieldMask` request header restricts the response shape; set
 *     here to exactly `suggestions.placePrediction.placeId,suggestions.placePrediction.text`
 *     — this endpoint only ever needs a place ID and its display text (plus the
 *     bolding offsets nested inside `text`).
 *   - Request body fields: `input`, `sessionToken`, `regionCode`,
 *     `locationBias.circle.{center: {latitude, longitude}, radius}`.
 *   - Response shape: `suggestions[]`, each either a `placePrediction` (has
 *     `placeId`, `text.text`, `text.matches[].{startOffset,endOffset}`) or a
 *     `queryPrediction` (no `placeId` — not a selectable address, filtered out below).
 *
 * FR-12: always `regionCode: "US"`. `locationBias` is included only when the caller
 * supplies `originLat`/`originLng` (Home Base coordinates don't exist in the DB yet —
 * next phase's job); omitted entirely, not defaulted to anything, when absent — this
 * must never error for that reason.
 */
export async function autocompletePlaces(params: {
  input: string;
  sessionToken: string;
  originLat?: number;
  originLng?: number;
}): Promise<PlaceSuggestion[]> {
  const requestBody: Record<string, unknown> = {
    input: params.input,
    sessionToken: params.sessionToken,
    regionCode: "US",
  };

  if (params.originLat !== undefined && params.originLng !== undefined) {
    requestBody.locationBias = {
      circle: {
        center: { latitude: params.originLat, longitude: params.originLng },
        radius: MAX_LOCATION_BIAS_RADIUS_METERS,
      },
    };
  }

  const res = await fetch(PLACES_AUTOCOMPLETE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text",
    },
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    logger.warn(
      { status: res.status, body: await safeReadText(res) },
      "Places Autocomplete (New): non-2xx response from Google",
    );
    throw new GoogleMapsUpstreamError(`Places Autocomplete failed with status ${res.status}`, res.status);
  }

  const json = (await res.json()) as {
    suggestions?: Array<{
      placePrediction?: {
        placeId?: string;
        text?: {
          text?: string;
          matches?: Array<{ startOffset?: number; endOffset?: number }>;
        };
      };
    }>;
  };

  const suggestions: PlaceSuggestion[] = [];
  for (const entry of json.suggestions ?? []) {
    const prediction = entry.placePrediction;
    const placeId = prediction?.placeId;
    const text = prediction?.text?.text;
    // `queryPrediction` entries (no `placeId`) are search-refinement suggestions, not
    // selectable addresses — dropped here rather than surfaced as a dead-end pick.
    if (!placeId || !text) {
      continue;
    }
    const matches = (prediction?.text?.matches ?? []).map((m) => ({
      startOffset: m.startOffset ?? 0,
      endOffset: m.endOffset ?? text.length,
    }));
    suggestions.push({ placeId, text, matches });
  }
  return suggestions;
}

export interface PlaceDetailsResult {
  placeId: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

/**
 * Place Details (New) — `GET https://places.googleapis.com/v1/places/{placeId}`.
 *
 * Confirmed via Google's live docs
 * (`/maps/documentation/places/web-service/place-details` and the REST reference
 * under `.../reference/rest/v1/places/get`):
 *   - The place ID is the final URL path segment, not a body/query field.
 *   - `X-Goog-FieldMask` is a REQUIRED request header for this endpoint (comma-
 *     separated field list, no spaces) — set here to exactly `location,formattedAddress`,
 *     the only two fields this feature uses. Google bills Place Details by field mask
 *     breadth ("Place Details Pro" tier here), so nothing broader (photos, reviews,
 *     opening hours, etc.) is requested.
 *   - `sessionToken` is a QUERY parameter on this GET request (not a header, not a
 *     separate call) — confirmed via the `places.get` REST reference's query
 *     parameter list: "A string which identifies an Autocomplete session for billing
 *     purposes." Passing the same token used for the preceding `/autocomplete` calls
 *     is what closes that Autocomplete billing session (FR-11); there is no distinct
 *     "end session" endpoint.
 *   - Response fields: `location.{latitude,longitude}`, `formattedAddress`.
 */
export async function getPlaceDetails(params: {
  placeId: string;
  sessionToken: string;
}): Promise<PlaceDetailsResult | null> {
  const url = new URL(`${PLACES_DETAILS_BASE_URL}/${encodeURIComponent(params.placeId)}`);
  url.searchParams.set("sessionToken", params.sessionToken);

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "location,formattedAddress",
    },
  });

  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    logger.warn(
      { status: res.status, body: await safeReadText(res) },
      "Place Details (New): non-2xx response from Google",
    );
    throw new GoogleMapsUpstreamError(`Place Details failed with status ${res.status}`, res.status);
  }

  const json = (await res.json()) as {
    location?: { latitude?: number; longitude?: number };
    formattedAddress?: string;
  };

  if (json.location?.latitude === undefined || json.location?.longitude === undefined || !json.formattedAddress) {
    throw new GoogleMapsUpstreamError("Place Details (New) response is missing location/formattedAddress");
  }

  return {
    placeId: params.placeId,
    latitude: json.location.latitude,
    longitude: json.location.longitude,
    formattedAddress: json.formattedAddress,
  };
}

export interface ComputeRouteResult {
  /** One-way. Callers double this themselves for the round trip (PRD §6.1) — this
   *  module never doubles anything, since a single leg is the true Google-measured
   *  quantity and doubling is a costing decision, not a routing one. */
  miles: number;
  minutes: number;
}

/**
 * Routes API `computeRoutes` — `POST https://routes.googleapis.com/directions/v2:computeRoutes`.
 *
 * Confirmed via Google's live docs
 * (`/maps/documentation/routes/compute_route_directions`, the
 * `.../reference/rest/v2/TopLevel/computeRoutes` reference, and the `Waypoint`
 * reference under `.../reference/rest/v2/Waypoint`):
 *   - `X-Goog-FieldMask` is REQUIRED on every call (omitting it errors) — set here to
 *     exactly `routes.distanceMeters,routes.duration`, per
 *     `SETUP_Google_Maps_API_Key.md`'s "always send X-Goog-FieldMask" note, both for
 *     correctness and to stay on the cheaper "Compute Routes" tier rather than
 *     pulling back polylines/legs/etc. this feature doesn't use.
 *   - `Waypoint.placeId` is a plain string field, a sibling of `location`/`address`
 *     (mutually exclusive) — so `origin`/`destination` are sent as `{ placeId }`
 *     directly, matching the PRD's `originPlaceId`/`destinationPlaceId` request shape
 *     with no lat/lng round-trip needed.
 *   - `departureTime` is RFC3339 UTC ("Zulu") — e.g. `"2014-10-02T15:01:23Z"`. Its
 *     only documented restriction ("You can only specify a departureTime in the past
 *     when RouteTravelMode is set to TRANSIT") does not restrict combining a
 *     (present/future) `departureTime` with `travelMode: DRIVE` +
 *     `routingPreference: TRAFFIC_AWARE` — exactly FR-3's traffic-aware-at-appointment-
 *     time requirement.
 *   - Response: `routes[]`, each with `distanceMeters` (number, meters) and
 *     `duration` (string, e.g. `"1234s"` — seconds with a trailing "s", not an
 *     ISO 8601 duration). An empty `routes: []` is a valid 2xx response, not an
 *     error — handled below as `NoRouteFoundError` (FR-5), not swallowed as success.
 */
export async function computeRoute(params: {
  originPlaceId: string;
  destinationPlaceId: string;
  /** RFC3339 UTC, e.g. from `Date#toISOString()`. */
  departureTime: string;
}): Promise<ComputeRouteResult> {
  const res = await fetch(ROUTES_COMPUTE_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: { placeId: params.originPlaceId },
      destination: { placeId: params.destinationPlaceId },
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      departureTime: params.departureTime,
    }),
  });

  if (!res.ok) {
    logger.warn(
      { status: res.status, body: await safeReadText(res) },
      "Routes API computeRoutes: non-2xx response from Google",
    );
    throw new GoogleMapsUpstreamError(`Routes computeRoutes failed with status ${res.status}`, res.status);
  }

  const json = (await res.json()) as {
    routes?: Array<{ distanceMeters?: number; duration?: string }>;
  };

  const route = json.routes?.[0];
  if (!route || route.distanceMeters === undefined || !route.duration) {
    // Valid, successful Google response with no routable path (islands, remote sites,
    // etc. — see the PRD's Edge Cases table). FR-5: this must surface as Unknown, never
    // a fabricated distance — callers map this to a 422, distinct from a real upstream
    // failure (502).
    throw new NoRouteFoundError("Google returned no route between these two places");
  }

  const durationSeconds = Number(route.duration.replace(/s$/, ""));
  if (!Number.isFinite(durationSeconds)) {
    throw new GoogleMapsUpstreamError(`Unexpected duration format from Routes API: "${route.duration}"`);
  }

  return {
    miles: route.distanceMeters / METERS_PER_MILE,
    minutes: durationSeconds / 60,
  };
}
