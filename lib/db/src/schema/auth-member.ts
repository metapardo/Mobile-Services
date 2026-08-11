import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { organizationTable } from "./auth-organization";
import { userTable } from "./auth-user";

// Better Auth `organization` plugin table — links a user to an organization with a role
// (owner/admin/member by default). Shape verified via `@better-auth/cli generate`.
export const memberTable = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizationTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => userTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("member_organization_id_idx").on(table.organizationId),
    index("member_user_id_idx").on(table.userId),
  ],
);

export const insertMemberSchema = createInsertSchema(memberTable).omit({
  id: true,
  createdAt: true,
});
export type InsertMember = z.infer<typeof insertMemberSchema>;
export type Member = typeof memberTable.$inferSelect;
