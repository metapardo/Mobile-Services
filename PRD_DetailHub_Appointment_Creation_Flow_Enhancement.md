# Appointment Creation Flow Enhancement — Scope PRD

**Status:** Draft v0.1 — for handoff to frontend-engineer
**Date:** September 2026
**Owner:** Bob (Product)
**Source file:** `artifacts/detail-hub/src/pages/booking-new.tsx` (component: `BookingNew`)

---

## 1. Overview

This scopes seven changes to the "Create appointment" screen, all grounded directly in the current `booking-new.tsx` implementation. This screen is already wired to the real backend (`useCreateBooking`, `useCreateClient`, `useListClients`, `useListPackages`, `useListEmployees` — not mock data), so everything here is a UI/UX rework of a working flow, not new backend plumbing, with two exceptions called out explicitly in Sections 5 and 6.

## 2. Goals

Let an operator create an appointment on the go with the fewest possible taps: add a brand-new customer or package inline, without leaving the flow or filling out fields that don't matter in the moment. Strip out three sections that add friction without adding value today (All-day, Repeats, Team, Deposit & extras — four sections, per Sections 4–6 below). Make the whole screen breathe more on a phone screen.

## 3. Customer & Service selection — page takeover + inline quick-create

### 3.1 Current state

Both "Add customer" and "Add service" open a `BottomSheet` — a partial-height drawer (max 90dvh) that slides up from the bottom over a dimmed backdrop. The customer sheet has a search input, then a separate, always-visible "New customer" row, then (if tapped) a full separate form requiring first name, phone, a **regex-validated email**, and **address** before "Save customer" enables (`newClientValid` in the current code requires all four). The services sheet has no search at all — just a static list of packages grouped by category with checkboxes; if zero packages exist, it shows a prompt that deep-links away to Settings > Packages.

### 3.2 Requirements

| # | Requirement |
|---|---|
| FR-1 | Replace the `BottomSheet` pattern with a full-screen, top-anchored page takeover for both the customer picker and the service picker specifically (not the date picker, which stays a bottom sheet — out of scope here). Its own header (back/close + title), no dimmed backdrop needed since it's fully opaque, occupies the full viewport rather than a partial drawer. |
| FR-2 | **Customer picker:** collapse today's two-step "search, then a separate static New customer row" into one live flow. As the operator types into a single name field, it should simultaneously (a) filter existing clients by name/phone the way `filteredClients` already does, and (b) surface a contextual "Add '[whatever they typed]' as new customer" action inline in the results — not a static row that's always there regardless of what's typed. |
| FR-3 | **Quick-add customer fields: First name, Last name, phone number only.** This is a real reduction from today's validation — the current `newClientValid` requires a regex-valid email and a non-empty address before the save button even enables; both become optional/dropped for the quick-add path. Split whatever was typed into the search field on the first space to pre-fill First/Last name (e.g., typing "John Smith" pre-fills First: John, Last: Smith) rather than making the operator retype it. |
| FR-4 | Dropping address from quick-add is deliberately fine: the appointment's own "Location" section already independently captures the service address for this specific job (`address` state, separate from the client record). A quick-added client simply won't have a home address on file until someone adds one later from the Clients page — that's an acceptable trade for speed, not an oversight, but flag it to whoever reviews this so it's a conscious call, not a surprise. |
| FR-5 | **Service picker:** same pattern — a live search-as-you-type field filtering the existing `pkgsByCategory` list by name, with a contextual "Add '[typed text]' as a new package" action surfaced inline when there's no exact match (or always, so the operator can add a variant even when a similar package exists). This also replaces today's `NothingToPickPrompt` deep-link for the zero-packages case — that escape hatch to Settings goes away in favor of creating the first package right here. |
| FR-6 | **Quick-add package fields — grounded in the real schema, not just what was asked for.** The request said "set a price and some details," but the real `packages` table (`lib/db/src/schema/packages.ts`) has five `NOT NULL` columns beyond name: `category` (enum: Exterior / Interior / Full / Add-on), `description`, `price`, `durationMinutes`, and `isAddon` (boolean). `durationMinutes` in particular is not cosmetic — it's read directly in this same file for total-duration display, the Fuel Gauge calculation, and the Smart Suggestions slot engine (`suggestSlots`). A quick-add form that skips duration will either fail to save (if the API rejects a missing required field) or silently produce a package that breaks those three downstream features. The inline quick-add form needs: name (pre-filled from typed text), price, duration (minutes), category, and description — all in the smallest reasonable set of fields, but all five must be present. `isAddon` can default from category (`Add-on` → true, everything else → false) so it doesn't need its own control. |
| FR-7 | Reuse the existing `useCreatePackage` mutation (already built and working in `pages/packages.tsx`) rather than a new endpoint — this is a real, already-wired hook, not new backend work. |

