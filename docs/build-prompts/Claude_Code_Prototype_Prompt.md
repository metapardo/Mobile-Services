# Build Prompt — DetailHub Mobile-Web Prototype

> **How to use this:** Paste this whole file into Claude Code, in the same project/folder as `PRD_MobileDetailingApp.md`. Tell Claude Code to read the PRD first, then follow the instructions below. Everything in this prompt is written so it can be handed over as-is.

---

## What you're building

A **mobile-web-friendly prototype** (not a native app — a responsive web app, designed mobile-first) of DetailHub, the mobile detailing business management tool specified in `PRD_MobileDetailingApp.md`. Read that PRD in full before writing any code — it defines every entity, screen, and business rule referenced below. This prompt adds two things the PRD doesn't cover: the technical scaffolding and the visual design system.

**This is a prototype, not production software.** Prioritize a working, believable, click-through experience over real integrations:
- Use mock/seeded data (a handful of clients, employees, packages, and a week of bookings) — no real database required, in-memory/local state or a simple JSON store is fine.
- Stub the Gas Meter's distance lookup, the Weather module's forecast, and any payment charge with realistic fake values rather than calling real APIs.
- No real authentication — a single hardcoded "logged in as Admin" state is enough.
- Every screen and interaction from the PRD's four use cases (Booking & Calendar, Sales Reporting, Package Admin, Payroll) should be navigable and populated with believable data, even where the underlying logic is mocked.

---

## Tech stack

- **Next.js (App Router) + TypeScript + React**
- **Tailwind CSS** for styling, using the design tokens defined below
- **shadcn/ui** as the component base (dialogs, sheets, tabs, dropdowns, tables) — restyle its defaults to match the design tokens rather than using them unstyled
- **Recharts** for the Sales Reporting trend charts
- **lucide-react** for icons
- Mock data as TypeScript fixtures (`/lib/mock-data.ts` or similar) — no external DB, no ORM
- The app must run with `npm install && npm run dev`

---

## Design direction

The product needs two registers, used deliberately in different places — don't blend them into one generic look:

1. **Daily-use utility register** — this is what 90% of the app is. Think **Notion, Ramp, and modern Google Workspace**: light, clean, information-dense but never cluttered, fast-feeling, quiet confidence, minimal chrome. This governs the calendar, booking forms, tables, and reporting views — the screens an admin lives in for hours.
2. **Brand-confidence register** — used sparingly, at moments that deserve weight: the login/splash screen, empty states, and hero numbers (e.g., a big revenue total, a payroll summary headline). Think **Rivian, Kyson Dana's portfolio, and Huge.inc**: near-black surfaces, oversized confident typography, generous negative space, zero gradients or decoration, restraint over flourish. This is a brand accent, not the app's default surface — don't make data tables live on a black background.

The synthesis: a light, Notion/Ramp-disciplined product shell that occasionally lets a bold, dark, big-type moment breathe — the way Ramp's own marketing site is louder and darker than its actual dashboard.

### Design tokens

Implement these as Tailwind theme values / CSS variables — don't improvise new colors during build.

**Color**

| Token | Hex | Use |
|---|---|---|
| `surface-base` | `#FFFFFF` | Default page background |
| `surface-subtle` | `#F7F7F5` | Card fills, table zebra striping, sidebar |
| `surface-sunken` | `#F0F0EE` | Input backgrounds, disabled states |
| `surface-inverse` | `#0B0B0C` | Brand-confidence register surfaces (splash, empty states, app shell nav bar) |
| `ink-primary` | `#0B0B0C` | Primary text |
| `ink-secondary` | `#6B6F76` | Secondary/meta text, captions |
| `ink-inverse` | `#F7F7F5` | Text on `surface-inverse` |
| `border` | `#E7E7E5` | Hairline borders — used instead of shadows for most elevation |
| `accent` | `#3654FF` | Primary buttons, links, focus rings, active nav state — the one brand color. Deliberately not a status color. |
| `accent-subtle` | `#EEF0FF` | Accent background tint (selected rows, active tab background) |
| `status-green` | `#1E9E62` | Confirmed bookings, Gas Meter "green", positive deltas |
| `status-amber` | `#D9A404` | New/pending state, Gas Meter "yellow" |
| `status-red` | `#DC2626` | Canceled/no-show, Gas Meter "red", destructive actions |

**Typography**

- UI font: **Inter** (or Geist Sans if available) — this is the only typeface for interface text.
- All currency and numeric figures (prices, payroll totals, revenue stats) use **tabular numerals** (`font-variant-numeric: tabular-nums`) so numbers align in tables and don't jitter — this single detail does a lot to make the product feel like Ramp rather than a generic dashboard.
- Scale (mobile-first, in px): Display `36/40 bold` (brand-confidence moments only) · H1 `24/32 semibold` · H2 `18/24 semibold` · Body `15/22 regular` · Small `13/18 regular` · Caption `12/16 regular, ink-secondary`.

**Shape, elevation, spacing**

- 8px base spacing grid.
- Cards: `rounded-xl` (12–16px), 1px `border` hairline, **no drop shadow** by default — flat, Notion-style. Reserve a soft shadow only for overlays (sheets/modals/dropdowns), never for static cards.
- Buttons: `rounded-lg`, medium weight label, generous horizontal padding (16–20px) — should feel tappable at mobile touch-target sizes (min 44px height).
- Status is always communicated with a small colored dot or pill badge plus a text label — never color alone.

