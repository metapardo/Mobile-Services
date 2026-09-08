# DetailHub Signup Copy, Booking API, and Packages Hardening — Product Requirements Document

**Status:** Draft v0.1
**Date:** August 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform (Rare Air)

---

## 1. Overview

This is a follow-up hardening pass catching four specific gaps left behind by the two PRDs it directly extends — `PRD_DetailHub_SelfServe_Signup_Trial.md` and `PRD_DetailHub_Real_Bookings_Clients_Backend.md`. None of these are new product ideas; they're loose ends found on inspection after that work landed (or while it's landing): stale invite-only copy still sitting on `/signup`, a client-facing performance trap in the bookings API, two schema fields that shouldn't have shipped as speculative placeholders, and a Packages settings screen that needs to actually be verified end-to-end rather than assumed wired.

## 2. How This Amends the Two Prior PRDs — Read Before Building

- **Amends `PRD_DetailHub_Real_Bookings_Clients_Backend.md` FR-5.** That PRD left `weatherSnapshot` and `gasMeterStatus` on the `bookings` schema as nullable, unpopulated placeholder columns "ready for when those integrations land." That decision is reversed here: **descope them entirely for now** (Section 6.3). Add them back properly, with real logic behind them, when the Weather module and Fuel Gauge/Gas Meter features (which already have their own PRD — `Fuel_Gauge_PRD.md`) are actually scoped for implementation.
- **Resolves `PRD_DetailHub_SelfServe_Signup_Trial.md` FR-17**, which left open whether new accounts should get seeded example packages or start fully empty. Decision made here: **fully empty, no seed data** (Section 6.4).
- **Extends `PRD_DetailHub_Real_Bookings_Clients_Backend.md`'s booking routes** with a filter capability that PRD didn't originally specify (Section 6.2).
- **Closes an incomplete piece of that same PRD's Phase A** (the self-serve signup work) — the account-creation form itself was rebuilt, but the page chrome around it wasn't audited for leftover invite-era language (Section 6.1).

**Sequencing note:** check whether tasks #39/#40 (the real bookings/clients backend and its frontend rewire) have already shipped. If they haven't, fold Sections 6.2 and 6.3 directly into that work rather than shipping speculative columns and a missing filter now, only to patch both immediately after. If they have already shipped, this becomes a real follow-up migration and route change.

## 3. Problem Statement

Four distinct gaps, each real on its own:

**Stale copy contradicts the product.** A visitor can now sign up instantly (per the self-serve signup work), but the page around that form still says things like "Request access," describes access as "opening in small waves," and carries at least one leftover reference to an invite-only model near Pricing. A page that contradicts its own form is a real trust problem, not a cosmetic one — it reads as broken or dishonest to a real visitor.

**The bookings API doesn't scale to how the client pages actually use it.** `clients.tsx` and `client-detail.tsx` fetch an organization's *entire* booking list and filter it in the browser to find one client's bookings. That works fine at ten bookings and gets linearly worse forever — this needs to be a server-side filter, not a frontend workaround.

**Two schema fields are half-built.** `weatherSnapshot` and `gasMeterStatus` exist on the bookings schema with no real integration behind either one. Shipping unpopulated placeholder columns invites bugs (something eventually reads `undefined` and renders it) and signals a feature is further along than it is.

**Packages may look done without being done.** A Settings > Packages screen existing in the UI doesn't confirm it's actually reading and writing real data, or that the booking form's package selector is genuinely pulling from the same source. This needs verification, not assumption.

## 4. Goals & Success Metrics

Every visible piece of `/signup` matches the actual self-serve model — no page anywhere describes an invite, a waitlist, or "opening in waves." `GET /bookings` supports server-side filtering by client, and both client-facing pages use it instead of client-side filtering. `bookings` carries no unpopulated placeholder columns. A brand-new organization's Packages settings page is genuinely empty, genuinely wired to the real API, and genuinely reflected in the booking form's package selector — confirmed by tracing the data path, not by visual inspection alone.

## 5. Non-Goals (v1)

Not rebuilding the Weather or Gas Meter features themselves — those stay properly scoped in their own PRDs for later. Not adding new Packages functionality beyond what's already specified in the master PRD's Section 5 — this is a wiring/verification pass, not a feature expansion. Not auditing copy anywhere else on the marketing site beyond `/signup` itself — scope this narrowly and expand later if more stale copy turns up elsewhere.

## 6. Functional Requirements

### 6.1 Signup page copy audit

| # | Requirement |
|---|---|
| FR-1 | Replace the page header's "Request access" label with copy matching the actual self-serve flow (e.g., "Sign up" / "Get started"). |
| FR-2 | Rewrite or remove the FAQ answer describing access as "opening in small waves" — it no longer describes reality. |
| FR-3 | Locate and fix the leftover "invite-only" reference near Pricing. Verify first whether this is a code comment (developer-facing — fix for hygiene, low urgency) or a user-facing text blurb (fix as a real copy defect, same priority as FR-1/FR-2) — don't assume which without checking. |
| FR-4 | Do a full pass of `/signup` (and anything it links to) for any other invite/waitlist/request-access language beyond these three named instances — these three were caught by inspection, not by an exhaustive search. |

