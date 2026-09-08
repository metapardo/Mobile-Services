import { and, eq } from "drizzle-orm";
import { employeesTable, type InsertEmployee, type Employee } from "./schema";
import { withOrganization } from "./tenant";

// FR-2/FR-9: minimal on purpose — `name`/`color` is enough to assign a booking and
// render it on the calendar. `workerType`/`paymentMethod`/`bankAccounts` are Payroll
// Module fields that already have DB-level defaults (see ../schema/employees.ts) so
// they can be omitted here; a future Payroll route is the intended place to set them
// for real.
export type CreateEmployeeInput = Pick<InsertEmployee, "name" | "color"> &
  Partial<Pick<InsertEmployee, "email" | "phone" | "active">>;
export type UpdateEmployeeInput = Partial<
  Pick<InsertEmployee, "name" | "color" | "email" | "phone" | "active">
>;

/**
 * Lists an organization's employees. Excludes inactive (soft-deleted) employees by
 * default — pass `includeInactive: true` for views that need full history (e.g.
 * showing who was assigned to an old booking).
 */
export async function listEmployees(
  organizationId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<Employee[]> {
  return withOrganization(organizationId, async (tx) => {
    const conditions = [eq(employeesTable.organizationId, organizationId)];
    if (!opts.includeInactive) {
      conditions.push(eq(employeesTable.active, true));
    }
    return tx
      .select()
      .from(employeesTable)
      .where(and(...conditions));
  });
}

export async function getEmployeeById(organizationId: string, id: number): Promise<Employee | null> {
  return withOrganization(organizationId, async (tx) => {
    const [row] = await tx
      .select()
      .from(employeesTable)
      .where(and(eq(employeesTable.organizationId, organizationId), eq(employeesTable.id, id)));
    return row ?? null;
  });
}

export async function createEmployee(organizationId: string, input: CreateEmployeeInput): Promise<Employee> {
  return withOrganization(organizationId, async (tx) => {
    const [created] = await tx
      .insert(employeesTable)
      .values({ ...input, organizationId })
      .returning();
    return created!;
  });
}

export async function updateEmployee(
  organizationId: string,
  id: number,
  patch: UpdateEmployeeInput,
): Promise<Employee | null> {
  return withOrganization(organizationId, async (tx) => {
    const [updated] = await tx
      .update(employeesTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(employeesTable.organizationId, organizationId), eq(employeesTable.id, id)))
      .returning();
    return updated ?? null;
  });
}

/** Soft-delete: marks the employee inactive rather than removing the row, so any
 * booking/employee-split that already references it keeps a valid `employeeId`. */
export async function archiveEmployee(organizationId: string, id: number): Promise<Employee | null> {
  return updateEmployee(organizationId, id, { active: false });
}
