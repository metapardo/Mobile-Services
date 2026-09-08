import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import {
  employeesTable,
  employeeRolesTable,
  employeeSplitsTable,
  timeLogsTable,
  bookingsTable,
  bookingPackagesTable,
  packagesTable,
  payrollRunsTable,
  type Employee,
  type EmployeeRole,
  type PayrollLineItem,
  type PayrollRun,
} from "./schema";
import { withOrganization } from "./tenant";
import { estimateWithholding } from "./payroll-tax-estimate";
import { pendingTimeOffCount } from "./time-off-requests";

/**
 * FLAGGED DESIGN GAP (not silently picked): `payrollRunsTable.runBy` is a `NOT NULL`
 * FK into `employeesTable.id` (docs/prds/PRD_DetailHub_Payroll_Module.md Section 2.6:
 * "`run_by` FK -> Employee (admin)"). But this app's admin/owner is a Better Auth
 * *user* (`userTable`, text id, e.g. `bookings.createdBy`) — v1 has no employee login
 * (see the master PRD's Section 1 / this app's "one admin/owner user per org" scope),
 * so there is no guaranteed `employees` row representing the person actually running
 * payroll. Rather than silently fabricating an employee row or weakening the FK,
 * `createPayrollRun` requires the caller to pass `runByEmployeeId` explicitly (the
 * admin picks/represents themselves via an existing employee record, if one exists) —
 * this needs a real product decision later (e.g. auto-create an "Owner" employee row
 * at signup, or change `runBy` to reference `userTable.id` the way
 * `bookings.createdBy` already does).
 */

// ─── Period resolution ──────────────────────────────────────────────────────
// Mirrors `artifacts/detail-hub/src/lib/payroll-data.ts`'s `getPeriodRange()`
// (via `date-fns`'s `startOfWeek`/`endOfWeek` with `weekStartsOn: 1`, i.e. Monday, and
// `startOfMonth`/`endOfMonth`) so the frontend and backend never disagree about what
// "this week" means. Computed in UTC (no `date-fns` dependency in `@workspace/db`) —
// this can differ from the business's local wall-clock by a few hours right at a day
// boundary, same class of simplification as the rest of this codebase's date handling
// (every `date` column here is a plain `YYYY-MM-DD` string with no timezone).
export type PayrollPeriodShorthand = "this_week" | "last_week" | "this_month";

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function mondayOfWeekUTC(d: Date): Date {
  const day = d.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() + diffToMonday);
  return monday;
}