## 4. Remove All-day and Repeats

### 4.1 Current state

The "Date and time" section has an All-day toggle (`allDay` state) and a "Repeats" row that always displays "Never" with a chevron.

### 4.2 Requirements

| # | Requirement |
|---|---|
| FR-8 | Remove both rows from the "Date and time" section entirely. |
| FR-9 | Worth knowing before you delete this: **Repeats has never actually done anything.** It renders a static "Never" label and chevron with no `onClick`, no picker sheet, nothing wired behind it — it's pure decoration in the current code. All-day's `allDay` state is tracked locally but is never included in the `useCreateBooking` payload either — flip it today and nothing downstream changes. Removing both is pure cleanup with zero behavioral risk; there's no hidden dependency to preserve. |

## 5. Remove Team selection

### 5.1 Current state — and why this is safer than it looks

The "Team" section lets the operator assign one or more employees via a bottom sheet, and today `canSave` hard-requires `selectedEmployees.length > 0` before the booking can be saved.

**This is a UI-only removal, confirmed against the real API contract, not a guess.** The generated API spec (`lib/api-zod/src/generated/api.ts`) states explicitly: *"`employeeSplit` may be empty (a booking can be created before an employee is assigned)."* The backend already fully supports zero employees on a booking — no schema or API change is needed here.

Two things already degrade gracefully without a UI element, so no new fallback logic needs to be written:
- The **Fuel Gauge** calculation already falls back to the first employee (`employees[0]?.id`) when `selectedEmployees` is empty (see the `syntheticBooking.employeeIds` line in the current code) — it will keep working exactly as it does today.
- **Smart Suggestions** (`suggestSlots`) doesn't take `selectedEmployees` as an input at all — it computes candidate employees per slot internally, and tapping a suggestion already calls `setSelectedEmployees([slot.employeeId])` behind the scenes. That auto-assignment path keeps working even with the Team section's UI gone.

### 5.2 Requirements

| # | Requirement |
|---|---|
| FR-10 | Remove the "Team" `Section` block and its "Assign team member" bottom sheet from the rendered UI. |
| FR-11 | Remove `selectedEmployees.length > 0` from the `canSave` boolean — the backend doesn't require it, so the frontend shouldn't either. |
| FR-12 | Keep the `selectedEmployees` state variable itself and its use inside `applySuggestion` and the Fuel Gauge `useMemo` exactly as-is — only the explicit picker UI goes away, not the state that Smart Suggestions and Fuel Gauge quietly depend on. |
| FR-13 | If an appointment is saved with no employee assigned at all (operator never taps a Smart Suggestion and no employee gets auto-set), confirm with whoever owns Team/Payroll whether "unassigned" bookings need a follow-up assignment step somewhere else (e.g., on the booking-detail page) — this PRD doesn't scope that follow-up UI, just flags that removing the only assignment point in the creation flow makes it a real possibility, not a hypothetical. |

## 6. Remove Deposit & extras

### 6.1 Current state — and two real dependencies to resolve, not just delete

The "Deposit & extras" section captures a deposit amount and a parking cost. Both feed logic beyond the section itself:

