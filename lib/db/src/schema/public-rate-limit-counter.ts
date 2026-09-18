import { pgTable, serial, text, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * `PRD_Mobull_Public_Calculator.md` Section 5, FR-2 — a rate-limit bucket for the
 * new unauthenticated `/public/places/*` and `/public/routes/compute` routes.
 *
 * DELIBERATELY NOT ORGANIZATION-SCOPED — the THIRD exception (alongside
 * `route_cache` and `weather_cache`) to "every table in this schema is org-scoped
 * with RLS": an anonymous marketing-page visitor has no `organizationId` at all, so
 * there is nothing to scope this table to. `ipAddress` (not `organizationId`) is the
 * counter's identity here, same fixed-window shape as `rate_limit_counters` otherwise
 * (see that table's doc comment for the general pattern this mirrors). No RLS policy,
 * no `tenantIsolationPolicy`, no `.enableRLS()` — every row here is platform-level
 * abuse-mitigation bookkeeping, not one tenant's data.
 *
 * `bucket` distinguishes `"public_places"` (autocomplete + details, shared — same
 * convention as the authenticated `"places"` bucket sharing across those two routes)
 * from `"public_routing"` (`/public/routes/compute`), so a visitor hammering address
 * lookups doesn't also burn their routing allowance and vice versa. See
 * `../public-rate-limit.ts`'s `PUBLIC_RATE_LIMIT_DEFAULTS` for the actual numbers and
 * the reasoning for why they're much tighter than the per-organization buckets.
 */
export const publicRateLimitCounterTable = pgTable(
  "public_rate_limit_counters",
  {
    id: serial("id").primaryKey(),
    // IPv4 or IPv6 textual representation (from `req.ip` once Express's `trust
    // proxy` setting is honored behind Vercel's front door — see
    // `../../artifacts/api-server/src/middlewares/public-rate-limit.ts`). Stored as
    // plain `text`, not `inet`, to sidestep any parsing edge case
    // (`::ffff:`-mapped addresses, a missing/malformed header, etc.) rather than
    // risking an insert failure in the one code path that must never itself become
    // a source of 500s.
    ipAddress: text("ip_address").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start").notNull(),
    count: integer("count").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("public_rate_limit_counters_ip_bucket_window_idx").on(
      table.ipAddress,
      table.bucket,
      table.windowStart,
    ),
  ],
  // No `.enableRLS()` call — see the doc comment above.
);

export const insertPublicRateLimitCounterSchema = createInsertSchema(publicRateLimitCounterTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPublicRateLimitCounter = z.infer<typeof insertPublicRateLimitCounterSchema>;
export type PublicRateLimitCounter = typeof publicRateLimitCounterTable.$inferSelect;
