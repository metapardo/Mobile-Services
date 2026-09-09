/**
 * Fuel Gauge — per-booking ROI indicator.
 *
 * Standalone, UI-free, testable independently. Rebuilt per
 * `PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md` (Phase 1) — the old version
 * "measured" distance by hashing address strings; it never touched real
 * geography. Every number here now comes from a real routed distance/time,
 * supplied by the caller via the `fetchRoute` dependency-injection callback
 * (React Query hooks can't be called from a plain function, so this file
 * stays framework-agnostic and the calling component wires
 * `useComputeRoute()` into `fetchRoute`).
 *
 * Step 1 — Anchor selection (same-tech, same-day peers only — FR-4):
 *   • No other booking that day → Home Base
 *   • One adjacent booking → that booking's address (falls back to Home Base
 *     if that one peer has no real coordinates)
 *   • Bookings before AND after → whichever is nearer by real routed
 *     distance (falls back to whichever side has coordinates if only one
 *     does; falls back to Home Base if neither does)
 *
 * Step 2 — Cost model (§6.1), round trip, fuel and drive time kept separate
 *   all the way to the return value — never pre-summed here (FR-6/FR-23a):
 *     roundTripMiles   = oneWayMiles   x 2
 *     roundTripMinutes = oneWayMinutes x 2
 *     fuelCost  = roundTripMiles   / vehicleMpg x gasPrice
 *     driveCost = roundTripMinutes / 60         x techHourlyCost
 *     travelCost = fuelCost + driveCost
 *     youKeep    = servicePrice - travelCost
 *     travelLoad = travelCost / servicePrice
 *
 * Step 3 — Grade (§6.3, hardcoded for Phase 1 — configurable cutoffs are
 *   FR-7/FR-26, explicitly Phase 2):
 *     travelLoad < 15%          → strong  ("Worth the trip")
 *     15% <= travelLoad < 35%   → fair    ("Okay — watch the drive")
 *     travelLoad >= 35%         → weak    ("The drive eats this one")
 *
 * FR-5: routing failure, a missing anchor, a target with no selected
 * address, or a $0 price all resolve to `grade: 'unknown'` — never a
 * fabricated or estimated grade. `reason` distinguishes *why*, so the UI can
 * show the right placeholder copy (only `routing-failed` gets a Retry
 * action — see §8.2/§10).
 */

// ── Public types ────────────────────────────────────────────────────────────

export type FuelGaugeGrade = 'strong' | 'fair' | 'weak' | 'unknown';
export type FuelGaugeAnchorType = 'home' | 'adjacent' | 'nearest';

/**
 * Why a result is `unknown` — only meaningful when `grade === 'unknown'`.
 *   no-address     — target booking has no `googlePlaceId` (address was
 *                     typed but never selected from suggestions, or this is
 *                     a legacy booking that predates real geocoding)
 *   no-price       — selected service(s) total $0 (§10: "a free job is a
 *                     business decision, not a bad drive")
 *   no-hq          — the resolved anchor needed Home Base and Home Base has
 *                     no coordinates yet (FR-24)
 *   no-anchor      — same-day peers exist but none have coordinates, and
 *                     Home Base also has none
 *   routing-failed — `fetchRoute` rejected, or Google returned no route
 *                     (FR-5) — the only reason that should offer a Retry
 *   not-computed   — `computeFuelGauge` was never called for this reading
 *                     at all (e.g. `calendar.tsx`'s Phase 1 compatibility
 *                     fix, which shows Unknown for every booking rather
 *                     than batch-fetching routes per grid cell — see that
 *                     file for why). Never returned by `computeFuelGauge`
 *                     itself; callers construct this reason directly.
 */
export type FuelGaugeUnknownReason =
  | 'no-address'
  | 'no-price'
  | 'no-hq'
  | 'no-anchor'
  | 'routing-failed'
  | 'not-computed';

export interface FuelGaugeResult {
  grade: FuelGaugeGrade;
  /** Only set when `grade === 'unknown'`. */
  reason?: FuelGaugeUnknownReason;
  servicePrice: number;
  /** `servicePrice - travelCost`. 0 when `grade === 'unknown'`. */
  youKeep: number;
  /** `travelCost / servicePrice`. 0 when `grade === 'unknown'`. */
  travelLoad: number;
  /** Round-trip fuel dollars — its own line, never pre-summed with `driveCost` (FR-23a). */
  fuelCost: number;
  roundTripMiles: number;
  /** Round-trip drive-time dollars — its own line, never pre-summed with `fuelCost` (FR-23a). */
  driveCost: number;
  roundTripMinutes: number;
  /** Google's `formattedAddress` for the anchor when known; `settings.homeAddress` for a Home Base anchor. */
  anchorAddress: string;
  anchorType: FuelGaugeAnchorType;
}

