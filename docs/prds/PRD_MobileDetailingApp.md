# Product Requirements Document
## [Working Title: "DetailHub"] — Mobile Detailing Business Management App

**Status:** Draft v1 — for prototype scoping in Claude Code
**Author:** Prepared from stakeholder working session + prior research (see Appendix A)
**Date:** July 2026

> Naming note: "DetailHub" is a placeholder used only so the rest of this doc has something concrete to refer to. Swap it before it shows up anywhere user-facing.

---

## 0. Vision & Context

DetailHub is a mobile-first business management app for mobile detailing businesses (and adjacent mobile/multi-employee field service businesses — HVAC, mobile mechanics, etc.). It is directly inspired by Vagaro Pro, informed by:

- A structured UX audit of Vagaro Pro's mobile app (five priority flows: calendar, checkout, client profiles, home navigation, payroll/reporting — see Appendix A).
- A primary interview and screen-share walkthrough with a working mobile detailing business owner, which surfaced the specific gaps this product is designed to close: no split-commission payroll support, fully manual payroll re-entry, and no way to account for the real, job-specific costs (fuel, parking) that a *mobile* business carries that a storefront salon doesn't.

**Core bet:** the biggest opportunity isn't out-competing Vagaro on breadth — it's building specifically for *mobile* crews, where a job's true profitability depends on more than the ticket price. Gas cost and parking cost eat into margin per job in a way that a fixed-location salon or spa never has to think about. Surfacing that at the point of booking is the product's differentiator.

**Primary user:** the business owner/admin who does the scheduling, dispatching, and payroll (not necessarily the person doing the detailing). Field employees are recipients of job notifications, not primary app operators, in v1.

---

## 1. Users & Roles

| Role | Description | v1 Access |
|---|---|---|
| **Admin/Owner** | Runs the business — books jobs, manages packages, runs payroll, views reporting. | Full access to all modules. |
| **Employee/Technician** | Performs the job. Receives notifications of assigned jobs. | Notification recipient only in v1 (see Open Questions — employee login is a candidate v2 feature). |
| **Client (end customer)** | The person getting their vehicle/property detailed. | No app login in v1 — receives email/SMS notifications only. Booking is admin/staff-driven, not self-service, matching how the interviewed business actually operates. |

---

## 2. Data Model Overview

High-level entities referenced throughout this PRD. Full field lists live in each use case section below.

| Entity | Purpose |
|---|---|
| `Client` | Customer profile — contact info, address(es), booking history. |
| `Booking` | A single scheduled job. Central object; most features attach to it. |
| `Package` | A sellable service/add-on in the catalog (e.g., "Hand Wash," "Interior Detail"). |
| `Employee` | Staff member who can be assigned to bookings. |
| `PayrollRule` | Admin-configured formula for computing employee payout. |
| `AdminSettings` | Business-wide config: home base address, gas price, MPG, thresholds. |

---

## 3. Use Case: Booking & Calendar Management

**This is the app's home screen — the daily main view**, matching how the interviewed owner described using Vagaro today: "This is my main view every day."

### 3.1 Core Booking Flow

**User stories**
- As an admin, I tap a time slot on the calendar to start a new booking.
- As an admin, I search for an existing client by name/phone/email, and their profile (including booking history) auto-populates; or I create a new client inline if they don't exist.
- As an admin, the booking screen captures every data point needed to create the booking in one place (see field list below) — no follow-up screen required to finish setting it up.
- As an admin, I select one or more services/packages from the catalog (Section 5) to add to the booking.
- As an admin, I assign one or more employees to the booking — multi-employee jobs must be supported, since a single job is sometimes staffed by two techs.
- As an admin, I can set a deposit (percentage or fixed amount) and either invoice it or charge a card on file immediately.
- As an admin, I can edit a booking after it's created — and **editing must expose the exact same fields as creation**, including adding or removing services/add-ons. (Vagaro's audit surfaced a real bug here: its edit screen doesn't let you add an add-on after the fact, only during initial booking. Do not replicate that gap.)
- As an admin, once I book, the client automatically receives an email and SMS confirmation with the job summary; assigned employee(s) receive a push/SMS notification.
- Booking confirmation is one-directional by design — the client isn't required to accept/confirm. (This matches how the interviewed business actually runs: staff schedules on the client's behalf.)

