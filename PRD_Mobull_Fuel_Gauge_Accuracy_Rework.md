# Fuel Gauge — Accuracy Rework

**Status:** Draft v2.1 (supersedes `Fuel_Gauge_PRD.md` v0.1, Aug 5 2026)
**Change in v2.1:** drive time is now priced into the grade, and fuel vs. drive-time costs are shown as separate lines. The standalone "long drive" flag is removed as redundant.
**Date:** September 9, 2026
**Owner:** Bob (Product)
**Product:** Mobull (codebase: `artifacts/detail-hub`)
**Engineering surface:** `src/lib/fuel-gauge.ts`, `src/pages/booking-new.tsx`, `src/pages/settings.tsx`, `artifacts/api-server`

---

## 1. Why this rewrite exists

The Fuel Gauge shipped, and it does not work. As you type a physical address into a new booking, the gauge flickers between Empty, Half and Full with no relationship to where the address actually is. It is not a rounding problem or a threshold problem. **The feature has never measured distance at all.**

This document replaces v0.1. It keeps the original intent — tell the owner whether a job is worth the drive — and rebuilds the three things that intent depends on: a real distance, a real address, and a number the owner can act on.

---

## 2. Root cause

`src/lib/fuel-gauge.ts` computes distance like this:

```ts
function addrHash(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}

export function estimateDistanceMiles(a: string, b: string): number {
  const h1 = addrHash(a) % 100;
  const h2 = addrHash(b) % 100;
  return (Math.abs(h1 - h2) % 20) * 0.7 + 2; // 2–16 mi
}
```

It sums the character codes of the two address strings and subtracts them. The output is a number between 2 and 16, and it is **a hash of the spelling of the address, not its location.** Drive time is derived from the same hash, divided by an assumed 10 mph.

Three consequences follow directly, and they explain every symptom observed:

| Symptom | Cause |
|---|---|
| Readings change on every keystroke | `booking-new.tsx` recomputes the gauge in a `useMemo` keyed on `address` once the string passes 5 characters. Each new character changes the hash, so each keystroke produces a genuinely different "distance." |
| Readings ignore the HQ address | The Home Base address is passed in and hashed, but hashing destroys location. Changing HQ from Brooklyn to Los Angeles changes the character sum, not the distance — and can move the gauge in either direction. |
| Two neighbors grade differently | `"12 Oak St"` and `"14 Oak St"` differ by one character code, so they land in different buckets. Adjacent houses can read Full and Empty. |

There is no geocoding, no routing, and no map provider configured anywhere in the workspace — `.env` contains only `DATABASE_URL`, `MIGRATION_DATABASE_URL` and `VERCEL_OIDC_TOKEN`. The gauge was built as a UI shell against a placeholder, and the placeholder shipped.

**The v0.1 threshold spec is not the problem and is mostly retained.** Feeding accurate miles into the existing `$3/$8 per mile` buckets would already be a large improvement. Everything below is about making the inputs true, and then making the output legible.

---

## 3. Goals

| # | Goal | Measured by |
|---|---|---|
| G-1 | The gauge reflects real driving distance and time | Distance shown is within 5% of Google Maps for the same two addresses, sampled across 30 test bookings |
| G-2 | The gauge stops moving while the owner types | Zero gauge state changes between address-field focus and address selection |
| G-3 | The owner sees money, not a ratio | Booking screen shows dollars kept and estimated drive time without opening a detail panel |
| G-4 | Address entry is fast and produces clean data | ≥90% of new bookings created from a selected suggestion rather than free text; ≥95% of stored addresses carry a lat/long |
| G-5 | The reading is trusted enough to act on | Owners report using the gauge to decline or re-price jobs; tracked qualitatively in first 60 days |

**Explicit priority:** accuracy first, threshold nuance second. A gauge that is right and coarse beats a gauge that is finely graded and wrong. Where this document has to choose, it chooses the true number.

---

## 4. Non-goals