/** Minimal shape `computeFuelGauge` needs from a booking — a structural subset of `BookingResult`. */
export interface FuelGaugeBookingInput {
  id: number;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM, 24-hour
  status: string;
  employeeIds: number[];
  googlePlaceId: string | null;
  formattedAddress: string | null;
}

/** Minimal shape `computeFuelGauge` needs from settings — a structural subset of `SettingsResult`. */
export interface FuelGaugeSettingsInput {
  homeAddress: string;
  hqGooglePlaceId: string | null | undefined;
  gasPrice: number;
  vehicleMpg: number;
  techHourlyCost: number;
}

/**
 * Dependency-injected router — the calling component supplies a thin wrapper
 * around `useComputeRoute()`'s `mutateAsync`. Always one-way; this file
 * doubles it for the round trip. Must reject (never return a sentinel) on
 * failure — `computeFuelGauge` treats any rejection as FR-5's
 * `routing-failed` case.
 */
export type FetchRoute = (
  originPlaceId: string,
  destinationPlaceId: string,
  departureTimeIso: string,
) => Promise<{ miles: number; minutes: number }>;

// ── Grade bands (§6.3 — hardcoded for Phase 1, FR-7/FR-26 are Phase 2) ───────

const TRAVEL_LOAD_STRONG_MAX = 0.15; // < 15% → strong
const TRAVEL_LOAD_FAIR_MAX = 0.35;   // < 35% → fair, else weak

