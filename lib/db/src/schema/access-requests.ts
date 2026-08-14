import { pgTable, serial, text, timestamp, pgEnum, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Public, unauthenticated "request access" leads — submitted from the marketing/
 * landing page by visitors who don't have a platform invite token yet (see
 * `platform-invite-tokens.ts`). This is a lead-capture table, not a signup gate: a row
 * here doesn't grant access to anything by itself. It's a list an operator works
 * through manually, bumping `status` to `invited` once a real
 * `platform_invite_tokens` row/email has actually been sent out-of-band, or to
 * `declined`.
 *
 * NOT organization-scoped (no `organizationId`, no RLS) — same reasoning as
 * `platform-invite-tokens.ts`: this table is populated before any organization exists,
 * there's nothing to scope it to yet.
 */
export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "pending",
  "invited",
  "declined",
]);

export const accessRequestsTable = pgTable(
  "access_requests",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    businessName: text("business_name"),
    status: accessRequestStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("access_requests_email_idx").on(table.email)],
);

export const insertAccessRequestSchema = createInsertSchema(accessRequestsTable).omit({
  id: true,
  status: true,
  createdAt: true,
});
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
export type AccessRequest = typeof accessRequestsTable.$inferSelect;