- No automatic pricing changes, route optimization, or booking recommendations. The gauge informs; the owner decides.
- No per-technician home base in this release (still Phase 4).
- No live re-routing or turn-by-turn navigation.
- No historical backfill of gauge readings for past bookings — the old readings are meaningless and will be cleared, not migrated.

---

## 5. The three fixes

### 5.1 Fix one — real distance and drive time

Replace both hash functions with a real routing call, via **Google Maps Platform**.

| Job | API | SKU | Why this one |
|---|---|---|---|
| Address suggestions as the owner types | Places API **Autocomplete (New)** | Autocomplete Session Usage | Best US address coverage, including apartment units and new construction |
| Turn a chosen suggestion into a lat/long | Places API **Place Details (New)** | Place Details Pro | Returns `location` + `formattedAddress` in one call; also terminates the autocomplete session so the typing is free |
| Distance and drive time between two points | **Routes API** `computeRoutes` | Compute Routes Pro | `TRAFFIC_AWARE` routing with a `departureTime` — the actual drive at the actual hour of the appointment |

**Cost.** Google replaced its old $200 monthly credit with a free monthly allowance per SKU: 10,000 calls on Essentials SKUs and 5,000 on Pro SKUs. Autocomplete keystrokes are unlimited-free when the session ends in a Place Details call. At 1,000 bookings/month the entire feature costs **$0**; the first paid dollar arrives around 2,500 bookings/month when route calls pass the 5,000 Pro cap, then roughly $27 per additional 1,000 bookings.

**Why traffic-aware routing replaces "borough mode."** v0.1 switched from dollars-per-mile to dollars-per-minute inside the five boroughs, because miles stop predicting cost in dense traffic. That was the right instinct built on the wrong mechanism — a zip-code table cannot know about traffic, and it silently misclassifies anyone who expands past NYC. Asking the Routes API for the real drive time at the real departure time solves the same problem everywhere, with no zip table to maintain. **The `isNYCAddress` function and the borough/standard mode split are deleted.** The `fuelGaugeHalfMin` / `fuelGaugeFullMin` settings columns are retained but unused, so no migration is required in this release. Drive time does not disappear with borough mode — it is promoted from a mode switch to a priced input in every grade (§6.4).

### 5.2 Fix two — the gauge stops guessing while you type

This is the single most visible defect and it is fixed by a rule, not by an API.

> **The Fuel Gauge computes only for an address the owner has explicitly selected from the suggestion list. Never for a partial string.**

Free text in the address box is not a location, and treating it as one is what produces the flicker. Until a suggestion is picked, the gauge area shows a calm placeholder — not a reading, not a spinner on every character.

### 5.3 Fix three — say it in dollars, and split them

`Fuel Rate = price ÷ miles` produces something like "$7.14 per mile." No owner has ever made a decision with that number. The headline becomes the money kept after both travel costs — fuel and the technician's drive time — with those two costs itemized beneath it and the estimated drive time alongside. See §6 and §8.1.

---

## 6. The ROI model

### 6.1 Formula

Two travel costs, computed separately and kept separate all the way to the screen.

```
round_trip_miles   = drive_distance_miles(anchor -> job) x 2
round_trip_minutes = drive_time_minutes(anchor -> job, at appointment time) x 2

fuel_cost   = round_trip_miles / vehicle_mpg x gas_price_per_gallon
drive_cost  = round_trip_minutes / 60 x tech_hourly_cost
travel_cost = fuel_cost + drive_cost

you_keep    = service_price - travel_cost
travel_load = travel_cost / service_price        <- what the grade is based on
```

Round trip, not one way: the van has to come back, and one-way costing understates every job by half.

**Why the two costs stay split.** They behave differently and they call for different responses. Fuel scales with distance; drive cost scales with traffic. An owner looking at a $34 travel cost cannot act on it, but an owner who sees *"Fuel $1.29 · Drive time $33.00"* knows immediately that the problem is the hour, not the mileage — move the appointment, don't re-price it. Summing them into one number throws away the only diagnostic the readout has.