function grade(travelLoad: number): FuelGaugeGrade {
  if (travelLoad < TRAVEL_LOAD_STRONG_MAX) return 'strong';
  if (travelLoad < TRAVEL_LOAD_FAIR_MAX) return 'fair';
  return 'weak';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Local appointment date + time -> ISO 8601, for Routes API's `departureTime` (FR-3).
 *
 * Clamped to "now" (+60s buffer) when the appointment's scheduled start has
 * already passed — Google's Routes API rejects a past `departureTime` for
 * `TRAFFIC_AWARE` DRIVE routing outright (it's a TRANSIT-only allowance), and
 * this is the common case for a same-day booking created after its default
 * time slot: the appointment-creation screen defaults to today's date, so
 * simply not touching the time picker yields a past timestamp for the rest
 * of the day. "Now" is the closest honest proxy for what the drive would
 * actually look like — the alternative (send the literal past time and let
 * it fail) makes the gauge non-functional for the single most common way to
 * create a booking.
 */
function toDepartureIso(date: string, startTime: string): string {
  const scheduled = new Date(`${date}T${startTime}:00`);
  const now = new Date();
  return (scheduled.getTime() > now.getTime() ? scheduled : new Date(now.getTime() + 60_000)).toISOString();
}

function unscoredResult(reason: FuelGaugeUnknownReason, servicePrice: number): FuelGaugeResult {
  return {
    grade: 'unknown',
    reason,
    servicePrice,
    youKeep: 0,
    travelLoad: 0,
    fuelCost: 0,
    roundTripMiles: 0,
    driveCost: 0,
    roundTripMinutes: 0,
    anchorAddress: '',
    anchorType: 'home',
  };
}

// ── Anchor selection (FR-4) ───────────────────────────────────────────────────

type AnchorSelection =
  | { kind: 'ok'; type: FuelGaugeAnchorType; placeId: string; address: string; route?: { miles: number; minutes: number } }
  | { kind: 'none'; reason: 'no-hq' | 'no-anchor' };

interface Peer extends FuelGaugeBookingInput {
  startMins: number;
}

function homeAnchor(settings: FuelGaugeSettingsInput): AnchorSelection {
  return settings.hqGooglePlaceId
    ? { kind: 'ok', type: 'home', placeId: settings.hqGooglePlaceId, address: settings.homeAddress }
    : { kind: 'none', reason: 'no-hq' };
}

function usableAdjacent(peer: Peer | null): AnchorSelection | null {
  if (!peer || !peer.googlePlaceId || !peer.formattedAddress) return null;
  return { kind: 'ok', type: 'adjacent', placeId: peer.googlePlaceId, address: peer.formattedAddress };
}

async function selectAnchor(
  target: FuelGaugeBookingInput,
  targetPlaceId: string,
  allBookings: FuelGaugeBookingInput[],
  settings: FuelGaugeSettingsInput,
  departureTimeIso: string,
  fetchRoute: FetchRoute,
): Promise<AnchorSelection> {
  const peers: Peer[] = allBookings
    .filter(b =>
      b.id !== target.id &&
      b.date === target.date &&
      b.status !== 'cancelled' && b.status !== 'no-show' &&
      b.employeeIds.some(id => target.employeeIds.includes(id)),
    )
    .map(b => ({ ...b, startMins: toMins(b.startTime) }))
    .sort((a, b) => a.startMins - b.startMins);

  if (peers.length === 0) return homeAnchor(settings);

  const tStart = toMins(target.startTime);
  const before = peers.filter(p => p.startMins < tStart);
  const after = peers.filter(p => p.startMins >= tStart);
  const prev = before.length > 0 ? before[before.length - 1] : null;
  const next = after.length > 0 ? after[0] : null;

  // Exactly one adjacent booking
  if (prev && !next) return usableAdjacent(prev) ?? homeAnchor(settings);
  if (!prev && next) return usableAdjacent(next) ?? homeAnchor(settings);

  // Sandwiched — both a prior and a following booking exist
  const prevUsable = !!(prev?.googlePlaceId && prev?.formattedAddress);
  const nextUsable = !!(next?.googlePlaceId && next?.formattedAddress);

  if (prevUsable && !nextUsable) {
    return { kind: 'ok', type: 'nearest', placeId: prev!.googlePlaceId!, address: prev!.formattedAddress! };
  }
  if (!prevUsable && nextUsable) {
    return { kind: 'ok', type: 'nearest', placeId: next!.googlePlaceId!, address: next!.formattedAddress! };
  }
  if (!prevUsable && !nextUsable) {
    const home = homeAnchor(settings);
    return home.kind === 'ok' ? home : { kind: 'none', reason: 'no-anchor' };
  }

  // Both usable — route to both, keep the nearer, and reuse that route as
  // the final result so the anchor's real leg is never fetched twice.
  const [prevRoute, nextRoute] = await Promise.all([
    fetchRoute(prev!.googlePlaceId!, targetPlaceId, departureTimeIso),
    fetchRoute(next!.googlePlaceId!, targetPlaceId, departureTimeIso),
  ]);
  return prevRoute.miles <= nextRoute.miles
    ? { kind: 'ok', type: 'nearest', placeId: prev!.googlePlaceId!, address: prev!.formattedAddress!, route: prevRoute }
    : { kind: 'ok', type: 'nearest', placeId: next!.googlePlaceId!, address: next!.formattedAddress!, route: nextRoute };
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Computes the Fuel Gauge reading for one booking. Never throws — every
 * failure mode (missing address, missing HQ, missing peer coordinates, a
 * rejected/no-route `fetchRoute` call) resolves to `grade: 'unknown'` with a
 * `reason`, per FR-5.
 */
export async function computeFuelGauge(
  target: FuelGaugeBookingInput,
  servicePrice: number,
  allBookings: FuelGaugeBookingInput[],
  settings: FuelGaugeSettingsInput,
  fetchRoute: FetchRoute,
): Promise<FuelGaugeResult> {
  // §10 edge case: a free/comped job is a business decision, not a bad drive.
  if (!(servicePrice > 0)) return unscoredResult('no-price', servicePrice);

  // Never for an address the owner typed but never selected (§5.2/§10).
  if (!target.googlePlaceId) return unscoredResult('no-address', servicePrice);

  const targetPlaceId = target.googlePlaceId;
  const departureTimeIso = toDepartureIso(target.date, target.startTime);

  try {
    const anchor = await selectAnchor(target, targetPlaceId, allBookings, settings, departureTimeIso, fetchRoute);
    if (anchor.kind === 'none') {
      return unscoredResult(anchor.reason, servicePrice);
    }

    const route = anchor.route ?? await fetchRoute(anchor.placeId, targetPlaceId, departureTimeIso);

    const roundTripMiles = route.miles * 2;
    const roundTripMinutes = route.minutes * 2;

    // Two costs, computed and returned separately — never pre-summed (FR-6/FR-23a).
    const fuelCost = (roundTripMiles / settings.vehicleMpg) * settings.gasPrice;
    const driveCost = (roundTripMinutes / 60) * settings.techHourlyCost;
    const travelCost = fuelCost + driveCost;

    const youKeep = servicePrice - travelCost;
    const travelLoad = travelCost / servicePrice;

    return {
      grade: grade(travelLoad),
      servicePrice,
      youKeep,
      travelLoad,
      fuelCost,
      roundTripMiles,
      driveCost,
      roundTripMinutes,
      anchorAddress: anchor.address,
      anchorType: anchor.type,
    };
  } catch {
    // fetchRoute rejected, or Google returned no route (the backend proxy's
    // `no_route_found` 422) — never fabricate a grade (FR-5).
    return unscoredResult('routing-failed', servicePrice);
  }
}
