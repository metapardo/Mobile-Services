import { and, eq, gt, or, isNull, sql } from "drizzle-orm";
import { db } from "./client";
import { platformInviteTokensTable, type PlatformInviteToken } from "./schema";

/**
 * Atomically claims a platform invite token: marks it used and returns the row, but
 * ONLY if, at the moment of the update, it was still unused, not yet expired, AND (when
 * the token has an `email` set) the signup email matches it case-insensitively. Returns
 * `null` if the token doesn't exist, is already used, is expired, or was issued for a
 * different email than the one being signed up. A token with `email = null` is an
 * open/general-purpose bearer token — anyone with it can use it, no email check applies.
 *
 * The caller intentionally cannot distinguish "no such token" from "token exists but is
 * scoped to a different email" from "token expired/used" — all three collapse to the same
 * `null` (and, at the HTTP layer, the same generic `invalid_invite_token` error). This is
 * deliberate: a distinguishable "wrong email" error would let someone probe whether a
 * given token string is real and who it's scoped to, without needing to guess the right
 * email at all.
 *
 * Race-safety: this is a single `UPDATE ... WHERE token = $1 AND used = false AND
 * expires_at > now() AND (email IS NULL OR lower(email) = lower($2)) RETURNING *` —
 * deliberately not a `SELECT` (check validity) followed by a separate `UPDATE` (mark
 * used). A separate select-then-update is not race-safe: two concurrent requests
 * presenting the same token could both run the `SELECT` and both see `used = false`
 * before either `UPDATE` commits, and both would then proceed to sign up using the same
 * single-use token. The email check is folded into this same conditional `UPDATE` rather
 * than a separate check beforehand, for the same reason — a check-then-update split would
 * reopen exactly the race this function exists to close.
 *
 * The conditional `UPDATE` closes that gap using Postgres's own row-level locking: when
 * two transactions issue `UPDATE ... WHERE used = false` against the same row
 * concurrently, the second one blocks waiting for the first transaction's row lock.
 * Once the first commits (with `used` now `true`), the second's `WHERE used = false`
 * clause is re-evaluated against that newly-committed value before it proceeds — so the
 * second `UPDATE` matches zero rows and `RETURNING` yields nothing. Only one caller,
 * ever, can receive the claimed row back, even under true concurrency, with no explicit
 * application-level locking needed.
 */
export async function claimPlatformInviteToken(
  token: string,
  email: string,
): Promise<PlatformInviteToken | null> {
  const [claimed] = await db
    .update(platformInviteTokensTable)
    .set({ used: true, usedAt: new Date() })
    .where(
      and(
        eq(platformInviteTokensTable.token, token),
        eq(platformInviteTokensTable.used, false),
        gt(platformInviteTokensTable.expiresAt, new Date()),
        or(
          isNull(platformInviteTokensTable.email),
          sql`lower(${platformInviteTokensTable.email}) = lower(${email})`,
        ),
      ),
    )
    .returning();
  return claimed ?? null;
}

/**
 * Releases a previously-claimed token back to unused, for the case where a token was
 * successfully claimed but the signup it gated failed partway through afterward (e.g.
 * user creation succeeded but organization creation failed). Best-effort compensating
 * action, not a rollback of the claim's transaction — see `routes/auth.ts` in
 * api-server for why signup can't be a single real DB transaction across Better Auth's
 * own API calls, and why this table's claim step is therefore released explicitly
 * on failure rather than relying on transactional rollback.
 */
export async function releasePlatformInviteToken(id: number): Promise<void> {
  await db
    .update(platformInviteTokensTable)
    .set({ used: false, usedAt: null })
    .where(eq(platformInviteTokensTable.id, id));
}
