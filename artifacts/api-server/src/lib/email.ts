/**
 * Transactional email (Resend) — `PRD_Mobull_Email_Notifications_Resend.md`.
 *
 * Wraps the `resend` SDK (already a listed-but-unused dependency, `package.json`) with
 * one focused function per one of the PRD's five sends, plus a single `sendEmail` core
 * helper they all funnel through. Route handlers (`routes/auth.ts`, `routes/bookings.ts`)
 * own gathering the data these functions need (client/package/creator/org lookups) and
 * call these — this file only knows how to format and send an email, never how to
 * query the DB.
 *
 * `RESEND_API_KEY` gating mirrors this codebase's own established pattern for an
 * optional third-party integration key (`./sentry.ts`'s `SENTRY_DSN` handling
 * server-side, and `detail-hub/src/main.tsx`'s `VITE_SENTRY_DSN`/`VITE_POSTHOG_KEY`
 * client-side): init only if the key is present, log once at module load either way,
 * and never throw when it's absent — every exported send function below silently
 * no-ops (after logging) rather than crashing local dev or any environment without a
 * configured key.
 *
 * NON-NEGOTIABLE (PRD Section 8 / Goals' guardrail metric): an email failure must never
 * cause the signup/booking/cancellation request that triggered it to fail, retry, or
 * roll back. Every exported function here therefore catches everything internally and
 * resolves (never rejects) — callers still attach a `.catch()` at the call site per the
 * PRD's own fire-and-forget wording, but that's defense in depth, not load-bearing.
 */

import { Resend } from "resend";
import { logger } from "./logger";

/** PRD's explicit sender identity for all five emails — a role-based address, not a
 *  personal one (deliverability + "looks like a real product" per the PRD). */
const FROM_ADDRESS = "support@mobull.app";

/** PRD's "Decided" line: the internal signup alert recipient — `.app`, not `.com`. */
const SIGNUP_ALERT_RECIPIENT = "sean@mobull.app";

const apiKey = process.env["RESEND_API_KEY"];

/** `true` once, at module load, for the lifetime of the process — same shape as
 *  `./sentry.ts`'s `sentryEnabled`. */
export const resendEnabled = Boolean(apiKey);

const resendClient = apiKey ? new Resend(apiKey) : null;

if (resendEnabled) {
  logger.info("Resend initialized — transactional emails will be sent for real.");
} else {
  // One-time warning (this module is only evaluated once per process) rather than a
  // per-send log line — `RESEND_API_KEY` doesn't exist in this environment yet
  // (checked: not in `.env`, not in Vercel), so local dev and any environment without
  // it needs to keep working normally, just without actually emailing anyone.
  logger.warn(
    "RESEND_API_KEY is not set — transactional emails (signup alert, booking " +
      "confirmations, cancellations) will be skipped. This is expected in local dev " +
      "or any environment without a configured Resend API key.",
  );
}

/** Minimal HTML-escaping for the handful of user-controlled strings (client name,
 *  address, business/org name, service names) that get interpolated into an email
 *  body — cheap insurance against a stray `<`/`&` in an address or note breaking the
 *  rendered markup. Not a general sanitizer; there's no rich user HTML input anywhere
 *  in this codebase's data model to worry about beyond plain text fields. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Renders `date` (`YYYY-MM-DD`) + `startTime` (`HH:MM`) into a human-readable string
 * for an email body, e.g. "Monday, September 22, 2026 at 2:00 PM".
 *
 * Mirrors the same technique `detail-hub`'s calendar view already uses for these exact
 * two stored fields (`artifacts/detail-hub/src/pages/calendar.tsx`: date-only strings
 * parsed via an explicit local-midnight suffix rather than a bare `new Date(dateStr)`,
 * and `startTime` rendered by building a throwaway `Date` from its hour/minute
 * components and formatting that, e.g. `format(new Date(2000, 0, 1, hour, minute),
 * 'h:mm a')`) — reused here via the `Intl`/`Date` APIs directly (no `date-fns`
 * dependency in `api-server`) rather than reinvented. Building the `Date` from explicit
 * numeric y/m/d/h/m components (not an ISO string) sidesteps `new Date("YYYY-MM-DD")`
 * being parsed as UTC midnight, which can roll over to the wrong calendar day once
 * rendered — this is a formatting concern only, not a timezone conversion: bookings
 * store `date`/`startTime` as plain strings already representing the organization's own
 * local time (PRD_Mobull_Email_Notifications_Resend.md), so there's no actual UTC offset
 * being applied here, just number-to-words rendering of the values as given.
 */