function addDaysUTC(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

export class InvalidPayrollPeriodError extends Error {}

/**
 * Resolves either an explicit `periodStart`/`periodEnd` pair or a shorthand
 * (`this_week`/`last_week`/`this_month`) into a concrete `YYYY-MM-DD` date range.
 * Explicit dates always win if both are provided alongside a shorthand.
 */
export function resolvePayrollPeriod(opts: {
  period?: PayrollPeriodShorthand;
  periodStart?: string;
  periodEnd?: string;
}): { start: string; end: string } {
  if (opts.periodStart && opts.periodEnd) {
    if (opts.periodStart > opts.periodEnd) {
      throw new InvalidPayrollPeriodError("periodStart must be on or before periodEnd.");
    }
    return { start: opts.periodStart, end: opts.periodEnd };
  }

  const now = new Date();
  const shorthand = opts.period ?? "this_week";
  if (shorthand === "this_week") {
    const monday = mondayOfWeekUTC(now);
    return { start: toDateOnly(monday), end: toDateOnly(addDaysUTC(monday, 6)) };
  }
  if (shorthand === "last_week") {
    const monday = addDaysUTC(mondayOfWeekUTC(now), -7);
    return { start: toDateOnly(monday), end: toDateOnly(addDaysUTC(monday, 6)) };
  }
  // this_month
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return { start: toDateOnly(start), end: toDateOnly(end) };
}

// ─── Summary calculation ────────────────────────────────────────────────────

export type PayrollSummary = {
  periodStart: string;
  periodEnd: string;
  lines: PayrollLineItem[];
  grossTotal: number;
  netTotal: number;
  pendingTimeOffCount: number;
};

/**
 * Computes each employee's payroll line item for `[periodStart, periodEnd]`
 * (both inclusive `YYYY-MM-DD`) — the core payroll engine. Mirrors
 * `artifacts/detail-hub/src/lib/payroll-data.ts`'s `calcPayrollSummary` exactly,
 * including one carried-over edge case: an employee with more than one
 * `pay_type: "commission"` role would have their full period commission revenue
 * counted once per such role (double-counted) — the mock never exercises this (no
 * mock employee has 2+ commission roles) and neither does this port; a real
 * multi-commission-role scenario would need booking-level role assignment to resolve
 * correctly, which is out of scope here (flagged, not silently "fixed" by guessing).
 *
 * `hourly_pay` only counts *approved* `TimeLog` rows (PRD Section 4 / Open Question
 * #11) — unapproved hours never flow into a payroll run.
 */
export async function calculatePayrollSummary(
  organizationId: string,
  periodStart: string,
  periodEnd: string,
): Promise<PayrollSummary> {
  return withOrganization(organizationId, async (tx) => {
    const [employees, roles, approvedLogs, periodBookings, pendingTimeOff] = await Promise.all([
      tx.select().from(employeesTable).where(eq(employeesTable.organizationId, organizationId)),
      tx.select().from(employeeRolesTable).where(eq(employeeRolesTable.organizationId, organizationId)),
      tx
        .select()
        .from(timeLogsTable)
        .where(
          and(
            eq(timeLogsTable.organizationId, organizationId),
            eq(timeLogsTable.approved, true),
            gte(timeLogsTable.date, periodStart),
            lte(timeLogsTable.date, periodEnd),
          ),
        ),
      tx
        .select()
        .from(bookingsTable)
        .where(
          and(
            eq(bookingsTable.organizationId, organizationId),
            eq(bookingsTable.status, "completed"),
            gte(bookingsTable.date, periodStart),
            lte(bookingsTable.date, periodEnd),
          ),
        ),
      pendingTimeOffCount(organizationId),
    ]);

    const bookingIds = periodBookings.map((b) => b.id);
    const [packageRows, splitRows] = bookingIds.length
      ? await Promise.all([
          tx
            .select({ bookingId: bookingPackagesTable.bookingId, price: packagesTable.price })
            .from(bookingPackagesTable)
            .innerJoin(packagesTable, eq(bookingPackagesTable.packageId, packagesTable.id))
            .where(
              and(eq(bookingPackagesTable.organizationId, organizationId), inArray(bookingPackagesTable.bookingId, bookingIds)),
            ),
          tx
            .select({
              bookingId: employeeSplitsTable.bookingId,
              employeeId: employeeSplitsTable.employeeId,
              percentage: employeeSplitsTable.percentage,
            })
            .from(employeeSplitsTable)
            .where(
              and(eq(employeeSplitsTable.organizationId, organizationId), inArray(employeeSplitsTable.bookingId, bookingIds)),
            ),
        ])
      : [[], []];

    const bookingTotalById = new Map<number, number>();
    for (const row of packageRows as { bookingId: number; price: string }[]) {
      bookingTotalById.set(row.bookingId, (bookingTotalById.get(row.bookingId) ?? 0) + Number(row.price));
    }

    const rolesByEmployee = new Map<number, EmployeeRole[]>();
    for (const role of roles) {
      const list = rolesByEmployee.get(role.employeeId) ?? [];
      list.push(role);
      rolesByEmployee.set(role.employeeId, list);
    }

    const splitsByEmployee = new Map<number, { bookingId: number; percentage: string }[]>();
    for (const split of splitRows as { bookingId: number; employeeId: number; percentage: string }[]) {
      const list = splitsByEmployee.get(split.employeeId) ?? [];
      list.push({ bookingId: split.bookingId, percentage: split.percentage });
      splitsByEmployee.set(split.employeeId, list);
    }

    const lines: PayrollLineItem[] = employees.map((emp: Employee) => {
      const empRoles = rolesByEmployee.get(emp.id) ?? [];

      // Hourly pay: approved hours in period, per hourly role, at that role's rate.
      let hours = 0;
      let hourlyPay = 0;
      for (const role of empRoles.filter((r) => r.payType === "hourly")) {
        const roleLogs = approvedLogs.filter((l) => l.employeeId === emp.id && l.roleName === role.roleName);
        const roleHours = roleLogs.reduce((sum, l) => sum + Number(l.hours), 0);
        hours += roleHours;
        hourlyPay += roleHours * Number(role.hourlyRate ?? 0);
      }

      // Commission pay: completed-booking revenue via employee_splits in period, per
      // commission role, at that role's rate (see this function's doc comment for the
      // carried-over multi-commission-role edge case).
      let commissionRevenue = 0;
      let commissionPay = 0;
      const empSplits = splitsByEmployee.get(emp.id) ?? [];
      for (const role of empRoles.filter((r) => r.payType === "commission")) {
        const rate = Number(role.commissionRate ?? 0) / 100;
        for (const split of empSplits) {
          const bookingTotal = bookingTotalById.get(split.bookingId) ?? 0;
          const empRevenue = (bookingTotal * Number(split.percentage)) / 100;
          commissionRevenue += empRevenue;
          commissionPay += empRevenue * rate;
        }
      }

      const tips = 0; // No tips data source anywhere in this schema yet — pass-through, matches the mock.
      const grossPay = hourlyPay + commissionPay + tips;
      const netPay = emp.workerType === "1099_contractor"
        ? grossPay
        : estimateWithholding(grossPay, new Date(`${periodStart}T00:00:00Z`), new Date(`${periodEnd}T00:00:00Z`));

      const defaultBankAccount = emp.bankAccounts.find((b) => b.is_default) ?? emp.bankAccounts[0];

      const line: PayrollLineItem = {
        employee_id: emp.id,
        hours,
        hourly_pay: hourlyPay,
        commission_revenue: commissionRevenue,
        commission_pay: commissionPay,
        tips,
        gross_pay: grossPay,
        net_pay: netPay,
        payment_method: emp.paymentMethod,
        bank_account_id: emp.paymentMethod === "direct_deposit" ? (defaultBankAccount?.id ?? null) : null,
      };
      return line;
    });

    const grossTotal = lines.reduce((sum, l) => sum + l.gross_pay, 0);
    const netTotal = lines.reduce((sum, l) => sum + l.net_pay, 0);

    return { periodStart, periodEnd, lines, grossTotal, netTotal, pendingTimeOffCount: pendingTimeOff };
  });
}

// ─── Payroll runs ────────────────────────────────────────────────────────────

export class PayrollRunValidationError extends Error {}

export type CreatePayrollRunInput = {
  periodStart: string;
  periodEnd: string;
  durationType: "weekly" | "biweekly" | "monthly" | "custom";
  runByEmployeeId: number;
};

/** Computes the period's line items (via `calculatePayrollSummary`) and stores them on
 * a new `status: "draft"` run — review-before-pay (PRD Section 6). */
export async function createPayrollRun(organizationId: string, input: CreatePayrollRunInput): Promise<PayrollRun> {
  const summary = await calculatePayrollSummary(organizationId, input.periodStart, input.periodEnd);
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(payrollRunsTable)
      .values({
        organizationId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        durationType: input.durationType,
        status: "draft",
        lineItems: summary.lines,
        runBy: input.runByEmployeeId,
      })
      .returning();
    return created!;
  });
}

