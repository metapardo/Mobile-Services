import { pgTable, serial, integer, text, date, numeric, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { packagesTable } from "./packages";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

export const bookingStatusEnum = pgEnum("booking_status", [
  "confirmed",
  "pending",
  "completed",
  "cancelled",
  "no-show",
]);

export const bookingPaymentMethodEnum = pgEnum("booking_payment_method", [
  "cash",
  "zelle",
  "venmo",
  "card",
  "tap",
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
    paymentNote: text("payment_note"),
  },
  (table) => [tenantIsolationPolicy("bookings", table)],
).enableRLS();

export const insertBookingSchema = createInsertSchema(bookingsTable).omit({
  id: true,
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
      .references(() => bookingsTable.id),
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
