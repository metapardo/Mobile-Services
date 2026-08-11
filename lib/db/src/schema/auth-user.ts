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
});

export const insertUserSchema = createInsertSchema(userTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof userTable.$inferSelect;
