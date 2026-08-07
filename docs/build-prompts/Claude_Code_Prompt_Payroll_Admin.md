# Build Prompt — Payroll & Team Management Module (Admin Experience)

> **How to use this:** Paste this into Claude Code inside the *existing* DetailHub prototype project — the one already built from `Claude_Code_Prototype_Prompt.md`. Have `PRD_DetailHub_Payroll_Module.md` in the same project. Read that PRD in full before writing any code — it defines every entity and business rule referenced below. This is an **incremental build prompt**, not a fresh scaffold: it extends what already exists rather than starting over.

---

## What you're building

The admin-facing side of the Payroll & Team Management module specified in `PRD_DetailHub_Payroll_Module.md`. This replaces and expands the placeholder "Payroll dashboard" and "Payroll Rule settings" screens from the original build prompt with the fuller set of screens that PRD defines: role/pay-rate setup, time tracking, time-off approval, and running payroll.

**Scope note — admin only.** The payroll PRD also specifies an employee-facing self-service portal (Section 8 of that PRD: paystubs, profile, time-off requests from the employee's own login). **That is explicitly out of scope for this prompt.** Build the data model to support it (see below) so it isn't a rewrite later, but don't build the employee-facing screens now — that's a separate follow-up prompt once employee login itself is scoped.

**This is still a prototype.** Same rules as the original build: mock data, mock logic where the real thing would require a real integration, no real backend.

---

## Before you touch any code

1. Confirm the existing project structure, design tokens, and mock-data pattern from the first build are intact — reuse them, don't reinvent them. If `/lib/mock-data.ts` (or equivalent) already exists, extend it; don't create a parallel data file.
2. Reuse the **exact same design tokens** as the rest of the app (reproduced below only so this prompt is self-contained — don't treat this as a second source of truth if the two ever drift, the original build prompt wins).

**Color:** `surface-base #FFFFFF` · `surface-subtle #F7F7F5` · `surface-sunken #F0F0EE` · `surface-inverse #0B0B0C` · `ink-primary #0B0B0C` · `ink-secondary #6B6F76` · `border #E7E7E5` · `accent #3654FF` · `accent-subtle #EEF0FF` · `status-green #1E9E62` · `status-amber #D9A404` · `status-red #DC2626`.

**Type:** Inter, tabular numerals on every currency/hours figure, same scale as the rest of the app (H1 24/32 semibold, H2 18/24 semibold, Body 15/22, Small 13/18, Caption 12/16).

**Shape:** `rounded-xl` cards, 1px hairline borders, no drop shadow on static cards, `rounded-lg` buttons, 44px minimum touch targets, status always shown as dot/pill + label, never color alone.

---

## Data model additions

Add these to the existing mock-data fixtures, per `PRD_DetailHub_Payroll_Module.md` Section 2. Reuse the existing `Employee` type if one already exists from the original build (it was referenced but not fully specified there) and extend it — don't create a duplicate.

- **`Employee`** — add `worker_type` (`w2_employee` / `1099_contractor`), `roles` (array of `EmployeeRole`), `payment_method` (`direct_deposit` / `check`), `bank_accounts` (array of `{id, bank_name, account_last4, is_default}`).
- **`EmployeeRole`** — `employee_id`, `role_name`, `pay_type` (`hourly` / `commission`), `hourly_rate`, `commission_rate`.
- **`PayrollRule`** — extend the existing type to add `hourly` as a fourth `type` option and an `applies_to_role` field.
- **`TimeLog`** — `employee_id`, `role_name`, `date`, `hours`, `source` (`manual_entry` / `derived_from_booking`), `linked_booking_id`, `approved`.
- **`TimeOffRequest`** — `employee_id`, `start_date`, `end_date`, `status` (`pending` / `approved` / `denied`), `requested_at`, `reviewed_by`, `reviewed_at`, `note`.
- **`PayrollRun`** — `period_start`, `period_end`, `duration_type`, `status` (`draft` / `processing` / `paid` / `failed`), `line_items` (array of `{employee_id, hours, hourly_pay, commission_revenue, commission_pay, tips, gross_pay, net_pay, payment_method, bank_account_id}`), `run_by`, `run_at`, `report_url`.

**Seed data to add:** at least 4 employees covering both pay types (e.g., one hourly-only front desk employee, two commission-only detailers, one with both roles), a mix of `1099_contractor` and `w2_employee`, 2–3 weeks of `TimeLog` entries, a handful of `TimeOffRequest`s in different statuses (include at least one `pending` so the approval flow has something to act on), and one or two historical `PayrollRun`s so the run history isn't empty on first load.

---

## Screens to build

These live under the existing **More → Payroll** entry point. Replace the single old "Payroll dashboard" screen with this small hub-and-spoke set — a Payroll Overview screen with clear entry points into the others, not five equally-weighted nav items competing for attention.

1. **Payroll Overview** (replaces the old Payroll dashboard) — per-employee, per-period summary (revenue, tips as a clearly labeled pass-through, computed payout) plus entry cards into Team & Pay, Time Off (with a pending-count badge if any requests are pending), Time Tracking, and Run Payroll. This is the screen More → Payroll opens to.

2. **Team & Pay Rates** — employee list, each row showing their role(s) and pay type/rate. Tapping an employee opens their pay setup: add/remove roles, set `hourly_rate` or `commission_rate` per role, matching the PRD's "Front Desk $15/hr vs. Stylist $20/hr" pattern generalized to any number of roles. This is also where `worker_type` and `payment_method` get set.

3. **Time Tracking** — a table (Date / Employee / Role / Hours), matching the reference screenshot exactly, with an approve action per entry or in bulk. Filter by date range and by employee. Entries with `source: derived_from_booking` should visually indicate they came from a completed job, not manual entry.

4. **Time Off** — two views in one screen (tabs or a status filter): a **pending queue** with an approve/deny action per request that opens a confirmation modal styled exactly like the reference — "Approve Time Off Request — Are you sure you want to accept the time off request by [Name]?" with Cancel/Approve buttons — and a **history view** of past requests with their resolved status. Approving or denying should update `TimeOffRequest.status`, `reviewed_by`, and `reviewed_at` in the mock store live.

5. **Run Payroll** — a multi-step flow, not a single form:
   - **Step 1:** select `period_start`/`period_end` and `duration_type` (weekly/biweekly/monthly/custom), matching the reference's "Payroll Period" and "Payroll Duration" selectors.
   - **Step 2 (draft review):** a table of every employee who has activity in the period — hours × hourly_rate for hourly roles, commission revenue × commission_rate for commission roles (pulling from completed bookings' split allocations, per the original PRD), tips, gross pay, net pay. Nothing should be able to pay out without this review step being shown first.
   - **Step 3 (confirm):** a "Run Payroll" primary action (use `accent` color, not a status color) that transitions the `PayrollRun` to `paid` and shows a per-employee confirmation state echoing the reference's "You Got Paid" pattern — even though there's no employee-facing screen yet to receive it, show it here as evidence the payout completed.
   - Also expose a lighter-weight **"Run Report"** action from the same period selector that generates a `report_url` without changing any `PayrollRun` to `paid` — this is the reporting-only path from the reference screenshots, distinct from actually running payroll.
   - **Run history:** a list of past `PayrollRun`s (period, status, total paid out) below or accessible from this screen.

6. **Payroll Rule Settings** (extends the existing Payroll Rule settings screen from the original build) — add the ability to define a rule scoped to a role (`applies_to_role`) in addition to the existing employee/all-employees scoping, and add `hourly` as a selectable rule type alongside the existing percentage/flat/tiered options.

---

## Mocked business logic

- **Payroll run calculation:** for each employee with activity in the selected period, sum `hours × hourly_rate` across their approved `TimeLog` entries for hourly roles, and sum `commission_revenue × commission_rate` from completed bookings' split allocations for commission roles (an employee can have both in the same run if they hold both role types). `gross_pay = hourly_pay + commission_pay + tips`. Use a flat mock deduction percentage (e.g., 20%) to derive `net_pay` from `gross_pay` — label it clearly as illustrative, not a real tax calculation, since real payroll tax is explicitly out of scope (see below).
- **Time-off approval:** approving or denying updates the request in place and reflects immediately in the pending-count badge on Payroll Overview — no page reload required.
- **Bank account selection:** a simple mock picker (existing accounts + "Add New Bank Account" that opens a form and appends a fake `{bank_name, account_last4}` to the employee's `bank_accounts` array) — do not build or simulate any real bank-linking flow.

---

## What to skip

- **Real tax filing/compliance logic.** The payroll PRD is explicit that this is a build-vs-buy decision requiring a real vendor/legal decision, not something to spec or fake convincingly. Show a flat, clearly-labeled illustrative deduction only (see above) — don't build anything that resembles real tax withholding logic.
- **Real bank account linking, direct deposit execution, or check printing.** Mock the UI only.
- **The employee self-service portal.** Out of scope per the note at the top — build the data model to support it later, not the screens now.
- **Real authentication for employees.** The app should remain "logged in as Admin" only, same as the original build.

---

## Deliverable

The existing DetailHub prototype, with More → Payroll now opening the six-screen hub described above instead of the original placeholder, fully wired to the extended mock data — a coherent admin experience for setting pay rates, tracking time, approving time off, and running payroll, ready to click through end to end.
