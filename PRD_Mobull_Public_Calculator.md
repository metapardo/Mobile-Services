# Mobull Calculator — Public Marketing Page — PRD

**Status:** Draft v0.1 — for handoff to frontend + backend engineers
**Date:** September 18, 2026
**Owner:** Bob (Product)
**Source:** Live codebase (`fuel-gauge.ts`, `fuel-gauge-icon.tsx`, `address-autocomplete.tsx`, `booking-new.tsx`, `signup.tsx`, `routes/places.ts`, `routes/routing.ts`), user-supplied reference mockup (full calculator layout — "Fuel & Drive Cost Calculator"), `mobull-copy-brief.md`

---

## 1. Overview

Add a public, no-login page to the marketing site — `mobull.app/calculator`, linked from the top nav as **"Drive Cost Calculator"** (matches the page's own H1 — "Fuel & Drive Cost Calculator" — for nav-to-headline consistency; alternate considered: "Job Cost Calculator," which leans harder into the SEO audit's top keyword but breaks that match) — that lets a visitor plug in a job price, two addresses, and their vehicle/pay numbers, and see the same "is this trip worth it" verdict the in-app Fuel Gauge gives an existing customer. Goal is top-of-funnel: let someone evaluate the core value prop with zero signup friction, using the reference mockup's layout (Trip Details + Vehicle & Cost inputs on the left, a large results card with a gauge and cost breakdown on the right).

**This is a bigger lift than "expose the existing feature," for one grounded reason:** the Fuel Gauge's cost *math* is a small, reusable pure function, but everything around it — the anchor-selection logic, the address-lookup endpoints, and the settings values it reads — is built entirely around having a logged-in organization. A public visitor has none of that. Section 3 below is what's actually shared versus what has to be built new.

## 2. What's genuinely reused vs. what's new

| Piece | In the app today | On this page |
|---|---|---|
| Cost formula (fuel $ + drive-time $ → travel cost → you-keep → travel-load %) | `fuel-gauge.ts` `computeFuelGauge()`, Step 2 of its own doc comment | **Reused as-is.** Same formula, same math, ported into a small shared function (Section 4.1) so a future change to one doesn't silently drift from the other. |
| Grade thresholds (`<15%` strong, `<35%` fair, `>=35%` weak) | `fuel-gauge.ts` `grade()` | **Reused as-is, per your instruction.** Same cutoffs, same color coding on the gauge. Copy differs (Section 4.4). |
| Anchor selection (same-day peer bookings vs. Home Base) | `fuel-gauge.ts` `selectAnchor()` — the bulk of that file's complexity | **Not used at all.** You're right that there's no HQ or existing client address to anchor from — but the deeper reason is this logic depends on `allBookings` and `employeeIds`, which don't exist for an anonymous visitor. The two address fields you specified replace it entirely: Start Address and Client Address are both supplied directly, so it's a single one-way route, doubled for round trip — no anchor logic needed. |
| Address autocomplete UI (`AddressAutocomplete` component) | `address-autocomplete.tsx`, used in `booking-new.tsx` and `settings.tsx` | **Reused as-is** — same component, same Google Places (New) session-token flow, same degrade-to-plain-text-on-failure behavior. |
| `/places/autocomplete`, `/places/details`, `/routes/compute` endpoints | `routes/places.ts`, `routes/routing.ts` | **Cannot be reused as-is — this is the one hard blocker (Section 5).** Every one of these routes is mounted behind `requireOrgSession` and rate-limited per `organizationId`. A marketing-page visitor has no session and no `organizationId`. New, public-facing endpoints are required. |
| `gasPrice` / `vehicleMpg` / `techHourlyCost` | Org-level columns on `settings`, no defaults except `techHourlyCost` ($22/hr) | **Replaced with page-local, visitor-editable defaults** (Section 4.2) — there's no org row to read from. |
| Fuel Gauge visual (small needle-arc SVG + tap-to-open dialog) | `fuel-gauge-icon.tsx` | **Not reused directly.** Your reference mockup shows a large radial dial with a numeric percentage in the center — a different, bigger presentation than the in-app icon. Section 4.4 specs a new component using the same color values and grade cutoffs, sized for this page. |

