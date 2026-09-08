import { pgTable, serial, integer, text, date, numeric, pgEnum, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { packagesTable } from "./packages";
import { organizationTable } from "./auth-organization";
import { userTable } from "./auth-user";
import { tenantIsolationPolicy } from "./rls";

// PRD_DetailHub_Signup_Copy_and_Packages_Hardening.md FR-9: `gasMeterStatus`
// (jsonb) and `weatherSnapshot` (text) were previously defined here (added for
// FR-5 of an earlier PRD) as nullable, never-populated placeholders for a
// geocoding/weather integration that doesn't exist yet. Dropped entirely for this
// pass — this schema (via `drizzle-kit push`, this package's declarative-diff
// migration mechanism, see `../../drizzle.config.ts`/`package.json`) had already
// been pushed against the live Neon DB with those columns present, so removing
// them here and re-running `pnpm run push` emits a real `ALTER TABLE bookings DROP
// COLUMN` — not a no-op. Any data in those columns is acceptable to lose (never
// populated by a real integration). FR-11 says both come back for real later (see
// Fuel_Gauge_PRD.md) — don't re-add speculative columns for that now.
export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "pending",
  "completed",
  "cancelled",
  "no-show",
]);

// PRD_DetailHub_Payment_Methods.md Section 7 "Data Requirements" is the authoritative
// shape for this feature (Checkout backend, Phase A of
// PRD_DetailHub_After_Package_Work.md) — it supersedes the earlier, rougher
// `["cash","zelle","venmo","card","tap"]` enum + `paymentNote` column that
// `PRD_DetailHub_Real_Bookings_Clients_Backend.md` had put here before this PRD was
// reviewed. `card`/`tap` collapse into the single `credit_card` tender type the
// Payment Methods PRD actually defines (tap-to-pay vs. manual card entry is a card
// *reader* detail per that PRD's FR-10/Section 8, not a distinct tender type); no real
// booking rows exist yet with the old values, so this is a clean redefinition, not a
// breaking migration of live data.
export const bookingPaymentMethodEnum = pgEnum("booking_payment_method", [
  "zelle",
  "venmo",
  "cash",
  "credit_card",
]);

// FR-8 / Section 6.2: Zelle/Venmo/Cash refunds are always a manual reversal record
// (no processor API call for any of these three tender types in v1 — see
// `POST /bookings/:id/refund` in `../../artifacts/api-server/src/routes/bookings.ts`).
// `requested` is included for schema completeness / a future state (e.g. "customer
// asked for a refund, not yet actioned") even though nothing in this pass ever sets it
// — the only state transition built here is direct-to-`completed`.
export const bookingRefundStatusEnum = pgEnum("booking_refund_status", [
  "none",
  "requested",
  "completed",
]);

export const bookingsTable = pgTable(
  "bookings",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    clientId: integer("client_id")
      .notNull()
      .references(() => clientsTable.id),
    date: date("date").notNull(),
    startTime: text("start_time").notNull(),
    address: text("address").notNull(),
    depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 }).notNull(),
    parkingCost: numeric("parking_cost", { precision: 10, scale: 2 }).notNull(),
    status: bookingStatusEnum("status").notNull(),
    notes: text("notes"),
    paymentMethod: bookingPaymentMethodEnum("payment_method"),
    // Free-text confirmation note for manual tender types (e.g. last 4 of a Zelle
    // confirmation, "exact change") or the processor transaction id for a card charge
    // once a processor exists (FR-6) — named to match
    // `PRD_DetailHub_Payment_Methods.md` Section 7's `Booking.payment_reference`
    // exactly (renamed from the earlier `paymentNote` column, see the enum comment
    // above for why).
    paymentReference: text("payment_reference"),
    // Set when a payment is actually recorded via `POST /bookings/:id/payment`
    // (FR-2) — null until then, distinct from `createdAt` (when the booking itself
    // was scheduled, which can be well before payment is collected).
    paymentRecordedAt: timestamp("payment_recorded_at"),
    // FR-8: null until a refund is ever recorded against this booking (most bookings
    // never have one) — `none` is a distinct, explicit "no refund" value for a
    // booking that HAS had refund activity looked at, reserved for future use; nothing
    // in this pass sets `none` today, only leaves this column null or sets `completed`.
    refundStatus: bookingRefundStatusEnum("refund_status"),
    refundReference: text("refund_reference"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    // Who created this booking (always the authenticated admin/owner — v1 has no
    // employee-facing accounts, see the org-wide "one admin/owner user" scope). Not
    // cascaded on user delete (no user-deletion flow exists anywhere in this app yet);
    // revisit if/when one does.
    createdBy: text("created_by")
      .notNull()
      .references(() => userTable.id),
  },
  (table) => [
    tenantIsolationPolicy("bookings", table),
    // PRD_DetailHub_Signup_Copy_and_Packages_Hardening.md FR-6: backs `GET
    // /bookings?clientId=` (see `listBookings` in `../bookings.ts`), which always
    // filters by `organizationId` first — this composite (not a standalone `clientId`
    // index) is what keeps that query fast as booking volume grows, since every real
    // query shape scopes by org first.
    index("bookings_organization_id_client_id_idx").on(table.organizationId, table.clientId),
  ],
).enableRLS();

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertBooking = z.infer<typeof insertBookingSchema>;
export type Booking = typeof bookingsTable.$inferSelect;

// mock-data.ts's `Booking.packageIds: number[]` is a many-to-many with no named
// interface of its own — modeled as a join table rather than an array column.
export const bookingPackagesTable = pgTable(
  "booking_packages",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    bookingId: integer("booking_id")
      .notNull()
      .references(() => bookingsTable.id, { onDelete: "cascade" }),
    packageId: integer("package_id")
      .notNull()
      .references(() => packagesTable.id),
  },
  (table) => [tenantIsolationPolicy("booking_packages", table)],
).enableRLS();

export const insertBookingPackageSchema = createInsertSchema(bookingPackagesTable).omit({
  id: true,
});
export type InsertBookingPackage = z.infer<typeof insertBookingPackageSchema>;
export type BookingPackage = typeof bookingPackagesTable.$inferSelect;
