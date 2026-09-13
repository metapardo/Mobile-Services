# First-Run Onboarding — Scope PRD

**Status:** Draft v2.1 — for handoff to frontend-engineer / backend-engineer
**Date:** September 2026
**Owner:** Bob (Product)
**Source files:** `artifacts/detail-hub/src/components/auth-gate.tsx`, `components/setup-wizard.tsx`, `pages/booking-new.tsx`, `pages/reporting.tsx`, `pages/calendar.tsx`, `lib/db/src/schema/settings.ts`, `lib/db/src/schema/employees.ts`, `artifacts/api-server/src/routes/auth.ts`, `artifacts/detail-hub/DESIGN.md`
**Reference assets (Bob-supplied, in `attached_assets/`):** `Onboarding_Screen1_Welcome_iPhone_Frame_Reference_2026-09-12.png`, `Onboarding_Screen5_Weather_SmartScheduler_Reference_2026-09-12.png`

**v2.0 changes:** replaces v1.0's 3-screen outline with the full 6-screen flow below (real copy, real screen order, a reference layout image). Team size is no longer informational-only — v1.0 held off on creating employee records because placeholder names ("Teammate 1") would look bad on the calendar; this version collects real names during onboarding, which removes that objection (§5, Screen 2). That also means this version reverses a recent, deliberate removal elsewhere in the app — flagged prominently in §6, not buried.

**v2.1 changes:** Bob supplied two specific reference images and assigned them to screens — Screen 1 now has a named hero-graphic source (FR-7a) and Screen 5 now has a named reference screenshot (FR-17a) instead of a generic "capture this later" placeholder. See those FRs for details, including one discrepancy the Screen 5 image surfaces that's worth a straight answer (§10).

---

## 1. Problem

Two gaps, both grounded in the current code, not assumed:

1. **Fuel Gauge is silently broken for every new signup** — unchanged from v1.0's finding. `POST /auth/signup` passes the signup form's free-text address straight into `createDefaultSettings`, never geocoded, so `settings.hqGooglePlaceId`/`hqLatitude`/`hqLongitude` stay null and every booking resolves to `grade: 'unknown', reason: 'no-hq'` until the owner manually finds Settings → Home Base Address. Nothing tells them to. Screen 3 (§5) closes this.
2. **The app's multi-technician features exist in code but have no discovery path.** `employeesTable`, the "Revenue by employee" report (`reporting.tsx`), and calendar's per-technician color-coding (confirmed functional, not decorative, per this project's own `.impeccable/config.json` detector exemption) all already work — but nothing in onboarding, or anywhere else, tells a new owner they can add teammates, and the appointment-creation flow's own team-assignment picker was deliberately *removed* in a recent pass (`PRD_DetailHub_Appointment_Creation_Flow_Enhancement.md` FR-10–FR-13, see §6). A "just me" solo operator and a 4-person crew get an identical first day.

## 2. Goals

- Every new organization leaves onboarding with a **geocoded** HQ, closing the Fuel Gauge gap as a forcing function.
- Every new owner sees the app's headline capabilities before landing on a cold calendar.
- Solo operators and small teams get an onboarding path that actually shapes the app around their answer — not just a stored preference nobody reads back.
- Ship in Mobull's own visual language (`DESIGN.md`'s "Night Instrument Panel" system), using the reference image only for layout/interaction pattern — see §3.

**Non-goals:** heavier business-setup fields (EIN, bank, payment processor) stay in the existing `SetupWizard`. Real email invitations remain out of scope (§7). See §9 for the full list.

## 3. Creative direction — what to take from the reference image, and what not to

