import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";
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
    email: text("email"),
    address: text("address"),
    notes: text("notes"),
    // Soft-delete flag (`PRD_DetailHub_Real_Bookings_Clients_Backend.md` Section 10 /
    // Edge Cases): a client referenced by an existing booking is never hard-deleted, so
    // historical bookings never end up with a dangling `clientId`. `DELETE /clients/:id`
    // sets this rather than removing the row; list endpoints exclude archived rows by
    // default (see `?includeArchived=` in `../clients.ts`).
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("clients", table)],
).enableRLS();

export const insertClientSchema = createInsertSchema(clientsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clientsTable.$inferSelect;