### 6.2 Settings this depends on

| Setting | Default | Status |
|---|---|---|
| `gas_price_per_gallon` | $6.00 | Column exists; promoted to a visible, review-prompted field (FR-25) |
| `vehicle_mpg` | 28 | Column exists; promoted to a visible field (FR-25) |
| `tech_hourly_cost` | $22.00 | **New.** What an hour of a technician's time costs the business. |

`tech_hourly_cost` is deliberately framed as *what you pay the tech*, not what the hour could have earned. It is cash actually leaving the business, it is a number every owner already knows, and it keeps `you_keep` positive and believable. Settings helper text: *"What one hour of your technician's time costs you. Used to price the drive."*

For a commission-paid shop, the guidance is to enter the effective hourly cost of that technician's working day. Opportunity-cost framing was considered and rejected for v2 — it ranks jobs identically but produces negative "you keep" figures that read as alarming rather than informative.

### 6.3 Grades

Three grades, based on how much of the ticket the round trip eats:

| Grade | Travel load | Plain-language readout |
|---|---|---|
| **Strong** | travel cost < 15% of price | "Worth the trip" |
| **Fair** | 15–35% | "Okay — watch the drive" |
| **Weak** | travel cost > 35% of price | "The drive eats this one" |
| **Unknown** | no geocode, no price, or routing failed | "Can't score this yet" |

Worked against realistic jobs at $6.00/gal, 28 mpg, and $22/hr:

| Job | Price | Round trip | Fuel | Drive time | You keep | Load | Grade |
|---|---|---|---|---|---|---|---|
| Suburban detail, 22 mi out | $180 | 44 mi · 76 min | $9.43 | $27.87 | $142.70 | 20.7% | Fair |
| Regular down the street | $75 | 6 mi · 18 min | $1.29 | $6.60 | $67.11 | 10.5% | Strong |
| Cheap job, 40 mi haul | $60 | 80 mi · 110 min | $17.14 | $40.33 | $2.52 | 95.8% | **Weak** |
| NYC crosstown, heavy traffic | $75 | 6 mi · 90 min | $1.29 | $33.00 | $40.71 | 45.7% | **Weak** |
| Premium ceramic, 48 mi out | $650 | 96 mi · 140 min | $20.57 | $51.33 | $578.10 | 11.1% | Strong |
| Small add-on, 12 mi | $45 | 24 mi · 44 min | $5.14 | $16.13 | $23.72 | 47.3% | **Weak** |

The model now behaves correctly across the full range: a big ticket earns a long drive ($650 at 48 miles is Strong), a small ticket does not ($45 at 12 miles is Weak), and a cheap job with a long haul is called out clearly.

### 6.4 Why drive time belongs in the grade

Costing fuel alone has one structural blind spot, and it is the most common failure mode in this market. **Fuel is cheap; time is not.**

The NYC crosstown row above is the case. A $75 job three miles away burns $1.29 of gas — 1.7% of the ticket. On fuel alone it grades **Strong**, and the owner takes it. But at 45 minutes each way it costs 90 paid minutes, and once that is priced it is a **Weak** job that should be declined, re-priced, or clustered with neighbors.

This is the same problem v0.1 tried to solve with "borough mode" — switching to dollars-per-minute inside the five boroughs. The instinct was right; the mechanism was a zip-code table that could not see traffic and broke the moment a business expanded past NYC. Pricing real drive time from a traffic-aware route solves it everywhere, with nothing to maintain.

| | Fuel only | Fuel + drive time |
|---|---|---|
| $75 job, 3 mi, 45 min each way | $1.29 travel → **Strong** | $34.29 travel → **Weak** |
| $180 job, 22 mi, 38 min each way | $9.43 travel → Fair | $37.30 travel → Fair |

A separate "long drive" warning flag was specified in an earlier draft as a workaround for fuel-only costing. It is **removed** — with drive time inside the grade and shown as its own line, the flag is redundant.

