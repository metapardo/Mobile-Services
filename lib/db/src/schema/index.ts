// Export your models here. Add one export per file
//
// Each model/table should ideally be split into different files.
// Each model/table should define a Drizzle table, insert schema, and types:
//
//   import { pgTable, text, serial } from "drizzle-orm/pg-core";
//   import { createInsertSchema } from "drizzle-zod";
//   import { z } from "zod/v4";
//
//   export const postsTable = pgTable("posts", {
//     id: serial("id").primaryKey(),
//     title: text("title").notNull(),
//   });
//
//   export const insertPostSchema = createInsertSchema(postsTable).omit({ id: true });
//   export type InsertPost = z.infer<typeof insertPostSchema>;
//   export type Post = typeof postsTable.$inferSelect;

// Better Auth core tables (admin/owner login only for v1) — shapes verified against the
// installed better-auth package, see auth-user.ts for how.
export * from "./auth-user";
export * from "./auth-session";
export * from "./auth-account";
export * from "./auth-verification";

// Better Auth `organization` plugin tables — the multi-tenancy root. Every
// business-owned table below carries an `organizationId` FK into `organization.id`.
export * from "./auth-organization";
export * from "./auth-member";
export * from "./auth-invitation";

// Platform-level signup gate (NOT Better Auth's `invitation` table above — see the
// header comment in this file for the distinction). No `organizationId`/RLS here by
// design: tokens are consumed before any organization exists.
export * from "./platform-invite-tokens";

// Shared row-level-security helper used by every business-owned table below.
export * from "./rls";

// Payroll module (docs/prds/PRD_DetailHub_Payroll_Module.md Section 2)
export * from "./employees";
export * from "./employee-role";
export * from "./time-log";
export * from "./time-off-request";
export * from "./payroll-run";

// Formalized from artifacts/detail-hub/src/lib/mock-data.ts
export * from "./clients";
export * from "./packages";
export * from "./bookings";
export * from "./employee-split";
export * from "./settings";
