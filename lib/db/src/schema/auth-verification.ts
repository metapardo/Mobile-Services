import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Better Auth core table (shape verified via `@better-auth/cli generate`, see auth-user.ts).
// Used for email verification / password reset / OTP-style tokens.
export const verificationTable = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const insertVerificationSchema = createInsertSchema(verificationTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVerification = z.infer<typeof insertVerificationSchema>;
export type Verification = typeof verificationTable.$inferSelect;
