import type { NextFunction, Request, Response } from "express";
import { checkAndIncrementPublic, PUBLIC_RATE_LIMIT_DEFAULTS } from "@workspace/db";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

declare module "express-serve-static-core" {
  interface Request {
    /**
     * Set by `publicRateLimitMiddleware` below — the IP-keyed sibling of
     * `rate-limit.ts`'s `req.underRateLimit`, for the new unauthenticated
     * `/public/places/*` / `/public/routes/compute` routes
     * (`PRD_Mobull_Public_Calculator.md` §5, FR-2). Only present past that
     * middleware in the handler chain.
     */
    underPublicRateLimit?: boolean;
  }
}

/**
 * Factory for a per-`bucket`, per-IP rate-limit check — the anonymous-visitor
 * counterpart to `./rate-limit.ts`'s `rateLimitMiddleware`. That existing middleware
 * keys exclusively on `req.organizationId` (set by `requireOrgSession`), which does
 * not exist for a public, unauthenticated request — hence a separate middleware
 * against a separate table (`public_rate_limit_counters`) rather than reusing/
 * stretching the org-keyed one.
 *
 * Relies on `app.set("trust proxy", true)` (`../app.ts`) for `req.ip` to reflect the
 * real client address behind Vercel's proxy rather than an internal hop address.
 * `req.ip` can still legitimately be `undefined` (e.g. a raw socket disconnect mid-
 * request) — falls back to `"unknown"` so a missing IP degrades to "one shared bucket
 * for unattributable requests" rather than a thrown error.
 *
 * Same fail-open posture as `rateLimitMiddleware`: a `checkAndIncrementPublic` error
 * (e.g. a transient DB error) is logged/reported but does not block the request.
 */
export function publicRateLimitMiddleware(bucket: keyof typeof PUBLIC_RATE_LIMIT_DEFAULTS) {
  return async function publicRateLimitCheck(req: Request, res: Response, next: NextFunction) {
    const ipAddress = req.ip ?? "unknown";
    const { limit, windowMinutes } = PUBLIC_RATE_LIMIT_DEFAULTS[bucket];
    try {
      req.underPublicRateLimit = await checkAndIncrementPublic(ipAddress, bucket, limit, windowMinutes);
    } catch (err) {
      logger.error({ err, bucket }, "publicRateLimitMiddleware: checkAndIncrementPublic failed — failing open");
      await captureAndFlush(err);
      req.underPublicRateLimit = true;
    }
    next();
  };
}
