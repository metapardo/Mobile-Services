import type { NextFunction, Request, Response } from "express";
import { APIError } from "better-auth";
import { auth } from "../lib/auth";
import { toFetchHeaders, forwardSetCookies } from "../lib/http-bridge";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

declare module "express-serve-static-core" {
  interface Request {
    /** Set by `requireOrgSession` once the request is confirmed authenticated with an
     *  active organization. Only present past that middleware — routes that use it are
     *  guaranteed to run after it in the same handler chain. */
    organizationId?: string;
    userId?: string;
  }
}

/**
 * Express middleware for the first real protected, org-scoped data routes in this
 * server (previously only `/healthz`, `/auth/*`, and the now-removed
 * `/access-requests` existed — none of those needed this). Mirrors `GET /auth/session`
 * (`../routes/auth.ts`) for the actual session lookup/cookie-refresh-forwarding, but
 * unlike that route (which always responds `200`, "not signed in" being a normal
 * answer), this middleware treats "not signed in" and "signed in with no active
 * organization" as real failures — a protected route has no sensible default behavior
 * for either.
 *
 * On success, sets `req.organizationId`/`req.userId` and calls `next()`. Does not
 * itself set `app.organization_id` via `withOrganization` (`@workspace/db`) — that
 * stays a per-query concern in each route handler, since `withOrganization` wraps a
 * single `db.transaction`, and a route may need zero, one, or several separate
 * transactions.
 *
 * Deliberately does NOT check `organizationBilling.subscriptionStatus` here (no
 * `past_due`/`canceled`/trial-expiry gating). That table doesn't exist in this
 * codebase yet — Stripe/billing infra is explicitly out of scope for
 * `PRD_DetailHub_SelfServe_Signup_Trial.md`'s Phase A (see that PRD's Section 11) and
 * isn't built anywhere else either. Whoever adds `organizationBilling` should extend
 * this middleware (or add a sibling one composed alongside it) rather than duplicate
 * the session-lookup logic here.
 */
export async function requireOrgSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { headers, response } = await auth.api.getSession({
      headers: toFetchHeaders(req.headers),
      returnHeaders: true,
    });

    forwardSetCookies(res, headers);

    if (!response) {
      res.status(401).json({ error: "not_authenticated", message: "Sign in required." });
      return;
    }

    const organizationId = response.session.activeOrganizationId;
    if (!organizationId) {
      res.status(403).json({
        error: "no_active_organization",
        message: "Your session has no active organization.",
      });
      return;
    }

    req.organizationId = organizationId;
    req.userId = response.user.id;
    next();
  } catch (err) {
    if (err instanceof APIError) {
      logger.warn({ err }, "requireOrgSession: Better Auth rejected the session check");
      res.status(typeof err.statusCode === "number" ? err.statusCode : 401).json({
        error: err.body?.code ?? "not_authenticated",
        message: err.body?.message ?? "Sign in required.",
      });
      return;
    }
    logger.error({ err }, "requireOrgSession: unexpected failure checking session");
    await captureAndFlush(err);
    res.status(500).json({ error: "internal_error" });
  }
}
