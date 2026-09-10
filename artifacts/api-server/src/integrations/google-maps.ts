/**
 * Server-side proxy calls to Google Maps Platform, for
 * `PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md` Phase 1 (Section 5.1, 7.1, 7.2, 9.1) and
 * `PRD_Mobull_Appointment_Optimizer_v1.0.md` Phase 1 (Section 8, 9, FR-18a/FR-20/FR-21).
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
 * `autocompletePlaces`/`getPlaceDetails`/`computeRoute` are plain proxy calls — no
 * caching or rate limiting, by design (Fuel Gauge Phase 1 scope). `computeRouteMatrix`
 * is the one function in this file that owns caching (`route_cache` via
 * `@workspace/db`'s `getCachedRoute`/`setCachedRoute`, FR-21) directly, since the
 * cache-aside logic (which destinations to even send to Google) has to live wherever
 * the batching decision is made. Rate limiting (FR-21a) stays a caller concern in all
 * four cases — see `../middlewares/rate-limit.ts` and `computeRouteMatrix`'s
 * `allowUpstreamCall` param below.
 */

import { logger } from "../lib/logger";
import { getCachedRoute, setCachedRoute } from "@workspace/db";

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

export interface GeocodeAddressResult {
  placeId: string;
  latitude: number;
  longitude: number;
  formattedAddress: string;
}

const PLACES_TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Places API (New) Text Search — `POST https://places.googleapis.com/v1/places:searchText`.
 *
 * Added for `BUGS_Mobull_2026-09-10_Round2.md` BUG-6 Blocker 3's one-time legacy-
 * booking coordinate backfill (`lib/db/scripts/backfill-booking-coordinates.ts`) — NOT
 * part of the live address-autocomplete flow. `autocompletePlaces`/`getPlaceDetails`
 * above are built around a two-step, session-tokened, partial-input UX flow
 * (Autocomplete predicts suggestions as the owner types; Details resolves the ONE
 * suggestion they select) — neither fits resolving a complete, already-known address
 * *string* with no user interaction, which is what a batch backfill needs (misusing
 * the session-token flow for that — inventing a fresh, immediately-discarded session
 * token per address — would be forcing a UX-shaped API onto a job it wasn't designed
 * for). Text Search takes free text and returns full Place resources directly in one
 * call; no session token involved (that's an Autocomplete-specific billing mechanism
 * this endpoint doesn't use).
 *
 * Confirmed via Google's live docs (`/maps/documentation/places/web-service/text-search`,
 * the `.../reference/rest/v1/places/searchText` REST reference, and the `Place`
 * resource reference under `.../reference/rest/v1/Place`):
 *   - Auth: `X-Goog-Api-Key` header — same convention as every other call in this file.
 *   - `X-Goog-FieldMask` is REQUIRED; set here to exactly
 *     `places.id,places.formattedAddress,places.location` — `id` is the place ID (a
 *     Text Search/Details response is a full `Place` resource, whose ID field is
 *     `id`, distinct from an Autocomplete `placePrediction.placeId` above),
 *     `formattedAddress`, and `location.{latitude,longitude}` — the only three fields
 *     this backfill needs.
 *   - Request body: `{ "textQuery": "<free text>", "regionCode": "US" }` — same
 *     always-US convention `autocompletePlaces` uses (FR-12), this app has no
 *     international addresses.
 *   - Response: `{ "places": [...] }`. An empty/absent array is a valid, successful
 *     response for an address Google can't resolve (typo, incomplete, demolished
 *     address, etc.) — not an error condition — so this returns `null` for that case
 *     rather than throwing, letting the backfill script skip-and-log instead of
 *     aborting the whole run (ticket: "skip... don't fail the whole run").
 */
export async function geocodeAddress(address: string): Promise<GeocodeAddressResult | null> {
  const res = await fetch(PLACES_TEXT_SEARCH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "places.id,places.formattedAddress,places.location",
    },
    body: JSON.stringify({ textQuery: address, regionCode: "US" }),
  });

  if (!res.ok) {
    logger.warn(
      { status: res.status, body: await safeReadText(res) },
      "Places Text Search (New): non-2xx response from Google",
    );
    throw new GoogleMapsUpstreamError(`Places Text Search failed with status ${res.status}`, res.status);
  }

  const json = (await res.json()) as {
    places?: Array<{
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }>;
  };

  const place = json.places?.[0];
  if (
    !place ||
    !place.id ||
    !place.formattedAddress ||
    place.location?.latitude === undefined ||
    place.location?.longitude === undefined
  ) {
    return null;
  }

  return {
    placeId: place.id,
    latitude: place.location.latitude,
    longitude: place.location.longitude,
    formattedAddress: place.formattedAddress,
  };
}

