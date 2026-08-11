import { pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Better Auth `organization` plugin table (shape verified via `@better-auth/cli generate`
// against `organization()` enabled — see auth-user.ts for how this was confirmed).
//
// IMPORTANT: `id` is `text`, not a `serial` integer, unlike the rest of this schema.
// Every `organizationId` FK column added to business tables MUST be `text` to match.
export const organizationTable = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    // No .defaultNow() here — matches Better Auth's own generated schema exactly,
    // which sets createdAt from application code rather than a DB default.
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const insertOrganizationSchema = createInsertSchema(organizationTable).omit({
  id: true,
});
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;
export type Organization = typeof organizationTable.$inferSelect;
