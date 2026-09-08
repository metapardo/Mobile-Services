import { pgTable, serial, text, boolean, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const workerTypeEnum = pgEnum("worker_type", ["w2_employee", "1099_contractor"]);
export const paymentMethodEnum = pgEnum("payment_method", ["direct_deposit", "check"]);

export type BankAccount = {
  id: string;
  bank_name: string;
  account_last4: string;
  is_default: boolean;
};

export const employeesTable = pgTable(
  "employees",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    color: text("color").notNull(),
    // `PRD_DetailHub_Real_Bookings_Clients_Backend.md` FR-2/FR-9 wants employee
    // creation to stay minimal (name + color, enough to assign a booking and show a
    // name on the calendar) — the full payroll shape (worker type, payment method, bank
    // accounts) belongs to the Payroll Module and is filled in later from that surface.
    // Defaults here (rather than making these columns nullable) keep them meaningful
    // Postgres enums with a real value from day one while still letting
    // `POST /employees` omit them entirely.
    workerType: workerTypeEnum("worker_type").notNull().default("w2_employee"),
    paymentMethod: paymentMethodEnum("payment_method").notNull().default("direct_deposit"),
    bankAccounts: jsonb("bank_accounts").$type<BankAccount[]>().notNull().default([]),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("employees", table)],
).enableRLS();

export const insertEmployeeSchema = createInsertSchema(employeesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employeesTable.$inferSelect;
