import { pgTable, serial, text, timestamp, boolean, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Platform-level signup gate. This app is invite-only at the platform level (no open
 * signup) — a brand-new user + organization can only be created by presenting a live,
 * unused, unexpired token from this table.
 *
 * IMPORTANT: this is NOT the same concept as Better Auth's `invitation` table
 * (`auth-invitation.ts`). That table is for an *existing* organization's admin inviting
 * a new member into *that* org (a `member` row gets created against an org that already
 * exists). This table is the prerequisite gate on who is allowed to create a brand-new
 * organization in the first place — there is no `organizationId` here by design, since
 * the whole point is that no organization exists yet when a token is issued/consumed.
 * Named `platform_invite_tokens`, deliberately distinct from `invitation`, so the two
 * don't get confused later.
 *
 * `email` is nullable/optional: a token can be scoped to a specific invitee email (not
 * enforced at insert time — enforcing "the signup email must match" is a call site
 * decision, not a schema constraint) or left open or  as a general-purpose bearer token.
 * Left unconstrained here rather than silently deciding which policy applies — flagged
 * per standing instructions.
 *
 * Consumption is done via `claimPlatformInviteToken` in `../platform-invite.ts`, which
 * performs a single conditional `UPDATE ... WHERE used = false ... RETURNING` rather
 * than a separate validate-then-update, specifically so concurrent requests racing on
 * the same token can't both succeed. See that file for the full reasoning.
 */
export const platformInviteTokensTable = pgTable(
  "platform_invite_tokens",
  {
    id: serial("id").primaryKey(),
    token: text("token").notNull().unique(),
    email: text("email"),
    used: boolean("used").notNull().default(false),
    usedAt: timestamp("used_at"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("platform_invite_tokens_token_idx").on(table.token)],
);

export const insertPlatformInviteTokenSchema = createInsertSchema(platformInviteTokensTable).omit({
  id: true,
  used: true,
  usedAt: true,
  createdAt: true,
});
export type InsertPlatformInviteToken = z.infer<typeof insertPlatformInviteTokenSchema>;
export type PlatformInviteToken = typeof platformInviteTokensTable.$inferSelect;