---

## 7. Functional requirements

### 7.1 Accuracy

| # | Requirement | Priority |
|---|---|---|
| FR-1 | Delete `estimateDistanceMiles`, `estimateDriveMinutes`, `addrHash` and `isNYCAddress` from `fuel-gauge.ts`. No hash-derived value may reach a user-visible number. | P0 |
| FR-2 | Every address — booking and Home Base — is stored with `latitude`, `longitude`, `googlePlaceId` and Google's `formattedAddress` alongside the raw string. | P0 |
| FR-3 | Distance and drive time come from Routes API `computeRoutes` with `routingPreference: TRAFFIC_AWARE` and `departureTime` set to the appointment's scheduled start. | P0 |
| FR-4 | Anchor selection logic from v0.1 is retained unchanged: no same-day peer → Home Base; one adjacent booking → that address; sandwiched → the nearer of the two. "Nearer" is now measured by real road distance. | P0 |
| FR-5 | If routing fails or returns no route, the gauge shows **Unknown** with a one-tap retry. It never falls back to an estimate and never shows a grade it cannot support. | P0 |
| FR-6 | Cost model is fuel + drive time, round trip, per §6.1. The two costs are computed, stored and returned separately and are never pre-summed by the calculation layer. | P0 |
| FR-7 | Grades follow the travel-load bands in §6.3 (Strong <15%, Fair 15–35%, Weak >35%); the cutoffs are editable in Settings. | P1 |
| FR-8 | If `tech_hourly_cost` is unset, the gauge computes on fuel alone and labels itself as doing so, rather than silently under-costing the job. | P1 |

### 7.2 Address input

| # | Requirement | Priority |
|---|---|---|
| FR-9 | The address field is a typeahead backed by Places Autocomplete (New), replacing the plain `<Input>` in `booking-new.tsx` and the Home Base field in `settings.tsx`. | P0 |
| FR-10 | Requests are debounced at 250ms and suppressed under 3 characters. | P0 |
| FR-11 | One Google session token is generated per address-entry session and passed to every Autocomplete call and the terminating Place Details call, so typing is billed as one session rather than per keystroke. | P0 |
| FR-12 | Results are biased toward the business's Home Base using `locationBias` with a 50-mile radius, so local streets surface first. Restricted to `regionCode: "US"`. | P0 |
| FR-13 | Full keyboard support: ↑/↓ to move, Enter to select, Esc to dismiss. The list is an ARIA combobox with `aria-activedescendant`; the matched substring is bolded in each suggestion. | P0 |
| FR-14 | Selecting a suggestion writes the formatted address, place ID and coordinates in one step and immediately triggers the single gauge computation for that booking. | P0 |
| FR-15 | Zip-first entry is supported — typing a 5-digit zip biases suggestions to that zip and lets the owner narrow from there. | P1 |
| FR-16 | A separate, always-visible **Apt / Suite / Unit** field sits below the address line. Google does not reliably return unit numbers, and mobile detailing needs them to find the vehicle. Stored as a distinct field; excluded from geocoding. | P1 |
| FR-17 | Manual override: if the owner's address genuinely isn't in Google's index, "Use what I typed" stores the raw string and marks the booking Unknown rather than blocking the save. | P1 |
| FR-18 | Selecting an existing client auto-fills their saved address, coordinates included, with no re-geocoding. | P1 |
| FR-19 | On a failed autocomplete request the field degrades to a plain text input with an inline notice, never a blocked form. | P0 |

### 7.3 Drive time display

| # | Requirement | Priority |
|---|---|---|
| FR-20 | The booking screen displays estimated one-way drive time: **"Drive Time: est. 45 min"**. | P0 |
| FR-21 | The readout names its origin so the number is interpretable — "from Home Base", "from previous job", "from next job". | P0 |
| FR-22 | Times ≥90 minutes render as "est. 1 hr 40 min". | P2 |
| FR-23 | Drive time appears on the calendar booking detail view, not only during creation. | P1 |
| FR-23a | Fuel cost and drive-time cost render as two distinct labelled lines in the booking readout, each with its own unit (miles / minutes). They are never collapsed into a single "travel cost" figure in the main readout. | P0 |

