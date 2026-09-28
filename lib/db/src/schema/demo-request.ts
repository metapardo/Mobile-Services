import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `PRD_Mobull_Demo_Request_Page.md` — durable record of a prospect's demo request,
 * submitted from the public, unauthenticated `/demo` marketing page before that
 * prospect has ever created an account (or an organization at all).
 *
 * Deliberately has NO tenantIsolationPolicy/RLS and no organizationId at insert time,
 * same shape-of-reasoning as `./billing-webhook-event.ts` (the PRD's own named
 * precedent): a demo request predates any organization existing — there is no
 * `app.organization_id` to set via `withOrganization()` (`../tenant.ts`) because the
 * submitter isn't signed in and has no organization to belong to yet. The handler that
 * writes this row (`POST /public/demo-requests`) runs as a plain unauthenticated route,
 * not inside an org-scoped session, so this table is written through the ordinary `db`
 * connection directly rather than the per-request org-scoped connection every
 * business-owned table uses.
 *
 * `submittedAt`/`emailedAt`/`emailError` follow the exact same "the row is written
 * first and is the durable source of truth; the email attempt's outcome is logged onto
 * that same row afterward, never treated as the primary write" pattern
 * `billing_webhook_events` uses for `receivedAt`/`processedAt`/`processingError` — a
 * Resend failure must never lose the underlying lead, only get recorded alongside it.
 */
export const demoRequestsTable = pgTable("demo_requests", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  // Normalized digits-only (e.g. "5165551234"), never the display-formatted
  // "(516) 555-1234" — formatting is the frontend's presentation concern only. Stored
  // as plain `text`, not validated at the DB level, same posture `clients.phone`
  // already takes elsewhere in this schema — the 10-digit-US validation lives in the
  // route handler (`routes/demo-requests.ts`), not a DB constraint.
  phone: text("phone").notNull(),
  businessName: text("business_name"),
  note: text("note"),
  submittedAt: timestamp("submitted_at").notNull().defaultNow(),
  emailedAt: timestamp("emailed_at"),
  emailError: text("email_error"),
});

export const insertDemoRequestSchema = createInsertSchema(demoRequestsTable).omit({
  id: true,
  submittedAt: true,
  emailedAt: true,
  emailError: true,
});
export type InsertDemoRequest = z.infer<typeof insertDemoRequestSchema>;
export type DemoRequest = typeof demoRequestsTable.$inferSelect;