### 6.2 Bookings API client filter

| # | Requirement |
|---|---|
| FR-5 | `GET /bookings` accepts an optional `clientId` query parameter, filtering server-side within the already-enforced `organizationId` scope. |
| FR-6 | Add a database index on `bookings (organizationId, clientId)` to keep this filter fast as booking volume grows. |
| FR-7 | `clients.tsx` and `client-detail.tsx` are rewired to pass `clientId` on the request rather than fetching the full organization booking list and filtering client-side. |
| FR-8 | `openapi.yaml` and the generated client packages are updated to reflect the new parameter, per the existing orval pipeline convention. |

### 6.3 Descope weatherSnapshot and gasMeterStatus

| # | Requirement |
|---|---|
| FR-9 | Remove `weatherSnapshot` and `gasMeterStatus` from the `bookings` schema for this pass. If task #39's migration already created them, write a follow-up migration to drop the columns rather than leaving unpopulated dead columns in the live schema. |
| FR-10 | Remove any frontend code already referencing these fields (e.g., a stubbed weather icon or gas-meter badge rendering against an always-`null` value) — don't leave dead UI pointed at a dropped column. |
| FR-11 | When the Weather module or Fuel Gauge feature is actually scoped for real implementation, that work adds these columns back with real logic behind them — reference `Fuel_Gauge_PRD.md` at that point rather than resurrecting these placeholders as-is. |

### 6.4 Packages — real wiring, no mock data, empty state

| # | Requirement |
|---|---|
| FR-12 | Settings > Packages performs real CRUD against the real `packages` table/API (from `PRD_DetailHub_Real_Bookings_Clients_Backend.md`) — verify this concretely: create a package in Settings, confirm it persists in Postgres, confirm it appears in the booking form's package selector. |
| FR-13 | Grep the codebase for any remaining `packages`-related read from `mock-data.ts` and remove it — this is a verification step with a concrete pass/fail, not a visual spot-check. |
| FR-14 | A brand-new organization's Packages settings page shows a genuine empty state ("No packages yet — add your first service") with no seeded or example data, per the resolved open question in Section 2. |
| FR-15 | If the booking form's package selector encounters zero packages (a brand-new account that hasn't set any up yet), it shows a clear prompt to add a package in Settings first, rather than an empty, unexplained dropdown. |

## 7. Data Requirements

| Data | Source | Notes |
|---|---|---|
| Existing `bookings.clientId` column | Already part of the schema per the master PRD's Booking entity | The gap is the missing API filter parameter, not a missing column. |
| `bookings.weatherSnapshot`, `bookings.gasMeterStatus` | To be removed | See FR-9. |
| `packages` table | `PRD_DetailHub_Real_Bookings_Clients_Backend.md` | This PRD verifies and completes the wiring, doesn't redesign the table. |

## 8. Edge Cases

| Case | Handling |
|---|---|
| `clientId` filter is passed for a client that doesn't belong to the requesting organization | Return an empty result, same as any other cross-tenant query — RLS should make this structurally impossible, not just application-logic-prevented. |
| A migration dropping `weatherSnapshot`/`gasMeterStatus` runs against a database that already has real data in those columns | Acceptable data loss for this pass — nothing downstream depends on these values since they were never populated by a real integration. |
| A new organization has zero packages and someone tries to create a booking anyway | FR-15's prompt should block progress cleanly, not allow a booking to save with a null package reference. |
| Old, cached client-side booking-filter logic left in `clients.tsx` after the rewire | Remove it entirely rather than leaving it as unreachable dead code "just in case." |

## 9. Phased Rollout

This is a single pass, not a multi-phase rollout — all four sections are small enough to land together, and several (6.2, 6.3) are cheapest to fold directly into task #39/#40 if those haven't shipped yet (see Section 2's sequencing note). If #39/#40 have already shipped, treat 6.2 and 6.3 as a follow-up migration + route change, and 6.1/6.4 as independent, parallel work.

## 10. Risks & Open Questions

Is the "invite-only" reference near Pricing (FR-3) a code comment or user-facing copy? Needs a direct look before it's clear how urgent the fix is. Should the FAQ entry about "opening in small waves" (FR-2) be rewritten to describe the trial model instead, or removed outright if there's no equivalent question worth answering there? Leaning toward rewrite (a real FAQ about the 14-day trial is probably worth having) but flagged as a copy decision, not an engineering one. Confirm task #39/#40's actual status before starting, since it changes whether this PRD's backend items are a fresh build or a follow-up migration.
