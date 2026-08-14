import { Router, type IRouter } from "express";
import { upsertAccessRequest } from "@workspace/db";
import { RequestAccessBody, RequestAccessResponse } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";
import { notifyAccessRequest } from "../integrations/resend";

const router: IRouter = Router();

/**
 * POST /access-requests — public, unauthenticated "request access" lead capture for
 * the marketing/landing page. Deliberately its own router, not folded into
 * `routes/auth.ts`: this never touches Better Auth at all, it's a plain insert/update
 * against `accessRequestsTable` (see `@workspace/db`'s `upsertAccessRequest`).
 *
 * INSERTION POINT for a future "notify someone a lead came in" step (integrations-
 * engineer's task, not built here): call it right after `upsertAccessRequest(...)`
 * resolves below, inside this same `try`. It must NOT be able to fail/rollback this
 * request — `upsertAccessRequest` has already committed by that point, so a
 * notification failure should be caught locally (its own try/catch, logged, optionally
 * reported to Sentry) and never change this route's response. Deliberately left as an
 * inline call site rather than factored into a separate exported function ahead of
 * time: there's nothing to abstract yet with a single caller, and premature
 * indirection here would just be a guess at a shape that isn't known until that task's
 * actual notification payload is designed.
 *
 * Honeypot spam guard: `honeypot` is a hidden form field real visitors never populate.
 * A non-empty value short-circuits to the same `200 { success: true }` response as a
 * real submission, WITHOUT calling `upsertAccessRequest` — no DB row, no distinguishing
 * status code/body, so an automated submitter gets no signal to adapt to. Chosen over
 * per-IP/per-email rate limiting because this app has no shared state store (no Redis,
 * etc.) and `api-server` runs partly as a Vercel Serverless Function (see
 * `../app.ts`'s header comment) — in-memory rate limiting wouldn't reliably work there
 * anyway, since concurrent/successive requests aren't guaranteed to land on the same
 * warm instance. A honeypot needs no shared state at all and is a reasonable first line
 * of defense for a low-value public form; real rate limiting can be layered on later
 * (e.g. at a CDN/WAF level) without touching this handler.
 */
router.post("/access-requests", async (req, res) => {
  const parsed = RequestAccessBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", message: parsed.error.message });
    return;
  }
  const { email, businessName, honeypot } = parsed.data;

  if (honeypot) {
    logger.info("access-requests: honeypot field populated — discarding silently");
    const data = RequestAccessResponse.parse({ success: true });
    res.status(200).json(data);
    return;
  }

  try {
    const row = await upsertAccessRequest(email, businessName ?? null);

    // Own local try/catch, on top of `notifyAccessRequest`'s own internal one — see
    // that function's doc comment in `../integrations/resend.ts`. Belt-and-suspenders
    // deliberately: `row` has already committed by this point, so nothing below this
    // line may ever affect the `200` response, even if `notifyAccessRequest`'s own
    // error handling somehow regresses later.
    try {
      await notifyAccessRequest(row);
    } catch (err) {
      logger.error({ err }, "access-requests: notifyAccessRequest threw unexpectedly");
      await captureAndFlush(err);
    }

    const data = RequestAccessResponse.parse({ success: true });
    res.status(200).json(data);
  } catch (err) {
    logger.error({ err }, "access-requests: unexpected failure");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
});

export default router;
