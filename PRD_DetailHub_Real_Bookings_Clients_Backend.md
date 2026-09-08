# DetailHub Real Bookings & Clients Backend — Product Requirements Document

**Status:** Draft v0.1
**Date:** August 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform (Rare Air)

---

## 1. Overview

Everything in `detail-hub` today — the calendar, client profiles, the empty states just scoped in the self-serve signup PRD — reads and writes `src/lib/mock-data.ts`'s in-memory arrays, not a real database. This PRD is the concrete execution spec for turning that into a real backend: Drizzle tables for bookings and clients (plus the minimum viable Employee and Package tables those depend on), row-level security, CRUD API routes, and the actual rewiring of `calendar.tsx` and `clients.tsx` off mock data and onto real queries. This is Tier 1 foundation work per the gap analysis — nothing else in the product (the empty states, the guided tour, real signup) is actually real until this exists.

## 2. Why This Can't Stay Scoped to Just "Bookings and Clients"

Booking records reference an assigned employee and one or more packages/line items. If bookings and clients go real while employees and packages stay mock-only, a real booking has nowhere valid to point — its `employee_id` and `package_id` fields would reference IDs that don't exist in any real table. So this PRD includes a **minimum viable Employee table and Package table** as hard dependencies, not optional extras:

- **Package:** full CRUD, since it's simple, self-contained, and already fully specified in the master PRD (Section 5) — id, name, category, description, price, duration estimate, is_addon, active.
- **Employee:** a minimal table only — id, organizationId, name, active — just enough to assign a booking to someone and show a name in the UI. The full Employee model (worker type, roles, pay rates, bank accounts) belongs to `PRD_DetailHub_Payroll_Module.md` and should be layered onto this same table later, not designed twice. Flag this coordination point to whoever builds payroll next: extend this table, don't replace it.

Payroll's own tables (`EmployeeRole`, `TimeLog`, `TimeOffRequest`, `PayrollRule`, `PayrollRun`) and `AdminSettings`'s broader fields (gas price, financial dashboard assumptions, etc.) are explicitly **out of scope here** — those stay on mock data until their own PRDs get built out.

## 3. Relationship to the Implementation Plan

This is the concrete execution of Implementation Plan Phase 1 ("formalize `mock-data.ts`'s interfaces into real Drizzle tables"), scoped specifically to Booking, Client, Package, and minimal Employee — not literally every interface in `mock-data.ts` at once. It must be built **after** Phase 1B's multi-tenancy foundation (already done) and follows the same non-negotiable rule already established there: every business-owned table gets a `NOT NULL organizationId` foreign key and a row-level security policy, no exceptions, no table pushed to Neon without it.

## 4. Goals & Success Metrics

A real account (created via the self-serve signup flow) can create a client, create a booking assigned to a real employee and real package, see it on the calendar, edit it, and see it persist across a page reload and a new login — all against Postgres, with zero reads from `mock-data.ts` on these two pages. Cross-organization data isolation is verified, not assumed: a query under one organization's session can never return another organization's rows.

## 5. Non-Goals (v1)

No migration of payroll, settings, or checkout/payment pages in this pass — they stay on mock data until their own scoped efforts. No bulk data import/export. No offline support or optimistic local caching beyond whatever TanStack Query gives by default. No changes to the booking/client data *shape* beyond what's needed to formalize it — this is a backend-reality project, not a redesign.

## 6. Functional Requirements

### 6.1 Schema