const ROUTE_MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";

export interface RouteMatrixElementResult {
  destinationPlaceId: string;
  /** Null when this element failed (see `error`). */
  miles: number | null;
  /** Null when this element failed (see `error`). */
  minutes: number | null;
  /** Non-null exactly when this element failed — PRD §10 "Route Matrix partially
   *  fails -> drop failed candidates, rank the rest" needs a per-destination failure
   *  marker distinct from the whole request failing. Null on success.
   *
   *  `"rate_limited"` is a specific, load-bearing value the frontend should treat
   *  differently from every other string here (PRD §10 "Rate limit hit mid-search ->
   *  return cached-only results with a notice, not an error") — see
   *  `computeRouteMatrix`'s `allowUpstreamCall` param below. */
  error: string | null;
}

/** Shape of one element in the Route Matrix v2 response array — confirmed via
 *  Google's live docs (`/maps/documentation/routes/compute_route_matrix`, the
 *  `.../reference/rest/v2/TopLevel/computeRouteMatrix` reference, and the
 *  `RouteMatrixElement` reference under `.../reference/rest/v2/RouteMatrixElement`).
 *  `status` is a `google.rpc.Status`-shaped object — an empty object (or `code`
 *  absent/`0`) means OK; anything else means this element failed independently of the
 *  rest of the batch. Docs explicitly warn: omitting `status` from the field mask
 *  makes every element look OK, so it's always included below. */
interface RawRouteMatrixElement {
  originIndex?: number;
  destinationIndex?: number;
  status?: { code?: number; message?: string };
  condition?: "ROUTE_EXISTS" | "ROUTE_NOT_FOUND" | string;
  distanceMeters?: number;
  duration?: string;
}

/**
 * Computes the `hourOfWeek` cache-bucket convention documented in
 * `lib/db/src/route-cache.ts` (`dayOfWeek * 24 + hourOfDay`, 0-167, JS
 * `Date#getDay()` convention where Sunday=0) from an RFC3339 `departureTime`. Uses the
 * UTC accessors, not local-timezone ones: every `departureTime` this module handles is
 * already RFC3339 UTC end to end (see `computeRoute`'s doc comment), and `route_cache`
 * is a single global table shared by every organization/process — bucketing on local
 * time would make the bucket depend on whatever timezone the server process happens to
 * be running in, which a shared cache key must never do.
 */
function hourOfWeekFromDepartureTime(departureTimeIso: string): number {
  const date = new Date(departureTimeIso);
  return date.getUTCDay() * 24 + date.getUTCHours();
}

