import { pgTable, serial, integer, text, date, numeric, boolean, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const timeLogSourceEnum = pgEnum("time_log_source", ["manual_entry", "derived_from_booking"]);

export const timeLogsTable = pgTable(
  "time_logs",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    employeeId: integer("employee_id")
      .notNull()
      .references(() => employeesTable.id),
    roleName: text("role_name").notNull(),
    date: date("date").notNull(),
    hours: numeric("hours", { precision: 6, scale: 2 }).notNull(),
    source: timeLogSourceEnum("source").notNull(),
    // Booking table doesn't exist in this schema yet (separate mock-data.ts formalization task) —
    // plain integer column for now, not a real FK reference until bookings lands.
    linkedBookingId: integer("linked_booking_id"),
    approved: boolean("approved").notNull().default(false),
  },
  (table) => [tenantIsolationPolicy("time_logs", table)],
).enableRLS();

export const insertTimeLogSchema = createInsertSchema(timeLogsTable).omit({
  id: true,
});
export type InsertTimeLog = z.infer<typeof insertTimeLogSchema>;
export type TimeLog = typeof timeLogsTable.$inferSelect;