The attached reference (a fintech app's onboarding carousel) is useful for **layout and interaction pattern**, not for color or material:

**Take from it:** full-bleed graphic filling the upper 2/3 of the screen, a high-contrast headline directly below it, one line of supporting copy, dot pagination, and a primary CTA pinned to the bottom safe area. This maps almost exactly onto a pattern already built in this codebase — `components/setup-wizard.tsx`'s `ProgressDots` + `NextBtn` — so the interaction shell is closer to a reuse than a build.

**Do not take from it:** the reference's palette (deep violet-to-black gradients, warm orange/pink 3D-rendered objects) is a different brand entirely, and it collides directly with two things `DESIGN.md` states explicitly: the Single-Accent Rule (Signal Blue `#2DA8FF` is *the one* accent — the reference uses several competing warm/cool hues at once) and the system's own written warning not to reintroduce "the retired 'Rare Air' orange/coral gradient." Execute onboarding in Mobull's actual system — Abyssal Navy background (`#03111F`), glass cards, Signal Blue CTA, Frost White type — not the reference's colors.

**Per-screen graphics:** where a screen represents a real feature (Fuel Gauge, Weather/Smart Scheduler), reuse the feature's real icon/component (e.g. `FuelGaugeIcon`) rather than commissioning new abstract 3D art — same principle already applied in `PRD_Mobull_Marketing_Site_Value_Props.md`. Screens 1 (Welcome) and 2 (Team) represent no existing feature and need a small amount of new, on-brand iconography — flagged in §10, not scoped here.

| # | Requirement |
|---|---|
| FR-1 | Full-screen page takeover (not a `BottomSheet`), dot pagination (`ProgressDots` pattern from `setup-wizard.tsx`), primary CTA pinned to the bottom safe area (`NextBtn` pattern). |
| FR-2 | Palette, type, radii, and glass treatment come from `DESIGN.md` exclusively — Abyssal Navy background, Signal Blue as the single accent on the CTA, Frost White text, 16px card radius. The reference image is not a palette source. |
| FR-3 | Mobile-first: build and test at phone width first (this is the only viewport onboarding needs to nail — the desktop sidebar/bottom-bar split in `DESIGN.md`'s Layout section doesn't really apply to a full-screen takeover), then confirm it doesn't break wider. |

## 4. Where this fits

`AuthGate` (`components/auth-gate.tsx`) already gates every route but `/`, `/login`, `/signup` on `authenticated && organizationId`. Add one more gate state, checked right after: if `settings.onboardingComplete` is `false`, render this flow full-screen instead of `<AppShell>`.

| # | Requirement |
|---|---|
| FR-4 | Add `onboardingComplete boolean not null default false` to `settingsTable`. |
| FR-5 | **Migration:** backfill `onboardingComplete = true` for every existing settings row at ship time — this flow is for new signups only; forcing it retroactively on active accounts is a regression. |
| FR-6 | `AuthGate` checks `settings.onboardingComplete` right after its existing `organizationId` check. `false` → onboarding; `true` → `<AppShell>` as today. |

## 5. Screens

### Screen 1 — Welcome

- **Title:** Welcome to Mobull
- **Subhead:** Your AI mobile business platform
- **CTA:** Continue

| # | Requirement |
|---|---|
| FR-7 | High-contrast display-scale headline (`DESIGN.md`'s Display type: semibold, 1.875–2.25rem), one line of Body-scale supporting copy, no data collected on this screen. |
| FR-7a | **Hero graphic:** extract just the iPhone hardware/device-frame render from `attached_assets/Onboarding_Screen1_Welcome_iPhone_Frame_Reference_2026-09-12.png` (Bob-supplied) — the tilted-phone product-photo treatment, not the calendar content shown inside it — and use that device frame as the screen's full-bleed upper graphic, per §3's layout pattern. Composite the "Welcome to Mobull" headline and subhead over or beside the frame (not inside the phone's screen area — that space stays the extracted hardware image, or a placeholder app-icon/logo mark if the empty-screen look reads badly). This is an asset-extraction task, not a design decision: whatever's actually inside that phone's screen in the source image is not what Screen 1 is about, only the device shell/lighting is being reused. |

### Screen 2 — Team

- **Prompt:** What's your team look like?
- **Options:** Just me / Team

| # | Requirement |
|---|---|
| FR-8 | "Just me" → no further input on this screen, no `employees` rows created, advance to Screen 3. |
| FR-9 | "Team" → reveals exactly **3** name input fields (flat inputs per the Flat Input Rule — no glass treatment), per the source spec. **⚠ Confirm before building:** is 3 a hard cap for v1, or is that just the number shown in the reference content and a 4th/5th teammate should be addable? Building to a literal 3-field cap is the safe default absent an answer, but worth a real decision — teams larger than 3 aren't uncommon in this product's own category (`BUSINESS_CATEGORIES` in `setup-store.ts` includes multi-tech categories like landscaping and cleaning crews). |
| FR-10 | On Finish (Screen 6), each non-empty name becomes a real `POST /employees` call: `{ name, color }` — `color` auto-assigned from a small fixed palette (round-robin), everything else left at the endpoint's defaults. Empty name fields (someone selected "Team" but only filled in 1 of 3) are simply skipped, not sent as blank employees. |
| FR-11 | This is a **reversal of a recent, deliberate decision** — see §6. Do not build FR-8–FR-10 without resolving that section first; it changes a screen that was intentionally simplified less than a week before this PRD. |

### Screen 3 — Headquarters

- **Prompt:** Headquarters address input field
- **Supporting copy:** This will help calculate Fuel and drive time costs for Jobs
- **CTA:** Next

| # | Requirement |
|---|---|
| FR-12 | Reuses `AddressAutocomplete` exactly as `settings.tsx`'s Home Base field does — same component, same write target (`settings.homeAddress`/`hqGooglePlaceId`/`hqLatitude`/`hqLongitude` via the existing `PATCH /settings`). No new backend endpoint. |
| FR-13 | "Next" stays disabled until a real suggestion is selected (not just typed) — this is the step that actually closes the §1 Fuel Gauge gap, so a free-text address that never resolves to coordinates defeats the point of the screen. |
| FR-14 | Write through immediately on selection, not deferred to a final save — if the owner abandons onboarding after this screen, the HQ fix has already landed. |

### Screen 4 — Job ROI

- **Title:** Check out your Job ROI
- **Subhead:** Understand what works for your business
- **Visual:** Fuel Gauge screenshot
- **CTA:** Next

| # | Requirement |
|---|---|
| FR-15 | Visual is the real `FuelGaugeIcon` component/gauge graphic, not a new illustration — matches §3's per-screen-graphics principle. |
| FR-16 | A live screenshot of the tap-to-reveal breakdown (per `PRD_Mobull_Marketing_Site_Value_Props.md` §4) is the ideal asset here too; that PRD's screenshot-capture brief (§11 of that document) is still unexecuted (blocked on demo-org access) — reuse whatever gets captured there rather than commissioning a second, separate capture pass. |

### Screen 5 — Drive Informed

- **Title:** Drive informed
- **Subhead:** With weather and Smart Scheduler
- **CTA:** Next

| # | Requirement |
|---|---|
| FR-17 | Combines two features in one screen (Weather Coverage + Appointment Optimizer/Smart Suggestions) — both are real product surfaces, but **Weather Coverage does not exist in the app yet** (`PRD_Mobull_Weather_Coverage.md` is still spec-only, nothing implemented as of this PRD). Do not ship this screen naming weather before that PRD ships — see §10 for sequencing, same dependency v1.0 already flagged for its own weather card. |
| FR-17a | **Reference screenshot:** `attached_assets/Onboarding_Screen5_Weather_SmartScheduler_Reference_2026-09-12.png` (Bob-supplied) is the visual target for this screen's graphic — it shows the booking-creation screen with the Fuel Gauge breakdown ("You keep $94 of $99"), the "Recommended — groups with nearby work" section, and a small weather glyph next to the Date and time field, matching the exact placement `PRD_Mobull_Weather_Coverage.md` FR-7 specifies. Use this image (or a live capture that matches it) as Screen 5's graphic once both dependent features are ready. This supersedes FR-16's generic "reuse whatever gets captured" note for this screen specifically — a concrete target now exists. |
| FR-18 | Smart Scheduler half of this screen can ship independently — the "Recommended — groups with nearby work" carousel in `booking-new.tsx` is real today and can be screenshotted now, per the same capture brief referenced in FR-16. |

### Screen 6 — Get Started

- **Title:** Get Started!
- **CTA:** Next (labeled "Next" per the source spec — confirm this shouldn't read "Get Started" or "Done" to match the title, since "Next" implies another screen follows and this is the last one)

| # | Requirement |
|---|---|
| FR-19 | On this screen's CTA: fire Screen 2's employee-creation calls (FR-10), set `onboardingComplete: true`, redirect into the app (`/calendar`). |

## 6. Team size drives real app behavior — and reverses a recent decision

The request is explicit: team-size data should "turn on Team member selections for Appointments and anywhere else leveraged: Reporting etc." Three concrete surfaces, checked directly against current code:

| Surface | Current state | What this PRD asks for |
|---|---|---|
| **Appointment creation** (`booking-new.tsx`) | No team-assignment UI exists. It was deliberately removed — `PRD_DetailHub_Appointment_Creation_Flow_Enhancement.md` FR-10: *"Remove the 'Team' Section block and its 'Assign team member' bottom sheet from the rendered UI"* — because the backend allows bookings with zero assigned employees and Smart Suggestions auto-assigns anyway. The underlying `selectedEmployees` state and its wiring were kept, just not the picker UI. | Re-add a lightweight assignment control, **shown only when the org has more than 1 employee** (i.e., "Team" was selected and at least one name was entered). A solo org never sees it — nothing to assign. This isn't undoing that PRD's UX reasoning (auto-assignment still works fine for 1 person); it's adding the control back specifically for the case that PRD's simplification didn't need to handle. |
| **Reporting** (`reporting.tsx`) | "Revenue by employee" section renders unconditionally today (`empRevenue`, line ~235/461) — for a solo org this is a redundant single-row breakdown of a number already shown elsewhere on the page. | Gate this section on `employees.length > 1` — hide it entirely for solo orgs rather than showing a one-row table that repeats the top-line number. |
| **Calendar** (`calendar.tsx`) | Per-technician color-coding is already real and functional (confirmed via this project's own `.impeccable/config.json`, which exempts it from the design detector's decorative-color rule specifically because it's "functional technician color-coding on a shared multi-tech calendar"). For a solo org, every booking is the same color, which is fine but a color *legend*, if one exists in the UI, is meaningless with one entry. | Confirm whether a color legend currently renders anywhere and, if so, hide it for solo orgs the same way — not scoped further here since it wasn't explicitly named, but flagged as the same category of gap. |
| **Payroll** (`payroll-team.tsx` etc.) | Already operates on whatever employees exist — no gating logic needed. A solo org simply sees itself as the only row. | No change required — this one already "just works" at any team size. |

| # | Requirement |
|---|---|
| FR-20 | **This whole section needs Bob's explicit confirmation before it's built.** Re-adding a team picker to `booking-new.tsx` reverses a recent, deliberate PRD's decision — not a casual UI toggle. The recommendation above (gate on employee count, don't undo the auto-assignment logic) is designed to satisfy both PRDs at once, but it should be confirmed, not assumed. |
| FR-21 | Every gate in the table above reads from the real `employees` count for the org — not from a separately-stored "team size" number from onboarding. If someone adds or removes employees later from Settings, these surfaces should reflect that, not freeze at whatever was answered during onboarding. |

## 7. Why no real invitations

Unchanged from v1.0: `invitationTable` exists in the schema but its own doc comment says *"Not wired to any invite-flow UI here — structural table only, per standing scope."* Screen 2 collects names for real `employees` rows (technicians who can be assigned and scheduled) — it does not send anyone an email or create a login. That distinction is worth being explicit about with Bob if there's any chance "Team" reads to users as "invite my team," since it currently means "let me track who's who," not "give them accounts."

## 8. B2B SaaS considerations

- **Multi-tenancy:** `onboardingComplete` and the new `employees` rows are both already org-scoped with RLS — no new isolation concern.
- **Admin vs. end-user:** unchanged — only the signup-flow owner goes through this.
- **Billing/plan-tier:** none of this PRD's changes touch billing, but a real employee count captured at signup is now available as a future plan-tier signal if that becomes relevant.
- **Migration path:** FR-5's backfill is the only migration.
- **Security/compliance:** none — reuses existing authenticated, org-scoped endpoints.

## 9. Not doing (v1)

- Real email/teammate invitations (§7).
- `SetupWizard`'s heavier fields (EIN, bank, payment processor).
- Retroactively onboarding existing organizations.
- More than 3 teammate names at signup, unless FR-9's open question resolves otherwise.
- Calendar's color-legend gating beyond confirming whether one exists (§6).

## 10. Sequencing and open questions

- **Screen 5's Weather half is blocked on `PRD_Mobull_Weather_Coverage.md` shipping** (still fully unimplemented as of this PRD) — same dependency v1.0 flagged. Ship Screen 5 as Smart Scheduler-only if Weather isn't ready, or hold the whole screen.
- **Worth a direct answer:** the FR-17a reference image already shows a weather glyph next to Date and time — is that a design comp/mockup made ahead of the build (in which case it's simply confirming the visual target, and FR-17's "not implemented yet" still stands until Weather Coverage actually ships), or is it a real screenshot from a build that's further along than this PRD assumes? Either way this doesn't change what needs building, but it's worth knowing which — flagging rather than guessing.
- **§6, FR-20** — the `booking-new.tsx` team-picker reversal needs explicit sign-off, not just this PRD's recommendation.
- **FR-9** — is 3 teammate names a hard v1 cap, or should a 4th/5th be addable?
- **Screen 6's CTA label** — "Next" on the final screen reads oddly; confirm before building (FR-19 area).
- **New icon assets** for Screens 1 and 2 (no existing feature to reuse an icon from) — not scoped here, needs a design pass.
- Screenshot capture for Screens 4 and 5 is still blocked on the same demo-org access gap noted in `PRD_Mobull_Marketing_Site_Value_Props.md` §11 — worth resolving once, since three PRDs now depend on it (that one, this one, and any future in-app empty-state work).

## 11. Assumptions

- The existing `PATCH /settings` endpoint already accepts the HQ fields in one call (confirmed in v1.0).
- `POST /employees` (FR-10) requires only `name` + `color` in practice (`email`/`phone`/etc. are nullable/optional per the real request schema) — confirmed against `CreateEmployeeBody`.
- `AuthGate` can read `settings.onboardingComplete` without a broader session-shape change.

## 12. Rollout

- Feature-flagged. Screen 5 ships Smart-Scheduler-only until Weather Coverage is live (§10).
- Sign-off needed before frontend work starts: §6's team-picker reversal, FR-9's 3-name cap, and the CTA-label question in §10.
