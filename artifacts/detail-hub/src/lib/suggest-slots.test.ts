/**
 * Unit tests for `suggest-slots.ts`, added per `BUGS_Mobull_2026-09-10_Round2.md`
 * BUG-6 ("Add unit tests for: `employeeIds: []`; an anchor absent from the
 * schedule map; an anchor with `googlePlaceId: null`. Round 1's fix passed
 * its tests and still failed in production because every fixture had a
 * technician assigned.").
 *
 * No test runner (vitest/jest) is configured anywhere in this monorepo yet
 * — this uses Node's built-in `node:test`/`node:assert` (zero new
 * dependencies, zero config changes) so it can run today via:
 *
 *   node --experimental-strip-types --test src/lib/suggest-slots.test.ts
 *
 * (Node 22.6+; this repo runs Node 26.) `tsconfig.json` already excludes
 * `**\/*.test.ts` from the main `pnpm typecheck` build, matching this
 * file's naming convention.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  suggestSlots,
  type SuggestSlotsAnchorInput,
  type SuggestSlotsBookingInput,
  type SuggestSlotsPackageInput,
  type SuggestSlotsSettingsInput,
  type FetchRouteMatrix,
} from './suggest-slots.ts';
import type { FetchRoute } from './fuel-gauge.ts';

const SETTINGS: SuggestSlotsSettingsInput = {
  homeAddress: '1 Shop Rd, Rockville Centre, NY',
  hqGooglePlaceId: null,
  gasPrice: 3.5,
  vehicleMpg: 22,
  techHourlyCost: 25,
};

const NEW_ADDRESS = { googlePlaceId: 'place-new', latitude: 40.66, longitude: -73.64 };

/** A fetchRouteMatrix stub that resolves every destination to a fixed, well-within-range leg unless explicitly overridden. */
function makeFetchRouteMatrix(overrides: Record<string, { miles: number; minutes: number } | null> = {}): FetchRouteMatrix {
  return async (_origin, destinationPlaceIds) => {
    return destinationPlaceIds.map((destinationPlaceId) => {
      const override = overrides[destinationPlaceId];
      if (override === null) {
        return { destinationPlaceId, miles: null, minutes: null, error: 'ZERO_RESULTS' };
      }
      const leg = override ?? { miles: 8, minutes: 15 };
      return { destinationPlaceId, miles: leg.miles, minutes: leg.minutes, error: null };
    });
  };
}

const fetchRoute: FetchRoute = async () => ({ miles: 10, minutes: 20 });

function anchor(overrides: Partial<SuggestSlotsAnchorInput>): SuggestSlotsAnchorInput {
  return {
    id: 1,
    date: '2026-09-15',
    startTime: '13:00',
    durationMinutes: 60,
    employeeIds: [],
    address: '140 Shepherd St, Rockville Centre, NY 11570',
    googlePlaceId: 'place-anchor',
    ...overrides,
  };
}

function booking(overrides: Partial<SuggestSlotsBookingInput>): SuggestSlotsBookingInput {
  return {
    id: 1,
    date: '2026-09-15',
    startTime: '13:00',
    status: 'confirmed',
    employeeIds: [],
    packageIds: [],
    googlePlaceId: 'place-anchor',
    ...overrides,
  };
}

const NO_PACKAGES: SuggestSlotsPackageInput[] = [];

test('BUG-6 Blocker 1 — an anchor with employeeIds: [] produces a recommendation, not a skip', async () => {
  const anchors = [anchor({ id: 1, employeeIds: [] })];
  // The anchor itself need not appear in `allBookings` at all for the
  // unassigned path (it uses `buildDaySchedule()` directly from the
  // anchor's own date/start/duration) — deliberately left empty here to
  // prove that.
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix(), fetchRoute,
  );

  assert.equal(outcome.skippedNoCoordinates, 0);
  assert.equal(outcome.skippedNotInSchedule, 0);
  assert.equal(outcome.skippedMatrixFailure, 0);
  assert.ok(outcome.slots.length > 0, 'expected at least one recommended slot for an unassigned anchor');
  assert.ok(
    outcome.slots.every((s) => s.employeeId === null),
    'an unassigned anchor must never produce a slot with a guessed employeeId',
  );
});

test('BUG-6 Blocker 2 — an assigned anchor absent from the schedule map is counted, not silently dropped', async () => {
  const anchors = [anchor({ id: 2, employeeIds: [42], googlePlaceId: 'place-anchor-2' })];
  // `allBookings` deliberately doesn't contain this anchor (or anything for
  // employee 42 on this date) — `schedule.get(date)?.get(42)` will be
  // `undefined`, the exact Blocker 2 scenario.
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix(), fetchRoute,
  );

  assert.equal(outcome.slots.length, 0);
  assert.equal(outcome.skippedNotInSchedule, 1);
  assert.equal(outcome.skippedNoCoordinates, 0);
  assert.equal(outcome.skippedMatrixFailure, 0);
});

test('BUG-6 Blocker 3 (unchanged) — an anchor with googlePlaceId: null increments skippedNoCoordinates', async () => {
  const anchors = [anchor({ id: 3, googlePlaceId: null })];
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix(), fetchRoute,
  );

  assert.equal(outcome.slots.length, 0);
  assert.equal(outcome.skippedNoCoordinates, 1);
  assert.equal(outcome.skippedNotInSchedule, 0);
  assert.equal(outcome.skippedMatrixFailure, 0);
});

test('BUG-6 Blocker 4 — a failed Route Matrix element increments skippedMatrixFailure, never fabricates a distance', async () => {
  const anchors = [anchor({ id: 4, googlePlaceId: 'place-unreachable' })];
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix({ 'place-unreachable': null }),
    fetchRoute,
  );

  assert.equal(outcome.slots.length, 0);
  assert.equal(outcome.skippedMatrixFailure, 1);
  assert.equal(outcome.skippedNoCoordinates, 0);
  assert.equal(outcome.skippedNotInSchedule, 0);
});

