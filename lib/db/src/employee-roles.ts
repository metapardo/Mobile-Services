import { and, eq } from "drizzle-orm";
import { employeeRolesTable, type InsertEmployeeRole, type EmployeeRole } from "./schema";
import { withOrganization } from "./tenant";

/**
 * Thrown by `validateEmployeeRoleInput`/`createEmployeeRole`/`updateEmployeeRole` for a
 * business-rule violation (as opposed to a genuine unexpected failure) — routes should
 * catch this specifically and respond `400`, not `500`.
 *
 * DESIGN DECISION (flagged, not silently picked — docs/prds/PRD_DetailHub_Payroll_Module.md
 * Section 2.2 says `hourly_rate`/`commission_rate` are set "when `pay_type = hourly`"/
 * "when `pay_type = commission`" respectively but doesn't specify what happens if the
 * *other* one is also provided, or neither): a role's `payType` determines which single
 * rate field is required and non-null; the other must be omitted/null. Revisit if
 * product wants to allow a role to carry both rates (e.g. a guaranteed hourly floor
 * plus a commission kicker) — that would be a real schema change, not just a validation
 * relaxation.
 */
export class EmployeeRoleValidationError extends Error {}

export type EmployeeRoleInput = {
  roleName: string;
  payType: "hourly" | "commission";
  hourlyRate?: string | null;
  commissionRate?: string | null;
};

export function validateEmployeeRoleInput(input: EmployeeRoleInput): void {
  if (input.payType === "hourly") {
    const rate = input.hourlyRate !== undefined && input.hourlyRate !== null ? Number(input.hourlyRate) : null;
    if (rate === null || !Number.isFinite(rate) || rate < 0) {
      throw new EmployeeRoleValidationError("hourlyRate is required (and must be >= 0) when payType is 'hourly'.");
    }
    if (input.commissionRate !== undefined && input.commissionRate !== null) {
      throw new EmployeeRoleValidationError("commissionRate must not be set when payType is 'hourly'.");
    }
  } else {
    const rate = input.commissionRate !== undefined && input.commissionRate !== null ? Number(input.commissionRate) : null;
    if (rate === null || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new EmployeeRoleValidationError(
        "commissionRate is required (and must be between 0 and 100) when payType is 'commission'.",
      );
    }
    if (input.hourlyRate !== undefined && input.hourlyRate !== null) {
      throw new EmployeeRoleValidationError("hourlyRate must not be set when payType is 'commission'.");
    }
  }
}

export type CreateEmployeeRoleInput = Omit<InsertEmployeeRole, "organizationId" | "employeeId">;
export type UpdateEmployeeRoleInput = Partial<Omit<InsertEmployeeRole, "organizationId" | "employeeId">>;

/** An employee can hold more than one role (PRD Section 2.1/3) — e.g. "Front Desk
 * $15/hr" and "Detailer 30% commission" on the same employee. */
export async function listEmployeeRoles(organizationId: string, employeeId: number): Promise<EmployeeRole[]> {
  return withOrganization(organizationId, async (tx) => {
    return tx
      .select()
      .from(employeeRolesTable)
      .where(and(eq(employeeRolesTable.organizationId, organizationId), eq(employeeRolesTable.employeeId, employeeId)));
  });
}

export async function createEmployeeRole(
  organizationId: string,
  employeeId: number,
  input: CreateEmployeeRoleInput,
): Promise<EmployeeRole> {
  validateEmployeeRoleInput(input);
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(employeeRolesTable)
      .values({ ...input, organizationId, employeeId })
      .returning();
    return created!;
  });
}

export async function updateEmployeeRole(
  organizationId: string,
  employeeId: number,
  roleId: number,
  patch: UpdateEmployeeRoleInput,
): Promise<EmployeeRole | null> {
  return withOrganization(organizationId, async (tx) => {
    // Re-read the current row so a partial patch (e.g. only `hourlyRate`) can still be
    // validated against the role's full resulting shape (`payType` included), not just
    // the fields actually present in this call.
    const [existing] = await tx
      .select()
      .from(employeeRolesTable)
      .where(
        and(
          eq(employeeRolesTable.organizationId, organizationId),
          eq(employeeRolesTable.employeeId, employeeId),
          eq(employeeRolesTable.id, roleId),
        ),
      );
    if (!existing) return null;

    const merged: EmployeeRoleInput = {
      roleName: patch.roleName ?? existing.roleName,
      payType: patch.payType ?? existing.payType,
      hourlyRate: patch.hourlyRate !== undefined ? patch.hourlyRate : existing.hourlyRate,
      commissionRate: patch.commissionRate !== undefined ? patch.commissionRate : existing.commissionRate,
    };
    validateEmployeeRoleInput(merged);

    const [updated] = await tx
      .update(employeeRolesTable)
      .set(merged)
      .where(
        and(
          eq(employeeRolesTable.organizationId, organizationId),
          eq(employeeRolesTable.employeeId, employeeId),
          eq(employeeRolesTable.id, roleId),
        ),
      )
      .returning();
    return updated ?? null;
  });
}

/** Hard delete — an employee role has no downstream FK referencing it (time logs/
 * commission splits key off `roleName`/`employeeId`, not `employeeRolesTable.id`), so
 * there's no dangling-reference risk the way there is for employees/clients/packages. */
export async function deleteEmployeeRole(organizationId: string, employeeId: number, roleId: number): Promise<boolean> {
  return withOrganization(organizationId, async (tx) => {
    const deleted = await tx
      .delete(employeeRolesTable)
      .where(
        and(
          eq(employeeRolesTable.organizationId, organizationId),
          eq(employeeRolesTable.employeeId, employeeId),
          eq(employeeRolesTable.id, roleId),
        ),
      )
      .returning({ id: employeeRolesTable.id });
    return deleted.length > 0;
  });
}