## 3. Page & Navigation

- New route `/calculator`, added to the small set of routes that stay ungated (currently just `/`, `/login`, `/signup` per `App.tsx`) — this is the **first** ungated marketing route beyond those three, so it's also the first real precedent for "a second marketing page" in this codebase.
- New nav entry in `signup.tsx`'s `navItems` array: `{ label: 'Drive Cost Calculator', href: '/calculator' }`. **This needs a code change beyond just adding to the array** — every existing nav item is an in-page anchor scroll (`Header`'s `go()` handler always calls `e.preventDefault()` + `lenisScrollToHash(href)`, it never does a real page navigation). The calculator entry needs to render as a real `wouter` `Link` to `/calculator` instead, in both the desktop `nav-links` and the mobile `mobile-nav` block (`signup.tsx` lines ~363–410) — a distinct type on each `navItems` entry (`{ type: 'anchor' | 'route', ... }`) is the cleanest way to keep one array driving both nav renders without a parallel special-case list.
- The calculator page shares the marketing site's header/logo/footer chrome for brand consistency, but is its own top-level page component (not a section within `signup.tsx`) — it needs its own scroll position, its own scroll-to-CTA-at-the-bottom pattern (see Section 4.6), and per Section 6, its own code-split chunk.

## 4. Functionality

### 4.1 Shared cost-model function

Extract the pure math (no anchor selection, no bookings/employee inputs) out of `computeFuelGauge` into a small shared helper both this page and the existing Fuel Gauge can call, e.g. `computeTravelCost({ roundTripMiles, roundTripMinutes, gasPrice, vehicleMpg, techHourlyCost, servicePrice })` returning `{ fuelCost, driveCost, travelCost, youKeep, travelLoad, grade }`. This isn't just tidiness — without it, the calculator page would need to hand-copy the formula, and the two implementations would silently drift the next time someone tunes a threshold or fixes a rounding bug in one place and not the other.

### 4.2 Trip Details & Vehicle/Cost inputs (left column, per mockup)

