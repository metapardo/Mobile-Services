import { and, eq } from "drizzle-orm";
import { timeOffRequestsTable, type TimeOffRequest } from "./schema";
import { withOrganization } from "./tenant";

export type CreateTimeOffRequestInput = {
  employeeId: number;
  startDate: string;
  endDate: string;
  note?: string | null;
};

export async function createTimeOffRequest(
  organizationId: string,
  input: CreateTimeOffRequestInput,
): Promise<TimeOffRequest> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(timeOffRequestsTable)
      .values({
        organizationId,
        employeeId: input.employeeId,
        startDate: input.startDate,
        endDate: input.endDate,
        note: input.note ?? null,
        status: "pending",
      })
      .returning();
    return created!;
  });
}

export async function listTimeOffRequests(
  organizationId: string,
  opts: { status?: "pending" | "approved" | "denied"; employeeId?: number } = {},
): Promise<TimeOffRequest[]> {
  return withOrganization(organizationId, async (tx) => {
    const conditions = [eq(timeOffRequestsTable.organizationId, organizationId)];
    if (opts.status) conditions.push(eq(timeOffRequestsTable.status, opts.status));
    if (opts.employeeId !== undefined) conditions.push(eq(timeOffRequestsTable.employeeId, opts.employeeId));
    return tx
      .select()
      .from(timeOffRequestsTable)
      .where(and(...conditions));
  });
}

/**
 * PRD Section 5 / Open Question #12's decided default: approved time off is just
 * visible/informational for v1 — this deliberately does NOT touch bookings or block
 * new assignments on the Calendar. `reviewedByEmployeeId` is optional (unlike
 * `payrollRunsTable.runBy`, `timeOffRequestsTable.reviewedBy` is nullable — see that
 * table's schema) since there's no reliable mapping yet from the authenticated
 * Better-Auth admin user to an `employees` row (v1 has no employee login; see the
 * flagged design gap in `./payroll.ts`'s header comment) — omit it if the caller has
 * no employee record to attribute the review to.
 */
export async function reviewTimeOffRequest(
  organizationId: string,
  id: number,
  input: { status: "approved" | "denied"; reviewedByEmployeeId?: number | null },
): Promise<TimeOffRequest | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(timeOffRequestsTable)
      .set({
        status: input.status,
        reviewedBy: input.reviewedByEmployeeId ?? null,
        reviewedAt: new Date(),
      })
      .where(and(eq(timeOffRequestsTable.organizationId, organizationId), eq(timeOffRequestsTable.id, id)))
      .returning();
    return updated ?? null;
  });
}

export async function pendingTimeOffCount(organizationId: string): Promise<number> {
  const rows = await listTimeOffRequests(organizationId, { status: "pending" });
  return rows.length;
}
