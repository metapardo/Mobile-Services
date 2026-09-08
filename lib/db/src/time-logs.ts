import { and, eq, gte, lte } from "drizzle-orm";
import { timeLogsTable, type TimeLog } from "./schema";
import { withOrganization } from "./tenant";

/**
 * PRD_DetailHub_Payroll_Module.md Open Question #11's decided default: "manual entry
 * with admin approval" for v1 — no clock-in/out, no auto-derivation from bookings.
 * `source`/`linkedBookingId` stay schema-supported (see `../schema/time-log.ts`) but
 * this create path always writes `source: "manual_entry"` / `linkedBookingId: null`
 * regardless of what's passed in; there is deliberately no way to create a
 * `derived_from_booking` row through this API yet.
 */
export type CreateTimeLogInput = {
  employeeId: number;
  roleName: string;
  date: string;
  hours: string;
};

export async function createTimeLog(organizationId: string, input: CreateTimeLogInput): Promise<TimeLog> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(timeLogsTable)
      .values({
        organizationId,
        employeeId: input.employeeId,
        roleName: input.roleName,
        date: input.date,
        hours: input.hours,
        source: "manual_entry",
        linkedBookingId: null,
        approved: false,
      })
      .returning();
    return created!;
  });
}

export async function listTimeLogs(
  organizationId: string,
  opts: { employeeId?: number; start?: string; end?: string } = {},
): Promise<TimeLog[]> {
  return withOrganization(organizationId, async (tx) => {
    const conditions = [eq(timeLogsTable.organizationId, organizationId)];
    if (opts.employeeId !== undefined) conditions.push(eq(timeLogsTable.employeeId, opts.employeeId));
    if (opts.start) conditions.push(gte(timeLogsTable.date, opts.start));
    if (opts.end) conditions.push(lte(timeLogsTable.date, opts.end));
    return tx
      .select()
      .from(timeLogsTable)
      .where(and(...conditions));
  });
}

/** Admin review/lock step ahead of a payroll run (PRD Section 4) — only approved logs
 * feed `hourly_pay` in `calculatePayrollSummary` (`./payroll.ts`). */
export async function approveTimeLog(organizationId: string, id: number): Promise<TimeLog | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(timeLogsTable)
      .set({ approved: true })
      .where(and(eq(timeLogsTable.organizationId, organizationId), eq(timeLogsTable.id, id)))
      .returning();
    return updated ?? null;
  });
}

/** Lets an admin remove a mis-entered manual log before it's approved/paid out.
 * Not called out explicitly by the PRD's time-tracking use case, but cheap hygiene
 * consistent with every other resource in this API having a delete path. */
export async function deleteTimeLog(organizationId: string, id: number): Promise<boolean> {
  return withOrganization(organizationId, async (tx) => {
    const deleted = await tx
      .delete(timeLogsTable)
      .where(and(eq(timeLogsTable.organizationId, organizationId), eq(timeLogsTable.id, id)))
      .returning({ id: timeLogsTable.id });
    return deleted.length > 0;
  });
}
