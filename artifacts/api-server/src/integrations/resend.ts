import { Resend } from "resend";
import type { AccessRequest } from "@workspace/db";
import { logger } from "../lib/logger";
import { captureAndFlush } from "../lib/sentry";

/**
 * Single narrow use of Resend: a plain-text internal notification email to Bob (an
 * operator, not an end user) whenever a public "request access" lead comes in — see
 * `../routes/access-requests.ts`'s header comment for the exact insertion point this
 * feeds. Deliberately NOT a general-purpose email module: no templating system, no
 * other transactional email types, nothing beyond `notifyAccessRequest` below. If more
 * outbound email needs show up later, this file is the natural place to grow, but
 * nothing here should be assumed reusable yet.
 *
 * Two required env vars, same graceful-skip idiom as `../lib/sentry.ts`'s
 * `sentryEnabled` (`isVercelDeployment && Boolean(dsn)`): if either is missing, sending
 * is disabled entirely rather than throwing at import time or crashing a request.
 *
 *   - `RESEND_API_KEY` — Resend account API key. Not yet set anywhere in this repo as
 *     of this writing (confirmed: no existing reference to it). Needs to be added to
 *     Vercel's env config (Production + Preview, at minimum — same reasoning as
 *     `SENTRY_DSN`/`VITE_SENTRY_DSN`: local dev shouldn't need a real key to boot, see
 *     the no-op path below) before this will ever actually send anything.
 *   - `ACCESS_REQUEST_NOTIFY_EMAIL` — Bob's real email address. Also not set anywhere;
 *     there is no existing config this could be read from, so it has to be supplied by
 *     a human. Using an env var rather than hardcoding an address in source keeps a
 *     real inbox out of committed code and matches this codebase's "secrets/config via
 *     env, not hardcoded" convention (see `CORS_ALLOWED_ORIGINS`, `SENTRY_DSN`, etc.).
 *
 * From-address note: Resend requires sending from a domain verified in that Resend
 * account. `rareaer.com` is this project's real registered production domain
 * (confirmed via `vercel domains ls`, not from repo doc text — a stale comment
 * elsewhere in this repo previously said "rareair.com", a one-letter typo of the real
 * domain; fixed, but flagging here too since a wrong sending domain would silently
 * never verify in Resend), but nothing in this repo indicates it has actually been
 * added and verified as a *sending* domain inside Resend's dashboard specifically —
 * that's a separate, manual, out-of-band step from anything committed here, and this
 * task has no way to confirm it's been done. So the default below falls back to
 * Resend's own sandbox address (`onboarding@resend.dev`), which sends successfully but
 * — per Resend's docs — only actually delivers to the Resend account's own verified
 * owner email regardless of the `to` address, until a real sending domain is verified.
 * An optional `RESEND_FROM_EMAIL` env var overrides this once `rareaer.com` (or a
 * subdomain of it, e.g. `notifications@rareaer.com`) is verified in Resend — at that
 * point set `RESEND_FROM_EMAIL=notifications@rareaer.com` (or similar) and real
 * delivery to `ACCESS_REQUEST_NOTIFY_EMAIL` will start working without a code change.
 */
const apiKey = process.env["RESEND_API_KEY"];
const notifyEmail = process.env["ACCESS_REQUEST_NOTIFY_EMAIL"];
const fromEmail = process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev";

export const accessRequestNotificationsEnabled = Boolean(apiKey) && Boolean(notifyEmail);

if (accessRequestNotificationsEnabled) {
  logger.info("Resend access-request notifications enabled");
} else {
  logger.info(
    { hasApiKey: Boolean(apiKey), hasNotifyEmail: Boolean(notifyEmail) },
    "Resend access-request notifications disabled (RESEND_API_KEY and/or ACCESS_REQUEST_NOTIFY_EMAIL unset) — skipping send",
  );
}

/**
 * Sends Bob a plain-text heads-up about a new access-request lead. `row` is the exact
 * row `upsertAccessRequest` already wrote/returned — used as-is (including its real
 * `createdAt`) rather than re-deriving any field or reaching for `new Date()`, since
 * the row is the source of truth for when the request actually came in.
 *
 * Deliberately swallows every failure itself (bad/missing key, network error, Resend
 * API error response) and never throws: this must never affect
 * `POST /access-requests`'s response, since by the time this is called the DB row has
 * already committed. A failed *send* is still logged and reported to Sentry — unlike a
 * routine "not configured" skip, an actual send failure while configured is
 * unexpected/operationally worth knowing about (Bob silently stops hearing about
 * leads), so it gets the same `logger.error` + `captureAndFlush` treatment this
 * codebase already uses for other unexpected-but-handled failures (see
 * `../routes/access-requests.ts`'s own `catch` block) — just without ever propagating
 * up to the HTTP response.
 */
export async function notifyAccessRequest(row: AccessRequest): Promise<void> {
  if (!accessRequestNotificationsEnabled) {
    logger.info(
      { id: row.id },
      "access-requests: notification skipped (Resend not configured)",
    );
    return;
  }

  try {
    const resend = new Resend(apiKey);
    const businessNameLine = row.businessName ?? "(not provided)";
    const { error } = await resend.emails.send({
      from: fromEmail,
      to: notifyEmail!,
      subject: `New access request: ${row.email}`,
      text: [
        `New access request submitted:`,
        ``,
        `Email: ${row.email}`,
        `Business name: ${businessNameLine}`,
        `Submitted: ${row.createdAt.toISOString()}`,
      ].join("\n"),
    });

    if (error) {
      logger.error(
        { err: error, id: row.id },
        "access-requests: Resend API returned an error sending the notification",
      );
      await captureAndFlush(new Error(`Resend send failed: ${error.message}`));
      return;
    }

    logger.info({ id: row.id }, "access-requests: notification email sent");
  } catch (err) {
    logger.error(
      { err, id: row.id },
      "access-requests: unexpected failure sending notification email",
    );
    await captureAndFlush(err);
  }
}
