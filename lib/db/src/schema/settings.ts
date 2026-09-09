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
    // PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md FR-2/FR-24/§9.4 (Phase 1). Nullable —
    // existing orgs' `homeAddress` was entered as free text with no geocoding, so
    // there's nothing to backfill; FR-24's "HQ without coordinates blocks gauge
    // computation and shows a setup prompt" null-check is a frontend concern next
    // phase, this just needs the columns to exist and be readable. Same
    // precision/scale-7 numeric convention as `bookings.latitude`/`longitude` — see
    // that file's comment for why `numeric` over `doublePrecision`.
    hqLatitude: numeric("hq_latitude", { precision: 10, scale: 7 }),
    hqLongitude: numeric("hq_longitude", { precision: 10, scale: 7 }),
    hqGooglePlaceId: text("hq_google_place_id"),
    gasPrice: numeric("gas_price", { precision: 10, scale: 3 }).notNull(),
    vehicleMpg: numeric("vehicle_mpg", { precision: 6, scale: 2 }).notNull(),
    gasThresholdGreen: numeric("gas_threshold_green", { precision: 5, scale: 2 }).notNull(),
    gasThresholdAmber: numeric("gas_threshold_amber", { precision: 5, scale: 2 }).notNull(),
    commissionRate: numeric("commission_rate", { precision: 5, scale: 2 }).notNull(),
    fuelGaugeHalfMi: numeric("fuel_gauge_half_mi", { precision: 6, scale: 2 }).notNull(),
    fuelGaugeFullMi: numeric("fuel_gauge_full_mi", { precision: 6, scale: 2 }).notNull(),
    fuelGaugeHalfMin: numeric("fuel_gauge_half_min", { precision: 6, scale: 2 }).notNull(),
    fuelGaugeFullMin: numeric("fuel_gauge_full_min", { precision: 6, scale: 2 }).notNull(),
    // PRD_Mobull_Fuel_Gauge_Accuracy_Rework.md §6.1/§6.2/§9.4 (Phase 1). NOT NULL with
    // a real default (unlike the nullable coordinate columns above) — this is a new
    // required input to the cost formula itself (`drive_cost = round_trip_minutes / 60
    // x tech_hourly_cost`), not an optional nicety, so every existing settings row
    // needs a real value the moment this column exists, not a null the app has to keep
    // special-casing. $22.00/hr matches the PRD's own default.
    techHourlyCost: numeric("tech_hourly_cost", { precision: 10, scale: 2 }).notNull().default("22.00"),
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
