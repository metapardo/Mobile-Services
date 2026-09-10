import { pgTable, serial, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationTable } from "./auth-organization";
import { tenantIsolationPolicy } from "./rls";

/**
 * `PRD_Mobull_Appointment_Optimizer_v1.0.md` FR-21a — "the only hard spend cap
 * available", since Google Maps Platform quotas show `Adjustable: No` and can't be
 * lowered from the Cloud console. Per-organization, per-bucket fixed-window counters:
 * `bucket` (e.g. `"routing"` or `"places"`) is part of the counter's identity, not a
 * label on a single shared counter, because FR-21a limits the routing and places
 * proxies independently.
 *
 * Storage layer only in this pass — see `../rate-limit.ts`'s `checkAndIncrement` for
 * the actual check-and-increment logic. Nothing in `artifacts/api-server` calls it
 * yet; wiring this into `routing.ts`'s/`places.ts`'s request path (as real middleware)
 * is explicitly a later integrations-engineer pass's job, not built here.
 *
 * Org-scoped with RLS like every other business-owned table in this schema (unlike
 * `route_cache`, which is deliberately global — see that table's doc comment for why
 * this one is different): the thing being metered is platform-wide Google spend, but
 * the LIMIT itself is applied per-organization (FR-21a: "per-organization rate
 * limiting"), so a counter row is one organization's own usage record, same as a
 * booking is.
 */
export const rateLimitCounterTable = pgTable(
  "rate_limit_counters",
  {
    id: serial("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    // e.g. "routing" or "places" — see the doc comment above for why this is part of
    // the counter's identity rather than a single shared counter across both.
    bucket: text("bucket").notNull(),
    // Floored to the start of whatever fixed window `checkAndIncrement` was called
    // with (e.g. the top of the current clock hour for a 60-minute window) — a new row
    // starts (count=1) whenever the window rolls over, rather than one ever-growing
    // counter per (organizationId, bucket).
    windowStart: timestamp("window_start").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    tenantIsolationPolicy("rate_limit_counters", table),
    uniqueIndex("rate_limit_counters_org_bucket_window_idx").on(
      table.organizationId,
      table.bucket,
      table.windowStart,
    ),
  ],
).enableRLS();

export const insertRateLimitCounterSchema = createInsertSchema(rateLimitCounterTable).omit({
  id: true,
  createdAt: true,
});
export type InsertRateLimitCounter = z.infer<typeof insertRateLimitCounterSchema>;
export type RateLimitCounter = typeof rateLimitCounterTable.$inferSelect;
