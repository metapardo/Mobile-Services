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

// NOTE: this schema previously had a platform-level invite-token gate
// (`platform-invite-tokens.ts`) and a public "request access" lead-capture table
// (`access-requests.ts`) sitting here. Both were removed per
// `PRD_DetailHub_SelfServe_Signup_Trial.md` Section 2 — signup is now fully
// self-serve, there is no gate to hold a token for and no request to capture leads
// for. See that PRD and the corresponding `platform_invite_tokens`/`access_requests`
// table drops for the full removal.

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

// PRD_Mobull_Appointment_Optimizer_v1.0.md §8/§9 prerequisites.
// `route-cache` is the ONE exception to "every table here is org-scoped with RLS" —
// see that file's doc comment before assuming it's missing organizationId by mistake.
export * from "./route-cache";
export * from "./rate-limit-counter";

// PRD_Mobull_Weather_Coverage.md §6 (FR-6 through FR-9). `weather-cache` is the
// SECOND exception (alongside `route-cache` above) to "every table here is
// org-scoped with RLS" — see that file's doc comment before assuming it's missing
// organizationId by mistake.
export * from "./weather-cache";
