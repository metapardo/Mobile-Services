import { pgTable, serial, integer, date, timestamp, text, jsonb, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { employeesTable } from "./employees";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const payrollDurationTypeEnum = pgEnum("payroll_duration_type", [
  "weekly",
  "biweekly",
  "monthly",
  "custom",
]);
export const payrollRunStatusEnum = pgEnum("payroll_run_status", [
  "draft",
  "processing",
  "paid",
  "failed",
]);

export type PayrollLineItem = {
  employee_id: number;
  hours: number;
  hourly_pay: number;
  commission_revenue: number;
  commission_pay: number;
  tips: number;
  gross_pay: number;
  net_pay: number;
  payment_method: "direct_deposit" | "check";
  bank_account_id: string | null;
};

export const payrollRunsTable = pgTable(
  "payroll_runs",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    durationType: payrollDurationTypeEnum("duration_type").notNull(),
    status: payrollRunStatusEnum("status").notNull().default("draft"),
    lineItems: jsonb("line_items").$type<PayrollLineItem[]>().notNull().default([]),
    runBy: integer("run_by")
      .notNull()
      .references(() => employeesTable.id),
    runAt: timestamp("run_at").notNull().defaultNow(),
    reportUrl: text("report_url"),
  },
  (table) => [tenantIsolationPolicy("payroll_runs", table)],
).enableRLS();

export const insertPayrollRunSchema = createInsertSchema(payrollRunsTable).omit({
  id: true,
});
export type InsertPayrollRun = z.infer<typeof insertPayrollRunSchema>;
export type PayrollRun = typeof payrollRunsTable.$inferSelect;