**Motion**

- Fast and quiet: 150–200ms ease-out for all transitions. No bounce, no springy easing.
- Reserve slightly more deliberate motion (a 300ms fade+slide) for brand-confidence moments only (splash/empty states).

**Imagery**

- No stock photography anywhere — this is a utility product, not a marketing site. Empty states use a simple line icon + one confident sentence of copy on a `surface-subtle` or `surface-inverse` background, not illustrations.

---

## Navigation shell (mobile-first)

Reuse the pattern already validated in the prior Vagaro Pro UX audit for this exact product category — a persistent bottom tab bar with five items, everything else nested under "More":

**Home · Calendar · Checkout · Clients · More**

- `Home` — today snapshot: next appointment, quick check-in/reschedule actions, quick-action shortcuts into Calendar/Checkout/Clients/Reports.
- `Calendar` — Day/Week/Agenda segmented control, defaults to Today, color-coded by booking status. Tapping a booking opens Booking Detail.
- `Checkout` — quick access to the checkout/payment step for an in-progress or upcoming booking.
- `Clients` — searchable client list → Client Profile (contact info, booking history).
- `More` — Sales Reporting, Package Admin, Payroll, Settings (including the Gas Meter and payroll rule configuration from the PRD's `AdminSettings`).

Design the shell mobile-first at a 390–430px viewport as the primary target, then let it scale up gracefully to tablet/desktop widths (the bottom tab bar can become a left rail above ~768px — standard responsive pattern, doesn't need special design beyond that).

---

## Screens to build

Build every screen below. Each maps directly to a section of the PRD — refer to it for exact fields and logic.

1. **Splash / login stub** (brand-confidence register) — dark `surface-inverse`, large product wordmark, single "Continue as Admin" action. No real auth.
2. **Home** — today snapshot card, quick actions, in the utility register.
3. **Calendar** (Day / Week / Agenda) — color-coded bookings by status; Today button; tapping a booking opens Booking Detail.
4. **New Booking flow** — client select/create → service select (from Package catalog) → employee assign (multi-select) → deposit → parking cost input → review & confirm. Show the Gas Meter badge and Weather panel as soon as an address and date are set, using mocked calculations (see below).
5. **Booking Detail / Edit** — identical field set to New Booking, fully editable in place, including adding/removing line items after the fact (this is a deliberate fix for the gap found in the Vagaro audit — don't lock any field post-creation). Shows Gas Meter, Weather, and Parking Cost.
6. **Client list + Client Profile** — searchable list; profile shows contact info, booking/purchase history, notes.
7. **Sales Reporting dashboard** — top-line stat cards (revenue this week/month/year, jobs completed, avg ticket) in the brand-confidence numeral treatment (large tabular-nums figures even though the page itself is in the light utility register); Revenue by Employee and Revenue by Package tables/charts; date range and period toggle (week/month/year).
8. **Package Admin** — list grouped by category with inline edit/archive; create/edit form (name, category, description, price, duration, is add-on toggle).
9. **Payroll dashboard** — per-employee, per-period summary (revenue, tips as clearly-labeled pass-through, computed payout); booking-level split-commission editor (percentage slider or input, shown only when a booking has 2+ assigned employees).
10. **Payroll Rule settings** (under More → Settings) — define/edit the commission calculation (flat % to start, per the PRD's v1 scope).
11. **Admin Settings** — home base address, gas price per gallon (default $6.00), vehicle MPG, Gas Meter thresholds — all editable, matching the PRD's Open Questions defaults.

---

## Mocked business logic

Implement these with real formulas against mock inputs — the math should be genuine even though the underlying data (distance, weather) is faked:

- **Gas Meter:** mock a `distanceMiles` value per booking (deterministic based on a fake address, e.g. hash the address string to a number between 3–40 miles), compute `gas_cost = (round_trip_miles / mpg) * gas_price_per_gallon`, then `gas_ratio = gas_cost / booking_price`, and map to green (≤10%) / yellow (10–20%) / red (>20%) per the PRD defaults. Show the breakdown on tap.
- **Weather:** mock a forecast object per booking date (rotate through a few realistic condition/precip/temp combinations) — no real API call.
- **Deposit button state:** the primary action button reads "Book Appointment" when deposit is $0, and switches to "Charge Deposit" once an amount is set — this exact conditional was specifically called out as good UX in the source interview, implement it faithfully.
- **Payroll split:** when a booking has multiple assigned employees, default to an even split, let the admin drag/adjust the percentage, and recompute each employee's payout live.

---

## What to skip

Don't build: real payment processing, real SMS/email delivery, real maps/geocoding, real weather API integration, multi-tenant auth, or a persistent database. Mock all of it convincingly. If something in the PRD's Open Questions (Section 8) is unresolved, take the proposed default and move on rather than blocking.

---

## Deliverable

A single Next.js app, runnable locally, with the navigation shell and all eleven screens above wired together with mock data — a coherent click-through prototype that could be handed to a stakeholder to react to, not a component library or design-system demo page.