- `depositAmount` currently drives the booking's initial `status`: `parseFloat(deposit) > 0 ? 'confirmed' : 'pending'`. Remove the input and this expression always evaluates to `'pending'` — that's a silent behavior change, not a neutral one.
- The primary "Save" button's label currently reads "Charge $X Deposit" when a deposit is entered. **Worth flagging regardless of this change:** nothing in `handleSave` actually charges anything — no payment processor call happens anywhere in this file. The button has been promising a charge that never occurs. Removing this section also quietly fixes that pre-existing, slightly misleading copy.
- `parkingCost` is sent to the API as `parseFloat(parking) || 0` today. Interestingly, the live Fuel Gauge *preview* shown during creation already hardcodes `parkingCost: 0` in its synthetic booking regardless of what's typed in this field — so the field's value has never actually affected the ROI preview the operator sees while booking. It only affects the persisted booking record.

### 6.2 Requirements

| # | Requirement |
|---|---|
| FR-14 | Remove the "Deposit & extras" `Section` block (both the deposit and parking inputs) from the rendered UI. |
| FR-15 | **Decide the new default status** for a freshly created booking now that deposit-based status logic is gone. Recommend defaulting to `'confirmed'` — being on the calendar at all is a reasonable bar for "confirmed" once there's no deposit gate — but this is a real product decision, not an engineering default; confirm before building rather than picking silently. |
| FR-16 | Send `depositAmount: 0` and `parkingCost: 0` on every create-booking call going forward — both remain `NOT NULL` columns on the real `bookings` table, so they still need a value, just always zero from this flow now. |
| FR-17 | **Parking cost isn't being deleted as a concept, just removed from this screen** — confirm whether it should become capturable somewhere else (e.g., at Checkout, closer to when the actual job happens and the real parking cost is known) rather than guessed at booking time, which is arguably a more accurate place for it anyway. Flag this to whoever owns Checkout/Fuel Gauge rather than treating "removed from appointment creation" as "removed from the product." |
| FR-18 | Update the CTA button label logic accordingly — it can no longer say "Charge $X Deposit" once the deposit input is gone; a single consistent label ("Book Appointment") is correct once this section is removed. |

## 7. Mobile-friendly layout pass

| # | Requirement |
|---|---|
| FR-19 | With four things removed (All-day, Repeats, Team, Deposit & extras), the screen has real room to breathe — use it. Increase vertical spacing between the remaining sections (Customer, Services, Location, Smart suggestions, Date and time, Notes) rather than leaving the tightened-up spacing that was tuned for a longer form. |
| FR-20 | Audit touch target sizes on the remaining interactive rows (customer/service pill buttons, date/time button, package rows in the takeover) for comfortable one-thumb tapping — most already look reasonably sized in the current code (py-3 to py-4 range), but do a real pass rather than assuming, especially inside the new page-takeover components from Section 3, which are new surfaces without an existing pass. |
| FR-21 | This is already a mobile-primary screen (`isMobile = !setup.isStorefront` already exists as a concept in this file) — this pass is about polish and spacing on an already-mobile-first layout, not a responsive redesign from scratch. |

## 8. Summary of what's explicitly NOT changing

To keep the frontend agent from over-scoping: the date picker stays a bottom sheet (only Customer and Service become page takeovers, per FR-1). Smart Suggestions, Fuel Gauge, and the Location/address field are untouched functionally — they're referenced above only because Team's removal touches their inputs. Notes stays exactly as-is. No backend schema changes are required anywhere in this PRD — every requirement here is achievable against the existing `bookings`, `clients`, and `packages` API surface as it stands today.

## 9. Open Questions

What should the new default booking `status` be once deposit-based logic is removed (FR-15) — recommend `'confirmed'`, needs sign-off. Should parking cost move to Checkout instead of disappearing from the product entirely (FR-17)? Does an "unassigned" booking (no employee ever set, per FR-13) need a follow-up assignment surface elsewhere, and if so, is that in scope for whoever picks this PRD up next or a separate PRD? For the quick-add package form (FR-6), should `category` default to something sensible (e.g., "Full") to shave one more decision off the fast path, or should every quick-add require an explicit category choice since it affects how the package displays in the picker's grouped list?