**Required field: client email.** Every booking must capture a valid client email address before it can be booked, specifically because it's the delivery channel for the booking notification. If the client profile doesn't already have one on file, it must be collected at booking time.

**Booking entity — fields**

| Field | Type | Notes |
|---|---|---|
| `client_id` | FK → Client | |
| `client_email` | string, required | Required at booking time if not already on the client record. |
| `client_phone` | string, optional | Enables SMS notification. |
| `service_address` | address, required | Job site location. Feeds Gas Meter and Weather. |
| `scheduled_date`, `scheduled_start_time` | date/time, required | |
| `estimated_duration` | integer (minutes) | Derived from selected package(s), overridable. |
| `assigned_employee_ids` | array of FK → Employee | Supports multi-employee jobs. |
| `line_items` | array of `{package_id, name, price, quantity}` | One or more packages/add-ons. |
| `subtotal` / `tax` / `total_price` | currency | Computed from line items. |
| `deposit_amount`, `deposit_status` | currency, enum(`none`/`pending`/`charged`) | |
| `parking_cost` | currency, optional | See Section 3.4. |
| `gas_meter_status` | enum(`green`/`yellow`/`red`), computed | See Section 3.2. |
| `weather_snapshot` | object, computed | See Section 3.3. |
| `status` | enum(`confirmed`/`in_progress`/`completed`/`canceled`/`no_show`) | Drives calendar color coding. |
| `notes` | text, internal | Staff-only. |
| `waiver_sent`, `waiver_signed` | boolean | Optional liability waiver e-signature step, matching Vagaro's flow. |
| `created_at`, `updated_at`, `created_by` | metadata | |

**Key screens**
- **Calendar** — Day / Week / Agenda views, color-coded by `status` for at-a-glance scanning (borrowing the "status over sameness" principle from the Vagaro audit — no two bookings should look identical if their state differs).
- **New Booking flow** — client select/create → service select → employee assign → deposit → parking cost → review & confirm.
- **Booking Detail / Edit** — identical field set to creation, fully editable in place; surfaces Gas Meter badge, Weather panel, and Parking Cost line.
- **Client Profile** — contact info, full booking/purchase history, notes.

**Notifications**
- On booking create/edit: client gets email + SMS with date, time, service, address, price, deposit status.
- Assigned employee(s) get a push/SMS notification of the new or changed job.

---

### 3.2 Gas Meter

**Purpose:** a per-booking profitability signal specific to mobile businesses — is this job worth the drive?

**Inputs**
- `AdminSettings.home_base_address` — the business's central starting point, set once.
- `AdminSettings.gas_price_per_gallon` — defaults to **$6.00**, admin-editable.
- `AdminSettings.vehicle_mpg` — **not specified by the stakeholder; flagged as an open question (Section 8).** Proposed default: 20 MPG, admin-editable.
- `Booking.service_address` — the job site.

