import { and, eq } from "drizzle-orm";
import { employeesTable, type InsertEmployee, type Employee } from "./schema";
import { withOrganization } from "./tenant";

// FR-2/FR-9: `name`/`color` is the only required pair — enough to assign a booking and
// render it on the calendar. `workerType`/`paymentMethod`/`bankAccounts` are Payroll
// Module fields (docs/prds/PRD_DetailHub_Payroll_Module.md Section 2.1/7) that already
// have DB-level defaults (see ../schema/employees.ts) so they can still be omitted at
// creation — but are now settable both at create and via `PATCH /employees/:id`
// (Phase A of PRD_DetailHub_After_Package_Work.md, Workstream 1 item 5), now that a
// real Payroll surface consumes them. `employees.ts` route's `toWire` controls what's
// actually exposed on the wire.
export type CreateEmployeeInput = Pick<InsertEmployee, "name" | "color"> &
  Partial<Pick<InsertEmployee, "email" | "phone" | "active" | "workerType" | "paymentMethod" | "bankAccounts">>;
export type UpdateEmployeeInput = Partial<
  Pick<
    InsertEmployee,
    "name" | "color" | "email" | "phone" | "active" | "workerType" | "paymentMethod" | "bankAccounts"
  >
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
