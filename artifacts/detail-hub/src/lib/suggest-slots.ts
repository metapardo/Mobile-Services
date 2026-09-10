/**
 * Appointment Optimizer — grouping recommendation engine.
 *
 * Rebuilt per `PRD_Mobull_Appointment_Optimizer_v1.0.md` (Phase 1, FR-15
 * through FR-21a). The old version operated on mock-data types and three
 * hash functions (`addrHash`, `estimateDriveMins`, an implicit 20mph
 * constant) that faked distance from address spelling — deleted entirely
 * (FR-15). Every number here now comes from a real routed distance/time,
 * supplied by the caller via dependency-injected routing callbacks — same
 * discipline as `fuel-gauge.ts` (FR-16): no React, no `fetch`, nothing but
 * pure/async logic driven by `FetchRouteMatrix`/`FetchRoute`.
 *
 * ── Algorithm (PRD §5) ──────────────────────────────────────────────────
 *
 * Step 1 — Which existing bookings are near this address?
 *   `anchors` (from `useListBookingAnchors`) already arrive pre-filtered
 *   server-side to within 30 straight-line miles (FR-19) — that's an
 *   intentionally loose filter. This module runs the real 45-minute
 *   drive-time cutoff (FR-20/FR-21) via ONE `fetchRouteMatrix` call (new
 *   address as origin, every anchor's `googlePlaceId` as destinations,
 *   batched in groups of <=25). Anchors with no `googlePlaceId`, a failed
 *   matrix element, or >45 min survive-nothing (§10: never treated as
 *   distance zero).
 *
 * Step 2 — Can that anchor's own technician take the job?
 *   For each surviving anchor, only that anchor's own assigned
 *   employee(s)' schedule that day is inspected (never a teammate's
 *   schedule). This mirrors the PRD's Step 2/3 wording literally: the
 *   open-time check and the tight-placement formula both use only ONE
 *   drive-time term (new<->anchor) — there's no additional physical-transit
 *   buffer budgeted for the neighboring booking's own leg. That's a
 *   simplification inherent in the PRD's own formulas, not an invention of
 *   this file; flagged in the frontend-engineer's report as a Phase 2/3
 *   candidate if finer feasibility modeling is ever wanted.
 *
 * Step 3 — Place the slot tight against the anchor, per the PRD's exact
 *   formulas.
 *
 * ── Double-anchored (FR-18) ─────────────────────────────────────────────
 * A slot is double-anchored only when it's within 45 min of BOTH bracketing
 * bookings. The bracketing peer's own new-address-origin leg is folded into
 * the SAME Step 1 batch call (as an extra destination alongside the anchor
 * candidates themselves) — no separate API call, per the PRD's explicit
 * note that both legs are "already fetched."
 *
 * ── Ranking / added drive time (FR-3, §6) ───────────────────────────────
 * Ranking uses *added* drive time, not raw one-way drive-to-anchor:
 *   Between two bookings A and B:   added = (A->new) + (new->B) - (A->B)
 *   After the last job of the day:  added = (anchor->new) + (new->home) - (anchor->home)
 * `(new->B)`/`(new->A)` legs come from the Step 1 batch (new address is
 * always the batch's origin) or its bracketing-peer extension above.
 * `(A->B)` (the baseline the technician was already going to drive
 * regardless) is a *different-origin* leg the Step 1 batch can't produce —
 * exactly one `fetchRoute` single-pair call per surviving candidate slot
 * (never per anchor), per FR-20's spirit. When a bracketing peer has no
 * coordinates and there's no Home Base baseline available either, this
 * module degrades to the anchor's own one-way drive time as the "added"
 * estimate (flagged via `addedIsEstimate`) rather than fabricating a
 * number — still 100% real routed data, just a coarser estimate (FR-15).
 *
 * ── Cost (FR-3, FR-17) ──────────────────────────────────────────────────
 * `miles / vehicleMpg * gasPrice` (fuel) + `minutes / 60 * techHourlyCost`
 * (labor), applied to *added* miles/minutes — same math `fuel-gauge.ts`
 * already gets right, reused rather than reinvented.
 *
 * ── Output ──────────────────────────────────────────────────────────────
 * Exactly 4 (FR-2), never padded. FR-5 (>=2/technician-day cap) and FR-2a
 * ("see more") are explicitly Phase 2 — not implemented here.
 */

import type { FetchRoute } from './fuel-gauge';
import type { FuelGaugeSettingsInput as SuggestSlotsSettingsInput } from './fuel-gauge';

