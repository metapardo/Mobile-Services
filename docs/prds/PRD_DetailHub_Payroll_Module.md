# PRD Addendum — Payroll & Team Management Module
## DetailHub — extends the master PRD (`PRD_MobileDetailingApp.md`)

**Status:** Draft v1
**Sourcing:** Three reference screenshots of Vagaro's own payroll product marketing (feature composite, feature grid, "Getting your team paid" detail panel) — see Section 0 for how to weigh this evidence against the rest of the master PRD.
**Merges into:** Replaces master PRD **Section 6 (Payroll Management)** in full. Updates **Section 1 (Users & Roles)** and **Section 8 (Open Questions)** — see Section 10 for exact merge instructions.

---

## 0. What this is and how to weigh it

The master PRD's payroll section was built from a primary interview — real evidence about how one mobile detailing owner actually works today. This addendum is built from a different, weaker kind of evidence: **Vagaro's own marketing screenshots of their payroll product**, showing what Vagaro has decided to build and how they've decided to present it. That's useful — it tells us what a mature competitor considers table stakes for "payroll" as a category — but it is not user research. Nobody told us these specific screens solve a real problem for a mobile detailing crew; we're inferring that from a competitor's feature set.

Treat this addendum as **category-standard scope to react to, not validated requirements**. A few items below (tax filing, in particular) are big enough decisions that they should get real validation before committing engineering time, not just be copied because Vagaro has them.

**What the screenshots show, concretely:**
1. A "Run Payroll" primary action.
2. A time-off approval modal ("Approve Time Off Request... by Nick Williams" → Cancel/Approve).
3. A per-employee role and pay-rate selector (e.g., "Zoe Stevens" → choose "Front Desk $15/hr" or "Stylist $20/hr").
4. A "You Got Paid" confirmation, addressed to the employee.
5. Payment method selection (Direct Deposit) and employee bank account management ("Wells Fargo ending in 9012," "Add New Bank Account").
6. Marketing copy for four capabilities: pay employees *and* contractors from one platform; automatic tax filing & compliance; time tracking with logs that sync to payroll; custom pay/commission rates by role or service.
7. A time log table: Date, Employee, Role, Hours.
8. A payroll run configuration panel: Payroll Period (date range), Payroll Duration, "Run Report."
9. PTO/vacation/day-off tracking, framed as its own capability.
10. "Employee self-service" — explicitly named: staff can access paystubs, update their own info, and request time off.

Item 10 is the single most consequential finding here — it directly contradicts an assumption already recorded in the master PRD.

---

## 1. Change to Users & Roles (updates master PRD Section 1)

