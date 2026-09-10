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
