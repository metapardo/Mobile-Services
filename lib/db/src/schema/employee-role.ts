import { pgTable, serial, integer, text, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const payTypeEnum = pgEnum("pay_type", ["hourly", "commission"]);

export const employeeRolesTable = pgTable(
  "employee_roles",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id),
    roleName: text("role_name").notNull(),
    payType: payTypeEnum("pay_type").notNull(),
    hourlyRate: numeric("hourly_rate", { precision: 10, scale: 2 }),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }),
  },
  (table) => [tenantIsolationPolicy("employee_roles", table)],
).enableRLS();

export const insertEmployeeRoleSchema = createInsertSchema(employeeRolesTable).omit({
  id: true,
});
export type InsertEmployeeRole = z.infer<typeof insertEmployeeRoleSchema>;
export type EmployeeRole = typeof employeeRolesTable.$inferSelect;