// ── Public types ────────────────────────────────────────────────────────────

/** Minimal shape this module needs from an anchor candidate — a structural subset of `AnchorCandidate`. */
export interface SuggestSlotsAnchorInput {
  id: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  durationMinutes: number;
  employeeIds: number[];
  address: string;
  googlePlaceId: string | null;
}

/** Minimal shape this module needs from a booking, for schedule-gap-checking — a structural subset of `BookingResult`. */
export interface SuggestSlotsBookingInput {
  id: number;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  status: string;
  employeeIds: number[];
  packageIds: number[];
  googlePlaceId: string | null;
}

/** Minimal shape this module needs from a package, to size a booking's duration — a structural subset of `PackageResult`. */
export interface SuggestSlotsPackageInput {
  id: number;
  durationMinutes: number;
}

export type { SuggestSlotsSettingsInput };

/**
 * Dependency-injected batch router — the calling component supplies a thin
 * wrapper around `useComputeRouteMatrix()`'s `mutateAsync` (FR-18a/FR-20).
 * One origin, many destinations. Must reject (never return a sentinel) on
 * a total failure; a partial failure is expressed per-element via `error`
 * (§10 — drop that element, rank the rest) and must NOT reject.
 */
export type FetchRouteMatrix = (
  originPlaceId: string,
  destinationPlaceIds: string[],
  departureTimeIso: string,
) => Promise<Array<{ destinationPlaceId: string; miles: number | null; minutes: number | null; error: string | null }>>;

/**
 * BUG-5 (`BUGS_Mobull_2026-09-10.md`) — an empty `slots` array is ambiguous:
 * it could mean "genuinely nothing nearby" or "candidates existed but
 * couldn't be evaluated." The bug report's own hypothesis (anchors dropped
 * for missing `googlePlaceId`) checked out FALSE against live data — every
 * upcoming real booking already had one. The actual live cause: bookings
 * created through the ordinary flow can have an empty `employeeSplit` (no
 * technician assigned yet — this is allowed by design, not itself a bug),
 * and Step 2 has nothing to check a schedule against for those, so they
 * silently contribute zero candidates. Both cases are real, both should be
 * distinguishable from "no nearby jobs" (report's own acceptance criterion,
 * generalized to the confirmed root cause rather than the guessed one).
 */
export interface SuggestSlotsOutcome {
  slots: SuggestedSlot[];
  /** Anchors within the 30-mile Haversine pre-filter with no `googlePlaceId` at all — a legacy booking, or one saved via a free-typed (never autocomplete-selected) address. */
  skippedNoCoordinates: number;
  /** Anchors that survived the 45-minute drive filter but have zero assigned employees (`employeeIds.length === 0`) — nothing for Step 2 to check a schedule against. The confirmed real cause of BUG-5. */
  skippedNoTechnician: number;
}

export interface SuggestedSlot {
  date: string; // YYYY-MM-DD
  startTime: string; // HH:MM
  endTime: string; // HH:MM — the new job's computed end
  employeeId: number;
  position: 'before' | 'after';

  anchorBookingId: number;
  anchorAddress: string;
  anchorStartTime: string;
  anchorEndTime: string;

  /** True only when within 45 min of BOTH bracketing bookings (FR-18). */
  doubleAnchored: boolean;
  /** Only set when `doubleAnchored` — the OTHER bracketing booking (not `anchorBookingId`). */
  otherBookingStartTime?: string;
  otherBookingEndTime?: string;

  /** Real one-way drive minutes from the new address to the anchor (Step 1) — e.g. "8 min from his 9:00 AM job". */
  driveToAnchorMinutes: number;

  /** PRD FR-3 — the drive this slot actually *adds* to a route already happening, not a round trip to the anchor. */
  addedDriveMinutes: number;
  /** Fuel dollars, `addedMiles / vehicleMpg * gasPrice` (FR-17) — kept separate from labor, never pre-summed, matching `fuel-gauge.ts`'s FR-23a discipline. Used for the "adds $X of gas" supporting-detail copy (§7.2). */
  addedFuelCostDollars: number;
  /** Technician drive-time dollars, `addedDriveMinutes / 60 * techHourlyCost` (FR-17) — kept separate from fuel. */
  addedLaborCostDollars: number;
  /** `addedFuelCostDollars + addedLaborCostDollars` — used only for ranking tiebreak 5, never displayed as a single line (§7.2 keeps "gas" and everything else distinct). */
  addedCostDollars: number;
  /** True when a real A->B baseline leg wasn't available (missing coordinates on a neighbor, or no Home Base set) and `addedDriveMinutes`/cost fields fall back to the anchor's own one-way drive time. Never a hash — always real routed data, just coarser (FR-15). */
  addedIsEstimate: boolean;

