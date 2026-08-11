import { pgTable, serial, text, numeric, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

// mock-data.ts's `Settings` has no id — it's a single app-wide config object,
// not a per-entity table. Previously flagged as an awkward singleton with no natural
// key; adding multi-tenancy resolves that ambiguity for free: `organizationId` is now
// both the tenant scope AND the natural key. `.unique()` on organizationId enforces
// "at most one settings row per organization" at the DB level, so the app can always
// upsert-by-organizationId instead of needing to know a row's serial `id` up front.
export const settingsTable = pgTable(
  "settings",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .unique()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    homeAddress: text("home_address").notNull(),
    gasPrice: numeric("gas_price", { precision: 10, scale: 3 }).notNull(),
    vehicleMpg: numeric("vehicle_mpg", { precision: 6, scale: 2 }).notNull(),
    gasThresholdGreen: numeric("gas_threshold_green", { precision: 5, scale: 2 }).notNull(),
    gasThresholdAmber: numeric("gas_threshold_amber", { precision: 5, scale: 2 }).notNull(),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
    fuelGaugeHalfMi: numeric("fuel_gauge_half_mi", { precision: 6, scale: 2 }).notNull(),
    fuelGaugeFullMi: numeric("fuel_gauge_full_mi", { precision: 6, scale: 2 }).notNull(),
    fuelGaugeHalfMin: numeric("fuel_gauge_half_min", { precision: 6, scale: 2 }).notNull(),
    fuelGaugeFullMin: numeric("fuel_gauge_full_min", { precision: 6, scale: 2 }).notNull(),
    paymentProcessorConnected: boolean("payment_processor_connected").notNull().default(false),
    cardReaderPaired: boolean("card_reader_paired").notNull().default(false),
  },
  (table) => [tenantIsolationPolicy("settings", table)],
).enableRLS();

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
});
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
