# PRD: Demo Request Page

**Status:** Draft
**Owner:** Bob
**Last updated:** September 24, 2026
**Reviewers:** —

**Context:** this closes Risk #1 from `Mobull_Long_Island_Guerrilla_GTM_Campaign.md` — the guerrilla campaign's "someone will reach out" CTA had nothing to actually land on. This PRD builds that landing spot.

## Summary

A new public, no-login page (`/demo`) with a short form — name, email, phone, business name, optional note — that a prospect submits to request a demo. Recommendation: the submission's source of truth is a new database row, not the email. The email to `support@mobull.app` is a best-effort notification on top of that row, not the only copy of the request — if Resend hiccups, the lead still exists and is recoverable; if it were email-only, a delivery failure would silently lose a real prospect with zero record anywhere.

## Problem

- The guerrilla campaign (and the calculator page's own CTA) both promise "someone will reach out," but there's genuinely nowhere for that request to land today — confirmed by checking the codebase, there's no lead-capture form anywhere, only self-serve `/signup` and a support inbox.
- A prospect who isn't ready to create a full account (the actual `/signup` flow) but wants a human conversation first has no path that isn't "go find an email address yourself."

## Goals

- A visitor can submit a demo request in under 30 seconds, no account required.
- Every submission is durably recorded, even if the notification email fails.
- Whoever's checking `support@mobull.app` gets a real-time heads-up, not just a periodic DB check.
- Non-goals: no CRM integration, no auto-scheduling (Calendly-style), no lead scoring/routing logic. This is a capture form, not a sales pipeline tool.

## Success metrics

- **Primary:** 100% of submitted demo requests are recoverable from the database, independent of whether the notification email succeeded.
- **Guardrail:** a Resend failure never blocks or errors the visitor's submission — same non-negotiable principle as the transactional email work (`PRD_Mobull_Email_Notifications_Resend.md`).
- Secondary, once volume exists: submission-to-first-contact time (how fast someone actually follows up).

## Recommended solution

New route `/demo`, new table `demo_requests` (no RLS — modeled on `billing_webhook_events`, the existing precedent for "a write with no organization context yet"), new public endpoint `POST /public/demo-requests`, and a new email function in the already-existing `lib/email.ts` reusing the established `support@mobull.app` sender identity and fire-and-forget dispatch pattern.

### Key flows / requirements

- [ ] **Fields:** name (required), email (required), phone (required — the whole point is a human follow-up, and a phone-less "reach out" is a weaker promise), business name (optional), a short free-text note (optional — "anything you'd like us to know?").
- [ ] **Phone field is US-only, by design and by validation.** Checked the codebase: no phone formatting/validation utility exists anywhere today — `clients.phone` (used in the booking flow and client-detail page) is stored and displayed as a raw, unvalidated string. This PRD introduces the first real phone-input pattern in the app, so it's worth getting right rather than copying the existing free-text precedent:
  - Input auto-formats as the visitor types, to `(XXX) XXX-XXXX`.
  - Validation requires exactly 10 digits (US, no country code prompt) — reject anything shorter/longer before allowing submission, rather than a loose format check.
  - Store the normalized 10-digit value (digits only) in the `demo_requests` table, not the display-formatted string — formatting is a presentation concern, not a storage one.
  - This is scoped to this form only — not retrofitting `clients.phone` elsewhere in the app, which stays free-text per its existing (unrelated) PRD history.
- [ ] **`demo_requests` table:** id, name, email, phone, business name (nullable), note (nullable), `submittedAt`, `emailedAt` (nullable), `emailError` (nullable) — same shape-of-reasoning as `billing_webhook_events`: the row is written first and is the durable record; the email attempt's outcome is logged onto that same row afterward, not treated as the primary write.
- [ ] **`POST /public/demo-requests`:** unauthenticated (no `requireOrgSession` — there is no organization yet), validates the four fields, writes the row, then fire-and-forget dispatches the notification email (not awaited, `.catch()`-logged) before responding success to the browser.
- [ ] **Basic abuse mitigation:** a honeypot field (hidden input real users never fill, bots often do) is sufficient here — this form doesn't spend money per submission the way the calculator's Google API calls do, so it doesn't need the same CAPTCHA-grade protection, just enough to keep obvious spam out of a real person's inbox.
- [ ] **Rate limiting:** same open architecture gap as the calculator PRD — no IP-based rate limiting exists in this codebase yet (existing limiter keys on `organizationId`, which doesn't apply to an anonymous submitter). If both this and the calculator ship, build the IP-based limiter once and share it, rather than solving it twice.
- [ ] **Notification email:** `sendDemoRequestNotificationEmail` in `lib/email.ts`, to `support@mobull.app`, containing name/email/phone/business/note — same non-blocking, never-throws pattern as the other five email functions already in that file.
- [ ] **Confirmation UX:** on successful submission, the form is replaced in place (not a page redirect) with a confirmation state, animated via `framer-motion` (already a real dependency, already used for reveals on `signup.tsx` — reuse it rather than adding a new animation approach). Copy, as specified:

  > "Thank you, someone from Mobull will reach out to you to setup that demo!"

  Minor optional polish worth considering (not a required change — your literal copy above is what ships if you'd rather keep it as-is): "set up" as two words when used as a verb ("set up that demo") is the conventional form; "setup" is the noun. Flagging since it's a one-character-level nitpick, not overriding your wording.
- [ ] **Shared chrome:** reuses `Header`/`Footer` from `components/marketing-chrome.tsx` — same pattern as `/calculator` and `/signup` — for visual consistency across the three public pages.
- [ ] **Top nav placement:** add a "Request a Demo" (or similar — see Open Questions) entry to `marketing-chrome.tsx`'s `navItems` array, `{ label: '...', href: '/demo', type: 'route' }` — same real-navigation entry type already established for "Drive Cost Calculator," not an in-page anchor scroll.
- [ ] **Linked from:** the calculator page's existing bottom CTA section, and available as the actual target for every "reach out" mention in the guerrilla campaign's copy (comments, DMs, flyer QR code) once this ships.
- [ ] **Mixpanel: `demo_request_submitted`** — fires client-side on a successful `POST /public/demo-requests` response, same convention as `signup_completed`/`appointment_created`/`client_added`/`package_created` from the earlier Mixpanel instrumentation work (snake_case, past-tense, no manual timestamp — Mixpanel stamps ingestion time automatically). Properties:
  - `has_business_name` (boolean) — whether the optional business-name field was filled in.
  - `has_note` (boolean) — whether the optional free-text note was filled in.
  - `source` (string) — where the visitor arrived from, e.g. `"calculator_cta"` vs. `"nav"` vs. `"direct"` — mirrors the same forward-looking pattern used on `client_added`'s `source` property, so this event stays useful once there's more than one entry point into the form.

### Alternatives considered (and rejected)

| Option | Why rejected |
|---|---|
| Email-only, no database table | A single point of failure for something that represents real sales pipeline — a lost lead due to a transient Resend error is a worse outcome than one extra table. |
| Redirect to a "thank you" page on success | An in-place animated confirmation keeps the visitor on the same page and reads as more polished/"elegant" per the ask, and avoids an extra route for something this small. |
| Full CAPTCHA (hCaptcha/reCAPTCHA) | Overkill for a form with no per-submission cost — a honeypot is proportionate; revisit only if this specific form actually gets spammed. |

## Not doing (v1)

CRM sync, auto-scheduling/calendar booking, lead scoring or routing rules, SMS confirmation to the submitter. This is a capture-and-notify form, not a sales tool.

## B2B SaaS considerations

- **Multi-tenancy:** none applies — a demo request predates any organization existing.
- **API/integration surface:** one new public endpoint, same unauthenticated pattern as the calculator's public routes.
- **Migration path:** none — new table, no existing data affected.
- **Security/compliance:** collects name/email/phone from a public form — standard low-sensitivity lead data, no special handling beyond not exposing the table via any public read endpoint (this is write-only from the public side).

## Risks and open questions

- **No admin view of `demo_requests` exists yet** — checking submissions today means a direct database query unless the email arrives reliably. Fine at low volume; worth a simple list view (even just in the Super Admin Console scoped in an earlier PRD) once volume justifies it.
- **US-only phone validation means an international prospect can't submit this form.** Deliberate per your instruction — if this campaign ever expands beyond a US audience (Long Island is domestic, so fine for now), this validation will need loosening. Not a concern for the current guerrilla campaign's geography.
- **Exact nav label not yet decided.** "Request a Demo" is the placeholder used above; "Book a Demo," "Get a Demo," or "See a Demo" are equally reasonable. Same category of decision as "Drive Cost Calculator" vs. "Mobull Calculator" earlier — pick before implementation so it's not a mid-build guess.

## Assumptions

- `support@mobull.app` remains the correct notification recipient — same address already verified and working from the transactional email PRD.
- One notification email per submission is sufficient for v1 — no digest/batching needed at expected guerrilla-campaign volume.
- Mixpanel is already initialized on this page (per the earlier Mixpanel instrumentation work covering the marketing site broadly) — no new SDK setup needed, just one new `track()` call.

## Rollout plan

- Single phase — table, endpoint, page, and email all ship together.
- Should ship before the guerrilla campaign's Week 3-4 DM follow-up push, since that's the step that actually needs a real "reach out" destination.

## Appendix

Relevant precedent: `lib/db/src/schema/billing-webhook-event.ts` (no-RLS table pattern), `artifacts/api-server/src/lib/email.ts` (fire-and-forget send pattern, `support@mobull.app` sender), `artifacts/detail-hub/src/pages/calculator.tsx` + `components/marketing-chrome.tsx` (shared public-page chrome pattern), `artifacts/detail-hub/src/pages/signup.tsx` (existing `framer-motion` usage).