**Calculation**
1. Compute round-trip driving distance between `home_base_address` and `service_address` (via a geocoding/directions API — see Open Questions).
2. `gas_cost = (round_trip_miles / vehicle_mpg) * gas_price_per_gallon`
3. `gas_ratio = gas_cost / booking_package_price` (using the booking's `total_price` before tax/deposit)
4. Map `gas_ratio` to a status:

| Status | Proposed threshold (admin-configurable) | Meaning |
|---|---|---|
| 🟢 Green | `gas_ratio ≤ 10%` | Healthy margin relative to drive cost. |
| 🟡 Yellow | `10% < gas_ratio ≤ 20%` | Worth a second look. |
| 🔴 Red | `gas_ratio > 20%` | Drive cost is eating meaningfully into the job's value. |

These exact thresholds were not specified by the stakeholder — treat as a starting default and make them editable in `AdminSettings`, not hardcoded.

**UI**
- Small colored badge (dot or fuel-pump icon) on the booking card in the calendar and on the booking detail screen.
- Tapping/expanding the badge shows the underlying breakdown: round-trip miles, estimated gas cost, and % of booking price — transparency builds trust in the number.

**Data model additions:** `AdminSettings.home_base_address`, `AdminSettings.gas_price_per_gallon` (default 6.00), `AdminSettings.vehicle_mpg`, `AdminSettings.gas_meter_thresholds {green_max, yellow_max}`; `Booking.distance_miles`, `Booking.gas_cost`, `Booking.gas_meter_status`.

---

### 3.3 Weather Module

**Purpose:** surface the forecast for a booking's date/location, since outdoor detailing work is weather-dependent.

**User stories**
- As an admin, from the calendar view, I see a lightweight weather indicator (icon + high temp) on the relevant day or booking card.
- As an admin, opening a specific booking shows a full weather panel for that date/location: precipitation chance, temperature (high/low), and a condition summary/icon.

**Logic**
- Fetch forecast via a weather API keyed on `service_address` + `scheduled_date` (candidate: OpenWeatherMap, NOAA/Weather.gov, or similar — see Open Questions for API selection).
- Forecasts are only reliably available ~10–14 days out; bookings further out should show a placeholder ("Forecast available closer to the date") rather than stale or fabricated data.
- Refresh the snapshot as the date approaches (forecasts shift); once the booking date has passed, freeze the last-fetched snapshot as a historical record rather than continuing to refresh.

**Data model additions:** `Booking.weather_snapshot { condition, precipitation_percent, temp_high, temp_low, fetched_at }` (nullable when unavailable).

---

### 3.4 Parking Cost

**Purpose:** capture a real, job-specific expense (parking/permit fees) at the point of booking so it's visible later for cost accounting.

**User stories**
- As an admin, during booking creation, I can enter an optional parking cost.
- As an admin, opening a booking's detail from the calendar shows the parking cost as a line item.

**Data model additions:** `Booking.parking_cost` (decimal, nullable, default 0).

**Suggested extension (not explicitly requested — flagging for consideration):** roll `parking_cost` and `gas_cost` together into a "net job profitability" figure surfaced in Sales Reporting (Section 4), since both were introduced as cost signals in the same conversation. Treat as v1.1 scope unless you want it in the first cut.

---

## 4. Use Case: Sales Reporting

**Purpose:** give admins visibility into revenue performance, mirroring how the interviewed owner actually uses reporting today — primarily to feed payroll, secondarily to spot package/trend performance.

**User stories**
- As an admin, I can view top-line revenue for a selected period (week/month/year, custom range).
- As an admin, I can break revenue down by booking, by job, by package, and by employee.
- As an admin, I can see trends over time — e.g., which packages are most booked, which add-ons attach most often, by week/month/year.
- As an admin, I can view a per-employee revenue report that reconciles with the Payroll module (Section 6).

**Metrics**

| Metric | Definition |
|---|---|
| Top-line revenue | Sum of `total_price` across bookings with `status = completed` in the selected range. |
| Revenue per booking/job | `total_price` for a single booking. |
| Revenue per package | Sum of `line_item.price × quantity` across all bookings, grouped by `package_id`. |
| Revenue per employee | Sum of bookings' `total_price` attributed to an employee; for multi-employee bookings, apportioned by the split allocation defined in Payroll (Section 6). |
| Time groupings | Daily / weekly / monthly / yearly, plus custom date range. |

**Key screens**
- **Sales Dashboard** — top-line stat cards (revenue this week/month/year, jobs completed, average ticket size).
- **Revenue by Employee** — table/chart view.
- **Revenue by Package** — table/chart view, with trend-over-time option.
- **Booking-level report** — filterable list of all bookings with financials, exportable (CSV at minimum).

---

## 5. Use Case: Package & Catalog Administration

**Purpose:** let admins build and maintain the service catalog used throughout booking. The interviewed owner had built their entire Vagaro catalog by hand — this experience should make that setup and maintenance as low-friction as possible.

**User stories**
- As an admin, I can create a new package with name, category, description, price, and estimated duration.
- As an admin, I can edit or archive an existing package.
- As an admin, I can organize packages into categories (e.g., "Washing & Detailing").
- As an admin, I can mark a package as a standalone service or an add-on (attachable to another service during booking).

**Package entity — fields**

| Field | Type |
|---|---|
| `name` | string |
| `category` | string / FK → Category |
| `description` | text |
| `price` | currency |
| `duration_estimate` | integer (minutes) |
| `is_addon` | boolean |
| `active` | boolean (archived vs. live) |
| `created_at`, `updated_at` | metadata |

**Key screens**
- Package list, grouped by category, with inline edit/archive actions.
- Package create/edit form.

---

## 6. Use Case: Payroll Management

**Purpose:** directly close the gap the interviewed owner described in detail — today, payroll is 100% manual: pulling job data out of Vagaro by hand, re-entering it into a spreadsheet, and hand-calculating a ~30% payout, with extra manual work whenever a job is split across two employees.

**User stories**
- As an admin, I can define a payroll calculation rule in Admin settings (e.g., flat percentage commission; could extend to tiered or per-employee rules).
- As an admin, that calculation is editable at any time, and changes are reflected in the Payroll view going forward.
- As an admin, for any booking with more than one assigned employee, I can set a commission split (e.g., 60/40) — defaulting to an even split, adjustable per booking. This directly replaces the manual spreadsheet workaround.
- As an admin, I can view a payroll summary per employee, per pay period: revenue generated, tips received (marked clearly as a pass-through, not owner-retained income — this framing matters, since the owner tracks tips specifically to document that they aren't keeping them for tax purposes), and computed payout.

**Data model**

| Entity | Fields |
|---|---|
| `PayrollRule` | `id`, `name`, `type` (`percentage`/`flat`/`tiered`), `value(s)`, `applies_to` (all employees or specific employee), `effective_date` |
| `Booking.split_allocations` | array of `{employee_id, percent, amount}` — only relevant when `assigned_employee_ids.length > 1` |
| `PayrollSummary` (computed view) | per employee, per period: revenue, tips, computed payout, based on the active `PayrollRule` and any `split_allocations` |

**Key screens**
- **Admin → Payroll Rules** — create/edit the calculation formula.
- **Payroll Dashboard** — per-employee, per-period summary table with computed payout.
- **Booking-level split editor** — surfaced on the booking detail screen only when multiple employees are assigned.

**Out of scope for v1 (flagged, not requested):** employee self-service login to view their own payout. Natural v2 extension given the data model already supports it, but the interview didn't ask for it and the current business process doesn't require it.

---

## 7. Use Case: Financial Health Dashboard

**Purpose:** give the admin a single place to read the business's financial health — not just the revenue-only view in Sales Reporting (Section 4), but a real income statement, balance sheet, and cash flow, built from the same booking and payroll data already in the product. This closes the loop the interviewed owner described: today, understanding whether the business is actually healthy means exporting data and doing it by hand.

**Prototype reference.** This section documents a working reference build, not just a spec: `DetailHub_Financial_Dashboard.html`, a self-contained interactive dashboard built against 1,000 fabricated transactions spread across 6 months of the six Package Admin services, with a realistic mobile-detailing cost structure (labor commission, materials, gas, card processing, insurance, vehicle maintenance, a financed work vehicle, a small loan). The two figures below are data-accurate exports of that dashboard — see the note at the end of this section for exactly what "exports" means here versus a literal screenshot.

**User stories**
- As an admin, I can view a financial dashboard that answers "is the business healthy" at a glance, without needing to interpret raw booking data myself.
- As an admin, I can toggle between Daily, Weekly, Monthly, Quarterly, and Annual views.
- At the Daily and Weekly tiers, I see an **operational pulse** only — revenue, jobs completed, average ticket, and gross margin. Overhead, taxes, and cash position are not shown at this grain, because they're not meaningful at daily/weekly resolution for a business this size.
- At the Monthly, Quarterly, and Annual tiers, I see the **full financial picture**: a complete income statement, a balance sheet snapshot, and a cash flow statement, plus the same operational KPIs.
- As an admin, I can see a 6-month revenue and net income trend regardless of which period I'm viewing, for context.
- As an admin, I can see a cost breakdown (labor, materials, gas, processing fees, and each operating expense line) and a package mix breakdown for whatever period I've selected.

**Data model additions**

The dashboard is a computed/reporting layer, not a new place to manually enter data — it derives everything from `Booking` (revenue, line items), `Payroll` (labor cost, per Section 6), and a set of business-level financial assumptions that live in `AdminSettings` alongside the Gas Meter settings from Section 3.2:

| Field | Type | Notes |
|---|---|---|
| `AdminSettings.starting_cash` | currency | Opening cash position for the reporting window. |
| `AdminSettings.vehicle_cost`, `.vehicle_monthly_depreciation` | currency | Financed work vehicle, straight-line depreciation. |
| `AdminSettings.equipment_cost`, `.equipment_monthly_depreciation` | currency | Detailing equipment, straight-line depreciation. |
| `AdminSettings.loan_balance`, `.loan_monthly_principal`, `.loan_monthly_interest` | currency | Vehicle/equipment financing, if any. |
| `AdminSettings.fixed_opex` | object `{insurance, vehicle_maintenance_budget, software, marketing, admin_wages}` | Recurring monthly overhead not tied to any single booking. |
| `AdminSettings.tax_rate_estimate` | percentage | Illustrative effective tax rate — flagged the same way as Section 9 of the Payroll addendum: not real tax logic, a placeholder assumption. |
| `AdminSettings.owner_draw_rate` | percentage | Assumed share of net income drawn by the owner monthly, for cash flow projection purposes. |
| `FinancialStatement` (computed, not stored) | object | Per period: income statement, balance sheet snapshot, and cash flow — recomputed on demand from `Booking`, `Payroll`, and `AdminSettings`, the same way the prototype's `gen_financials.py` model works. |

**Key screens**
- **Financial Dashboard** (under More → Reports, alongside or replacing the existing Sales Reporting entry point) — period selector (Daily/Weekly/Monthly/Quarterly/Annual), KPI row, 6-month revenue/net income trend, cost breakdown, package mix, and the three statements.

**Figure 1 — Overview: KPI row, trend, and cost breakdown (Monthly view, Jul 2026)**

![Financial dashboard overview — KPI cards, revenue and net income trend, and cost breakdown donut](dashboard_shot_1_overview.png)

**Figure 2 — Package mix and the three statements (Monthly view, Jul 2026)**

![Financial dashboard statements — package mix, income statement, balance sheet, and cash flow](dashboard_shot_2_statements.png)

**A note on what these figures actually are.** They are not browser screenshots — this sandbox has no network path to a headless browser to render one (Puppeteer's Chromium download, a system `chromium` package, and Playwright's browser download were all tried and blocked by network restrictions, with no root access to install one directly). Instead, these are exports generated directly from the same fabricated dataset and the same numbers the live HTML dashboard computes, rendered with matplotlib and styled to the product's actual color tokens (Section design tokens: `#3654FF` accent, `#1E9E62`/`#D9A404`/`#DC2626` status colors, etc.). The layout and every number is accurate to the real `DetailHub_Financial_Dashboard.html` file's Monthly view; only the rendering path differs from a literal screenshot. If pixel-accurate screenshots are needed later, open the HTML file directly and capture them from there.

**Verification note.** The underlying three-statement model was checked to balance exactly: `Total Assets = Total Liabilities + Equity` to the penny across all 6 fabricated months, not just visually plausible. That check is in `gen_financials.py` (`balance_sheet_max_check`, which evaluates to `0.0`).

---

## 8. Cross-Cutting Design Principles

Carried forward from the Vagaro Pro audit, adapted for this product:

1. **Status over sameness.** Booking status, gas meter state, and weather risk should all be visible at a glance via color/icon — never require a tap-in to find out if something needs attention.
2. **Autosave by default.** No in-progress booking or edit should ever be lost by navigating away.
3. **Surface today first.** The calendar/home view should default to today, not a fixed start-of-day scroll position.
4. **Don't lock what admins own.** Every field captured at booking creation must remain editable afterward — no creation-only fields (this is a direct fix for the add-on editing gap found in Vagaro).
5. **Make the mobile-specific costs visible, not buried.** Gas Meter and Parking Cost exist specifically because this is a mobile business — surface them at the point of booking, not several taps deep in a report.

---

## 9. Open Questions & Assumptions

These were not fully specified in the working session. Each has a proposed default so a prototype can be built without blocking, but confirm before treating any of them as final:

| # | Question | Proposed default |
|---|---|---|
| 1 | Vehicle fuel efficiency (MPG) for Gas Meter calculation | 20 MPG, admin-editable in settings |
| 2 | Gas Meter green/yellow/red thresholds | ≤10% green, 10–20% yellow, >20% red — admin-editable |
| 3 | Distance/geocoding provider for Gas Meter | Google Maps Distance Matrix API (or equivalent) |
| 4 | Weather data provider | OpenWeatherMap or NOAA/Weather.gov |
| 5 | Do employees get their own login in v1, or notification-only? | Notification-only for v1; login is a v2 candidate |
| 6 | Does the client get any self-service access (view booking, reschedule)? | No — staff-driven booking only, matching the interviewed business's actual workflow |
| 7 | Should Parking Cost + Gas Cost roll into a "net job profit" figure in Sales Reporting? | Not in v1 scope; flagged as a natural v1.1 extension |
| 8 | Payroll rule complexity — is a flat % sufficient for v1, or is tiered/per-employee needed at launch? | Flat % sufficient for v1; data model (`PayrollRule.type`) leaves room to extend |
| 9 | Product name | "DetailHub" is a placeholder only |
| 10 | Starting cash, vehicle/equipment cost, and loan terms used in the Financial Dashboard's balance sheet | All fabricated for the prototype (Section 7) — real onboarding will need to collect these per business, likely during initial setup |
| 11 | Depreciation schedule and method for vehicle/equipment | Straight-line, illustrative monthly amounts in the prototype; confirm against how the business's actual accountant depreciates these assets |
| 12 | Effective tax rate used in the income statement | 25% flat, explicitly illustrative — same caution as the Payroll addendum's tax filing flag: this is not real tax logic |
| 13 | Owner draw rate assumption for cash flow | 55% of net income in the prototype — real behavior varies enormously by owner and should likely be an editable `AdminSettings` field, not a fixed assumption |
| 14 | Should the Financial Dashboard replace or sit alongside Sales Reporting (Section 4)? | Proposed: extend Sales Reporting into the fuller Financial Dashboard rather than maintaining two separate reporting screens — confirm before build |

---

## Appendix A — Research Inputs

This PRD is grounded in two prior artifacts from the same project:

- **Vagaro Pro Mobile App UX Audit & Redesign** (`Vagaro_Pro_UX_Audit_Redesign.docx`) — desk research across Capterra, App Store, and Trustpilot reviews, prioritizing five flows: Checkout & POS, Appointment Calendar, Client Profiles, Home Dashboard & Navigation, and Reporting & Payroll.
- **Vagaro Pro user interview notes** (`vagaro_interview_notes.md`) — a direct interview and screen-share walkthrough with a multi-employee mobile service business owner, covering payroll workflow, reporting usage, competitor context, and a live demo of the booking flow. This is the primary source for the payroll split-commission requirement, the required-client-email notification requirement, and the mobile-specific cost framing (gas, parking) that this PRD is built around.

Two further artifacts extend this PRD and are referenced directly in their respective sections:

- **Payroll & Team Management PRD addendum** (`PRD_DetailHub_Payroll_Module.md`) — extends Section 6, sourced from Vagaro's own payroll product marketing (role/pay-rate setup, time tracking, PTO, running payroll, employee self-service).
- **Financial Dashboard prototype** (`DetailHub_Financial_Dashboard.html`, `gen_financials.py`, `gen_dashboard_shots.py`) — the working reference behind Section 7, built from 1,000 fabricated transactions to validate the three-statement dashboard concept ahead of wiring it to real data.
