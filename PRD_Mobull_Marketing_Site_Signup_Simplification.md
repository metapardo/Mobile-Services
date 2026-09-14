# Marketing Site — Signup Form Simplification — Scope PRD

**Status:** Draft v0.1 — for handoff to frontend-engineer / backend-engineer
**Date:** September 2026
**Owner:** Bob (Product)
**Source files:** `artifacts/detail-hub/src/pages/signup.tsx`, `artifacts/detail-hub/src/pages/signup.css`, `artifacts/api-server/src/routes/auth.ts`, `lib/api-zod/src/generated/api.ts`, `lib/db/src/settings.ts`, `lib/db/src/schema/auth-organization.ts`
**Related:** `PRD_Mobull_Onboarding_Flow.md` (v2.1) — Goal 2 below is a direct dependency on that PRD's HQ screen and `AuthGate` gate.

---

## 1. Overview

Four changes to the marketing/signup page (`/`), shipped together as one pass since they touch the same form and the same page: drop two signup-form fields (one now redundant with onboarding, one that never did anything customer-facing), make the form's own labels readable, and remove a redundant CTA from the pricing section. Two of the four (§3, §4 below) have real backend implications, not just a deleted UI field.

## 2. Goal 1 — Remove the "Business URL" field (`organizationSlug`)

**Current state:** free-text input (`signup.tsx:923`), auto-filled from Business Name via `slugify()` unless the user edits it, validated lowercase-hyphenated. Confirmed against the codebase: nothing downstream reads this beyond Better Auth's own uniqueness constraint on `organization.slug` (`auth-organization.ts:22`) — not a public URL, not a subdomain, not shown to anyone again.

| # | Requirement |
|---|---|
| FR-1 | Remove the "Business URL" field and label from the signup form UI and from `signupSchema` (client-side zod, `signup.tsx`). |
| FR-2 | Better Auth's `createOrganization` still requires a `slug` — keep generating one automatically from `organizationName` via the existing `slugify()` helper, just server-side now and invisible to the user instead of client-editable. |
| FR-3 | Handle collisions: `createOrganization` already rejects a duplicate slug (`auth.ts`'s existing catch resolves that to a 400 today). With no field left for a user to fix a collision themselves, the signup handler needs to retry once with a short random suffix appended (e.g. `northline-mobile-detail-4f2a`) rather than surfacing a raw 400 to someone who never saw a slug field. |
| FR-4 | `SignupBody` (`lib/api-zod/src/generated/api.ts`) still requires `organizationSlug` in the request payload — this is generated output; find and edit its source spec, not the generated file directly. |

## 3. Goal 2 — Remove the "Business address" field

Ties directly to onboarding now owning HQ collection (`PRD_Mobull_Onboarding_Flow.md` Screen 3, real `AddressAutocomplete`) — same finding flagged in chat, repeated here because it changes how this has to be built, not just what gets deleted:

- `auth.ts` already does a best-effort geocode of this field at signup (commit `025dc64`) — it isn't dead weight today, it's the only thing making Fuel Gauge work out of the box right now. Removing it is safe **only once Onboarding's `AuthGate` gate ships in the same release** (blocks every app screen until `settings.onboardingComplete`) — that's what guarantees nobody reaches an HQ-dependent screen before Onboarding Screen 3 runs.
- `settings.homeAddress` is `NOT NULL` with no DB-level default — signup must still write *something*.

| # | Requirement |
|---|---|
| FR-5 | Remove the "Business address" field and label from the signup form UI and from `signupSchema`. |
| FR-6 | `auth.ts`'s signup handler: drop the `geocodeAddress`/`hqGeocode` block entirely (nothing left to geocode) — call `createDefaultSettings(organization.id, "")` with no `hq`. Onboarding Screen 3's `PATCH /settings` becomes the one real write path for HQ (already spec'd there, FR-12–FR-14). |
| FR-7 | `SignupBody` — same generated-schema note as FR-4: drop `businessAddress` there too, and fix its now-doubly-stale description ("not geocoded at signup time") while touching it. |
| FR-8 | **Ship order matters:** this cannot go out before Onboarding's `AuthGate` gate (that PRD's FR-4–FR-6) is live, or new orgs get an empty HQ with no forcing function to ever fill it in — the exact gap `PRD_Mobull_Onboarding_Flow.md` was written to close. |

## 4. Goal 3 — Increase input field label font size

**Current state:** `.site-shell .field-group label` is `.67rem` (~10.7px), uppercase, letter-spaced mono type (`signup.css:271`) — small relative to the `.88rem` input text it sits above. `.site-shell` is scoped to this page only (confirmed nowhere else in the app uses it), so this change is fully isolated from the in-app design system.

| # | Requirement |
|---|---|
| FR-9 | Increase `.site-shell .field-group label` font-size from `.67rem` to the `.75–.8rem` range — enough to read comfortably without competing with the input text or abandoning the existing uppercase/mono treatment. Exact value is a design call, not fixed here. |

## 5. Goal 4 — Remove the "Get Started" button from "Get Started for Free"

**Current state:** `GetStartedFree()` (`signup.tsx:798`) ends with its own `button-primary` CTA (`button-pricing-start`) that scrolls to the signup form (`#access`) — one of five identical "scroll to form" entry points already on this page.

| # | Requirement |
|---|---|
| FR-10 | Remove the `Get Started` button (and its arrow icon) from `GetStartedFree()`. |
| FR-11 | Keep the "Free for 14 days. No card required." fine print under it — that's a claim, not a CTA, and it's not stated anywhere else on the page. |
| FR-12 | Confirmed no dead end results: nav (`button-nav-request`), mobile nav (`button-mobile-request`), and hero (`button-hero-access`) all still scroll to `#access` — three other paths to the form remain after this one is removed. |

## 6. Not doing (v1)

- Turning `organizationSlug` into a real, customer-facing URL (a bookable public link) — this PRD only removes the field, per our discussion, doesn't repurpose it.
- Any change to `SetupWizard`'s separate storefront-address step (`profile.storefrontAddress`) — a different field, used for receipts, not touched here.
- A DB migration to make `settings.homeAddress` nullable — the empty-string placeholder (FR-6) avoids needing one, contingent on FR-8 actually holding at ship time.

## 7. Assumptions

- Onboarding's `AuthGate` gate ships before or alongside this PRD (§3, FR-8).
- `SignupBody`'s source spec (whatever generates `lib/api-zod/src/generated/api.ts`) is reachable and editable — not confirmed in this pass; flagged for whoever picks up FR-4/FR-7.

## 8. Rollout

- §2 (slug), §4 (label size), §5 (pricing CTA) can ship independently, any time, in any order.
- §3 (address) must ship no earlier than Onboarding's `AuthGate` gate — sequence together or hold.

## 9. Open questions

- FR-9's exact label font size — design call, not decided here.
- Whether `SignupBody`'s generator source is easy to reach/edit (FR-4/FR-7) — unconfirmed.
