import type { NextFunction, Request, Response } from "express";
import { checkAndIncrement, RATE_LIMIT_DEFAULTS } from "@workspace/db";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Set by `rateLimitMiddleware` below — whether this request is still under its
     * bucket's fixed-window limit (`PRD_Mobull_Appointment_Optimizer_v1.0.md` FR-21a).
     * Only present past that middleware in the handler chain.
     *
     * Deliberately NOT turned into a response by this middleware itself — PRD §10
     * specifies different behavior per route on limit-exceeded ("Rate limit hit
     * mid-search -> return cached-only results with a notice, not an error" for
     * `POST /routes/matrix` specifically; a plain 429 for `POST /routes/compute` and
     * the `/places/*` routes, which have no cache layer to fall back to). Each route
     * handler reads this flag and decides its own response shape.
     */
    underRateLimit?: boolean;
  }
}

/**
 * Factory for a per-`bucket` rate-limit check (FR-21a). Must run after
 * `requireOrgSession` (needs `req.organizationId`) and before any Google-bound work in
 * the handler. Uses `RATE_LIMIT_DEFAULTS` (`@workspace/db`'s `rate-limit.ts`) for the
 * limit/window numbers — those are explicitly-flagged placeholder guesses pending real
 * production traffic, not Google-quota-derived numbers.
 *
 * A `checkAndIncrement` failure (e.g. a transient DB error) fails OPEN — treated as
 * "under limit" rather than blocking every routing/places request behind a broken rate
 * limiter — but is logged and reported, since a persistently-failing rate limiter is
 * itself a real problem worth knowing about.
 */
export function rateLimitMiddleware(bucket: keyof typeof RATE_LIMIT_DEFAULTS) {
  return async function rateLimitCheck(req: Request, res: Response, next: NextFunction) {
    if (!req.organizationId) {
      // Should be unreachable — this middleware is only ever mounted after
      // `requireOrgSession` on these routes. Fails open rather than 500ing on what
      // would be this middleware's own ordering bug, not the caller's fault.
      logger.error({ bucket }, "rateLimitMiddleware: req.organizationId is unset — check middleware order");
      req.underRateLimit = true;
      next();
      return;
    }

    const { limit, windowMinutes } = RATE_LIMIT_DEFAULTS[bucket];
    try {
      req.underRateLimit = await checkAndIncrement(req.organizationId, bucket, limit, windowMinutes);
    } catch (err) {
      logger.error({ err, bucket }, "rateLimitMiddleware: checkAndIncrement failed — failing open");
      await captureAndFlush(err);
      req.underRateLimit = true;
    }
    next();
  };
}
