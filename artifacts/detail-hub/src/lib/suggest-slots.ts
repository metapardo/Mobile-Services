/**
 * Smart slot suggestion engine.
 *
 * Scans existing bookings over a 10-day window and finds up to 6 openings
 * that efficiently cluster a new appointment near existing work on the same
 * technician's route — minimising dead-head drive and unusable gaps.
 *
 * Algorithm (mirrors the spec):
 *   Step 1 — Collect future, non-cancelled bookings as candidate anchors.
 *             Pre-filter by straight-line proximity to the new address (≤45 min drive).
 *   Step 2 — For each anchor, inspect ONLY that anchor's own technician's schedule.
 *             Is there open time immediately before or after the anchor that fits
 *             newDuration + driveTime without overlapping the surrounding bookings?
 *   Step 3 — Position the slot as tight as possible against the anchor.
 *   Step 4 — Mark "double-anchored" when consecutive bookings on the same tech
 *             bracket the new slot from both sides within 45 min of each.
 *   Rank   — double-anchored > shorter drive > higher margin > tighter fit.
 */

import type { Booking, Package, Settings } from './mock-data';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SuggestedSlot {
  date: string;          // YYYY-MM-DD
  startTime: string;     // HH:MM
  employeeId: number;
  driveMinutes: number;
  doubleAnchored: boolean;
  unusedGapMinutes: number;
  marginDollars: number;
  anchorBookingId: number;
  position: 'before' | 'after';
}

// ── Constants ─────────────────────────────────────────────────────────────────

const WORK_START_MINS = 8 * 60;   // 08:00
const WORK_END_MINS   = 18 * 60;  // 18:00
const MAX_DRIVE_MINS  = 45;
const SEARCH_DAYS     = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────