### 7.4 Settings

| # | Requirement | Priority |
|---|---|---|
| FR-24 | Home Base Address uses the same autocomplete component and stores coordinates. An HQ without coordinates blocks gauge computation and shows a setup prompt. | P0 |
| FR-25 | Gas price, vehicle MPG and technician hourly cost are promoted to a visible "Vehicle & Labor" card with helper text. Gas price carries a "last updated" date and prompts for review after 60 days — the default of $6.00/gal is a guess, and pump prices moved roughly 38% in the first half of 2026 alone. | P0 |
| FR-26 | The three travel-load cutoffs are editable, with a live preview: "A $150 job 20 miles · 35 min away grades **Fair** — you keep $117." | P1 |
| FR-27 | The unused `fuelGaugeHalfMin` / `fuelGaugeFullMin` per-minute threshold fields are removed from the Settings UI. Columns remain in the schema. | P2 |

---

## 8. UX specification

### 8.1 The readout

Money first, gauge second, and the two travel costs on their own lines. The owner reads the dollar figure in under a second; the split tells them *why*; the colored gauge is what makes a week of bookings scannable at a glance.

```
+----------------------------------------+
|  (gauge)  YOU KEEP $143 of $180        |
|           Worth the trip               |
|                                        |
|  Drive Time: est. 38 min               |
|  from Home Base                        |
|                                        |
|  Fuel         $9.43   44 mi round trip |
|  Drive time  $27.87   76 min round trip|
|                                  [why?]|
+----------------------------------------+
```

The fuel and drive-time lines are always both present, always in that order, and never collapsed into a single "travel cost" figure. When one dominates, the owner sees it without doing arithmetic:

```
|  Fuel         $1.29    6 mi round trip |
|  Drive time  $33.00   90 min round trip|
```

That readout says "this job isn't far, it's slow" at a glance — which points at moving the appointment rather than re-pricing it.

Copy rules, given the audience is a fast-moving owner without a business degree:

- **No jargon.** Not "ROI," not "margin," not "$/mile." "You keep $143 of $180."
- **Whole dollars in the headline, cents in the line items.** The decision is made on the headline; the detail earns trust.
- **Grade as a sentence, not a label.** "The drive eats this one" tells the owner what to do. "Empty" does not.
- **Name the origin every time.** A drive time with no starting point is not a fact.
- **Each cost line carries its own unit.** "$9.43 · 44 mi" and "$27.87 · 76 min" — the number and what produced it, side by side.

### 8.2 States

| State | Display |
|---|---|
| No address selected yet | "Pick an address to see if it's worth the trip" — static, no gauge, no flicker |
| Address selected, no service yet | "Add a service to see what you keep" |
| Calculating | Skeleton on the money line and both cost lines; layout does not shift |
| Scored | Full readout as above |
| Routing failed | "Couldn't get drive time" + Retry. No grade, no guess, no partial fuel-only score. |
| No HQ set | "Set your shop address in Settings to score jobs" + deep link |
| No tech hourly cost set | Gauge computes on fuel only and says so: "Add your hourly cost in Settings to price the drive" |

### 8.3 The "why?" panel

Tapping `[why?]` opens the full arithmetic. This is what makes the number trustworthy rather than magic:

```
Service price                      $180.00

Round trip                    44 mi / 76 min
  Fuel   $6.00/gal / 28 mpg       - $9.43
  Drive time  76 min @ $22/hr    - $27.87
                                 ---------
  Travel cost                      $37.30
-----------------------------------------
You keep                          $142.70

Travel is 20.7% of this job → Fair
Measured from: Home Base, 1102 Flatbush Ave
Drive time is traffic-aware for a
Tuesday 2:00 PM departure.
```

