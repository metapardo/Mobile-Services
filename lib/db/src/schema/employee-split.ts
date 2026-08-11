import { pgTable, serial, integer, numeric, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { bookingsTable } from "./bookings";
import { employeesTable } from "./employees";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

// Formalizes mock-data.ts's `EmployeeSplit` ({employeeId, percentage} on Booking).
// `Booking.employeeIds: number[]` was folded in here too — the split's employeeId list
// already implies which employees are assigned to the booking, so a separate raw
// employeeIds array would just be redundant data that could drift out of sync.
export const employeeSplitsTable = pgTable(
  "employee_splits",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id),
    percentage: numeric("percentage", { precision: 5, scale: 2 }).notNull(),
  },
  (table) => [tenantIsolationPolicy("employee_splits", table)],
).enableRLS();

export const insertEmployeeSplitSchema = createInsertSchema(employeeSplitsTable).omit({
  id: true,
});
export type InsertEmployeeSplit = z.infer<typeof insertEmployeeSplitSchema>;
export type EmployeeSplit = typeof employeeSplitsTable.$inferSelect;
