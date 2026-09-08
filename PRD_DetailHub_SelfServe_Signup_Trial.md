# DetailHub Self-Serve Signup, Free Trial & Onboarding — Product Requirements Document

**Status:** Draft v0.1
**Date:** August 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform (Rare Air)

---

## 1. Overview

This PRD replaces the invite-gated signup model entirely with a fully self-serve flow: a visitor on the marketing site (rareair.com) signs up, creates an account and organization, and gets instant access to a working, empty instance of the app — no manual approval, no invite token, no waiting. The account runs as a 14-day free trial. When the trial ends, a blocking interstitial requires a subscription before the app is usable again. New accounts start completely empty (no seed or mock data) and a short guided tooltip tour orients a first-time user around the core actions: booking an appointment, editing one, adding a client, and recording a cash payment.

## 2. This Explicitly Reverses Prior Scope — Read Before Building

Two previously-scoped pieces of work are **superseded and should be removed, not layered under this one:**

- **The platform-level invite gate** (Phase 1B of the Implementation Plan): `platformInvites` table, the `create-invite` CLI script (task #29), and `/signup`'s token validation. Signup is no longer gated by anything.
- **The Access Request Flow** (`PRD_DetailHub_Access_Request_Flow.md`, tasks #34 and #35): the `accessRequests` table, the public request-access endpoint, the owner-notification email, and `/signup`'s branching logic between "valid token" and "show a request form" states. None of this is needed anymore — there's no request to review, because there's no gate to request access past.

**Operational flag, not just a paperwork note:** task #34 was already marked in-progress, and a build prompt for it was already run in a terminal session against the real repo. Before starting this PRD's work, check whether that run actually merged code. If it did, this PRD's backend work needs to include *removing* the `accessRequests` table, its endpoint, and the `/signup` branching logic — not building self-serve signup alongside a dead access-request path. Don't let both systems exist at once.

## 3. Problem Statement

Manual invite-gating made sense when the only users were hand-picked early testers. It doesn't scale past that, and it adds friction directly between a marketing ad click and an actual account — every campaign built so far (the Facebook ads plan) points traffic at a form that, until now, dead-ends most visitors into "request access and wait." That's an unnecessary drop-off for a product that's ready for real self-serve users.

## 4. Goals & Success Metrics

A visitor can go from clicking "Sign up" on the marketing site to an active, usable account in one flow, with no manual step in between. Every new account is a real trial, not a demo — same product, same data isolation, same everything, just time-boxed. No target conversion metric yet; this is infrastructure the funnel depends on, not a growth feature to optimize in v1.

## 5. Non-Goals (v1)

No annual billing option — monthly only, matching the existing Phase 3B billing model. No multiple pricing tiers — one flat plan, consistent with the platform billing decision already made. No admin approval step anywhere in signup. No seeded example data unless explicitly decided otherwise (see Open Questions) — default is a fully empty account.

## 6. Users & Core Story

**User story:** As a mobile service business owner who just saw an ad or found the site, I want to sign up and start using the app immediately with my own real business information, without waiting for anyone's approval, so I can decide if it's worth adopting before I'm asked to pay.

## 7. Functional Requirements

### 7.1 Signup flow

| # | Requirement |
|---|---|
| FR-1 | `/signup` is fully public — no token, no gate, reachable directly from the marketing site's primary CTA. |
| FR-2 | Signup creates a Better Auth account and organization in one motion (unchanged from the existing Phase 1B convention — account creation *is* business creation, not two steps). |
| FR-3 | Signup collects: name, email, password, business name, and **business address** (new required field — see 7.3). |
| FR-4 | On successful signup, an `organizationBilling` row is created with `subscriptionStatus = trialing` and `trialEndsAt = now + 14 days`. **No card is collected at signup** — this is a deliberate change from Phase 3B's original "card collected upfront" assumption. Flag this explicitly to whoever owns that phase; it changes the Stripe integration's shape (Checkout Session moves from signup-time to trial-expiry-time, see 7.2). |
| FR-5 | Immediately after signup, the user lands inside the app (calendar/home view) — no confirmation screen, no waiting state, no email verification gate blocking access (email verification, if built per the Auth Hardening PRD, stays informational-only, unchanged). |

### 7.2 Trial and premium interstitial

| # | Requirement |
|---|---|
| FR-6 | Every account runs as `trialing` for 14 days from `organizationBilling.trialEndsAt`. |
| FR-7 | The existing access-gating check (Phase 3B) — which already blocks the app when `subscriptionStatus` is `past_due` or `canceled` — gets a third trigger condition: `trialing` **and** `trialEndsAt` has passed. Extend the existing check rather than building a second, parallel gating mechanism. |
| FR-8 | When triggered, the interstitial is a full block, not a dismissible banner — the app underneath isn't usable until the user subscribes. No bypass, no "remind me later." |
| FR-9 | Subscribing routes through the same Stripe hosted Checkout Session already scoped in Phase 3B. On `checkout.session.completed`, the existing webhook flips `subscriptionStatus` to `active` — no new webhook logic needed, just the new entry condition from FR-7. |
| FR-10 | If the trial expires while a user is mid-action (e.g., editing a booking), let the in-progress action complete rather than interrupting it abruptly — gate on next navigation or page load, not mid-interaction. |

### 7.3 Business address intake

| # | Requirement |
|---|---|
| FR-11 | Signup requires a business address. This is not a new, separate field — it populates `AdminSettings.home_base_address`, the same field the master PRD's Gas Meter feature already depends on. Don't create a duplicate address field elsewhere in the schema. |
| FR-12 | Address geocoding (for Gas Meter / Appointment Optimizer) can happen asynchronously/best-effort after signup — don't hard-block account creation on a geocoding API call succeeding, since that dependency may not be fully wired yet per the gap analysis. |
| FR-13 | The business address remains editable later from Settings, unchanged from how `home_base_address` was already described in the master PRD. |

### 7.4 Empty state — clients, calendar, packages

| # | Requirement |
|---|---|
| FR-14 | A new organization has zero rows in `clients`, `bookings`, and `packages` — true by default under existing multi-tenant RLS, as long as no seed/mock data is ever inserted for a new org. |
| FR-15 | The calendar view, with zero bookings, shows a dedicated empty state (not a blank grid) with a clear "Add your first appointment" call to action. |
| FR-16 | The clients list, with zero clients, shows a dedicated empty state with an "Add your first client" call to action. |
| FR-17 | Whether the package/service catalog starts fully empty or with a few example starter packages is an open product decision — see Section 12. Don't default to seeding examples without that decision being made deliberately. |

### 7.5 Reporting empty state

| # | Requirement |
|---|---|
| FR-18 | Sales Reporting and the Financial Health Dashboard must handle a zero-booking, zero-payroll period without errors — no NaN values, no division-by-zero in any margin/ratio calculation, no broken chart. |
| FR-19 | Show an explicit empty state ("Nothing to report yet — complete your first booking to see it here") rather than a statement full of zeros that looks broken versus intentional. |
| FR-20 | This needs a guard in the financial statement computation logic itself (Section 7 of the master PRD describes this as computed on demand) — flag to backend-engineer as a real case to handle, not purely a frontend concern. |

### 7.6 Guided tooltip tour

| # | Requirement |
|---|---|
| FR-21 | On first login to a new account (after signup and business address intake), show a sequential, dismissible hover/highlight tour covering, in order: adding an appointment, editing an appointment, adding a client, recording a cash payment at checkout, and reporting (shown even in its empty state, to set expectation for what will appear there later). |
| FR-22 | The tour is skippable at any point and does not block using the app underneath it. |
| FR-23 | The tour is re-launchable later from a help or settings menu — it shouldn't be the only way to learn these flows if someone skips it early. |
| FR-24 | Tour completion/dismissal is stored per user (e.g., `User.onboardingTourCompletedAt`), so it doesn't reappear automatically after the first session. |

## 8. Data Model Changes

**Add:**
- `organizationBilling.trialEndsAt` (already implied by Phase 3B; confirm it's populated at signup per FR-4, not only at Checkout time as originally scoped)
- `User.onboardingTourCompletedAt` (nullable timestamp)

**Formalize:**
- `AdminSettings.home_base_address` as required-at-signup rather than optional-later

**Remove (per Section 2):**
- `platformInvites` table and all `/signup` token-validation logic
- `accessRequests` table, its public endpoint, and the owner-notification email integration built for it

## 9. Dependencies

Needs Phase 1B (Better Auth + Organization plugin) — already built, unaffected by this change. Needs Phase 3B's Stripe subscription infrastructure (`organizationBilling`, Checkout Session, webhook handler, access-gating check) — but with a real, material change to its shape: card collection moves from signup-time to trial-expiry-time. This is not additive; whoever owns Phase 3B needs to re-scope that piece, not assume the original "card upfront" design still holds. Does **not** depend on, and actively removes, the invite gate and access-request flow.

## 10. Edge Cases

| Case | Handling |
|---|---|
| User abandons signup mid-form | No partial account created — standard form validation, nothing persisted until submission succeeds. |
| Trial expires while a booking or payment is mid-flow | Let it complete per FR-10; gate on next load. |
| Business address can't be geocoded at signup time | Store the raw address, retry geocoding asynchronously; don't block account creation (FR-12). |
| Someone signs up multiple times with different emails to repeatedly extend a free trial | Known, accepted risk for v1 — no dedupe/fraud logic in this phase; revisit only if it becomes an observed problem. |
| A new org's first login happens on a device/session where the tour was already dismissed for a different org under the same user | Tour state is per-user (FR-24), not per-org — decide whether that's actually desired or whether it should be per-organization instead; flagged in Open Questions. |

## 11. Phased Rollout

**Phase A:** Remove the invite gate and access-request flow entirely (Section 2). Build self-serve signup with business address intake (7.1, 7.3). Build empty states for clients, calendar, and reporting (7.4, 7.5).

**Phase B — sequence immediately after A, not deferred indefinitely:** Trial-expiry interstitial and the corresponding Stripe/Checkout timing change (7.2). Shipping Phase A alone means public self-serve signup with no eventual monetization gate — acceptable for a short window while B is built, but shouldn't sit unmonetized for long.

**Phase C (can run in parallel with A/B, lower risk):** Guided tooltip tour (7.6).

## 12. Risks & Open Questions

Should the package/service catalog start with a few example starter packages to reduce first-run friction, or stay fully empty and force manual setup — matching how the real interviewed business actually built their own catalog by hand? Not decided; flagged in FR-17. Should the onboarding tour's completion state be tracked per user or per organization — relevant if one person ever manages multiple organizations? Flagged as an edge case above, not resolved. The no-card 14-day trial is a real, accepted abuse surface (repeat signups to extend free access indefinitely) — worth monitoring once real traffic exists, not worth solving preemptively. Confirm with whoever owns Phase 3B that moving card collection from signup-time to trial-expiry-time is an intentional, agreed change and not a silent scope drift introduced by this PRD.