Every input is named with its source, so an owner who disputes the number knows exactly which setting to go change.

### 8.4 Calendar view

Each booking keeps the existing gas-gauge icon, now colored by grade (green / amber / red / grey). The existing `fuel-gauge-icon.tsx` SVG is retained; only its inputs change. Tapping opens the same "why?" panel.

---

## 9. Technical design

### 9.1 Where the work happens

All Google calls are proxied through `artifacts/api-server`. The API key is never shipped to the browser.

```
POST /api/places/autocomplete   { input, sessionToken }  → suggestions
POST /api/places/details        { placeId, sessionToken } → { lat, lng, formattedAddress }
POST /api/routes/compute        { origin, destination, departureTime } → { miles, minutes }
GET  /api/bookings/:id/gauge                              → FuelGaugeResult
```

Server-side rate limiting per organization guards against a runaway client loop burning the free tier. **This is Phase 1, not hardening:** Google Maps Platform quotas are fixed (`Adjustable: No` in the Cloud console) and cannot be lowered, so an application-level limiter is the only hard spend cap available. Budget and usage alerts notify but do not stop traffic.

### 9.2 Caching

Routing results are cached in Postgres keyed on `(origin_place_id, destination_place_id, hour_of_week)`, with a 30-day TTL. Traffic patterns are stable by hour of week, so a Tuesday 2pm Brooklyn→Queens route is reusable. For a business serving a repeat client base this should keep route calls well under the 5,000/month free cap indefinitely.

Geocoding results are cached permanently against the place ID — an address does not move.

### 9.3 When the gauge recomputes

| Trigger | Recompute |
|---|---|
| Address **selected** from suggestions | Yes |
| Keystroke in the address field | **No** |
| Service added/removed/re-priced | Yes — price changed, distance did not, so this is a cache hit with no API call |
| Appointment time changed | Yes — departure time affects traffic |
| Technician reassigned | Yes — anchor may change |
| Same-day adjacent booking added, moved or cancelled | Yes, for the affected neighbors |
| Home Base changed in Settings | Invalidate all future bookings anchored to Home Base |
| Gas price, MPG or technician hourly cost changed | Yes — recompute from cached distances and times, zero API calls |

### 9.4 Data model additions

```
bookings:  latitude, longitude, google_place_id, formatted_address,
           unit_number, cached_drive_miles, cached_drive_minutes,
           cached_fuel_cost, cached_drive_cost,       -- stored separately
           gauge_computed_at

settings:  hq_latitude, hq_longitude, hq_google_place_id,
           gas_price_updated_at,
           tech_hourly_cost (default 22.00),          -- NEW
           travel_load_strong_pct (default 15), travel_load_weak_pct (default 35)

route_cache: origin_place_id, destination_place_id, hour_of_week,
             miles, minutes, fetched_at
```

Existing bookings have no coordinates. They render as Unknown until edited — correct behavior, since their stored readings were never meaningful.

---

## 10. Edge cases

| Case | Handling |
|---|---|
| Address typed but never selected from the list | No gauge. Placeholder copy, no reading. |
| Address outside routable road network (islands, remote sites) | Routes API returns no route → Unknown, no guess |
| HQ set but not geocoded (legacy row) | Prompt to re-save HQ in Settings; gauge Unknown until then |
| Service price is $0 or comped | Unknown, not Weak — a free job is a business decision, not a bad drive |
| Booking has no technician assigned | Anchor falls back to Home Base; readout says "from Home Base" |
| Two bookings at the same address | Distance 0, fuel $0 → Strong. Correct. |
| Autocomplete quota exhausted | Field degrades to plain text with a notice; save is never blocked |
| Client's saved address is stale | Owner can re-select; new coordinates overwrite |
| Multi-day or overnight booking | Anchor uses the start date only |
| Gas price never reviewed | Grades still compute; Settings shows a "review your gas price" nudge after 60 days |