function formatBookingDateTime(date: string, startTime: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  const localDate = new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0);
  const datePart = localDate.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timePart = localDate.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${datePart} at ${timePart}`;
}

function formatCurrency(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function formatServiceList(services: string[]): string {
  return services.length > 0 ? services.map(escapeHtml).join(", ") : "No services listed";
}

function formatTimestamp(date: Date): string {
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
  /** Discriminator for the log line — which of the five sends this is — so a failure
   *  is traceable without parsing the subject/body. */
  emailType:
    | "signup_alert"
    | "booking_confirmation_creator"
    | "booking_confirmation_client"
    | "booking_cancellation_creator"
    | "booking_cancellation_client";
};

/**
 * Core send — every exported function below funnels through this. Never throws: a
 * missing API key, a Resend API error, or an unexpected exception are all caught and
 * logged here, never propagated, per this file's header comment (the PRD's guardrail
 * metric). Every attempt (success or failure, including the no-op "not configured"
 * case) is logged via the existing `logger` — sufficient for v1 traceability per the
 * PRD's own Assumptions section (no dedicated `notification_log` table).
 */
async function sendEmail(params: SendEmailParams): Promise<void> {
  if (!resendClient) {
    // Already logged once at module load — this would otherwise spam identical
    // warnings on every signup/booking/cancellation in an unconfigured environment.
    logger.info(
      { emailType: params.emailType, to: params.to },
      "email send skipped — Resend not configured (RESEND_API_KEY unset)",
    );
    return;
  }
  try {
    const { data, error } = await resendClient.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    });
    if (error) {
      logger.error(
        { emailType: params.emailType, to: params.to, error },
        "email send failed — Resend API returned an error",
      );
      return;
    }
    logger.info(
      { emailType: params.emailType, to: params.to, resendId: data?.id },
      "email sent",
    );
  } catch (err) {
    logger.error(
      { err, emailType: params.emailType, to: params.to },
      "email send failed — unexpected exception calling Resend",
    );
  }
}

/**
 * 1. Signup alert → `sean@mobull.app`, fired after `POST /auth/signup` succeeds
 *    (`routes/auth.ts`). Internal-only; no client-facing content concerns apply.
 */
export async function sendSignupAlertEmail(params: {
  name: string;
  email: string;
  organizationName: string;
  signupAt: Date;
}): Promise<void> {
  const name = escapeHtml(params.name);
  const email = escapeHtml(params.email);
  const organizationName = escapeHtml(params.organizationName);
  const timestamp = formatTimestamp(params.signupAt);

  await sendEmail({
    to: SIGNUP_ALERT_RECIPIENT,
    emailType: "signup_alert",
    subject: `New Mobull signup: ${params.organizationName}`,
    html: `
      <p>A new user just signed up.</p>
      <ul>
        <li><strong>Name:</strong> ${name}</li>
        <li><strong>Email:</strong> ${email}</li>
        <li><strong>Business/organization:</strong> ${organizationName}</li>
        <li><strong>Signed up:</strong> ${timestamp}</li>
      </ul>
    `,
    text:
      `A new user just signed up.\n\n` +
      `Name: ${params.name}\n` +
      `Email: ${params.email}\n` +
      `Business/organization: ${params.organizationName}\n` +
      `Signed up: ${timestamp}\n`,
  });
}

/**
 * 2. Booking confirmation → the booking's creator (`req.userId`'s email — confirmed by
 *    the PRD's "Decided" line as the person who made the request, not any assigned
 *    employee), fired after `POST /bookings` succeeds.
 */
export async function sendBookingConfirmationCreatorEmail(params: {
  to: string;
  clientName: string;
  date: string;
  startTime: string;
  services: string[];
  address: string;
  price: number;
}): Promise<void> {
  const clientName = escapeHtml(params.clientName);
  const address = escapeHtml(params.address);
  const services = formatServiceList(params.services);
  const dateTime = formatBookingDateTime(params.date, params.startTime);
  const price = formatCurrency(params.price);

  await sendEmail({
    to: params.to,
    emailType: "booking_confirmation_creator",
    subject: `Booking confirmed — ${params.clientName}, ${dateTime}`,
    html: `
      <p>A booking has been confirmed.</p>
      <ul>
        <li><strong>Client:</strong> ${clientName}</li>
        <li><strong>When:</strong> ${dateTime}</li>
        <li><strong>Service(s):</strong> ${services}</li>
        <li><strong>Address:</strong> ${address}</li>
        <li><strong>Price:</strong> ${price}</li>
      </ul>
    `,
    text:
      `A booking has been confirmed.\n\n` +
      `Client: ${params.clientName}\n` +
      `When: ${dateTime}\n` +
      `Service(s): ${params.services.length > 0 ? params.services.join(", ") : "No services listed"}\n` +
      `Address: ${params.address}\n` +
      `Price: ${price}\n`,
  });
}

/**
 * 3. Booking confirmation → the client, same trigger as #2. Per the PRD's Assumptions
 *    section, deliberately omits price/deposit — call sites must not pass one in.
 *    Call sites are responsible for the "skip silently when `clients.email` is null"
 *    rule (this function assumes it's only ever called with a real address).
 */
export async function sendBookingConfirmationClientEmail(params: {
  to: string;
  date: string;
  startTime: string;
  services: string[];
  address: string;
  businessName: string;
}): Promise<void> {
  const address = escapeHtml(params.address);
  const businessName = escapeHtml(params.businessName);
  const services = formatServiceList(params.services);
  const dateTime = formatBookingDateTime(params.date, params.startTime);

  await sendEmail({
    to: params.to,
    emailType: "booking_confirmation_client",
    subject: `Your appointment with ${params.businessName} is confirmed`,
    html: `
      <p>Your appointment with ${businessName} is confirmed.</p>
      <ul>
        <li><strong>When:</strong> ${dateTime}</li>
        <li><strong>Service(s):</strong> ${services}</li>
        <li><strong>Address:</strong> ${address}</li>
      </ul>
    `,
    text:
      `Your appointment with ${params.businessName} is confirmed.\n\n` +
      `When: ${dateTime}\n` +
      `Service(s): ${params.services.length > 0 ? params.services.join(", ") : "No services listed"}\n` +
      `Address: ${params.address}\n`,
  });
}

/**
 * 4a/4b (cancellation, creator recipient) — fired on either of the PRD's two distinct
 * triggers: `DELETE /bookings/:id` succeeding, or `PATCH /bookings/:id` succeeding with
 * `status` transitioning *to* `cancelled` from something that wasn't already
 * `cancelled`. Framed as a cancellation, not a re-confirmation — no call to action.
 */
export async function sendBookingCancellationCreatorEmail(params: {
  to: string;
  date: string;
  startTime: string;
  services: string[];
  address: string;
}): Promise<void> {
  const address = escapeHtml(params.address);
  const services = formatServiceList(params.services);
  const dateTime = formatBookingDateTime(params.date, params.startTime);

  await sendEmail({
    to: params.to,
    emailType: "booking_cancellation_creator",
    subject: `Booking cancelled — ${dateTime}`,
    html: `
      <p>This booking has been cancelled.</p>
      <ul>
        <li><strong>Was scheduled for:</strong> ${dateTime}</li>
        <li><strong>Service(s):</strong> ${services}</li>
        <li><strong>Address:</strong> ${address}</li>
      </ul>
    `,
    text:
      `This booking has been cancelled.\n\n` +
      `Was scheduled for: ${dateTime}\n` +
      `Service(s): ${params.services.length > 0 ? params.services.join(", ") : "No services listed"}\n` +
      `Address: ${params.address}\n`,
  });
}

/** 4a/4b (cancellation, client recipient) — same two triggers as the creator version
 *  above; same email-on-file rule as the confirmation email applies at the call site. */
export async function sendBookingCancellationClientEmail(params: {
  to: string;
  date: string;
  startTime: string;
  services: string[];
  address: string;
  businessName: string;
}): Promise<void> {
  const address = escapeHtml(params.address);
  const businessName = escapeHtml(params.businessName);
  const services = formatServiceList(params.services);
  const dateTime = formatBookingDateTime(params.date, params.startTime);

  await sendEmail({
    to: params.to,
    emailType: "booking_cancellation_client",
    subject: `Your appointment with ${params.businessName} has been cancelled`,
    html: `
      <p>Your appointment with ${businessName} has been cancelled.</p>
      <ul>
        <li><strong>Was scheduled for:</strong> ${dateTime}</li>
        <li><strong>Service(s):</strong> ${services}</li>
        <li><strong>Address:</strong> ${address}</li>
      </ul>
    `,
    text:
      `Your appointment with ${params.businessName} has been cancelled.\n\n` +
      `Was scheduled for: ${dateTime}\n` +
      `Service(s): ${params.services.length > 0 ? params.services.join(", ") : "No services listed"}\n` +
      `Address: ${params.address}\n`,
  });
}