function addrHash(addr: string): number {
  return addr.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

/**
 * Cheap straight-line drive-time proxy (no API call).
 * Uses modular difference of address hashes to produce 5–42 minute estimates
 * that feel realistic for addresses within the same metro area.
 */
export function estimateDriveMins(a: string, b: string): number {
  const h1 = addrHash(a) % 100;
  const h2 = addrHash(b) % 100;
  const distMiles = (Math.abs(h1 - h2) % 20) * 0.7 + 2; // 2–16 mi
  return Math.round((distMiles / 20) * 60);               // 6–48 min @ 20 mph urban
}

function toMins(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function fromMins(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getDatesAhead(days: number): string[] {
  const out: string[] = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

function bookingDuration(b: Booking, pkgMap: Map<number, Package>): number {
  const dur = b.packageIds.reduce((sum, pid) => sum + (pkgMap.get(pid)?.durationMinutes ?? 60), 0);
  return dur > 0 ? dur : 60;
}

// ── Main export ───────────────────────────────────────────────────────────────

export function suggestSlots(
  newAddress: string,
  newDurationMins: number,
  newPrice: number,
  allBookings: Booking[],
  allPackages: Package[],
  config: Settings,
): SuggestedSlot[] {
  if (!newAddress.trim() || newAddress.length < 6) return [];

  const duration = newDurationMins > 0 ? newDurationMins : 120;
  const searchDates = new Set(getDatesAhead(SEARCH_DAYS));
  const pkgMap = new Map(allPackages.map(p => [p.id, p]));

  // Active, upcoming bookings only
  const activeBookings = allBookings.filter(
    b => searchDates.has(b.date) && b.status !== 'cancelled' && b.status !== 'no-show',
  );

  // Group by date → employeeId → sorted list (for O(1) lookup later)
  // Map<date, Map<empId, sortedBookings>>
  const schedule = new Map<string, Map<number, Array<Booking & { startMins: number; endMins: number }>>>();

  for (const b of activeBookings) {
    if (!schedule.has(b.date)) schedule.set(b.date, new Map());
    const dayMap = schedule.get(b.date)!;
    const dur = bookingDuration(b, pkgMap);
    const startMins = toMins(b.startTime);
    const enriched = { ...b, startMins, endMins: startMins + dur };

    for (const empId of b.employeeIds) {
      if (!dayMap.has(empId)) dayMap.set(empId, []);
      dayMap.get(empId)!.push(enriched);
    }
  }
  // Sort each employee's day by start time
  for (const dayMap of schedule.values()) {
    for (const arr of dayMap.values()) {
      arr.sort((a, b) => a.startMins - b.startMins);
    }
  }

  const candidates: SuggestedSlot[] = [];

  // Iterate every anchor
  for (const anchor of activeBookings) {
    const driveToAnchor = estimateDriveMins(newAddress, anchor.address);
    if (driveToAnchor > MAX_DRIVE_MINS) continue;

    const anchorDur = bookingDuration(anchor, pkgMap);
    const anchorStart = toMins(anchor.startTime);
    const anchorEnd   = anchorStart + anchorDur;

    const dayMap = schedule.get(anchor.date);
    if (!dayMap) continue;

    for (const empId of anchor.employeeIds) {
      const empDay = dayMap.get(empId);
      if (!empDay) continue;

      const anchorIdx = empDay.findIndex(b => b.id === anchor.id);
      if (anchorIdx === -1) continue;

      const prev = empDay[anchorIdx - 1] ?? null;
      const next = empDay[anchorIdx + 1] ?? null;

      // ── SLOT BEFORE anchor ──────────────────────────────────────────────
      {
        const slotEnd   = anchorStart - driveToAnchor;
        const slotStart = slotEnd - duration;

        if (slotStart >= WORK_START_MINS && slotEnd >= WORK_START_MINS) {
          // Must not overlap the previous booking for this employee
          const driveFromPrev = prev ? estimateDriveMins(prev.address, newAddress) : 0;
          const earliestStart = prev ? prev.endMins + driveFromPrev : WORK_START_MINS;

          if (slotStart >= earliestStart) {
            const unusedGap = slotStart - earliestStart;
            const isDoubleAnchored = prev !== null &&
              estimateDriveMins(prev.address, anchor.address) <= MAX_DRIVE_MINS;

            const gasCost = (driveToAnchor * 2 / 60) * (config.gasPrice / config.vehicleMpg);
            candidates.push({
              date: anchor.date,
              startTime: fromMins(slotStart),
              employeeId: empId,
              driveMinutes: driveToAnchor,
              doubleAnchored: isDoubleAnchored,
              unusedGapMinutes: unusedGap,
              marginDollars: newPrice - gasCost,
              anchorBookingId: anchor.id,
              position: 'before',
            });
          }
        }
      }

      // ── SLOT AFTER anchor ───────────────────────────────────────────────
      {
        const slotStart = anchorEnd + driveToAnchor;
        const slotEnd   = slotStart + duration;

        if (slotEnd <= WORK_END_MINS) {
          // Must not run into the next booking for this employee
          const driveToNext = next ? estimateDriveMins(newAddress, next.address) : 0;
          const latestEnd   = next ? next.startMins - driveToNext : WORK_END_MINS;

          if (slotEnd <= latestEnd) {
            const unusedGap = latestEnd - slotEnd;
            const isDoubleAnchored = next !== null &&
              estimateDriveMins(anchor.address, next.address) <= MAX_DRIVE_MINS;

            const gasCost = (driveToAnchor * 2 / 60) * (config.gasPrice / config.vehicleMpg);
            candidates.push({
              date: anchor.date,
              startTime: fromMins(slotStart),
              employeeId: empId,
              driveMinutes: driveToAnchor,
              doubleAnchored: isDoubleAnchored,
              unusedGapMinutes: unusedGap,
              marginDollars: newPrice - gasCost,
              anchorBookingId: anchor.id,
              position: 'after',
            });
          }
        }
      }
    }
  }

  // Deduplicate by (date, startTime, employeeId) — keep first occurrence (already ranked by anchor order)
  const seen = new Set<string>();
  const deduped = candidates.filter(c => {
    const key = `${c.date}|${c.startTime}|${c.employeeId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Rank per spec:
  //  1. double-anchored beats single-anchored
  //  2. shorter total drive time wins ties
  //  3. higher margin wins remaining ties
  //  4. tighter fit (less leftover gap) breaks final ties
  deduped.sort((a, b) => {
    if (a.doubleAnchored !== b.doubleAnchored) return a.doubleAnchored ? -1 : 1;
    if (a.driveMinutes   !== b.driveMinutes)   return a.driveMinutes - b.driveMinutes;
    if (a.marginDollars  !== b.marginDollars)   return b.marginDollars - a.marginDollars;
    return a.unusedGapMinutes - b.unusedGapMinutes;
  });

  return deduped.slice(0, 6);
}
