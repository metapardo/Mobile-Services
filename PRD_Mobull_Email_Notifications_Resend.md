# PRD: Transactional Email Notifications (Resend)

**Status:** Shipped (pending live-send verification)
**Owner:** Bob
**Last updated:** September 22, 2026
**Reviewers:** —

**Decided:** internal signup alert goes to `sean@mobull.app` (not `.com`). "Confirmation to that user" (use case 2) means the booking's creator, not assigned employees. Sender identity is `support@mobull.app`. Cancellation confirmations (creator + client) are in scope; reschedule confirmations are explicitly deferred (see Not doing).

## Summary

Wire up Resend (already a listed but unused dependency in `api-server`) to send five transactional emails: an internal alert on every new signup, a pair of booking-confirmation emails on creation (creator + client), and a pair of cancellation emails when a booking is deleted or its status is set to cancelled (creator + client). Recommendation: ship all five as fire-and-forget sends that never block or fail the underlying signup/booking/cancellation request, since a Resend outage is not a reason to break any of those flows.

## Problem

- **You (the business owner) have zero visibility into new signups today.** The only way to know someone signed up is to go look. At near-zero volume this is fine; it stops being fine the moment the SEO/growth work already underway starts converting.
- **Mobull users get no record of a booking outside the app itself.** No email trail means no easy way to forward a booking to themselves, no paper trail if a client disputes what was booked.
- **Clients get no confirmation at all.** A client who books (or has a job booked on their behalf) has nothing in their inbox — no reassurance the appointment is real, no reference to check the details against later. This is the one with the clearest trust/perception cost: competitors treat a confirmation email as table stakes.

No usage data behind these — this is a pre-launch gap, not something measured from support tickets. Flagging that explicitly per the "problem before solution" standard, rather than inventing evidence that doesn't exist yet.

## Goals

- Every successful signup produces one internal alert email, reliably.
- Every successful booking produces a confirmation to the creating user, and — when the client has an email on file — to the client.
- Every cancelled booking (hard-deleted, or status set to `cancelled`) produces a cancellation email to the same two recipients, so an inbox never holds a confirmation for a job that no longer exists.
- Non-goals: no notification preference center, no retry queue, no SMS, no marketing/drip sequences, no reschedule emails (deferred — see Not doing). This PRD is transactional email only.

## Success metrics