test('regression — an anchor with an assigned technician still recommends and auto-fills them', async () => {
  const anchors = [anchor({ id: 5, employeeIds: [7], googlePlaceId: 'place-anchor-5' })];
  const allBookings = [booking({ id: 5, employeeIds: [7], googlePlaceId: 'place-anchor-5' })];
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, allBookings, NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix(), fetchRoute,
  );

  assert.ok(outcome.slots.length > 0, 'expected at least one recommended slot for an assigned anchor');
  assert.ok(outcome.slots.every((s) => s.employeeId === 7));
  assert.equal(outcome.skippedNotInSchedule, 0);
});

test('recommended start times snap to the 15-minute grid, never an arbitrary minute', async () => {
  // The anchor-side buffer is now `max(realDriveMins, 45)`, and a real drive
  // to an anchor is always <=45 (anything farther is excluded before
  // placement even runs), so that buffer is always exactly 45 — itself
  // already grid-aligned. So the non-grid-aligned input has to come from
  // the anchor's own start time instead: 09:07-10:07 (not on a 15-minute
  // mark) means the raw earliest start is 10:07+45=10:52, which must still
  // snap up to 11:00, never appear as :52 (or :07).
  const anchors = [anchor({ id: 7, employeeIds: [], startTime: '09:07', durationMinutes: 60, googlePlaceId: 'place-anchor-7' })];
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix({ 'place-anchor-7': { miles: 5, minutes: 9 } }),
    fetchRoute,
  );

  assert.ok(outcome.slots.length > 0, 'expected at least one recommended slot');
  for (const slot of outcome.slots) {
    const minutes = parseInt(slot.startTime.split(':')[1], 10);
    assert.ok(minutes % 15 === 0, `expected ${slot.startTime} to land on a 15-minute mark`);
  }
  const afterSlot = outcome.slots.find((s) => s.position === 'after');
  assert.equal(afterSlot?.startTime, '11:00', 'the after-anchor slot should snap 10:52 up to 11:00, never down or left unaligned');
});

test('a recommendation never lands within 45 minutes of the anchor, even when the real drive is much shorter', async () => {
  // driveMins=9 is well under 45 — without the floor this would place the
  // after-slot at 10:00+9=10:09 (snapped to 10:15). With the floor, the
  // anchor-side buffer is max(9, 45)=45, so the slot must start no earlier
  // than 10:45, not 10:15.
  const anchors = [anchor({ id: 9, employeeIds: [], startTime: '09:00', durationMinutes: 60, googlePlaceId: 'place-anchor-9' })];
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix({ 'place-anchor-9': { miles: 3, minutes: 9 } }),
    fetchRoute,
  );

  const afterSlot = outcome.slots.find((s) => s.position === 'after');
  assert.ok(afterSlot, 'expected an after-anchor slot');
  assert.equal(afterSlot!.startTime, '10:45', 'a 9-minute real drive must still be floored to the 45-minute minimum buffer');
});

test('a recommendation never overlaps a booking the naive prev/next search would miss', async () => {
  // The anchor (unassigned, 13:00-14:00) has no bookings before or after it
  // in `allBookings` — so a naive "nearest booking that ends before/starts
  // after the anchor" search finds prev=null, next=null, and would treat
  // the whole rest of the day as open. But a *different* technician has a
  // booking from 13:30-15:30 that starts before the anchor ends and ends
  // after it — invisible to that search (its start, 13:30, is before the
  // anchor's end, 14:00), yet a naive after-anchor recommendation (tight
  // against the anchor at ~14:09, well within 13:30-15:30) would collide
  // with it. The overlap safety net must drop that candidate.
  const anchors = [anchor({ id: 10, employeeIds: [], startTime: '13:00', durationMinutes: 60, googlePlaceId: 'place-anchor-10' })];
  const allPackages: SuggestSlotsPackageInput[] = [{ id: 1, durationMinutes: 120 }];
  const allBookings = [
    booking({ id: 999, employeeIds: [42], packageIds: [1], startTime: '13:30', googlePlaceId: 'place-other' }),
  ];

  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, allBookings, allPackages, SETTINGS,
    makeFetchRouteMatrix({ 'place-anchor-10': { miles: 3, minutes: 9 } }),
    fetchRoute,
  );

  // The other booking occupies 13:30 (810) - 15:30 (930). No returned slot
  // may overlap that window.
  for (const slot of outcome.slots) {
    const [sh, sm] = slot.startTime.split(':').map(Number);
    const [eh, em] = slot.endTime.split(':').map(Number);
    const startMins = sh * 60 + sm;
    const endMins = eh * 60 + em;
    const overlapsOther = startMins < 930 && endMins > 810;
    assert.ok(!overlapsOther, `slot ${slot.startTime}-${slot.endTime} must not overlap the other technician's 13:30-15:30 booking`);
  }
});

test('the true empty state still appears when nothing survives the 45-minute filter', async () => {
  const anchors = [anchor({ id: 6, googlePlaceId: 'place-far' })];
  const outcome = await suggestSlots(
    NEW_ADDRESS, 60, anchors, [], NO_PACKAGES, SETTINGS,
    makeFetchRouteMatrix({ 'place-far': { miles: 40, minutes: 50 } }), // > MAX_DRIVE_MINS (45)
    fetchRoute,
  );

  assert.equal(outcome.slots.length, 0);
  assert.equal(outcome.skippedNoCoordinates, 0);
  assert.equal(outcome.skippedNotInSchedule, 0);
  assert.equal(outcome.skippedMatrixFailure, 0);
});