| # | Requirement |
|---|---|
| FR-1 | `clients` table: `id`, `organizationId` (NOT NULL, FK), `name`, `email`, `phone`, `address`, `notes`, `createdAt`, `updatedAt`. |
| FR-2 | `employees` table (minimal): `id`, `organizationId` (NOT NULL, FK), `name`, `active`, `createdAt`, `updatedAt`. Designed for extension by the Payroll Module PRD, not replacement. |
| FR-3 | `packages` table: `id`, `organizationId` (NOT NULL, FK), `name`, `category`, `description`, `price`, `durationEstimate`, `isAddon`, `active`, `createdAt`, `updatedAt` — per master PRD Section 5. |
| FR-4 | `bookings` table, matching the master PRD's Booking entity (Section 3.1) field-for-field: `clientId`, `clientEmail`, `clientPhone`, `serviceAddress`, `scheduledDate`, `scheduledStartTime`, `estimatedDuration`, `assignedEmployeeIds` (array or join table — see Open Questions), `lineItems`, `subtotal`/`tax`/`totalPrice`, `depositAmount`/`depositStatus`, `parkingCost`, `status`, `notes`, `waiverSent`/`waiverSigned`, plus `organizationId` (NOT NULL, FK), `createdAt`/`updatedAt`/`createdBy`. |
| FR-5 | `gasMeterStatus` and `weatherSnapshot` fields exist on the schema per the master PRD but are **nullable and unpopulated by this PRD** — those depend on geocoding/weather API integrations not yet wired (per the gap analysis). Don't block this PRD on that; leave the columns ready for when those integrations land. |
| FR-6 | Every table above gets Postgres row-level security enabled, with a policy comparing `organizationId` to `current_setting('app.organization_id')`, written as a manual migration (Drizzle-kit doesn't generate RLS automatically) — matching the exact convention already established in Phase 1B. |

### 6.2 API routes

| # | Requirement |
|---|---|
| FR-7 | Full CRUD routes for `clients`: list, get by id, create, update, delete (or archive — decide per Open Questions). |
| FR-8 | Full CRUD routes for `packages`, matching the same pattern. |
| FR-9 | Minimal routes for `employees`: list and get by id are required now; create/update can be a simple form for v1 since the full employee management UI belongs to Payroll. |
| FR-10 | Full CRUD routes for `bookings`, plus a date-range list query (`GET /bookings?start=&end=`) to power the calendar view efficiently rather than fetching every booking ever made. |
| FR-11 | Every route sets the `app.organization_id` session variable from the authenticated user's organization before running any query, per the existing non-negotiable convention — a route that skips this is a bug, not an edge case. |
| FR-12 | `openapi.yaml` is updated for every new route, and `lib/api-zod`/`lib/api-client-react` are regenerated via the existing orval pipeline — never hand-edit the generated packages. |

### 6.3 Frontend rewire

| # | Requirement |
|---|---|
| FR-13 | `calendar.tsx` reads and writes bookings via the generated TanStack Query hooks against the real API — no `mock-data.ts` booking reads remain on this page. |
| FR-14 | `clients.tsx` (list and detail/profile views) reads and writes clients via the same pattern. |
| FR-15 | The booking create/edit form's employee and package selectors read from the real `employees`/`packages` endpoints, not mock arrays — this is what makes FR-2/FR-3's minimum-viable tables necessary rather than optional. |
| FR-16 | This migration happens on these two pages only, per the existing established convention ("page-by-page, not a big-bang rewrite") — payroll, settings, checkout, and package-admin pages keep reading mock data for now and are explicitly unaffected. |
| FR-17 | The empty states scoped in `PRD_DetailHub_SelfServe_Signup_Trial.md` (calendar and clients list) now reflect real query results (zero rows for a new organization) rather than an empty mock array — confirm they still render correctly against a real, genuinely-empty query response, not just an empty mock array shaped the same way. |

## 7. Data Requirements

| Data | Source | Notes |
|---|---|---|
| Existing `mock-data.ts` interfaces | `artifacts/detail-hub/src/lib/mock-data.ts` | Source of truth for field names/types — formalize what's already proven out, don't invent a new shape. |
| Organization/session context | Better Auth + Organization plugin (Phase 1B) | Already built; every new route depends on it. |
| Booking's `packageId`/`employeeId` references | New `packages`/`employees` tables (FR-2, FR-3) | Must exist and be seedable before booking creation is meaningfully usable. |

## 8. Edge Cases

| Case | Handling |
|---|---|
| A booking form loads before any employee or package exists in a brand-new account | Show the same empty-state pattern as calendar/clients — "Add a package before booking a job" / "Add an employee to assign this job to" — don't let the booking form silently fail or show an empty, unexplained dropdown. |
| A query somehow omits the organization scope | Treat as a bug to catch in review, not an acceptable edge case — this is the actual security boundary between tenants (per Phase 1B's own framing). |
| Multi-employee bookings (`assignedEmployeeIds`) | Decide array column vs. join table before building (see Open Questions) — affects both the schema and the query shape for FR-10's date-range list. |
| A client or employee gets archived/deleted while referenced by an existing booking | Prefer soft-delete/archive over hard delete for clients, employees, and packages, so historical bookings don't end up with dangling references. |

## 9. Phased Rollout

**Phase 1:** Schema + RLS for all four tables (FR-1–FR-6), full CRUD routes (FR-7–FR-12).

**Phase 2:** Frontend rewire of `calendar.tsx` and `clients.tsx` (FR-13–FR-17), including the booking form's employee/package selectors.

**Phase 3 (adjacent, not required to close this PRD):** Full employee management UI (owned by the Payroll Module PRD) and full package administration UI, both of which can now build on the tables this PRD creates rather than needing their own schema work.

## 10. Risks & Open Questions

Should `assignedEmployeeIds` on a booking be a Postgres array column or a proper join table (`booking_employees`)? A join table is more normalized and easier to query/report against later (per the master PRD's "revenue per employee" reporting need); an array is faster to ship now. Recommend the join table given reporting is already a named use case, but flag as a decision, not a default. Should client/employee/package deletion be soft (archive flag) or hard? Recommend soft, per the edge case above, but confirm before backend-engineer builds it either way. Does the booking form need a guided fallback when no employees/packages exist yet (see Edge Cases), or is that acceptable to leave as a rough edge for this pass and polish later? Worth a quick decision since it affects whether Phase 2 needs extra UI work beyond a straightforward rewire.