---

## 11. Phasing

**Phase 1 — Make it true.** FR-1 through FR-6, FR-9 through FR-14, FR-19, FR-20, FR-21, FR-23a, FR-24, plus the per-organization rate limiter (§9.1). Real geocoding, real routing, autocomplete, select-to-compute, and the split fuel / drive-time dollars readout. Threshold defaults hardcoded. *This phase alone resolves the reported defect.*

**Phase 2 — Make it clear.** FR-7, FR-8, FR-15 through FR-18, FR-23, FR-25, FR-26. Configurable cutoffs, unit field, zip-first entry, Settings work, "why?" panel.

**Phase 3 — Make it cheap.** Route cache (§9.2), invalidation rules (§9.3), quota monitoring and usage alerts.

**Phase 4 — Make it complete.** Per-technician home base and per-technician hourly cost, gauge on the week view, full-day route summaries, optional toll costs.

---

## 12. Success criteria

Phase 1 is done when all of the following hold:

1. Typing a full address produces **exactly one** gauge computation, on selection.
2. Distance for 30 sampled address pairs is within 5% of Google Maps.
3. Changing HQ from Brooklyn to Los Angeles moves every affected booking to Weak.
4. Two neighboring houses on the same street grade identically.
5. Drive time renders on every scored booking with its origin named, and fuel and drive-time costs render as separate lines.
5a. A $75 job 3 miles out with 45 min each way of traffic grades **Weak**, not Strong.
6. No hash function survives anywhere in `fuel-gauge.ts`.
7. A failed route call yields Unknown and never a fabricated grade.

---

## 13. Instrumentation