/**
 * Route Matrix v2 `computeRouteMatrix` — `POST https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix`.
 * The batch sibling of `computeRoute` above (1 origin x N destinations in a single
 * call) for `PRD_Mobull_Appointment_Optimizer_v1.0.md` FR-18a/FR-20.
 *
 * Confirmed via Google's live docs (`/maps/documentation/routes/compute_route_matrix`
 * and the `.../reference/rest/v2/TopLevel/computeRouteMatrix` /
 * `.../reference/rest/v2/RouteMatrixOrigin` /
 * `.../reference/rest/v2/RouteMatrixElement` references):
 *   - Same auth convention as every other call in this module: `X-Goog-Api-Key`
 *     header, never a query param.
 *   - Unlike `computeRoutes`'s `Waypoint.placeId` sent as a bare sibling of
 *     `origin`/`destination`, the matrix endpoint's `origins`/`destinations` are
 *     arrays of `RouteMatrixOrigin`/`RouteMatrixDestination`, each wrapping a
 *     `Waypoint` under a `waypoint` field — i.e. `{ waypoint: { placeId } }`, not
 *     `{ placeId }` directly. This really is a different shape from `computeRoutes`,
 *     confirmed against the docs rather than assumed to match.
 *   - `X-Goog-FieldMask` is required; Google's own docs warn that omitting `status`
 *     from the mask makes every element look OK regardless of its real status, so the
 *     mask here is exactly `originIndex,destinationIndex,status,condition,distanceMeters,duration`.
 *   - Response body is a single JSON array of `RouteMatrixElement` objects (confirmed
 *     via the docs' own example response) — NOT wrapped in a top-level key, and not
 *     newline-delimited despite the endpoint being described as "streaming" at the
 *     gRPC layer; `res.json()` parses it directly as an array.
 *   - Each element has `originIndex`/`destinationIndex` (this module always sends
 *     exactly one origin, so `originIndex` is always `0` here — `destinationIndex` is
 *     what matters, indexing into the exact `destinations` array sent on this
 *     request), `status`, `condition` (`ROUTE_EXISTS`/`ROUTE_NOT_FOUND`),
 *     `distanceMeters`, `duration` (same `"1234s"` seconds-string format as
 *     `computeRoutes`, parsed with the same logic below — not reimplemented
 *     differently).
 *   - Size limits confirmed via the docs: origins+destinations (via `placeId`) must
 *     each total <=50, and origins x destinations <=625 for
 *     `routingPreference: TRAFFIC_AWARE` (the stricter <=100 cap is only for
 *     `TRAFFIC_AWARE_OPTIMAL`/`TRANSIT`, neither used here) — the OpenAPI contract's
 *     `destinationPlaceIds.maxItems: 25` (1 origin, so product = destination count) is
 *     comfortably inside both.
 *
 * Cache-aside (FR-21): checks `route_cache` (`getCachedRoute`/`setCachedRoute`,
 * `@workspace/db`) for every destination before calling Google at all. Only the
 * destinations that miss cache go into ONE batched Google request (FR-20 — never N
 * individual `computeRoute` calls); if every destination hits cache, Google is never
 * called. Freshly-computed elements are written through to the cache after a
 * successful response; failed elements are not cached (a transient per-element
 * failure must not poison the cache for 30 days). `condition: "ROUTE_NOT_FOUND"` is
 * a stable geographic fact (no drivable road exists between two fixed places) and
 * would be reasonable to cache too, but is deliberately NOT cached here: `route_cache`
 * `miles`/`minutes` columns are NOT NULL `numeric` (see `lib/db/src/schema/route-
 * cache.ts`), so there's no schema-level way to record "confirmed no route" distinct
 * from "not yet computed" without inventing a sentinel value (e.g. `-1`) that any
 * future reader of this table would need to know to special-case — judged not worth
 * that landmine for this pass. Worth a dedicated column (or small side table) if
 * `ROUTE_NOT_FOUND` turns out to be common enough in production to matter for cost.
 *
 * Rate limiting (FR-21a) is intentionally NOT checked inside this function — it's the
 * caller's (`../routes/routing.ts`) job, via `rateLimitMiddleware`, because the
 * PRD-mandated behavior on limit-exceeded ("return cached-only results with a notice,
 * not an error", PRD §10) differs per endpoint and this module has no HTTP-response
 * concerns. `allowUpstreamCall: false` is how the caller communicates "you're over the
 * limit — cache only, no Google call" down into this function.
 */