- **Primary:** ≥99% of signups, bookings, and cancellations that succeed also produce a successful Resend API call (measured from logs — see Assumptions on why a full audit table is optional for v1, not required).
- **Guardrail:** 0% of signups, bookings, or cancellations fail or roll back because of an email-send failure. This is non-negotiable given FR-3 below, not aspirational.
- Secondary, once volume exists: bounce rate on client emails (signal for stale/mistyped client data) and open rate on the client confirmation (rough proxy for whether it's actually landing in inboxes, not spam).

## Recommended solution

Add a small `lib/email.ts` in `api-server` wrapping the Resend SDK, called from three existing route handlers — `POST /auth/signup`, `POST /bookings`, `PATCH /bookings/:id`, and `DELETE /bookings/:id` (all in `routes/*.ts`) — after each already succeeds. No new endpoints, no new client-facing surface.

### Key flows / requirements

- [ ] `RESEND_API_KEY` added as a server-only Vercel env var; never exposed to the frontend.
- [ ] A sending domain verified in Resend (SPF/DKIM) before any of this goes live — sending from an unverified domain gets spam-filtered or blocked outright.
- [ ] All sends are dispatched **after** the triggering write succeeds and the HTTP response is being prepared — never inline before the signup/booking/cancellation is committed. Mirrors `POST /auth/signup`'s existing compensating-cleanup pattern: that cleanup exists for signup-step failures, and an email failure must never enter that path.
- [ ] Signup alert → `sean@mobull.app`, containing new user's name, email, business/org name, signup timestamp.
- [ ] Booking confirmation (to `req.userId`, the booking's creator — confirmed, not assigned employees) → client name, date/time, service(s), address, price.
- [ ] Booking confirmation (to the client) → date/time, service(s), address, business name. **Skipped silently, no error, when `clients.email` is null** — that column is nullable today and the in-app client form doesn't require it.
- [ ] **Cancellation confirmation, both recipients, on two distinct triggers:** (a) `DELETE /bookings/:id` succeeds, or (b) `PATCH /bookings/:id` succeeds with `status` changing *to* `cancelled` from something else. Recipients are `booking.createdBy` (the original creator — `bookings.ts` schema already stores this per row, so this is the same person regardless of who performs the cancellation) and the client, same email-on-file rule as creation. Content makes clear this is a cancellation, not a re-confirmation — the date/time/service/address of what was cancelled, not a call to action.
- [ ] **`DELETE /bookings/:id` is a hard delete** (confirmed in that route's own doc comment) — the row is gone immediately after. The handler must read the full booking (with client + package join) *before* calling `deleteBooking`, and pass that captured data into the email send — there's nothing left to query afterward.
- [ ] The `PATCH` cancellation path only fires on an actual transition into `cancelled` (compare the previous status to the new one) — not on every edit of an already-cancelled booking, and not on unrelated field edits.
- [ ] Every send logged (success or failure) via the existing `logger`/`captureAndFlush` pattern — sufficient for v1 traceability without a dedicated table (see Assumptions).
- [ ] Dates/times in email bodies rendered in the organization's local time — bookings store `date`/`startTime` as plain strings already, so this is a formatting decision, not a timezone-conversion problem.
- [ ] Sends are dispatched **without being awaited** in the request handler (fire, attach a `.catch()` that logs, move on) — not just "after the write succeeds" but genuinely decoupled from the response. Awaiting Resend's round-trip before responding would add its latency to every booking/cancellation click for no user-facing benefit.
- [ ] "From" address is `support@mobull.app` for all five emails — a role-based sender, not a personal address, both for deliverability (personal-address senders get flagged more aggressively) and for looking like a real product rather than a one-off script.

### Alternatives considered (and rejected)

| Option | Why rejected |
|---|---|
| Send inline, synchronously, before responding to the signup/booking request | Couples a third-party API's uptime to whether a customer can create a booking. Rejected outright — see the guardrail metric above. |
| A different provider (SendGrid, Postmark, SES) | Resend is already a declared dependency in `package.json` — someone already made this call. No reason found in the codebase to revisit it. |
| Build a queue/worker for retries now | Real infrastructure for a failure rate that isn't known yet. Revisit if logs show retries would actually help. |

## Not doing (v1)

**Reschedule confirmation emails — explicitly deferred, not forgotten.** `PATCH /bookings/:id` changing date/time/address without touching `status` sends nothing in v1. This is a real gap (a client's original confirmation goes stale the moment their job moves) but is being deliberately sequenced after cancellations rather than bundled in, per your instruction. Recommend this as the very next fast-follow, not a someday item.

Also not doing: SMS notifications, an in-app notification center, per-user notification preferences, marketing/drip sequences, bounce/complaint webhook handling, a dedicated `notification_log` table, multi-employee notification fan-out (only the booking's creator gets emailed, not every assigned tech on `employeeSplit`).

## B2B SaaS considerations

- **Multi-tenancy / permissions impact:** none beyond the existing RLS boundary — booking data pulled for the email is already scoped to `req.organizationId` by the same queries that create the booking.
- **Admin vs. end-user experience:** no distinction — owner, admin, and member all trigger the same booking-confirmation email when they create a booking.
- **Billing / plan-tier implications:** none today (no plan tiers exist yet per the Super Admin Console PRD's own finding). Worth a mental note that "advanced notifications" could be a future paid-tier lever, not a v1 concern.
- **API / integration surface:** none — no new public endpoints, no webhook surface added by this PRD.
- **Migration path for existing customers:** none needed — additive, no existing data shape changes.
- **Security / compliance:** client PII (name, address, service details) now leaves the system via email in plaintext — reasonable for a transactional confirmation, but worth naming explicitly rather than assuming it's a non-issue. No SSO/audit-log/data-residency requirements apply at this company's current stage.

## Risks and open questions

- **Reschedules still send nothing (confirmed scope decision, not an oversight).** A client whose job moves from Tuesday to Thursday via `PATCH` (without a status change to `cancelled`) keeps an inbox holding a confirmation for the wrong time, with no correction. Accepted as v1 scope per your instruction — see Not doing for why this should be the immediate next PRD rather than a someday item.
- **No idempotency guard on any of the five sends.** Nothing stops a duplicate email if a request is retried (network blip, double-click, frontend retry-on-timeout) — existing guards (booking-overlap, past-date) protect against duplicate *bookings*, not duplicate *emails* from a legitimately-reprocessed request. For `DELETE`, this mostly self-resolves (a retried delete 404s the second time, since the row is already gone) — but the `PATCH`-to-cancelled path and the original creation path both need an explicit guard. Cheap to close: key each send on `bookingId + eventType` and skip if already sent.
- **Client email is optional, not guaranteed** (`clients.email` is nullable) — a meaningful fraction of bookings may simply never send a client confirmation. Worth knowing what fraction of your current clients even have an email on file before treating this as "done" for that use case.
- **No business phone/contact field exists anywhere in `settings` today.** The client-facing confirmation has no "questions? call us" line to include, because there's nothing in the schema to pull it from. Either add a contact field to org settings now, or accept v1 ships without a callback number — but don't let that be an accidental omission.
- **Deposit/price disclosure — resolved by what shipped.** The implemented `lib/email.ts` includes `price` only in the creator's confirmation (`sendBookingConfirmationCreatorEmail`) and omits it entirely from the client's (`sendBookingConfirmationClientEmail` takes no price param at all). Treating this as the decided v1 behavior rather than reopening it.
- ~~Resend domain verification may be tied to the wrong domain.~~ **Resolved** — confirmed the original setup was for `rareaer.com`; a new, separate domain verification was added for `mobull.app` specifically. No carryover assumption needed.
- **"The user who booked it" isn't always "the person doing the job."** Confirmed as creator-only for v1 — becomes worth revisiting the moment multi-employee bookings are common.
- **Resend's plan tier caps daily/monthly sends.** Signup alerts will fire on every signup including bot/low-intent traffic from the recent SEO push — check your plan's ceiling isn't a surprise.
- **No bounce/complaint handling in v1** — a client whose address hard-bounces every time will fail silently, indefinitely, with nothing surfacing that to you.

## Assumptions

- A full `notification_log` table is not required for v1 — structured logging is assumed sufficient until support volume proves otherwise. Flagging this as a judgment call, not a settled fact.
- The internal alert recipient is a single hardcoded address for v1, not a configurable list — reasonable at one recipient, revisit if more than one person needs it.
- The client confirmation omits price/deposit details — confirmed as shipped, not just assumed (see Risks).

## Rollout plan

- Single phase — all five emails shipped together in one implementation pass.
- **Status:** code is merged and typechecked; `RESEND_API_KEY` is live in Vercel. Remaining before this is fully verified working: confirm `mobull.app` (not the pre-migration `rareaer.com`) shows as a Verified domain in Resend, then run one real signup and one real booking/cancellation in production and confirm delivery (including checking spam, since a freshly-verified domain has no sending reputation yet).
- Next fast-follow (not blocking): reschedule confirmation emails (see Not doing), plus the copy fix noted below.
- **Copy note:** shipped email bodies are generic/functional and still say "appointment" rather than "job" (a `mobull-copy-brief.md` vocabulary miss), with no sign-off distinguishing the creator vs. client emails. Polished replacement copy was drafted in this project's chat history and can be handed off to swap in — not done yet.
- Check-in: after the first ~2 weeks of real signups/bookings post-SEO-push, look at actual send volume and bounce rate before deciding whether Section "Not doing" items (retry queue, audit table) are still correctly deprioritized.

## Appendix

Relevant code: `artifacts/api-server/src/routes/auth.ts` (`POST /auth/signup`), `artifacts/api-server/src/routes/bookings.ts` (`POST /bookings`, `PATCH /bookings/:id`, `DELETE /bookings/:id` — the last confirmed as a hard delete in its own doc comment), `lib/db/src/schema/bookings.ts` (`createdBy` — the field the cancellation email's creator recipient resolves from), `lib/db/src/schema/clients.ts` (nullable `email`), `lib/db/src/schema/employees.ts` (nullable `email`), `artifacts/api-server/package.json` (`resend@^6.19.0`, currently unused).
