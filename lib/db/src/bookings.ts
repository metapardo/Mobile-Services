import { and, eq, gte, inArray, lte } from "drizzle-orm";
import {
  bookingsTable,
  bookingPackagesTable,
  employeeSplitsTable,
  type InsertBooking,
  type Booking,
} from "./schema";
import { withOrganization } from "./tenant";

export type EmployeeSplitInput = { employeeId: number; percentage: string };

export type BookingWithRelations = Booking & {
  packageIds: number[];
  employeeSplit: EmployeeSplitInput[];
};

type BookingLineItems = { packageIds: number[]; employeeSplit: EmployeeSplitInput[] };

export type CreateBookingInput = Omit<InsertBooking, "organizationId" | "createdBy"> & BookingLineItems;
export type UpdateBookingInput = Partial<Omit<InsertBooking, "organizationId" | "createdBy">> &
  Partial<BookingLineItems>;

/**
 * Thrown by `validateEmployeeSplit`/`createBooking`/`updateBooking` for a
 * business-rule violation (as opposed to a genuine unexpected failure) — routes
 * should catch this specifically and respond `400`, not `500`.
 *
 * DESIGN DECISION (flagged, not silently picked — mock-data.ts's `EmployeeSplit`
 * doesn't itself say how percentages must add up): a non-empty `employeeSplit` must
 * have every percentage in `(0, 100]` and sum to exactly 100 (0.01 tolerance for
 * floating-point rounding), since this is what a payroll "revenue per employee" split
 * needs to mean anything. An *empty* `employeeSplit` is allowed — e.g. a booking
 * created before an employee is assigned (see the booking-form empty-state edge case
 * in the PRD) — since requiring at least one employee at creation time would block
 * that flow. Revisit if product wants a different rule (e.g. allow splits that don't
 * sum to 100, or require at least one employee).
 */
export class BookingValidationError extends Error {}

export function validateEmployeeSplit(employeeSplit: EmployeeSplitInput[]): void {
  if (employeeSplit.length === 0) return;
  let sum = 0;
  for (const split of employeeSplit) {
    const pct = Number(split.percentage);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      throw new BookingValidationError(
        `employeeSplit percentage for employeeId ${split.employeeId} must be a number between 0 (exclusive) and 100 (inclusive), got ${split.percentage}`,
      );
    }
    sum += pct;
  }
  if (Math.abs(sum - 100) > 0.01) {
    throw new BookingValidationError(`employeeSplit percentages must sum to 100, got ${sum}`);
  }
}

/**
 * Date-range list for the calendar view (`GET /bookings?start=&end=`, FR-10) — both
 * bounds optional/inclusive so the caller can also do an open-ended range or (with
 * neither) list everything for the organization. Batches the `booking_packages`/
 * `employee_splits` joins across all matching bookings in two extra queries rather
 * than N+1-ing per booking.
 *
 * `clientId` (FR-5/FR-6 of PRD_DetailHub_Signup_Copy_and_Packages_Hardening.md) is
 * ANDed onto the same `conditions` array as `organizationId`/`start`/`end` — it can
 * never be used to widen the query past `organizationId`, only narrow it further. A
 * `clientId` belonging to a different org is therefore structurally impossible to
 * leak: the `organizationId` condition still applies (and RLS, via
 * `withOrganization`, is a second independent enforcement layer below this), so a
 * cross-org `clientId` just yields zero rows rather than someone else's booking.
 */
export async function listBookings(
  organizationId: string,
  opts: { start?: string; end?: string; clientId?: number } = {},
): Promise<BookingWithRelations[]> {
  return withOrganization(organizationId, async (tx) => {
    const conditions = [eq(bookingsTable.organizationId, organizationId)];
    if (opts.start) conditions.push(gte(bookingsTable.date, opts.start));
    if (opts.end) conditions.push(lte(bookingsTable.date, opts.end));
    if (opts.clientId !== undefined) conditions.push(eq(bookingsTable.clientId, opts.clientId));

    const bookings = await tx
      .select()
      .from(bookingsTable)
      .where(and(...conditions));
    if (bookings.length === 0) return [];

    const ids = bookings.map((b) => b.id);
    const [packageRows, splitRows] = await Promise.all([
      tx
        .select({ bookingId: bookingPackagesTable.bookingId, packageId: bookingPackagesTable.packageId })
        .from(bookingPackagesTable)
        .where(and(eq(bookingPackagesTable.organizationId, organizationId), inArray(bookingPackagesTable.bookingId, ids))),
      tx
        .select({
          bookingId: employeeSplitsTable.bookingId,
          employeeId: employeeSplitsTable.employeeId,
          percentage: employeeSplitsTable.percentage,
        })
        .from(employeeSplitsTable)
        .where(and(eq(employeeSplitsTable.organizationId, organizationId), inArray(employeeSplitsTable.bookingId, ids))),
    ]);

    const packagesByBooking = new Map<number, number[]>();
    for (const row of packageRows) {
      const list = packagesByBooking.get(row.bookingId) ?? [];
      list.push(row.packageId);
      packagesByBooking.set(row.bookingId, list);
    }
    const splitsByBooking = new Map<number, EmployeeSplitInput[]>();
    for (const row of splitRows) {
      const list = splitsByBooking.get(row.bookingId) ?? [];
      list.push({ employeeId: row.employeeId, percentage: row.percentage });
      splitsByBooking.set(row.bookingId, list);
    }

    return bookings.map((booking) => ({
      ...booking,
      packageIds: packagesByBooking.get(booking.id) ?? [],
      employeeSplit: splitsByBooking.get(booking.id) ?? [],
    }));
  });
}

