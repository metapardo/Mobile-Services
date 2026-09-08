/**
 * Small adapters between the real, generated API types (`@workspace/api-client-react`)
 * and the local mock-shaped types (`@/lib/mock-data`) that `fuel-gauge.ts` and
 * `suggest-slots.ts` are written against.
 *
 * Those two calculation modules were built against `mock-data.ts`'s `Booking`/
 * `Package`/`Settings` interfaces and are otherwise unrelated to where the booking
 * data actually comes from (mock array vs. real API) — rather than forking or
 * rewriting them for `BookingResult`, this file adapts the real shape down to the
 * mock shape at the boundary. `PackageResult`/`ClientResult`/`EmployeeResult` don't
 * need adapters: their fields are a structural superset of `Package`/`Client`/
 * `Employee` (same names/types, plus extras like `archived`/`createdAt`), so
 * TypeScript accepts them directly wherever the mock type is expected. `BookingResult`
 * is the one exception — `notes`/`paymentMethod`/`paymentReference` are `| null` on the
 * wire vs. `| undefined` on the mock type, and `date` needs normalizing (see
 * `isoDateOnly` below).
 *
 * Note on dates: `@workspace/api-client-react`'s generated types call `date`-ish
 * fields plain `string` (not `Date`) — `POST/PATCH /bookings`'s request body and
 * `GET /bookings`'s `start`/`end` query params all just want a bare `YYYY-MM-DD`
 * string, which is exactly what `mock-data.ts`'s own `Booking.date`/local `date`
 * form state already are, so no cast/wrapper is needed sending them. The one place
 * that does need care is the *response* side: the backend's zod response schema
 * `zod.coerce.date()`s `date` before `res.json()`, and `JSON.stringify`'s default
 * `Date.toJSON()` serializes that as a full UTC-midnight ISO *datetime* (e.g.
 * `"2026-08-04T00:00:00.000Z"`), not a bare date — see `isoDateOnly`.
 */
import type { BookingResult } from '@workspace/api-client-react';
import type { Booking } from '@/lib/mock-data';

/**
 * `BookingResult.date` round-trips as a UTC-midnight ISO *datetime* string (see this
 * file's header comment), not the bare `YYYY-MM-DD` the rest of the app works with.
 * Slicing the first 10 characters reads the date portion directly, without ever
 * constructing a `Date`/going through local-timezone formatting — `new Date(isoString)`
 * followed by a local-time formatter would shift the calendar date backward by one in
 * any timezone behind UTC (e.g. all of the US), which slicing the raw string avoids
 * entirely.
 */
export function isoDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

/** `BookingResult` -> mock-shaped `Booking`, for feeding into `fuel-gauge.ts`/`suggest-slots.ts`. */
export function adaptBooking(b: BookingResult): Booking {
  return {
    id: b.id,
    clientId: b.clientId,
    packageIds: b.packageIds,
    employeeIds: b.employeeIds,
    date: isoDateOnly(b.date),
    startTime: b.startTime,
    address: b.address,
    depositAmount: b.depositAmount,
    parkingCost: b.parkingCost,
    status: b.status,
    notes: b.notes ?? undefined,
    employeeSplit: b.employeeSplit,
    paymentMethod: b.paymentMethod ?? undefined,
    paymentReference: b.paymentReference ?? undefined,
  };
}

interface Split {
  employeeId: number;
  percentage: number;
}

/**
 * Evenly splits 100% across `employeeIds`, distributing the remainder (when 100
 * doesn't divide evenly) 1 point at a time to the first few employees so the total
 * always sums to exactly 100 — required by the real `POST/PATCH /bookings` validation
 * ("if non-empty every percentage must be in (0, 100] and the set must sum to exactly
 * 100"). The previous mock-only version (`Math.floor(100 / n)` for every employee)
 * silently produced e.g. 33/33/33 = 99 for 3 employees, which the mock backend never
 * validated but the real API rejects with a 400.
 */
export function evenSplit(employeeIds: number[]): Split[] {
  const n = employeeIds.length;
  if (n === 0) return [];
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  return employeeIds.map((employeeId, i) => ({
    employeeId,
    percentage: base + (i < remainder ? 1 : 0),
  }));
}

/**
 * Guarantees a split sums to exactly 100 before it's sent to the real API, applying
 * any rounding drift (from manual per-employee percentage edits, e.g. in
 * `booking-detail.tsx`'s payroll-split inputs) to the last entry. Falls back to a
 * fresh `evenSplit` if that clamped adjustment still doesn't land on 100 (e.g. every
 * other entry is already pinned at 100).
 */
export function normalizeSplitTo100(split: Split[]): Split[] {
  if (split.length === 0) return [];
  const total = split.reduce((s, x) => s + x.percentage, 0);
  if (total === 100) return split;

  const result = split.map((s) => ({ ...s }));
  const lastIdx = result.length - 1;
  const diff = 100 - total;
  result[lastIdx] = {
    ...result[lastIdx],
    percentage: Math.min(100, Math.max(1, result[lastIdx].percentage + diff)),
  };

  const newTotal = result.reduce((s, x) => s + x.percentage, 0);
  if (newTotal !== 100) {
    return evenSplit(result.map((s) => s.employeeId));
  }
  return result;
}
