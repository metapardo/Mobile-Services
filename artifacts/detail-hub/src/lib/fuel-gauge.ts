/**
 * Fuel Gauge — per-booking ROI indicator.
 *
 * Standalone, UI-free, testable independently.
 *
 * Step 1 — Anchor selection (same-tech only):
 *   • No other booking that day → Home Base Address
 *   • One adjacent booking → that booking's address
 *   • Bookings before AND after → whichever is nearer
 *
 * Step 2 — Metric:
 *   • NYC address (5 boroughs) → drive TIME in minutes
 *   • Everywhere else → drive DISTANCE in miles
 *
 * Step 3 — Rate & bucket:
 *   • Rate = booking price / metric value
 *   • Thresholds are user-configurable (defaults: $3/$8 per mile, $1.50/$4 per minute)
 */

import type { Booking, Package } from './mock-data';

// ── Public types ──────────────────────────────────────────────────────────────

export type GaugeLevel = 'full' | 'half' | 'empty' | 'unknown';

export interface FuelGaugeResult {
  level: GaugeLevel;
  metricType: 'miles' | 'minutes';
  metricValue: number;        // miles or minutes to/from anchor
  rate: number;               // $/mile or $/minute
  bookingPrice: number;
  anchorAddress: string;
  anchorType: 'home' | 'adjacent' | 'nearest';
}

export interface FuelGaugeThresholds {
  fuelGaugeHalfMi:  number;   // $/mile — lower bound of Half (default 3)
  fuelGaugeFullMi:  number;   // $/mile — lower bound of Full (default 8)
  fuelGaugeHalfMin: number;   // $/min  — lower bound of Half (default 1.5)
  fuelGaugeFullMin: number;   // $/min  — lower bound of Full (default 4)
}

// ── NYC borough detection — static lookup, zero API calls ─────────────────────

/** Zip-code ranges for the 5 NYC boroughs */
const NYC_ZIP_RANGES: Array<[number, number]> = [
  [10001, 10282], // Manhattan
  [10301, 10314], // Staten Island
  [10451, 10475], // Bronx
  [11004, 11109], // Queens (eastern / near JFK)
  [11201, 11239], // Brooklyn
  [11354, 11436], // Queens (western/northern — Flushing, Astoria, Forest Hills…)
  [11691, 11697], // Queens — Far Rockaway
];

export function isNYCAddress(address: string): boolean {
  // Grab first 5-digit sequence that starts with 1 (NYC zips: 10xxx–11xxx)
  const m = address.match(/\b(1\d{4})\b/);
  if (!m) return false;
  const z = parseInt(m[1], 10);
  return NYC_ZIP_RANGES.some(([lo, hi]) => z >= lo && z <= hi);
}

// ── Distance / drive-time proxies (no API call) ───────────────────────────────

function addrHash(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

/**
 * Straight-line distance proxy.  Two addresses in the same metro area typically
 * hash within 2–16 miles of each other — enough for the gauge to differentiate
 * nearby vs. far-flung jobs without a live Geocoding API.
 */
export function estimateDistanceMiles(a: string, b: string): number {
  const h1 = addrHash(a) % 100;
  const h2 = addrHash(b) % 100;
  return (Math.abs(h1 - h2) % 20) * 0.7 + 2; // 2–16 mi
}

/**
 * NYC drive-time proxy: ~10 mph average in dense-city traffic.
 */
export function estimateDriveMinutes(a: string, b: string): number {
  return Math.round((estimateDistanceMiles(a, b) / 10) * 60);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function pkgDuration(b: Booking, pkgMap: Map<number, Package>): number {
  const d = b.packageIds.reduce((s, id) => s + (pkgMap.get(id)?.durationMinutes ?? 60), 0);
  return d > 0 ? d : 60;
}

// ── Anchor selection (spec Step 1) ───────────────────────────────────────────

function selectAnchor(
  target: Booking,
  allBookings: Booking[],
  pkgMap: Map<number, Package>,
  homeAddress: string,
): { address: string; type: FuelGaugeResult['anchorType'] } {

  // Same-tech, same-day, active bookings other than target
  const peers = allBookings
    .filter(b =>
      b.id !== target.id &&
      b.date === target.date &&
      b.status !== 'cancelled' && b.status !== 'no-show' &&
      b.employeeIds.some(id => target.employeeIds.includes(id)),
    )
    .map(b => ({ ...b, startMins: toMins(b.startTime) }))
    .sort((a, b) => a.startMins - b.startMins);

  if (peers.length === 0) {
    return { address: homeAddress, type: 'home' };
  }

  const tStart = toMins(target.startTime);
  const before = peers.filter(b => b.startMins < tStart);
  const after  = peers.filter(b => b.startMins >= tStart);
  const prev   = before.length > 0 ? before[before.length - 1] : null;
  const next   = after.length  > 0 ? after[0]                  : null;

  // Exactly one adjacent booking
  if (!prev && next) return { address: next.address, type: 'adjacent' };
  if (prev && !next) return { address: prev.address, type: 'adjacent' };

  // Both before and after — pick nearer one
  const dPrev = estimateDistanceMiles(target.address, prev!.address);
  const dNext = estimateDistanceMiles(target.address, next!.address);
  return dPrev <= dNext
    ? { address: prev!.address, type: 'nearest' }
    : { address: next!.address, type: 'nearest' };
}

// ── Main export ───────────────────────────────────────────────────────────────

export function computeFuelGauge(
  target: Booking,
  allBookings: Booking[],
  allPackages: Package[],
  homeAddress: string,
  thresholds: FuelGaugeThresholds,
): FuelGaugeResult {
  const pkgMap = new Map(allPackages.map(p => [p.id, p]));

  const bookingPrice = target.packageIds
    .reduce((s, id) => s + (pkgMap.get(id)?.price ?? 0), 0);

  // Unknown: no address, no price, or price is zero
  if (!target.address?.trim() || bookingPrice === 0) {
    return {
      level: 'unknown', metricType: 'miles', metricValue: 0,
      rate: 0, bookingPrice, anchorAddress: '', anchorType: 'home',
    };
  }

  const anchor = selectAnchor(target, allBookings, pkgMap, homeAddress);

  if (!anchor.address?.trim()) {
    return {
      level: 'unknown', metricType: 'miles', metricValue: 0,
      rate: 0, bookingPrice, anchorAddress: homeAddress, anchorType: 'home',
    };
  }

  // Step 2 — choose metric
  const useMinutes = isNYCAddress(target.address);
  const metricValue = useMinutes
    ? estimateDriveMinutes(anchor.address, target.address)
    : estimateDistanceMiles(anchor.address, target.address);

  if (metricValue === 0) {
    return {
      level: 'unknown',
      metricType: useMinutes ? 'minutes' : 'miles',
      metricValue: 0, rate: 0, bookingPrice,
      anchorAddress: anchor.address, anchorType: anchor.type,
    };
  }

  // Step 3 — rate & bucket
  const rate = bookingPrice / metricValue;
  let level: GaugeLevel;
  if (useMinutes) {
    level = rate >= thresholds.fuelGaugeFullMin ? 'full'
          : rate >= thresholds.fuelGaugeHalfMin ? 'half'
          : 'empty';
  } else {
    level = rate >= thresholds.fuelGaugeFullMi ? 'full'
          : rate >= thresholds.fuelGaugeHalfMi ? 'half'
          : 'empty';
  }

  return {
    level,
    metricType: useMinutes ? 'minutes' : 'miles',
    metricValue,
    rate,
    bookingPrice,
    anchorAddress: anchor.address,
    anchorType: anchor.type,
  };
}