export async function getBookingById(organizationId: string, id: number): Promise<BookingWithRelations | null> {
  return withOrganization(organizationId, async (tx) => {
    const [booking] = await tx
      .select()
      .from(bookingsTable)
      .where(and(eq(bookingsTable.organizationId, organizationId), eq(bookingsTable.id, id)));
    if (!booking) return null;

    const [packageRows, splitRows] = await Promise.all([
      tx
        .select({ packageId: bookingPackagesTable.packageId })
        .from(bookingPackagesTable)
        .where(and(eq(bookingPackagesTable.organizationId, organizationId), eq(bookingPackagesTable.bookingId, id))),
      tx
        .select({ employeeId: employeeSplitsTable.employeeId, percentage: employeeSplitsTable.percentage })
        .from(employeeSplitsTable)
        .where(and(eq(employeeSplitsTable.organizationId, organizationId), eq(employeeSplitsTable.bookingId, id))),
    ]);

    return {
      ...booking,
      packageIds: packageRows.map((r) => r.packageId),
      employeeSplit: splitRows,
    };
  });
}

export async function createBooking(
  organizationId: string,
  createdBy: string,
  input: CreateBookingInput,
): Promise<BookingWithRelations> {
  const { packageIds, employeeSplit, ...bookingFields } = input;
  validateEmployeeSplit(employeeSplit);

  return withOrganization(organizationId, async (tx) => {
    const [booking] = await tx
      .insert(bookingsTable)
      .values({ ...bookingFields, organizationId, createdBy })
      .returning();

    if (packageIds.length > 0) {
      await tx
        .insert(bookingPackagesTable)
        .values(packageIds.map((packageId) => ({ organizationId, bookingId: booking!.id, packageId })));
    }
    if (employeeSplit.length > 0) {
      await tx.insert(employeeSplitsTable).values(
        employeeSplit.map((split) => ({
          organizationId,
          bookingId: booking!.id,
          employeeId: split.employeeId,
          percentage: split.percentage,
        })),
      );
    }

    return { ...booking!, packageIds, employeeSplit };
  });
}

export async function updateBooking(
  organizationId: string,
  id: number,
  patch: UpdateBookingInput,
): Promise<BookingWithRelations | null> {
  const { packageIds, employeeSplit, ...bookingFields } = patch;
  if (employeeSplit !== undefined) validateEmployeeSplit(employeeSplit);

  return withOrganization(organizationId, async (tx) => {
    let booking: Booking | undefined;
    if (Object.keys(bookingFields).length > 0) {
      [booking] = await tx
        .update(bookingsTable)
        .set({ ...bookingFields, updatedAt: new Date() })
        .where(and(eq(bookingsTable.organizationId, organizationId), eq(bookingsTable.id, id)))
        .returning();
    } else {
      [booking] = await tx
        .select()
        .from(bookingsTable)
        .where(and(eq(bookingsTable.organizationId, organizationId), eq(bookingsTable.id, id)));
    }
    if (!booking) return null;

    if (packageIds !== undefined) {
      await tx
        .delete(bookingPackagesTable)
        .where(and(eq(bookingPackagesTable.organizationId, organizationId), eq(bookingPackagesTable.bookingId, id)));
      if (packageIds.length > 0) {
        await tx
          .insert(bookingPackagesTable)
          .values(packageIds.map((packageId) => ({ organizationId, bookingId: id, packageId })));
      }
    }
    if (employeeSplit !== undefined) {
      await tx
        .delete(employeeSplitsTable)
        .where(and(eq(employeeSplitsTable.organizationId, organizationId), eq(employeeSplitsTable.bookingId, id)));
      if (employeeSplit.length > 0) {
        await tx.insert(employeeSplitsTable).values(
          employeeSplit.map((split) => ({
            organizationId,
            bookingId: id,
            employeeId: split.employeeId,
            percentage: split.percentage,
          })),
        );
      }
    }

    // Re-read the current relations rather than trusting the input — covers the case
    // where only one of packageIds/employeeSplit was patched (the other should reflect
    // what's actually in the DB, not be silently dropped from the response).
    const [packageRows, splitRows] = await Promise.all([
      tx
        .select({ packageId: bookingPackagesTable.packageId })
        .from(bookingPackagesTable)
        .where(and(eq(bookingPackagesTable.organizationId, organizationId), eq(bookingPackagesTable.bookingId, id))),
      tx
        .select({ employeeId: employeeSplitsTable.employeeId, percentage: employeeSplitsTable.percentage })
        .from(employeeSplitsTable)
        .where(and(eq(employeeSplitsTable.organizationId, organizationId), eq(employeeSplitsTable.bookingId, id))),
    ]);

    return { ...booking, packageIds: packageRows.map((r) => r.packageId), employeeSplit: splitRows };
  });
}

