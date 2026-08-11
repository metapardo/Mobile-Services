import { pgTable, serial, text } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const clientsTable = pgTable(
  "clients",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phone: text("phone").notNull(),
    email: text("email").notNull(),
    address: text("address").notNull(),
    notes: text("notes"),
  },
  (table) => [tenantIsolationPolicy("clients", table)],
).enableRLS();

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
