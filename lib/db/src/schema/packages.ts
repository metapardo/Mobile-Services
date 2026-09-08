import { pgTable, serial, text, numeric, integer, boolean, pgEnum, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const packageCategoryEnum = pgEnum("package_category", [
  "Exterior",
  "Interior",
  "Full",
  "Add-on",
]);

export const packagesTable = pgTable(
  "packages",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    category: packageCategoryEnum("category").notNull(),
    description: text("description").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    isAddon: boolean("is_addon").notNull(),
    // Soft-delete flag — see clients.ts's `archived` for the same reasoning
    // (a package referenced by a historical booking must never become a dangling FK).
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [tenantIsolationPolicy("packages", table)],
).enableRLS();

export const insertPackageSchema = createInsertSchema(packagesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPackage = z.infer<typeof insertPackageSchema>;
export type Package = typeof packagesTable.$inferSelect;