/**
 * Hard delete. Unlike clients/employees/packages, bookings are the "leaf" of this
 * schema — nothing else references a booking except its own join rows
 * (`booking_packages`/`employee_splits`, both `onDelete: "cascade"` on `bookingId`),
 * so there's no dangling-reference risk the way there is for an archived
 * client/employee/package. A cancelled booking should generally use `status:
 * "cancelled"` via `PATCH /bookings/:id` instead of this — this is for genuine
 * removal (e.g. a duplicate/test entry).
 */
export async function deleteBooking(organizationId: string, id: number): Promise<boolean> {
  return withOrganization(organizationId, async (tx) => {
    const deleted = await tx
      .delete(bookingsTable)
      .where(and(eq(bookingsTable.organizationId, organizationId), eq(bookingsTable.id, id)))
      .returning({ id: bookingsTable.id });
    return deleted.length > 0;
  });
}

/**
 * Thrown by `recordBookingPayment` when `paymentMethod === "credit_card"`.
 * `PRD_DetailHub_Payment_Methods.md` FR-5: card processing requires a connected
 * processor (Stripe/Square — integrations-engineer's build), which doesn't exist yet.
 * Routes should catch this specifically and respond 422 with a
 * `card_processing_not_available` error code — never simulate or fake a card charge.
 */
export class CardProcessingUnavailableError extends Error {}

export type RecordBookingPaymentInput = {
  paymentMethod: "zelle" | "venmo" | "cash" | "credit_card";
  paymentReference?: string | null;
};

/**
 * `POST /bookings/:id/payment` (FR-2). For `zelle`/`venmo`/`cash`, records the tender
 * type + optional free-text reference and timestamps it — this is *recording*, not
 * processing (Section 6.2): the money already moved outside the app. `credit_card`
 * always throws `CardProcessingUnavailableError` — no processor is connected in this
 * codebase (Section 8), and this function must never fall through to any real or
 * simulated charge logic for that case.
 */
export async function recordBookingPayment(
  organizationId: string,
  id: number,
  input: RecordBookingPaymentInput,
): Promise<BookingWithRelations | null> {
  if (input.paymentMethod === "credit_card") {
    throw new CardProcessingUnavailableError(
      "Card processing isn't available yet — no payment processor is connected. See Settings once one is.",
    );
  }
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(bookingsTable)
      .set({
        paymentMethod: input.paymentMethod,
        paymentReference: input.paymentReference ?? null,
        paymentRecordedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(bookingsTable.organizationId, organizationId), eq(bookingsTable.id, id)))
      .returning();
    if (!updated) return null;

    const [packageRows, splitRows] = await Promise.all([
      tx
        .select({ packageId: bookingPackagesTable.packageId })
        .from(bookingPackagesTable)
        .where(and(eq(bookingPackagesTable.organizationId, organizationId), eq(bookingPackagesTable.bookingId, id))),
      tx
        .select({ employeeId: employeeSplitsTable.employeeId, percentage: employeeSplitsTable.percentage })
        .from(employeeSplitsTable)
        .where(and(eq(employeeSplitsTable.organizationId, organizationId), eq(employeeSplitsTable.bookingId, id))),
    ]);
    return { ...updated, packageIds: packageRows.map((r) => r.packageId), employeeSplit: splitRows };
  });
}

export type RefundBookingInput = { refundReference?: string | null };

/**
 * `POST /bookings/:id/refund` (FR-8). Always a manual reversal record — per
 * `PRD_DetailHub_Payment_Methods.md` Section 6.2/FR-8, none of Zelle/Venmo/Cash has a
 * processor API to call for a real refund, and no card processor is connected either
 * (Section 8), so this never calls any processor refund endpoint, real or simulated.
 * Sets `refundStatus: "completed"` directly (no `"requested"` intermediate state is
 * built in this pass — see the enum's own doc comment in `../schema/bookings.ts`).
 */
export async function refundBooking(
  organizationId: string,
  id: number,
  input: RefundBookingInput = {},
): Promise<BookingWithRelations | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(bookingsTable)
      .set({
        refundStatus: "completed",
        refundReference: input.refundReference ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(bookingsTable.organizationId, organizationId), eq(bookingsTable.id, id)))
      .returning();
    if (!updated) return null;

    const [packageRows, splitRows] = await Promise.all([
      tx
        .select({ packageId: bookingPackagesTable.packageId })
        .from(bookingPackagesTable)
        .where(and(eq(bookingPackagesTable.organizationId, organizationId), eq(bookingPackagesTable.bookingId, id))),
      tx
        .select({ employeeId: employeeSplitsTable.employeeId, percentage: employeeSplitsTable.percentage })
        .from(employeeSplitsTable)
        .where(and(eq(employeeSplitsTable.organizationId, organizationId), eq(employeeSplitsTable.bookingId, id))),
    ]);
    return { ...updated, packageIds: packageRows.map((r) => r.packageId), employeeSplit: splitRows };
  });
}