The master PRD scoped **Employee/Technician as "notification recipient only in v1"** and explicitly deferred employee login to v2 (Open Question #5). Vagaro's own payroll product treats employee self-service — paystubs, profile updates, time-off requests — as a baseline expectation, not an advanced feature.

**Recommendation: bring employee login into v1, scoped narrowly.** Not full app access — just enough for payroll's own PTO and paystub loop to work without the admin acting as a manual intermediary for every time-off request and pay question. This is a scope increase from the master PRD; flag it to whoever owns the roadmap before treating it as settled (see Section 9).

**Revised role table:**

| Role | Description | v1 Access |
|---|---|---|
| **Admin/Owner** | Runs the business — books jobs, manages packages, runs payroll, views reporting. | Full access to all modules. |
| **Employee/Technician** | Performs the job. Now also a limited authenticated user (updated from notification-only). | Push/SMS job notifications (unchanged), **plus** a scoped self-service view: their own paystubs, their own profile/bank account info, submitting time-off requests. No access to other employees' data, financials, bookings they aren't assigned to, or admin settings. |
| **Client (end customer)** | The person getting their vehicle/property detailed. | Unchanged — no app login in v1. |

---

## 2. Data model additions and changes

The master PRD referenced `Employee` and `PayrollRule` without fully specifying either. This addendum defines `Employee` properly and extends `PayrollRule`, and adds four new entities.

### 2.1 `Employee` (newly fully specified)

| Field | Type | Notes |
|---|---|---|
| `id` | — | |
| `name`, `email`, `phone` | string | Email required once self-service login ships (Section 1). |
| `worker_type` | enum(`w2_employee` / `1099_contractor`) | Vagaro's own marketing explicitly calls out supporting both — tax treatment differs materially between the two, see Section 8. |
| `roles` | array → `EmployeeRole` (below) | An employee can hold more than one role, each with its own pay type/rate — this is what the "Front Desk $15/hr vs. Stylist $20/hr" selector represents. |
| `payment_method` | enum(`direct_deposit` / `check`) | |
| `bank_accounts` | array of `{id, bank_name, account_last4, is_default}` | Populated via Section 6's self-service flow or by an admin on the employee's behalf. |
| `active` | boolean | Archived vs. currently employed. |
| `created_at`, `updated_at` | metadata | |

### 2.2 `EmployeeRole` (new)

| Field | Type | Notes |
|---|---|---|
| `employee_id` | FK → Employee | |
| `role_name` | string | e.g., "Front Desk," "Detailer/Stylist." Distinct from job title generally — this is specifically the *pay basis* label. |
| `pay_type` | enum(`hourly` / `commission`) | The two pay models the screenshots show side by side. |
| `hourly_rate` | currency, nullable | Set when `pay_type = hourly`. |
| `commission_rate` | percentage, nullable | Set when `pay_type = commission`; this is the rate `PayrollRule` (below) applies against booking revenue, and is what the master PRD's `Booking.split_allocations` divides between employees on a multi-staff job. |

This reconciles the two payroll models that otherwise look like a conflict: the master PRD's booking-level commission split (Section 6 of the master doc) is the `commission` pay type here; the screenshots' hourly front-desk rate is the `hourly` pay type. Real mobile detailing businesses plausibly need both — a dispatcher/front-desk employee paid hourly, detailers paid per job.

### 2.3 `PayrollRule` (extended from master PRD)

Master PRD had `type` as `percentage` / `flat` / `tiered`. Add:

| Field | Change |
|---|---|
| `type` | Add `hourly` as a fourth option, so a rule can define "pay this role's hourly rate straight through" as well as the existing commission-style options. |
| `applies_to_role` | New field — a rule can now be scoped to an `EmployeeRole.role_name` rather than only to an employee or to everyone, since pay structure in these screenshots is fundamentally role-based ("Custom pay & commission rates... based on roles or services"). |

### 2.4 `TimeLog` (new)

| Field | Type | Notes |
|---|---|---|
| `id` | — | |
| `employee_id` | FK → Employee | |
| `role_name` | string | Which `EmployeeRole` this time is logged against — matters because the same employee might have two roles with two rates. |
| `date` | date | |
| `hours` | decimal | |
| `source` | enum(`manual_entry` / `derived_from_booking`) | Detailer hours can plausibly be auto-derived from a booking's scheduled/actual duration; front-desk/hourly roles need manual clock-in or manual entry since they're not tied to a specific booking. Flagged as an open question in Section 8. |
| `linked_booking_id` | FK → Booking, nullable | Set when `source = derived_from_booking`. |
| `approved` | boolean | Whether this log has been reviewed/locked ahead of a payroll run. |

### 2.5 `TimeOffRequest` (new)

| Field | Type | Notes |
|---|---|---|
| `id` | — | |
| `employee_id` | FK → Employee | |
| `start_date`, `end_date` | date | |
| `status` | enum(`pending` / `approved` / `denied`) | |
| `requested_at` | timestamp | |
| `reviewed_by`, `reviewed_at` | FK → Employee (admin), timestamp, nullable | |
| `note` | text, optional | |

Matches the screenshot's approve/deny modal exactly ("Approve Time Off Request — Are you sure you want to accept the time off request by Nick Williams?").

### 2.6 `PayrollRun` (new)

| Field | Type | Notes |
|---|---|---|
| `id` | — | |
| `period_start`, `period_end` | date | The "Payroll Period" selector (e.g., "Dec 8 to Dec 14"). |
| `duration_type` | enum(`weekly` / `biweekly` / `monthly` / `custom`) | The "Payroll Duration" selector. |
| `status` | enum(`draft` / `processing` / `paid` / `failed`) | |
| `line_items` | array of `{employee_id, hours, hourly_pay, commission_revenue, commission_pay, tips, gross_pay, net_pay, payment_method, bank_account_id}` | One entry per employee included in the run. `commission_revenue`/`commission_pay` draw from completed bookings' `split_allocations` in the period; `hourly_pay` draws from approved `TimeLog` entries in the period. |
| `run_by` | FK → Employee (admin) | |
| `run_at` | timestamp | |
| `report_url` | string, nullable | Output of "Run Report." |

---

## 3. Use Case: Role & Pay Rate Setup

**User stories**
- As an admin, when I add or edit an employee, I can assign them one or more roles, each with its own pay type (hourly or commission) and rate.
- As an admin, I can see and edit an employee's roles/rates at any time from their profile — not just at hire.
- As an admin, I can define a default rate per role (e.g., "Front Desk defaults to $15/hr") that pre-fills when assigning a new employee to that role, via `PayrollRule.applies_to_role`.

**Key screen:** Employee profile → Roles & Pay tab — matches the "Zoe Stevens / Select Role: Front Desk $15/hr / Stylist $20/hr" pattern from the screenshots, generalized to support more than two roles.

---

## 4. Use Case: Time Tracking

**User stories**
- As an admin, I can see a log of hours per employee per role per day (Date / Employee / Role / Hours, matching the screenshot's table exactly).
- As an admin, for hourly roles, I can review and approve logged hours before they flow into a payroll run.
- As a detailer paid by commission, my job-based pay doesn't require a separate manual time entry — it's derived from completed bookings, consistent with the master PRD's existing booking/commission model.
- As an hourly employee (post self-service login), I can see my own logged hours.

**Open question carried to Section 8:** the screenshots don't show *how* hours get logged (clock-in/out vs. manual entry vs. scheduled-shift-equals-hours-worked) — flagged rather than guessed.

---

## 5. Use Case: Time Off / PTO Management

**User stories**
- As an employee (post self-service login), I can submit a time-off request with a date range and optional note.
- As an admin, I see pending time-off requests and can approve or deny each one via a confirmation modal, exactly as shown: "Approve Time Off Request — Are you sure you want to accept the time off request by [Name]?" with Cancel/Approve actions.
- As an admin, approved time off should visibly block that employee from being assigned to new bookings in that date range on the Calendar (ties to the master PRD's booking assignment flow — flag this integration point explicitly rather than building PTO as an island).

**Key screens:** Admin — Time Off requests queue + approval modal. Employee — request time off, view request status/history.

---

## 6. Use Case: Running Payroll

**User stories**
- As an admin, I select a payroll period (date range) and duration type, then run payroll — the screenshots' "Payroll Period: Dec 8 to Dec 14," "Payroll Duration: By Payroll Period," and the primary "Run Payroll" action.
- Before finalizing, I can review a draft: every employee included, their hours/commission revenue for the period, gross pay, and net pay — so nothing pays out unreviewed.
- As an admin, once I run payroll, each employee's `PayrollRun.line_items` entry is created, the run is marked `paid` once the payment method executes, and each employee gets a confirmation — the "You Got Paid" pattern from the screenshots, sent to the employee.
- As an admin, I can separately "Run Report" for a given period without executing a payment — for reconciliation or export, distinct from actually paying people.

**Key screens:** Payroll → New Run (period + duration selection) → Review draft → Run Payroll (confirmation) → Run history/detail. Reporting is a separate, lighter-weight "Run Report" action from the same period selector.

---

## 7. Use Case: Payment Methods & Direct Deposit

**User stories**
- As an admin, I set each employee's payment method (direct deposit or check) and, for direct deposit, their bank account.
- As an employee (post self-service login), I can add or update my own bank account rather than routing every change through the admin — the screenshot explicitly shows "Employee Bank Account: Wells Fargo ending in 9012 / Add New Bank Account" as a self-service action.

**Data handling note:** bank account entry is one of the few places in this entire product where real financial credential handling matters. Do not build a custom bank-linking flow — use a payments/payroll processor's hosted, PCI/NACHA-compliant account-linking component (Plaid-style bank linking or whatever your chosen payroll processor provides, see Section 9) rather than storing raw account/routing numbers in DetailHub's own database.

---

## 8. Use Case: Employee Self-Service Portal

**User stories**
- As an employee, I can log in (scoped account, see Section 1) and see: my upcoming assigned jobs, my paystubs/payment history, my logged hours, and my time-off requests and their status.
- As an employee, I can update my own contact info and banking details without needing the admin to do it for me.
- As an employee, I receive a "You Got Paid" confirmation when a payroll run pays out to me.

**Key screens:** a lightweight employee-facing mobile view — Paystubs list, Profile/Bank Account, Time Off (request + history), Upcoming Jobs (read-only, reusing booking data already assigned to them per the master PRD).

---

## 9. Use Case: Tax Filing & Compliance — flagged, not scoped

The screenshots market "automatic tax filing and compliance" as a core payroll benefit. **This is explicitly called out here as a build-vs-buy decision, not a feature to build from scratch.** Payroll tax withholding, filing, and compliance (federal, multi-state, W-2 vs. 1099 handling, unemployment insurance, etc.) is a heavily regulated domain with real legal and financial liability if done incorrectly — it is not comparable in effort or risk to any other feature in this PRD.

**Recommendation:** integrate a third-party embedded payroll/compliance provider (e.g., a payroll-as-a-service API) rather than building tax logic in-house, and treat this as its own vendor-selection and legal-review workstream separate from the rest of DetailHub's engineering timeline. Do not let "automatic tax filing" ship as a bullet point on a features list without that underlying decision made explicitly.

**Not scoped further in this document** — deliberately, since the right answer depends on a vendor/legal decision this PRD can't make.

---

## 10. How this merges into the master PRD

- **Replace** master PRD Section 6 ("Use Case: Payroll Management") in full with Sections 2–9 above.
- **Update** master PRD Section 1 (Users & Roles) with the revised role table in Section 1 above.
- **Update** master PRD Section 2 (Data Model Overview) to add `Employee` (now fully specified), `EmployeeRole`, `TimeLog`, `TimeOffRequest`, and `PayrollRun` to the entity table.
- **Update** master PRD Section 8 (Open Questions): mark **Question #5 as superseded** — was "notification-only for v1," now "scoped self-service login in v1, see Payroll addendum Section 1" — and append the new open questions in Section 11 below.
- Section 4 (Sales Reporting) in the master PRD should be checked for consistency: "Revenue per employee" already references payroll's split allocations; no change needed, but note the new `PayrollRun` entity as the eventual source of truth for what actually got paid out, versus Sales Reporting's revenue-attribution view of what was *earned*. These two numbers can legitimately differ (e.g., a payroll run spanning a different period than a reporting query) — worth a short note in Section 4 that "revenue per employee" and "payroll paid per employee" are related but not identical figures.

---

## 11. New Open Questions (append to master PRD Section 8)

| # | Question | Proposed default |
|---|---|---|
| 10 | Payroll/tax processor vendor — who actually executes direct deposits, check printing, and tax filing? | Not decided — flagged as its own vendor-selection workstream (Section 9), not a default to guess at. |
| 11 | How are hours logged for hourly roles — clock-in/out, manual entry, or scheduled-shift-equals-worked? | Manual entry with admin approval, as the simplest v1; clock-in/out as a v1.1 candidate. |
| 12 | Does approved time off block new booking assignments on the Calendar automatically, or just warn the admin? | Warn, don't hard-block, for v1 — avoids a scheduling edge case (urgent reassignment) turning into a dead end. |
| 13 | Scope of employee self-service login — just payroll/PTO, or eventually the full booking/calendar view? | Scoped to payroll/PTO/profile only for v1, per Section 1. |
| 14 | 1099 contractor handling — do contractors get the same self-service portal, or a reduced version (no PTO, since PTO doesn't typically apply to contractors)? | Reduced: paystub/payment history and profile only, no PTO request flow, for `worker_type = 1099_contractor`. |