- Autocomplete sessions per booking, and % of bookings created from a selected suggestion vs. free text (target ≥90%)
- Route API calls per booking and cache hit rate (target ≥60% by month two)
- Monthly call volume per SKU against the free-tier caps, with an alert at 80%
- Grade distribution over time, and specifically the trend in Weak bookings
- Share of travel cost coming from drive time vs. fuel, per organization — tells us whether the $22/hr default and the 15%/35% bands are calibrated for real shops
- % of organizations that have set a technician hourly cost (gates FR-8's fuel-only fallback)
- "why?" panel open rate (v0.1 target was ≥40% weekly)
- Unknown-state rate, split by cause: no geocode / no price / routing failure

---

## 14. Risks and open questions

**Risks**

- *The hourly cost is one number standing in for a messy reality.* A shop paying commission, or running techs at different rates, gets an approximation. It is still far closer than ignoring drive time entirely, and per-technician rates are Phase 4. The "why?" panel names the rate used so the figure is always auditable.
- *The 15% / 35% bands are calibrated against modelled jobs, not observed ones.* They rank the test set correctly, but they should be revisited once 30 days of real bookings exist — the instrumentation in §13 exists to answer exactly this.
- *Stale gas price or hourly cost silently skews every grade.* A business running the $6.00 default while paying $4.20, or leaving the $22/hr default untouched, sees grades that are wrong across the board. FR-25's review nudge is the mitigation; automatic fuel price feeds are a future option.
- *Free-tier headroom.* Comfortable to ~2,500 bookings/month, then roughly $27 per additional 1,000. The route cache is what keeps this flat; it is Phase 3, so Phase 1 and 2 will run hotter than steady state.
- *Existing bookings show Unknown after launch.* Deliberate, but it is a visible change and needs a one-time in-app note explaining that old readings were unreliable and have been cleared.

**Open questions**

1. Should the price used be net of discounts and promotions, or gross list price? *Recommendation: net — it's the money that actually arrives.*
2. Should the round trip assume a return to Home Base, or to the next booking when one exists? Current spec measures the anchor leg doubled; a true chained route across the day is more accurate but materially more expensive in API calls.
3. Should Weak bookings surface anywhere proactively — a weekly digest, a warning at save time — or stay a passive indicator? v0.1 was explicitly diagnostic-only; that constraint is worth revisiting once owners trust the number.
3a. Should drive time back to Home Base at the end of the day be charged to the last booking of the day? Currently every job is costed as its own round trip, which double-counts the middle of a well-clustered route.
4. Should the gauge account for tolls? The Routes API can return them, and a bridge crossing is real money in this market.

---

## 15. Appendix — before and after

```ts
// ── BEFORE (current, broken) ──────────────────────────────────
function addrHash(s: string): number {
  return s.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
}
export function estimateDistanceMiles(a: string, b: string): number {
  const h1 = addrHash(a) % 100;
  const h2 = addrHash(b) % 100;
  return (Math.abs(h1 - h2) % 20) * 0.7 + 2;
}
const rate = bookingPrice / metricValue;   // "$7.14 per mile"

// ── AFTER ─────────────────────────────────────────────────────
const route = await routes.compute({
  origin:      { placeId: anchor.placeId },
  destination: { placeId: booking.placeId },
  travelMode:  'DRIVE',
  routingPreference: 'TRAFFIC_AWARE',
  departureTime: booking.scheduledStart,
});

const roundTripMiles   = route.miles   * 2;
const roundTripMinutes = route.minutes * 2;

// Two costs, computed and returned separately — never pre-summed.
const fuelCost  = (roundTripMiles / settings.vehicleMpg) * settings.gasPrice;
const driveCost = (roundTripMinutes / 60) * settings.techHourlyCost;

const travelCost = fuelCost + driveCost;
const youKeep    = servicePrice - travelCost;
const travelLoad = travelCost / servicePrice;

const grade =
  travelLoad < settings.travelLoadStrongPct / 100 ? 'strong' :
  travelLoad < settings.travelLoadWeakPct   / 100 ? 'fair'   : 'weak';

return {
  grade, youKeep, travelLoad,
  fuelCost,  roundTripMiles,      // displayed as its own line
  driveCost, roundTripMinutes,    // displayed as its own line
  anchorType, anchorAddress,
};
```
---

## 16. Appendix — reproduction

The shipped `estimateDistanceMiles` was executed directly against realistic inputs. Every symptom in §2 reproduces deterministically.

**The reading changes on every keystroke.** Typing one address, HQ held constant:

```
typed  6 chars ->  11.1 mi   '350 5t'
typed 10 chars ->  10.4 mi   '350 5th Av'
typed 14 chars ->   6.9 mi   '350 5th Ave, N'
typed 18 chars ->   7.6 mi   '350 5th Ave, New Y'
typed 22 chars ->   4.8 mi   '350 5th Ave, New York,'
typed 26 chars ->  12.5 mi   '350 5th Ave, New York, NY '
typed 30 chars ->   9.0 mi   '350 5th Ave, New York, NY 1011'
COMPLETE       ->   6.2 mi
```

The distance swings between 4.8 and 12.5 miles for one unchanging destination.

**The HQ address is ignored.** Same destination in Manhattan, HQ moved across the country:

```
 6.2 mi   HQ = 1102 Flatbush Ave, Brooklyn, NY 11226
 7.6 mi   HQ = 1102 Flatbush Ave, Los Angeles, CA 90210
 6.9 mi   HQ = 1 Main St, Anchorage, AK 99501
```

Anchorage to Manhattan reads as 6.9 miles. This is the clearest demonstration that no location data is involved anywhere in the calculation.

**Neighbors grade differently.** A $120 job, four consecutive houses on one street, against the shipped $3/$8 per-mile thresholds:

```
12 Oak St  ->  13.2 mi   $9.09/mi   FULL
13 Oak St  ->  13.9 mi   $8.63/mi   FULL
14 Oak St  ->  14.6 mi   $8.22/mi   FULL
15 Oak St  ->  15.3 mi   $7.84/mi   HALF
```

Three doors down flips the grade. Each added character raises the character sum by one, walking the output up a straight line until it crosses a threshold — the "distance" is measuring house numbers, not geography.
