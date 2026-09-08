# After Package Work — Product Requirements Document

**Status:** Draft v0.2 — updated against live source (`Mobile-Services/artifacts/detail-hub`)
**Date:** September 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform (Rare Air / DetailHub)

---

## 1. Overview

This is the next wave after the Packages/bookings/clients backend work lands (tasks #39–#44). It covers three things: the backend data requirements to make the **Team** section real (payroll, time tracking, job counts, recent activity), the backend data requirements to make the **Reports** section real, and finishing the mock-data removal that the Packages work started — extending it to **Checkout**, which hasn't been scoped for real data anywhere else.

## 2. Grounding

v0.1 of this PRD built the Reports section (6.2) from the master PRD's spec, not a live inspection, and flagged that as a gap. That gap is now closed: this version is written directly against the actual frontend source in `Mobile-Services/artifacts/detail-hub/src` — specifically `pages/payroll-overview.tsx`, `pages/payroll-team.tsx`, `pages/reporting.tsx`, `pages/checkout-payment.tsx`, `lib/payroll-data.ts`, `lib/reporting-data.ts`, and `lib/mock-data.ts`. Every requirement below cites the real component and, where relevant, the real field or label. Where the code diverges from what an earlier PRD (Payment Methods) assumed, that's called out explicitly rather than silently reconciled.

## 3. Relationship to Prior PRDs

This builds on, and doesn't duplicate:

- `PRD_DetailHub_Real_Bookings_Clients_Backend.md` — real `bookings`, `clients`, `employees`, `packages` tables and CRUD routes are the foundation everything here queries against.
- `PRD_DetailHub_Payroll_Module.md` — `EmployeeRole`, `TimeLog`, `TimeOffRequest`, `PayrollRun` are already fully specified there; this PRD wires the Team section's UI to that existing data model, it doesn't redesign it. Confirmed: `lib/payroll-data.ts` already implements these exact types in-memory, importing `employees`/`bookings`/`packages` straight from `mock-data.ts` — so payroll's own data model is right, it's just not backed by a database yet.
- `PRD_DetailHub_Payment_Methods.md` — specifies `Booking.payment_method`, `.payment_reference`, `.payment_recorded_at`, `.refund_status`, `.refund_reference`. Confirmed: none of these exist on the current `Booking` interface in `mock-data.ts` (line 36–51) — the real fields today are just `paymentMethod?: PaymentMethodId` and `paymentNote?: string`. This is a bigger gap than "confirm these exist" — they need to be added from scratch.
- `PRD_DetailHub_Signup_Copy_and_Packages_Hardening.md` (task #44) already covers removing mock data from Packages specifically — this PRD references that rather than re-scoping it, and adds Checkout as new, previously-uncovered scope.

## 4. Problem Statement

Team and Reports are two of the most-used sections in the app (per the interview research, payroll prep is the *primary* reason the interviewed owner uses reporting at all) and both are still substantially mock-data-driven. Checkout — where a job actually gets marked paid — is the same. None of these are cosmetic gaps; they're the sections where real money and real payroll decisions get made, and most of it doesn't persist anywhere real today.

## 5. Goals & Success Metrics

An admin can open Team and see real gross/net payroll, real time logs, and real employee pay-rate data for this week, last week, or this month — computed from actual bookings and a real `PayrollRun` table, not `payroll-data.ts`'s in-memory mock. Reports' Monthly/Quarterly/Annual views reflect the same standard: every KPI, chart, and statement backed by a real query against real bookings and payroll, not the fabricated 1,000-transaction dataset in `reporting-data.ts`. Checkout marks a real booking as paid, through a real payment method, persisted to the real `bookings` table with a real reference and timestamp — and Packages carries zero remaining mock-data reads, closing out task #44.

## 6. Functional Requirements

### 6.1 Team section

Source: `pages/payroll-overview.tsx`, `pages/payroll-team.tsx`, `lib/payroll-data.ts`.

| # | Requirement |
|---|---|
| FR-1 | A period selector — **This Week / Last Week / This Month** (confirmed exact labels, `payroll-overview.tsx` lines 51–63) — controls the data shown across the whole Team section. Currently client-side only (`getPeriodRange()` computes date-fns ranges locally); rebuild as a shared date-range parameter on the relevant endpoints, not a client-side filter over an in-memory array. |
| FR-2 | **Gross Payroll** and **Net Payroll** totals cards (confirmed labels). Gross is a real sum of `calcPayrollSummary()`'s per-employee `gross_pay`. **Net Payroll today is fake**: the UI hardcodes the caption "After 20% illustrative deduction" (line 74) — net pay is not computed from real withholding/tax logic anywhere. This needs an actual net-pay calculation, not just a real data source for the same placeholder math. |
| FR-3 | **Employee Summary** card (confirmed label, lines 78–106) — a per-employee row: colored dot, name, hourly pay / commission pay breakdown (whichever applies), and gross pay. Must be computed from real `PayrollRun`/`TimeLog` data per employee for the selected period. |
| FR-4 | **Team & Pay Rates** page (confirmed title, `payroll-team.tsx` line 55) — per-employee: role name, pay type (hourly/commission), rate, worker type (W-2 employee / 1099 contractor), payment method (direct deposit / check), and bank accounts (name + last 4). All of this is currently mutable in the UI via `updatePayProfile()` / `addBankAccount()`, but writes only to an in-memory `payProfiles` array in `payroll-data.ts` — nothing persists across a reload. This needs real backing tables and persistence, not new UI. |
| FR-5 | **Time Tracking** page — real `TimeLog` entries (date, employee, role, hours), filterable by the same period selector, per the existing Payroll Module PRD's screenshot-sourced table format. (`payroll-time-tracking.tsx` not fully re-read this pass, but referenced by the "Time Tracking" hub card at line 35 of `payroll-overview.tsx`.) |
| FR-6 | **Time Off** hub card shows a live pending-request count (`pendingTimeOffCount()`, line 21) as a badge. This logic already exists and works against mock `TimeOffRequest` data — it just needs the same data to come from a real table. |
| FR-7 | **Recent Runs** (confirmed current label — line 139, *not* renamed to "Recent jobs"; that was speculative in v0.1 and is now dropped). This list shows the 3 most recent `PayrollRun` records: period range, duration type, total paid, and status badge (Paid / Report / Draft). No rename is needed — this needs `payrollRuns` to be a real table instead of a mock array. |
| FR-8 | **No "Total jobs booked" field exists anywhere in the current Team section.** v0.1 speculated this as a requirement; it isn't present in the live UI. Drop it from scope unless you want it added as genuinely new functionality — flag that decision explicitly rather than building it as if it were a gap-fill. |

### 6.2 Reports section

Source: `pages/reporting.tsx`, `lib/reporting-data.ts`.

The Reports section has five tabs (confirmed, lines 453–459): **Daily, Weekly, Monthly, Quarterly, Annual**. These split into two genuinely different views with different rebuild scopes.

| # | Requirement |
|---|---|
| FR-9 | **Daily / Weekly ("Operational View", lines 76–155)** already reads from live mock `bookings`/`packages` data, not the fabricated dataset — it filters real booking records by date and computes Jobs Booked, Revenue, Avg Ticket, and a bookings list directly. One exception: **Est. Gross Margin is a hardcoded 38.9% constant** (`gm = revenue * 0.389`, line 95) applied to every period regardless of actual cost — this needs to become a real calculation once real cost data (labor, materials, gas, card fees) exists per booking. Once `bookings` is a real table (task #39/#40), this tab mostly just needs its data source swapped — the query logic is already close to correct. |
| FR-10 | **Monthly / Quarterly / Annual ("Financial View", lines 158–447)** is entirely synthetic today, sourced from `reporting-data.ts`'s fabricated ~1,000-booking dataset with hardcoded cost rates (44.05% labor, 7.96% materials, $11.83/job gas, 3.05% card fees) and hardcoded monthly revenue/job seeds. This is a full rebuild, not a wiring exercise. It needs: 6 KPI cards (Revenue, Gross Margin, Net Margin, Jobs Completed, Cash on Hand, Total Liabilities), a 6-month revenue/net-income trend chart, a "Where the money goes" cost breakdown (labor, opex, materials, gas, card processing, interest+tax), a "Package mix" bar chart, a full income statement (revenue → COGS → gross profit → opex → operating income → interest/tax → net income), a balance sheet (assets/liabilities/equity), and a cash flow statement (operating/financing activities, net change) — all computed from real bookings, real payroll, and genuinely tracked overhead/liabilities/assets, none of which exist as real data today. |
| FR-11 | **"Revenue by employee"** chart at the bottom of the Financial View (lines 163–174, 428–444) is the one part of Monthly/Quarterly/Annual that already computes from live mock data (`employees` × completed `bookings` × `employeeSplit` percentage) rather than the fabricated dataset. This should carry over cleanly once `bookings`/`employees` are real — it doesn't need new logic, just a real data source. |
| FR-12 | Fixed overhead (insurance, vehicle maintenance, software, marketing, admin wages), loan interest, depreciation, and the 25% illustrative tax rate are all hardcoded constants in `reporting-data.ts` with no admin-facing way to set or edit them. Decide whether these become real configurable settings (a new small admin surface) or stay as reasonable defaults — this is a product decision, not just a backend one. |
| FR-13 | Every statement and chart must handle a zero-data period without error, consistent with the empty-state requirement already established for a brand-new organization in the self-serve signup PRD. |

### 6.3 Remaining mock data removal — Packages and Checkout

Source: `pages/checkout-payment.tsx`, `lib/mock-data.ts` (`Booking` interface, lines 36–51).

| # | Requirement |
|---|---|
| FR-14 | Packages: task #44's scope, referenced here for completeness, not re-specified — confirm it's actually done before considering this PRD's mock-data-removal goal met. |
| FR-15 | Checkout currently calls `updateBooking(cart.bookingId, { status: 'completed', paymentMethod, paymentNote })` (lines 84–90) directly against the in-memory mock array. This needs to become a real API call against the real `bookings` table once that table exists. |
| FR-16 | **Confirmed gap, not hypothetical:** the current `Booking` interface has only `paymentMethod?: PaymentMethodId` and `paymentNote?: string` (mock-data.ts lines 49–50). It has **no** `payment_reference`, `payment_recorded_at`, `refund_status`, or `refund_reference` fields at all — the Payment Methods PRD's schema doesn't exist yet in any form, mock or real. These need to be added to the real `bookings` table from scratch as part of this work, not just verified. |
| FR-17 | Card payments are fully simulated: `handleChargeCard()` always succeeds after a 2-second timeout (`checkout-payment.tsx` line 111, comment: "Simulate processing (always succeeds in mock)") — there's no real payment processor integration at all. Decide whether real card processing is in scope for this PRD or a separate integrations PRD (recommend the latter, given it likely needs a PCI-scoped processor decision — see the GTM one-pager's "tokenized capture" mention). If out of scope here, Checkout's mock-data removal should still land Cash/Zelle/Venmo as real, persisted payment records even before card processing is real. |
| FR-18 | Confirm no `mock-data.ts` reads remain anywhere in the Checkout flow via a grep-based check, same verification standard already used for Packages. |

## 7. Data Requirements

| Data | Source | Notes |
|---|---|---|
| `PayrollRun.line_items[].gross_pay` / `.net_pay` | Payroll Module PRD, implemented in-memory in `lib/payroll-data.ts` | FR-2/FR-3's direct source. The type shape is right; it just needs a real table behind it, plus real net-pay math (see FR-2). |
| `payProfiles` (roles, pay type, rates, worker type, payment method, bank accounts) | `lib/payroll-data.ts` | FR-4's direct source — currently mutable UI state with no persistence. |
| `TimeLog`, `TimeOffRequest` | `lib/payroll-data.ts` | FR-5/FR-6's direct source. |
| `bookings` (real) | Real Bookings/Clients Backend PRD | FR-9–FR-11's underlying source; also the fix for FR-15. |
| `Booking.payment_method` / `.payment_reference` / `.payment_recorded_at` / `.refund_status` / `.refund_reference` | Payment Methods PRD — **none currently implemented, even as mock fields** | FR-16 — build from scratch, not "confirm and migrate." |
| Overhead/liability/asset figures (insurance, loan balance, depreciation, etc.) | Currently hardcoded constants in `reporting-data.ts` | FR-12 — needs a product decision on whether these become editable settings. |

## 8. Dependencies

Everything here assumes the real `bookings`/`clients`/`employees`/`packages` tables and routes (tasks #39/#40) exist first — this is explicitly "after Package work," not parallel to it. The Payroll Module's own data shapes are already correctly modeled in `lib/payroll-data.ts`, but that whole file is mock/in-memory — a real `PayrollRun`, `TimeLog`, `TimeOffRequest`, and pay-profile schema needs to exist before Section 6.1 can be wired for real.

## 9. Edge Cases

| Case | Handling |
|---|---|
| An employee has zero bookings/hours in the selected period | Show a real zero, not a missing card — consistent with the empty-state standard already set elsewhere. |
| "This week" spans a payroll period boundary (e.g., a `PayrollRun` covering part of last week and part of this week) | Decide whether gross/net payroll attributes partial-run pay proportionally or by run start date — flagged in Open Questions, don't guess silently. |
| Checkout attempts to record payment on a booking that doesn't exist in the real table yet (stale client state) | Fail cleanly with a clear error, don't silently write a payment record to nothing. |
| A Reports period (Monthly/Quarterly/Annual) has no real overhead/liability data yet configured (FR-12) | Decide a sane default (e.g., $0 overhead) rather than silently reusing the old hardcoded constants, which would look real but aren't. |

## 10. Phased Rollout

**Phase 1:** Stand up real `PayrollRun`/`TimeLog`/`TimeOffRequest`/pay-profile tables (Section 8) and decide the FR-12 overhead/settings question — both determine how much of Sections 6.1/6.2 is new backend work versus wiring.

**Phase 2:** Team section backend (6.1) and Reports section backend (6.2) — these can run in parallel; note that Reports' Daily/Weekly tab (FR-9) is much lighter than Monthly/Quarterly/Annual (FR-10) and could ship first as a quick win once `bookings` is real.

**Phase 3:** Checkout mock-data removal (6.3), sequenced after `Booking.payment_method` and related fields are added (FR-16). Decide FR-17's card-processing scope before starting this phase, since it affects whether Checkout ships with real Cash/Zelle/Venmo only or full card support.

## 11. Risks & Open Questions

Should net payroll (FR-2) implement real withholding/tax logic, or a different, still-illustrative-but-labeled-honestly estimate? The current 20% flat deduction is a placeholder that shouldn't just move to a real database unchanged. Does Est. Gross Margin on the Daily/Weekly Reports tab (FR-9) get a real per-booking cost calculation, or a smarter blended rate — needs a decision once real cost inputs exist. Should the overhead/liability/depreciation figures in Reports (FR-12) become an editable admin settings screen, or stay as reasonable fixed defaults per business? Is real credit card processing (FR-17) in scope for this PRD, or does it split into a separate integrations PRD given the PCI/processor decision involved? How should a `PayrollRun` spanning a period boundary be attributed across "this week" vs. "last week" views (see Edge Cases)? Needs a product decision, not an engineering default.
