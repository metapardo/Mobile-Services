import { pgTable, serial, integer, text, date, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const timeOffStatusEnum = pgEnum("time_off_status", ["pending", "approved", "denied"]);

export const timeOffRequestsTable = pgTable(
  "time_off_requests",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: timeOffStatusEnum("status").notNull().default("pending"),
    requestedAt: timestamp("requested_at").notNull().defaultNow(),
    reviewedBy: integer("reviewed_by").references(() => employeesTable.id),
    reviewedAt: timestamp("reviewed_at"),
    note: text("note"),
  },
  (table) => [tenantIsolationPolicy("time_off_requests", table)],
).enableRLS();

export const insertTimeOffRequestSchema = createInsertSchema(timeOffRequestsTable).omit({
  id: true,
});
export type InsertTimeOffRequest = z.infer<typeof insertTimeOffRequestSchema>;
export type TimeOffRequest = typeof timeOffRequestsTable.$inferSelect;