export async function listPayrollRuns(organizationId: string, opts: { limit?: number } = {}): Promise<PayrollRun[]> {
  return withOrganization(organizationId, async (tx) => {
    const query = tx
      .select()
      .from(payrollRunsTable)
      .where(eq(payrollRunsTable.organizationId, organizationId))
      .orderBy(desc(payrollRunsTable.runAt));
    return opts.limit ? query.limit(opts.limit) : query;
  });
}

export async function getPayrollRunById(organizationId: string, id: number): Promise<PayrollRun | null> {
  return withOrganization(organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.organizationId, organizationId), eq(payrollRunsTable.id, id)));
    return row ?? null;
  });
}

/**
 * `draft` -> `paid` only. This is a bookkeeping status flip, NOT a real payment
 * execution — no direct deposit/check/ACH transfer actually happens here (there's no
 * payroll processor connected anywhere in this codebase, per
 * `docs/prds/PRD_DetailHub_Payroll_Module.md` Section 9). Do not build "money moved"
 * logic against this; it exists so the run stops showing as an editable draft.
 */
export async function markPayrollRunPaid(organizationId: string, id: number): Promise<PayrollRun | null> {
  return withOrganization(organizationId, async (tx) => {
    const [existing] = await tx
      .select()
      .from(payrollRunsTable)
      .where(and(eq(payrollRunsTable.organizationId, organizationId), eq(payrollRunsTable.id, id)));
    if (!existing) return null;
    if (existing.status !== "draft") {
      throw new PayrollRunValidationError(`Only a 'draft' run can be marked paid (this run is '${existing.status}').`);
    }
    const [updated] = await tx
      .update(payrollRunsTable)
      .set({ status: "paid" })
      .where(and(eq(payrollRunsTable.organizationId, organizationId), eq(payrollRunsTable.id, id)))
      .returning();
    return updated ?? null;
  });
}