export async function computeRouteMatrix(params: {
  originPlaceId: string;
  destinationPlaceIds: string[];
  /** RFC3339 UTC, e.g. from `Date#toISOString()`. */
  departureTime: string;
  /** Set to `false` when the caller has already determined this organization is over
   *  its rate-limit bucket (FR-21a) — skips the Google call entirely regardless of
   *  cache misses, returning `error: "rate_limited"` for every miss instead. Defaults
   *  to `true`. */
  allowUpstreamCall?: boolean;
}): Promise<RouteMatrixElementResult[]> {
  const allowUpstreamCall = params.allowUpstreamCall ?? true;
  const hourOfWeek = hourOfWeekFromDepartureTime(params.departureTime);

  const cacheChecks = await Promise.all(
    params.destinationPlaceIds.map(async (destinationPlaceId) => ({
      destinationPlaceId,
      cached: await getCachedRoute(params.originPlaceId, destinationPlaceId, hourOfWeek),
    })),
  );

  const results = new Map<string, RouteMatrixElementResult>();
  const missingDestinationIds: string[] = [];
  for (const { destinationPlaceId, cached } of cacheChecks) {
    if (cached) {
      results.set(destinationPlaceId, { destinationPlaceId, miles: cached.miles, minutes: cached.minutes, error: null });
    } else if (!missingDestinationIds.includes(destinationPlaceId)) {
      // De-duplicated: a repeated destinationPlaceId in the request only needs to be
      // sent to Google once — the merge step below fans the single answer back out to
      // every occurrence.
      missingDestinationIds.push(destinationPlaceId);
    }
  }

  const toResponse = (): RouteMatrixElementResult[] =>
    params.destinationPlaceIds.map((id) => {
      const result = results.get(id);
      if (!result) {
        // Should be unreachable — every id is either a cache hit, a Google result, or
        // an explicit rate-limited/error fallback below. Guarded anyway rather than
        // risking a thrown error on a malformed upstream response.
        return { destinationPlaceId: id, miles: null, minutes: null, error: "missing_result" };
      }
      return result;
    });

  if (missingDestinationIds.length === 0) {
    // FR-20/FR-21: every destination was already cached — Google is never called.
    return toResponse();
  }

  if (!allowUpstreamCall) {
    // FR-21a / PRD §10 "Rate limit hit mid-search -> return cached-only results with a
    // notice, not an error" — `../routes/routing.ts` has already determined this
    // organization is over its rate-limit bucket for this window.
    for (const destinationPlaceId of missingDestinationIds) {
      results.set(destinationPlaceId, { destinationPlaceId, miles: null, minutes: null, error: "rate_limited" });
    }
    return toResponse();
  }

  const res = await fetch(ROUTE_MATRIX_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": getApiKey(),
      "X-Goog-FieldMask": "originIndex,destinationIndex,status,condition,distanceMeters,duration",
    },
    body: JSON.stringify({
      origins: [{ waypoint: { placeId: params.originPlaceId } }],
      destinations: missingDestinationIds.map((placeId) => ({ waypoint: { placeId } })),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
      departureTime: params.departureTime,
    }),
  });

  if (!res.ok) {
    logger.warn(
      { status: res.status, body: await safeReadText(res) },
      "Route Matrix v2 computeRouteMatrix: non-2xx response from Google",
    );
    throw new GoogleMapsUpstreamError(`Route Matrix computeRouteMatrix failed with status ${res.status}`, res.status);
  }

  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) {
    logger.warn({ body: json }, "Route Matrix v2: response was not a JSON array as expected");
    throw new GoogleMapsUpstreamError("Route Matrix v2 response was not a JSON array as expected");
  }
  const elements = json as RawRouteMatrixElement[];

  for (const element of elements) {
    const destinationIndex = element.destinationIndex ?? 0;
    const destinationPlaceId = missingDestinationIds[destinationIndex];
    if (destinationPlaceId === undefined) {
      logger.warn({ element }, "Route Matrix v2: destinationIndex out of range, dropping element");
      continue;
    }

    const statusCode = element.status?.code;
    const isOk = statusCode === undefined || statusCode === 0;
    if (!isOk) {
      results.set(destinationPlaceId, {
        destinationPlaceId,
        miles: null,
        minutes: null,
        error: element.status?.message ? `google_error: ${element.status.message}` : `google_status_code_${statusCode}`,
      });
      continue;
    }

    if (element.condition === "ROUTE_NOT_FOUND") {
      // FR-5-equivalent for the matrix endpoint: a valid, successful per-element
      // response with no drivable path. Not cached — see this function's doc comment.
      results.set(destinationPlaceId, { destinationPlaceId, miles: null, minutes: null, error: "no_route_found" });
      continue;
    }

    if (element.distanceMeters === undefined || !element.duration) {
      results.set(destinationPlaceId, {
        destinationPlaceId,
        miles: null,
        minutes: null,
        error: "missing_distance_or_duration",
      });
      continue;
    }

    const durationSeconds = Number(element.duration.replace(/s$/, ""));
    if (!Number.isFinite(durationSeconds)) {
      results.set(destinationPlaceId, {
        destinationPlaceId,
        miles: null,
        minutes: null,
        error: `unexpected_duration_format: "${element.duration}"`,
      });
      continue;
    }

    const miles = element.distanceMeters / METERS_PER_MILE;
    const minutes = durationSeconds / 60;
    results.set(destinationPlaceId, { destinationPlaceId, miles, minutes, error: null });
    // Write-through cache (FR-21). Fire-and-forget within this loop would risk an
    // unhandled rejection; awaited sequentially instead — matrix batches are small
    // (<=25 destinations per the OpenAPI contract) so this isn't a latency concern.
    await setCachedRoute(params.originPlaceId, destinationPlaceId, hourOfWeek, { miles, minutes });
  }

  // Any destinationIndex Google's response didn't cover (shouldn't happen per the
  // docs, but this module's own convention is to verify rather than assume) still
  // needs a result so every requested destination gets exactly one element back.
  for (const destinationPlaceId of missingDestinationIds) {
    if (!results.has(destinationPlaceId)) {
      results.set(destinationPlaceId, {
        destinationPlaceId,
        miles: null,
        minutes: null,
        error: "missing_from_google_response",
      });
    }
  }

  return toResponse();
}