| Field | Behavior |
|---|---|
| "What are you charging the customer?" | Plain numeric input, `$`-prefixed. Maps directly to `servicePrice`. Required — button stays disabled without a value > 0 (mirrors `fuel-gauge.ts`'s own `no-price` rule: a $0 or blank price should never produce a scored result). |
| Start Address | `AddressAutocomplete`, same component/props as in-app. Required. |
| Client Address | `AddressAutocomplete`, same component. Required. |
| Fuel Efficiency (MPG) | Plain numeric input. **Default 25** (matches your mockup) — visitor-editable, since there's no org settings row to source a real value from. |
| Fuel Price ($/gal) | Plain numeric input, `$`-prefixed. **Default needs a product decision** (Section 8) — either a hardcoded current-ish national average (mockup shows $3.50) or, if worth the small extra engineering cost, a periodically-refreshed regional average. Recommend hardcoded to start; a live feed is a Phase 2 nice-to-have, not a blocker. |
| Driver Pay Rate ($/hr) | Slider + `$`-prefixed numeric readout, matching the mockup. **Recommend defaulting to $22/hr** to match `techHourlyCost`'s existing in-app default (`settings.ts` schema default) rather than the mockup's $24 — keeps the public page's "typical" number consistent with what an actual Mobull customer sees on day one. Flagging as a call for you either way. |

### 4.3 "Calculate Route" button (mockup's label — see Section 8 on the "Process Trip" wording)

- Disabled until: price > 0, Start Address selected (has a `placeId`, not just typed text), Client Address selected.
- On click: resolve both addresses' place IDs into a route via the new public routing endpoint (Section 5), then run `computeTravelCost()` (Section 4.1) with the resolved miles/minutes and the four input values.
- Loading state while the route call is in flight (spinner on the button, consistent with the `Loader2` pattern used elsewhere in the app — e.g. `AuthGate`, `AddressAutocomplete`'s own busy indicator).
- Failure state: if the routing call fails (upstream error, no route found, or the new endpoint's rate limit — Section 5), show an inline error on the results card rather than silently leaving stale numbers — same non-fabrication principle as `fuel-gauge.ts`'s FR-5 ("never a fabricated or estimated grade").

### 4.4 Results card (right column, per mockup)

| Element | Source / behavior |
|---|---|
| "YOU TAKE HOME $X.XX / $Y.YY" | `youKeep` / `servicePrice`. Before a calculation runs, mockup shows both values equal to the entered price (i.e., zero travel cost assumed) — match that as the pre-calculation default state. |
| "Net Profit: $X.XX" | `youKeep`, shown even when negative (a trip that loses money should say so plainly, not clamp to $0 — see the gauge % note below for why the *dial* clamps but this line doesn't). |
| Radial gauge + percentage | **New display metric, not present anywhere in the app today** — the in-app Fuel Gauge only ever shows dollars, never a percentage. Recommend `percentKept = (youKeep / servicePrice) * 100`, i.e., the inverse of `travelLoad`. Grade/color thresholds stay tied to `travelLoad` exactly as they are today (`< 15%` loss → green/"strong", `15–35%` → amber/"fair", `>= 35%` → red/"weak") — the dial's color is driven by the existing thresholds, only the *number in the middle* is new. Clamp the displayed percentage at 0% for a badly-losing trip (travel cost exceeding price) so the dial doesn't render past empty — the "Net Profit" line above it still shows the true negative dollar figure, so nothing is hidden, just not force-fit into a 0–100 dial. |
| Drive Time row | "Est. N min round trip" — **not** "from Home Base" (mockup's own compact card says that, but there's no Home Base here); wording should reference the two entered addresses instead, e.g. "round trip between the two addresses." |
| Fuel row | `$fuelCost · roundTripMiles mi round trip` — identical format to the existing `FuelGaugeIcon` dialog's Fuel line. Direct reuse of that formatting logic. |
| Drive time row | `$driveCost · roundTripMinutes min round trip` — identical format to `FuelGaugeIcon`'s Drive time line. |
| Effective Hourly Rate | **New metric, needs a product decision (Section 8)** — there's no existing computation for this anywhere in the app to ground it in. Recommended definition: `youKeep / (roundTripMinutes / 60)` — what the $ actually nets out to per hour of driving, after fuel and drive-time costs are already backed out of the price. Flagging this explicitly rather than guessing, since a wrong definition here is the kind of thing a sharp visitor will sanity-check against their own trip and lose trust in the tool over. |

### 4.5 Copy — thresholds/colors same, labels different

Per your instruction, the three grade bands keep their exact numeric cutoffs and the gauge's color coding, but should **not** reuse the in-app dialog's literal copy ("Worth the trip" / "Okay — watch the drive" / "The drive eats this one") — those read like screenshots of the product's internal voice, and this is a public-facing tool with its own framing. Recommend something like "Worth the trip" / "Break-even territory" / "Losing money on the drive" — happy to workshop wording, just flagging that new copy needs to exist here rather than being copy-pasted.

### 4.6 CTA

Below the calculator, a section inviting the visitor to sign up (reuses the existing `#access` scroll-to-signup pattern from `signup.tsx`, or a direct `Link` to `/signup` — either is fine, just needs to exist; a calculator with no next step is a dead end for the stated "breed interest" goal).

## 5. Backend: new public endpoints (the real engineering lift here)

This is the part of the ask that isn't "wire up an existing feature" — it's new backend surface, for a concrete reason: `POST /places/autocomplete`, `POST /places/details`, and `POST /routes/compute` all sit behind `requireOrgSession` (`middlewares/require-org-session.ts`), which 401s any request without a valid Better Auth session and an `activeOrganizationId`. A marketing-page visitor has neither by definition. Reusing these routes isn't an option without removing auth from routes that legitimately need it for paying customers.

| # | Requirement |
|---|---|
| FR-1 | Add new, unauthenticated routes — e.g. `POST /public/places/autocomplete`, `POST /public/places/details`, `POST /public/routes/compute` — that proxy the same underlying Google Places (New) / Routes API integration code (`integrations/google-maps.ts` is already framework-agnostic w.r.t. auth, so this is route-layer duplication, not a rewrite of the Google integration itself). |
| FR-2 | **Rate limiting must be re-architected for this path, not reused.** `rateLimitMiddleware` and `checkAndIncrement` (`@workspace/db`'s `rate-limit.ts`) key exclusively on `organizationId` — there is no IP-based or anonymous-session-based bucket anywhere in this codebase today. The public endpoints need a new bucket keyed on IP address (or a lightweight anonymous fingerprint/cookie), sized much tighter than the existing `places: 500/hr` and `routing: 200/hr` per-org limits, since a single bad actor hitting a public, unauthenticated endpoint is a materially different cost-abuse risk than a paying org's own usage. |
| FR-3 | Given this page will now get real organic/crawler traffic (per the recent SEO remediation work), add basic bot mitigation in front of the "Calculate Route" action specifically — the button that actually spends a Google API call — e.g. a lightweight challenge (hCaptcha/reCAPTCHA v3, invisible) or at minimum a honeypot/timing check. Autocomplete-as-you-type is lower risk (debounced, suppressed under 3 chars, per FR-10 of the original Fuel Gauge PRD) and probably doesn't need this; the route-compute call is the one that should be gated. |
| FR-4 | `GOOGLE_MAPS_API_KEY` stays server-side exactly as it does today (read only in `integrations/google-maps.ts`, never sent to the browser) — no change needed here, just confirming the new routes inherit that same discipline rather than accidentally exposing a key for a "public" page. |
| FR-5 | Reuse the same 4xx/5xx error-shape conventions as the authenticated routes (`no_route_found` 422, upstream failure 502, config error 500) so the frontend's failure-state handling (Section 4.3) can share logic with the in-app version rather than inventing a second error contract. |

## 6. SEO / performance (ties into `PRD_Mobull_SEO_Technical_Remediation.md`)

- `/calculator` is a public, indexable marketing route — it needs the same treatment as `/` and `/signup` from the SEO remediation PRD: its own `<title>`/meta description, inclusion in `sitemap.xml`, and — critically — it should land in the **marketing-bundle side** of that PRD's Phase 3 code-splitting work (FR-1–FR-3), not get pulled into the authenticated app's lazy-loaded chunk. A calculator page that pulls in the full booking/calendar/payroll bundle just to show a gauge would undercut the exact page-speed fix that PRD just scoped.
- No `X-Robots-Tag: noindex` header for this route in `vercel.json` — this is one of the few pages that specifically wants to be found by search (ties to the SEO audit's keyword-opportunity findings around "job cost," "drive time," "fuel cost" — this page is a natural landing target for that traffic).

## 7. Out of scope for this PRD

- Any change to the in-app Fuel Gauge itself (`fuel-gauge.ts`, `fuel-gauge-icon.tsx`) beyond extracting the shared cost-math helper in Section 4.1 — this is additive, not a rework.
- Saving or emailing calculator results, or capturing the visitor's info before showing a result — the ask is a frictionless, no-signup tool; adding a gate here would work against the stated "breed interest without setup" goal.
- A live/regularly-updated regional gas price feed (Section 4.2 flags this as a possible Phase 2).

## 8. Open questions for you

1. **"Process Trip" vs. "Calculate Route"** — your written spec says "hit the Process Trip [button]," but the reference mockup's actual button says "Calculate Route." Went with the mockup's literal label per the Design section's instruction to copy how it looks; flag if "Process Trip" was intentional and the mockup just hadn't caught up.
2. **Effective Hourly Rate's definition** (Section 4.4) — needs your sign-off on `youKeep / (roundTripMinutes/60)` or a different formula; this metric doesn't exist anywhere else in the app to defer to.
3. **Fuel price default source** (Section 4.2) — hardcoded starting number, or worth a live feed later?
4. **New grade-band copy** (Section 4.5) — the three suggested replacement labels are placeholders, not final copy.
5. **CAPTCHA/bot-mitigation vendor** (FR-3) — no existing precedent in this codebase to default to; needs a pick before backend work starts.
