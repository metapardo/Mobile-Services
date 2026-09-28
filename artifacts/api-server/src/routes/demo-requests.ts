import { Router, type IRouter } from "express";
import { db, demoRequestsTable, eq } from "@workspace/db";
import { CreateDemoRequestBody, CreateDemoRequestResponse } from "@workspace/api-zod";
import { publicRateLimitMiddleware } from "../middlewares/public-rate-limit";
import { sendDemoRequestNotificationEmail } from "../lib/email";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

/**
 * `PRD_Mobull_Demo_Request_Page.md` — the public, unauthenticated demo-request
 * lead-capture endpoint for the no-login `/demo` marketing page. Deliberately a
 * separate router/file (same reasoning as `./public-maps.ts`) rather than added to
 * any authenticated router: every route below is intentionally unauthenticated (no
 * `requireOrgSession`), because a demo request predates any organization existing.
 *
 * Rate-limited on `publicRateLimitMiddleware`'s IP-keyed `"demo_requests"` bucket
 * (`@workspace/db`'s `PUBLIC_RATE_LIMIT_DEFAULTS`) — same shared middleware
 * `./public-maps.ts` uses for `/public/places/*`, new bucket.
 */

const router: IRouter = Router();

/** Strips everything but digits — used both for the 10-digit US validation and for
 *  the normalized value actually stored (never the display-formatted string). */
function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

router.post("/public/demo-requests", publicRateLimitMiddleware("demo_requests"), async (req, res) => {
  if (req.underPublicRateLimit === false) {
    res.status(429).json({
      error: "rate_limited",
      message: "Too many demo requests right now. Try again shortly.",
    });
    return;
  }

  const parsedBody = CreateDemoRequestBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "invalid_request", message: parsedBody.error.message });
    return;
  }
  const body = parsedBody.data;

  const phoneDigits = digitsOnly(body.phone);
  if (phoneDigits.length !== 10) {
    // Defense-in-depth only — the frontend's own phone input also enforces exactly
    // 10 digits before allowing submission (PRD). Never trust client-side validation
    // alone.
    res.status(400).json({
      error: "invalid_request",
      message: "Phone number must be exactly 10 digits.",
    });
    return;
  }

  // Honeypot: a filled-in `website` marks this as an automated submission. Respond
  // with the exact same success shape as a genuine submission — skip the DB write
  // and the email entirely — so a bot never learns it was caught (PRD).
  if (body.website && body.website.trim().length > 0) {
    logger.warn("POST /public/demo-requests: rejected by honeypot check");
    const data = CreateDemoRequestResponse.parse({ success: true });
    res.status(200).json(data);
    return;
  }

  let insertedId: number;
  try {
    const [row] = await db
      .insert(demoRequestsTable)
      .values({
        name: body.name,
        email: body.email,
        phone: phoneDigits,
        businessName: body.businessName ?? null,
        note: body.note ?? null,
      })
      .returning({ id: demoRequestsTable.id });
    if (!row) {
      throw new Error("demo_requests insert returned no row");
    }
    insertedId = row.id;
  } catch (err) {
    logger.error({ err }, "POST /public/demo-requests: failed to write demo_requests row");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
    return;
  }

  // Respond immediately — the row (not the email) is the durable record (PRD Goals).
  const data = CreateDemoRequestResponse.parse({ success: true });
  res.status(200).json(data);

  // Fire-and-forget: never awaited, never allowed to affect the response already
  // sent above. `sendDemoRequestNotificationEmail` never throws/rejects (same
  // guardrail as this file's other five email functions) — it reports its outcome
  // via the resolved `SendEmailResult` instead, which is what gets logged onto this
  // same row's `emailedAt`/`emailError` columns afterward. The `.catch()` below is
  // defense-in-depth only, mirroring the PRD's own fire-and-forget wording, in case
  // of a truly unexpected exception outside that contract.
  sendDemoRequestNotificationEmail({
    name: body.name,
    email: body.email,
    phone: phoneDigits,
    businessName: body.businessName ?? null,
    note: body.note ?? null,
  })
    .then(async (result) => {
      try {
        if (result.success) {
          await db
            .update(demoRequestsTable)
            .set({ emailedAt: new Date() })
            .where(eq(demoRequestsTable.id, insertedId));
        } else {
          await db
            .update(demoRequestsTable)
            .set({ emailError: result.error ?? "unknown_error" })
            .where(eq(demoRequestsTable.id, insertedId));
        }
      } catch (err) {
        logger.error(
          { err, insertedId },
          "POST /public/demo-requests: failed to record email outcome onto demo_requests row",
        );
        await captureAndFlush(err);
      }
    })
    .catch(async (err: unknown) => {
      logger.error({ err, insertedId }, "POST /public/demo-requests: notification email unexpectedly rejected");
      try {
        const message = err instanceof Error ? err.message : String(err);
        await db
          .update(demoRequestsTable)
          .set({ emailError: message })
          .where(eq(demoRequestsTable.id, insertedId));
      } catch (updateErr) {
        logger.error(
          { err: updateErr, insertedId },
          "POST /public/demo-requests: failed to record emailError",
        );
        await captureAndFlush(updateErr);
      }
    });
});

export default router;