  /** Leftover minutes in the gap this slot doesn't use — ranking tiebreak 4 (tighter fit). */
  unusedGapMinutes: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Exported per BUG-3 (`BUGS_Mobull_2026-09-10.md`) — `booking-new.tsx`'s time
// slot list needs the same business-hours bounds this module already uses,
// rather than a second hardcoded 08:00/18:00 pair.
export const WORK_START_MINS = 8 * 60; // 08:00
export const WORK_END_MINS = 18 * 60; // 18:00
const MAX_DRIVE_MINS = 45;
const MATRIX_CHUNK_SIZE = 25; // ComputeRouteMatrixRequest.destinationPlaceIds.maxItems

const ACTIVE_STATUSES_EXCLUDED = new Set(['cancelled', 'no-show']);

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * `AnchorCandidate.date`/`BookingResult.date` round-trip as UTC-midnight ISO
 * *datetime* strings ("2026-09-10T00:00:00.000Z"), not the bare `YYYY-MM-DD`
 * this module's own `SuggestSlotsAnchorInput`/`SuggestSlotsBookingInput`
 * interfaces declare — confirmed live: without this, `SuggestedSlot.date`
 * carried the raw ISO string straight through, which `applySuggestion()` in
 * `booking-new.tsx` writes directly into the booking form's `date` field
 * (breaking FR-9's "fills date, time and technician" for a selected
 * recommendation, not just display). Same fix `isoDateOnly()` in
 * `lib/api-adapters.ts` already applies for `BookingResult` elsewhere in this
 * app — reimplemented locally (a one-line slice) rather than imported, to
 * keep this module free of app-level dependencies, matching its existing
 * "no React, no fetch, nothing but pure/async logic" discipline.
 */
function dateOnly(iso: string): string {
  return iso.slice(0, 10);
}

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMins(total: number): string {
  const clamped = Math.max(0, Math.round(total));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface RouteLeg {
  miles: number;
  minutes: number;
}

/**
 * Runs `fetchRouteMatrix` (chunked to <=25 destinations per call) from a
 * single origin and returns only the successful legs, keyed by destination
 * place id. §10: a failed/errored element is silently dropped, never
 * fabricated as distance zero.
 */
async function batchedLegs(
  originPlaceId: string,
  destinationPlaceIds: string[],
  departureTimeIso: string,
  fetchRouteMatrix: FetchRouteMatrix,
): Promise<Map<string, RouteLeg>> {
  const result = new Map<string, RouteLeg>();
  const unique = Array.from(new Set(destinationPlaceIds));
  if (unique.length === 0) return result;

  const chunks = chunk(unique, MATRIX_CHUNK_SIZE);
  const responses = await Promise.all(
    chunks.map((ids) => fetchRouteMatrix(originPlaceId, ids, departureTimeIso)),
  );
  for (const elements of responses) {
    for (const el of elements) {
      if (el.error || el.miles == null || el.minutes == null) {
        // BUG-5 secondary suspect (report §"Route Matrix failures return
        // `continue`, dropping elements silently") — this was already
        // correct behavior (never fabricate a distance for a failed
        // element, §10), but silent. Logged now so a real Route Matrix
        // failure is distinguishable from a genuine no-result during
        // future debugging, without changing the drop-and-continue logic.
        if (el.error) {
          // eslint-disable-next-line no-console -- diagnostic only, matches this module's existing discipline of never surfacing a fabricated distance instead
          console.warn(`[suggest-slots] Route Matrix element failed for ${el.destinationPlaceId}: ${el.error}`);
        }
        continue;
      }
      result.set(el.destinationPlaceId, { miles: el.miles, minutes: el.minutes });
    }
  }
  return result;
}

/**
 * Exported per BUG-3 (`BUGS_Mobull_2026-09-10.md`) — `booking-new.tsx`'s
 * conflict-aware time slot list reuses this exact shape, computed by the
 * same `buildSchedule()` below, rather than building a second schedule map.
 */
export interface ScheduleEntry {
  id: number;
  startMins: number;
  endMins: number;
  startTime: string;
  googlePlaceId: string | null;
}

function bookingDuration(b: SuggestSlotsBookingInput, pkgMap: Map<number, number>): number {
  const dur = b.packageIds.reduce((sum, pid) => sum + (pkgMap.get(pid) ?? 60), 0);
  return dur > 0 ? dur : 60;
}

/**
 * date -> employeeId -> that employee's bookings that day, sorted by start
 * time. Exported per BUG-3 — `booking-new.tsx`'s time slot list reuses this
 * directly rather than building a second schedule map.
 */
export function buildSchedule(
  allBookings: SuggestSlotsBookingInput[],
  allPackages: SuggestSlotsPackageInput[],
): Map<string, Map<number, ScheduleEntry[]>> {
  const pkgMap = new Map(allPackages.map((p) => [p.id, p.durationMinutes]));
  const schedule = new Map<string, Map<number, ScheduleEntry[]>>();

  for (const b of allBookings) {
    if (ACTIVE_STATUSES_EXCLUDED.has(b.status)) continue;
    const dur = bookingDuration(b, pkgMap);
    const startMins = toMins(b.startTime);
    const entry: ScheduleEntry = {
      id: b.id,
      startMins,
      endMins: startMins + dur,
      startTime: b.startTime,
      googlePlaceId: b.googlePlaceId,
    };

    const bDate = dateOnly(b.date);
    if (!schedule.has(bDate)) schedule.set(bDate, new Map());
    const dayMap = schedule.get(bDate)!;
    for (const empId of b.employeeIds) {
      if (!dayMap.has(empId)) dayMap.set(empId, []);
      dayMap.get(empId)!.push(entry);
    }
  }
  for (const dayMap of schedule.values()) {
    for (const arr of dayMap.values()) arr.sort((a, b) => a.startMins - b.startMins);
  }
  return schedule;
}

/** A raw, feasible (business-hours, non-overlapping) candidate slot — before ranking math is applied. */
interface RawCandidate {
  anchor: SuggestSlotsAnchorInput;
  employeeId: number;
  position: 'before' | 'after';
  slotStart: number;
  slotEnd: number;
  unusedGapMinutes: number;
  /** The bracketing peer on the "new job" side — `null` means Home Base (or day start/end with no Home Base set). */
  peer: ScheduleEntry | null;
  driveToAnchor: RouteLeg;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function suggestSlots(
  // `latitude`/`longitude` are accepted for input-contract parity with how
  // the caller already has them on hand (`AddressAutocomplete`'s
  // selection) but aren't read here — every distance in this module comes
  // from the injected routers, never a local Haversine calc (that
  // pre-filter already happened server-side, FR-19).
  newAddress: { googlePlaceId: string; latitude: number; longitude: number },
  newDurationMins: number,
  anchors: SuggestSlotsAnchorInput[],
  allBookings: SuggestSlotsBookingInput[],
  allPackages: SuggestSlotsPackageInput[],
  settings: SuggestSlotsSettingsInput,
  fetchRouteMatrix: FetchRouteMatrix,
  fetchRoute: FetchRoute,
): Promise<SuggestSlotsOutcome> {
  const duration = newDurationMins > 0 ? newDurationMins : 120;
  const newPlaceId = newAddress.googlePlaceId;

  // Google Route Matrix takes one `departureTime` for the whole batch call,
  // but anchors span many different future dates/times — a per-anchor
  // departure isn't achievable in a single batched request without
  // defeating FR-20's whole point (one call per search). "Now" is used as
  // the best available real-traffic proxy for both the 45-minute filter and
  // every leg below, matching `fuel-gauge.ts`'s `toDepartureIso` clamp.
  // The +60s buffer is load-bearing, not cosmetic: Google's Routes API
  // rejects a `departureTime` that has already passed by the time the
  // request lands server-side (confirmed live — "Timestamp must be set to
  // a future time", the same failure `fuel-gauge.ts` clamps around), and a
  // bare `new Date().toISOString()` is already stale by then.
  const departureTimeIso = new Date(Date.now() + 60_000).toISOString();

  const routableAnchors = anchors.filter((a) => !!a.googlePlaceId);
  const skippedNoCoordinates = anchors.length - routableAnchors.length;
  if (routableAnchors.length === 0) return { slots: [], skippedNoCoordinates, skippedNoTechnician: 0 };

  // ── Step 1 — real 45-minute drive-time filter (FR-19/FR-20) ────────────
  const anchorLegs = await batchedLegs(
    newPlaceId,
    routableAnchors.map((a) => a.googlePlaceId!),
    departureTimeIso,
    fetchRouteMatrix,
  );

  const survivingAnchors = routableAnchors.filter((a) => {
    const leg = anchorLegs.get(a.googlePlaceId!);
    return !!leg && leg.minutes <= MAX_DRIVE_MINS;
  });
  if (survivingAnchors.length === 0) return { slots: [], skippedNoCoordinates, skippedNoTechnician: 0 };

  // ── Step 2/3 — schedule-gap check + tight placement ─────────────────────
  const schedule = buildSchedule(allBookings, allPackages);
  const raw: RawCandidate[] = [];
  // BUG-5's confirmed real cause: a booking with real coordinates but no
  // assigned employee(s) yet (allowed by design — see FR-11 elsewhere in
  // this app, a booking can be created before a technician is picked)
  // can never anchor a recommendation, since there's no schedule to check
  // it against. Counted separately from "no good time fit" (which is a
  // legitimate outcome, not a data gap) — only a *zero-employee* anchor
  // counts here.
  let skippedNoTechnician = 0;

  for (const anchor of survivingAnchors) {
    const driveToAnchor = anchorLegs.get(anchor.googlePlaceId!)!;
    const anchorStart = toMins(anchor.startTime);
    const anchorEnd = anchorStart + anchor.durationMinutes;
    const driveMins = Math.round(driveToAnchor.minutes);

    if (anchor.employeeIds.length === 0) {
      skippedNoTechnician++;
      continue;
    }

    for (const empId of anchor.employeeIds) {
      const dayMap = schedule.get(dateOnly(anchor.date));
      const empDay = dayMap?.get(empId);
      if (!empDay) continue;

      const anchorIdx = empDay.findIndex((b) => b.id === anchor.id);
      if (anchorIdx === -1) continue;

      const prev = empDay[anchorIdx - 1] ?? null;
      const next = empDay[anchorIdx + 1] ?? null;

      // Before anchor.
      {
        const slotEnd = anchorStart - driveMins;
        const slotStart = slotEnd - duration;
        const gapStart = prev ? prev.endMins : WORK_START_MINS;
        if (slotStart >= gapStart && slotStart >= WORK_START_MINS && slotEnd <= WORK_END_MINS) {
          raw.push({
            anchor, employeeId: empId, position: 'before',
            slotStart, slotEnd, unusedGapMinutes: slotStart - gapStart,
            peer: prev, driveToAnchor,
          });
        }
      }

      // After anchor.
      {
        const slotStart = anchorEnd + driveMins;
        const slotEnd = slotStart + duration;
        const gapEnd = next ? next.startMins : WORK_END_MINS;
        if (slotEnd <= gapEnd && slotEnd <= WORK_END_MINS) {
          raw.push({
            anchor, employeeId: empId, position: 'after',
            slotStart, slotEnd, unusedGapMinutes: gapEnd - slotEnd,
            peer: next, driveToAnchor,
          });
        }
      }
    }
  }

  if (raw.length === 0) return { slots: [], skippedNoCoordinates, skippedNoTechnician };

  // ── Bracketing-peer legs, folded into the Step 1 batch's own origin (new
  //    address) so double-anchor detection costs no extra call — plus Home
  //    Base, needed as the A/B fallback when a candidate has no real peer
  //    on that side. ────────────────────────────────────────────────────
  const peerPlaceIds = new Set<string>();
  for (const c of raw) {
    if (c.peer?.googlePlaceId) peerPlaceIds.add(c.peer.googlePlaceId);
  }
  if (settings.hqGooglePlaceId) peerPlaceIds.add(settings.hqGooglePlaceId);

  const peerLegs = await batchedLegs(newPlaceId, Array.from(peerPlaceIds), departureTimeIso, fetchRouteMatrix);
  // Unified new-address-origin lookup: anchor legs + peer/home legs.
  const newOriginLegs = new Map<string, RouteLeg>([...anchorLegs, ...peerLegs]);

  // ── Ranking math: added drive time + added cost (FR-3/FR-17), one
  //    different-origin baseline call per candidate slot (FR-20's spirit).
  const slots = await Promise.all(raw.map(async (c): Promise<SuggestedSlot> => {
    const peerPlaceId = c.peer?.googlePlaceId ?? null;
    const homePlaceId = settings.hqGooglePlaceId ?? null;

    // A/B endpoints for the FR-3 formula: before-case brackets prev(or
    // Home)<->anchor; after-case brackets anchor<->next(or Home).
    const aPlaceId = c.position === 'before' ? (peerPlaceId ?? homePlaceId) : c.anchor.googlePlaceId!;
    const bPlaceId = c.position === 'before' ? c.anchor.googlePlaceId! : (peerPlaceId ?? homePlaceId);

    // Legs already known from the new-address-origin batch. One side of
    // each formula is exactly the direction we need (before-case: new->B
    // is literally new->anchor from Step 1; after-case: new->B is the
    // peer/home leg folded into that same batch); the other side is the
    // new-origin batch's leg reused in the opposite direction as a
    // documented approximation (real routed data either way, just not
    // guaranteed symmetric — see file header).
    const legNewToB = c.position === 'before' ? c.driveToAnchor : (bPlaceId ? newOriginLegs.get(bPlaceId) ?? null : null);
    const legNewToA = c.position === 'before' ? (aPlaceId ? newOriginLegs.get(aPlaceId) ?? null : null) : c.driveToAnchor;

    let addedMiles: number | null = null;
    let addedMinutes: number | null = null;
    let baseline: RouteLeg | null = null;

    if (aPlaceId && bPlaceId && legNewToA && legNewToB) {
      try {
        const result = await fetchRoute(aPlaceId, bPlaceId, departureTimeIso);
        baseline = result;
      } catch {
        baseline = null;
      }
    }

    if (baseline && legNewToA && legNewToB) {
      addedMiles = legNewToA.miles + legNewToB.miles - baseline.miles;
      addedMinutes = legNewToA.minutes + legNewToB.minutes - baseline.minutes;
    }

    const addedIsEstimate = addedMiles === null || addedMinutes === null;
    const finalAddedMiles = addedMiles ?? c.driveToAnchor.miles;
    const finalAddedMinutes = addedMinutes ?? c.driveToAnchor.minutes;

    // Fuel and labor kept separate all the way through (FR-23a discipline,
    // reused from `fuel-gauge.ts`) — only summed for the ranking tiebreak.
    const addedFuelCostDollars = (Math.max(0, finalAddedMiles) / settings.vehicleMpg) * settings.gasPrice;
    const addedLaborCostDollars = (Math.max(0, finalAddedMinutes) / 60) * settings.techHourlyCost;
    const addedCostDollars = addedFuelCostDollars + addedLaborCostDollars;

    const doubleAnchored = !!(c.peer && peerPlaceId && (newOriginLegs.get(peerPlaceId)?.minutes ?? Infinity) <= MAX_DRIVE_MINS);

    const anchorStart = toMins(c.anchor.startTime);
    const anchorEnd = anchorStart + c.anchor.durationMinutes;

    return {
      date: dateOnly(c.anchor.date),
      startTime: fromMins(c.slotStart),
      endTime: fromMins(c.slotEnd),
      employeeId: c.employeeId,
      position: c.position,

      anchorBookingId: c.anchor.id,
      anchorAddress: c.anchor.address,
      anchorStartTime: fromMins(anchorStart),
      anchorEndTime: fromMins(anchorEnd),

      doubleAnchored,
      ...(doubleAnchored && c.peer
        ? { otherBookingStartTime: fromMins(c.peer.startMins), otherBookingEndTime: fromMins(c.peer.endMins) }
        : {}),

      driveToAnchorMinutes: Math.round(c.driveToAnchor.minutes),

      addedDriveMinutes: Math.round(Math.max(0, finalAddedMinutes)),
      addedFuelCostDollars,
      addedLaborCostDollars,
      addedCostDollars,
      addedIsEstimate,

      unusedGapMinutes: c.unusedGapMinutes,
    };
  }));

  // ── Ranking (§6, all five levels, in order) ─────────────────────────────
  slots.sort((a, b) => {
    if (a.doubleAnchored !== b.doubleAnchored) return a.doubleAnchored ? -1 : 1;
    if (a.addedDriveMinutes !== b.addedDriveMinutes) return a.addedDriveMinutes - b.addedDriveMinutes;
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    if (a.unusedGapMinutes !== b.unusedGapMinutes) return a.unusedGapMinutes - b.unusedGapMinutes;
    return a.addedCostDollars - b.addedCostDollars;
  });

  // Dedupe by (date, startTime, employeeId) after ranking — keep the
  // best-ranked variant of any exact-duplicate slot produced by two
  // different anchors landing on the same opening.
  const seen = new Set<string>();
  const deduped = slots.filter((s) => {
    const key = `${s.date}|${s.startTime}|${s.employeeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // FR-2 — exactly 4, never padded.
  return { slots: deduped.slice(0, 4), skippedNoCoordinates, skippedNoTechnician };
}
