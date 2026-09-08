import { pgTable, text, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Better Auth core table. Shape confirmed against the installed `better-auth@1.6.26`
// package by running `@better-auth/cli generate` against a real `betterAuth({...})`
// config with the `organization` plugin enabled, not hand-typed from memory (per
// standing instructions — the installed package is ground truth here).
//
// Scope: admin/owner login only for v1. This table has no `organizationId` — a user
// can belong to multiple organizations via `member`, and Better Auth manages this
// table directly through its own adapter/sign-in flows, not through a business route.
export const userTable = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  // Not a Better Auth core field — added per
  // PRD_DetailHub_SelfServe_Signup_Trial.md FR-24 (guided tooltip tour, Section 7.6).
  // Nullable: unset means "tour not yet completed/dismissed". Not registered as a
  // Better Auth `additionalFields` entry because nothing in this task wires it through
  // Better Auth's own APIs (signUpEmail/updateUser) — the eventual tour-completion
  // endpoint (a separate Phase C frontend-driven task) can read/write it directly via
  // `@workspace/db`, the same way every other non-Better-Auth-owned column here would.
  onboardingTourCompletedAt: timestamp("onboarding_tour_completed_at"),
});

export const insertUserSchema = createInsertSchema(userTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof userTable.$inferSelect;
