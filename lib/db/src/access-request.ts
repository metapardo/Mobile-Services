import { and, eq, sql } from "drizzle-orm";
import { db } from "./client";
import { accessRequestsTable, type AccessRequest } from "./schema";

/**
 * Records a "request access" submission from the public marketing landing page,
 * de-duplicating repeated legitimate interest from the same email address rather than
 * accumulating duplicate rows: if a `pending` request already exists for the email, its
 * `createdAt` is bumped to now instead of inserting a new row. `status` values other
 * than `pending` (`invited`/`declined`) are left alone and NOT matched here — someone
 * who already responds "still interested" after being marked `invited`/`declined`
 * should show up as a fresh row for an operator to notice, not silently vanish into an
 * already-resolved one.
 *
 * Race-safety note — deliberately NOT the same fully-atomic single-statement pattern as
 * `claimPlatformInviteToken` in this same directory (see that function's comment for
 * the full reasoning it uses). That function closes a real security race: two
 * concurrent requests both successfully claiming one single-use invite token. This
 * function's race is much lower-stakes: two genuinely concurrent submissions of the
 * *same* email, in the same instant, could each fail to find an existing pending row
 * and both insert, producing two `pending` rows for one email instead of one — a
 * cosmetic duplicate in an internal lead list an operator works through by hand, not a
 * security or correctness bug (nothing downstream trusts this table to be unique per
 * email). Given that, this still uses a conditional `UPDATE ... RETURNING` first (an
 * atomic "does a pending row already exist, and if so, bump it" check-and-write in one
 * statement — not a separate `SELECT` then `UPDATE`, which would reopen a real TOCTOU
 * race for no benefit), and only falls through to `INSERT` when that update matched
 * zero rows. The narrow remaining window (between the failed UPDATE and the INSERT) is
 * accepted rather than closed with a partial unique index + `ON CONFLICT` upsert, since
 * that added complexity isn't warranted for a lead-capture table with no security
 * properties riding on per-email uniqueness. Revisit with a partial unique index on
 * `lower(email) WHERE status = 'pending'` if duplicate leads ever become an operational
 * annoyance in practice.
 */
export async function upsertAccessRequest(
  email: string,
  businessName: string | null,
): Promise<AccessRequest> {
  const [updated] = await db
    .update(accessRequestsTable)
    .set({ createdAt: new Date() })
    .where(
      and(
        sql`lower(${accessRequestsTable.email}) = lower(${email})`,
        eq(accessRequestsTable.status, "pending"),
      ),
    )
    .returning();
  if (updated) {
    return updated;
  }

  const [inserted] = await db
    .insert(accessRequestsTable)
    .values({ email, businessName })
    .returning();
  return inserted!;
}
