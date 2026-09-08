# Fuel Gauge — Product Requirements Document

**Status:** Draft v0.1
**Date:** August 5, 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform

---

## 1. Overview

Fuel Gauge is an at-a-glance visual indicator — a gas gauge icon showing Empty, Half, or Full — displayed on every booking in the calendar. It tells the business owner, without any math, whether a booking's price is a good return for the distance (or, in dense traffic areas, the time) a technician has to travel to reach it.

Where Appointment Optimizer helps decide where to put a *new* booking, Fuel Gauge is a read-only diagnostic on bookings that are *already* on the calendar — a quick health check the owner can scan across a day or week to spot which jobs are efficient and which are quietly expensive to service.

## 2. Problem Statement

Business owners have no fast way to tell, at a glance, whether an already-booked appointment is a profitable use of a technician's drive time. A $200 job 25 miles away might net less than a $75 job three minutes down the street once fuel and time are accounted for, but nothing on the calendar surfaces that today. Owners would have to manually estimate distance and compare it to price for every booking — something nobody actually does in practice, so low-value, high-travel bookings go unnoticed until margins are already thin.

## 3. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Surface low-value-for-distance bookings | % of bookings landing in "Empty" | Establish baseline in first 30 days, trend down over time |
| Drive awareness/engagement with the indicator | % of owners who open the detail breakdown at least weekly | ≥40% within 60 days |
| Inform pricing decisions | Qualitative: owners report using gauge data to adjust pricing for far-out bookings | Tracked via feedback, not a hard target in v1 |

## 4. Non-Goals (v1)

- No automatic pricing changes or booking recommendations — Fuel Gauge is a diagnostic, not an action.
- No live traffic data beyond the static borough-based metric switch (see 6.2).
- No per-technician Home Base addresses in v1 — one business-wide Home Base only.
- No re-routing or rescheduling of existing bookings based on the gauge reading.

## 5. Users & Core Story

**Primary user:** Business owner or scheduling admin reviewing their calendar.

**User story:** As the business owner, when I look at my calendar, I want to see at a glance which bookings are worth the drive and which aren't, so I can make smarter pricing and scheduling decisions going forward without doing the math myself for every job.

## 6. Product Requirements

### 6.1 Functional Requirements

| # | Requirement | Priority |
|---|---|---|
| FR-1 | For each booking, system determines a reference anchor using only that technician's own other bookings that day: if there's no other booking that day, the anchor is the business's Home Base Address; if there's exactly one adjacent booking (first or last of the day), the anchor is that booking's address; if there are bookings both before and after, the anchor is whichever of the two is nearer. | P0 |
| FR-2 | System determines whether the booking's own address falls within the 5 NYC boroughs (Manhattan, Brooklyn, Queens, Bronx, Staten Island). | P0 |
| FR-3 | If the booking is within the 5 boroughs, system computes drive time (minutes) between the booking address and the reference anchor. Otherwise, system computes drive distance (miles). | P0 |
| FR-4 | System computes Fuel Rate = this booking's total service price ÷ the reference metric from FR-3 (dollars per minute inside the boroughs, dollars per mile everywhere else). | P0 |
| FR-5 | System buckets Fuel Rate into Empty / Half / Full using business-configurable thresholds — a $/mile threshold pair for standard mode, a separate $/minute threshold pair for borough mode. | P0 |
| FR-6 | System displays a gas gauge icon (Empty/Half/Full) on each booking in the calendar view, reflecting its bucket. | P0 |
| FR-7 | Selecting/hovering the icon shows the underlying numbers: price, distance or time used, resulting $/mile or $/min, and which anchor (Home Base, previous booking, or next booking) was used. | P1 |
| FR-8 | Admin settings screen exposes both threshold pairs (standard $/mile empty/full cutoffs, borough $/minute empty/full cutoffs) as adjustable values. | P1 |
| FR-9 | Admin settings screen allows the business to set/edit a single Home Base Address, used whenever a technician has no other booking that day. | P0 |
| FR-10 | Gauge recalculates when a booking's price, address, or technician changes, or when an adjacent same-day booking is added, moved, or cancelled. | P1 |

### 6.2 Scoring Spec

**Step 1 — Pick the reference anchor** (same-technician only, mirrors the anchor rule from Appointment Optimizer):

```
if technician has no other booking that day:
    anchor = Home Base Address
elif only one adjacent booking exists that day (first or last booking):
    anchor = that adjacent booking's address
else (sandwiched between two same-day bookings):
    anchor = nearer of (previous booking's address, next booking's address)
```

**Step 2 — Choose the metric based on where the job is:**

```
if booking.address is within the 5 boroughs (Manhattan, Brooklyn, Queens, Bronx, Staten Island):
    metric = drive_time_minutes(booking.address, anchor)
    mode = "borough" (dollars per minute)
else:
    metric = drive_distance_miles(booking.address, anchor)
    mode = "standard" (dollars per mile)
```

Distance is used everywhere else because it maps more directly to actual fuel burned; drive time is used inside the boroughs because dense traffic breaks the correlation between miles and real cost — a short crosstown trip can burn more time and gas than a much longer suburban or highway trip.

**Step 3 — Compute the rate and bucket it:**

```
Fuel Rate = Total Service Price ÷ metric

if mode == "standard":
    Empty:  Fuel Rate < $X / mile   (default X = 3)
    Half:   $X ≤ Fuel Rate < $Y / mile   (default Y = 8)
    Full:   Fuel Rate ≥ $Y / mile

if mode == "borough":
    Empty:  Fuel Rate < $A / minute   (default A = 1.50)
    Half:   $A ≤ Fuel Rate < $B / minute   (default B = 4.00)
    Full:   Fuel Rate ≥ $B / minute
```

All four defaults (X, Y, A, B) are placeholders to launch with — they should be revisited once real bookings generate enough data to calibrate against actual fuel and labor costs.

### 6.3 UX Requirements

- Each booking card/entry in the calendar shows a small gas gauge icon (needle or fill-level style) in one of three states: Empty, Half, Full.
- Tapping or hovering the icon reveals the breakdown: price, the metric used (miles or minutes), the resulting rate, and which anchor it was measured against — this builds trust in the number rather than leaving it as an unexplained icon.
- Bookings with unknown/ungeocoded addresses or missing pricing show a neutral "unknown" state rather than defaulting to Empty, so the owner isn't misled by incomplete data.
- Admin settings page includes: Home Base Address (single field), standard mode $/mile thresholds, and borough mode $/minute thresholds — each with the current defaults pre-filled and editable.

## 7. Data Requirements

| Data | Source | Notes |
|---|---|---|
| Booking address | Booking records | Already required for Appointment Optimizer — reuse the same geocoded lat/long |
| Total service price (this booking) | Booking records | Sum of line-item services on this specific booking |
| Technician assigned to booking | Booking records | Needed to determine same-day adjacency |
| Home Base Address | New business setting | Single, business-wide in v1 |
| Borough/geofence status of an address | Zip-code table, geocode sublocality field, or a lat/long boundary check | Should be a cheap local lookup, not a live API call |
| Drive distance & drive time between two addresses | Distance Matrix API (reuse the same integration/cache built for Appointment Optimizer) | Only needs to be computed once per booking's anchor, not continuously |
| $/mile and $/minute threshold pairs | New business settings | Two independent pairs, since the units aren't comparable |

## 8. System Considerations

- This shares its core address/distance infrastructure with Appointment Optimizer — the geocoding, Distance Matrix integration, and caching layer built for that feature should be reused rather than duplicated.
- The borough geofence check should be resolved locally (a bundled zip-code-to-borough table or a simple polygon check) rather than an API round trip, since it needs to run for every booking rendered on the calendar.
- Recompute the gauge lazily — on booking save/update and on calendar load — rather than continuously in the background; this is a diagnostic display, not a live routing engine.

## 9. Edge Cases

| Case | Handling |
|---|---|
| Booking has no technician assigned yet | No same-day adjacency can be determined; fall back to Home Base, or show "unknown" until a technician is assigned. |
| Booking address can't be geocoded | Show "unknown" gauge state, not a false Empty reading. |
| Total service price is $0 or missing | Show "unknown" rather than Empty — a missing price isn't the same as a bad rate. |
| Adjacent booking gets cancelled/rescheduled after the gauge was shown | Recompute per FR-10 rather than leaving a stale reading. |
| Address sits right at a borough boundary | Best-effort geofence result is acceptable; this doesn't need to be exact to the foot. |
| Home Base not yet configured | Prompt the admin to set one before the gauge can compute for sole-booking days; show "unknown" until then. |

## 10. Phased Rollout

**Phase 1 (MVP):** Anchor logic (FR-1), borough-aware metric switch (FR-2, FR-3), Fuel Rate calculation and bucketing with fixed default thresholds (FR-4, FR-5), gauge icon on the calendar (FR-6), Home Base setting (FR-9).

**Phase 2:** Tooltip/detail breakdown on tap (FR-7), configurable thresholds in admin settings (FR-8).

**Phase 3:** Live recompute on booking/adjacency changes (FR-10), per-technician Home Base override.

**Phase 4 (future):** Real-time traffic data instead of the static borough toggle, generalize the "dense metro" logic beyond the 5 NYC boroughs for businesses expanding elsewhere, correlate gauge history against actual tracked fuel expenses if the platform ever captures those.

## 11. Metrics & Instrumentation

- Distribution of bookings across Empty / Half / Full over time.
- Trend of "Empty" bookings over time (a decreasing trend suggests better pricing/scheduling decisions upstream).
- Engagement rate with the detail breakdown (FR-7).
- Once available, correlation between gauge readings and actual reported fuel/mileage expense.

## 12. Risks & Open Questions

- **Calibration risk:** the default $/mile and $/minute thresholds are starting guesses, not derived from real cost data — plan to revisit after a data collection period.
- **Geofence data source:** needs an eng decision between a static zip/borough table, a geocoding API's sublocality field, or a bundled polygon boundary — affects both accuracy and whether it requires a live API call.
- **Open question:** should Total Service Price be net of any discounts/promotions applied, or the gross list price?
- **Open question:** should the dense-traffic (drive-time) logic ever generalize beyond the 5 NYC boroughs, e.g., for other congested metros the business might expand into?
- **Open question:** is a single business-wide Home Base sufficient for v1, or do enough technicians start their day from different locations to justify per-technician Home Base sooner than Phase 3?

## 13. Appendix — Core Formulas

```
# Step 1: pick the anchor (same technician's own bookings only, or Home Base)
if technician has no other booking that day:
    anchor = Home Base Address
elif only one adjacent booking exists:
    anchor = that adjacent booking's address
else:
    anchor = nearer of (previous booking, next booking)

# Step 2: choose metric based on the booking's own location
if booking.address ∈ {Manhattan, Brooklyn, Queens, Bronx, Staten Island}:
    metric = drive_time_minutes(booking.address, anchor)
    mode = "borough"
else:
    metric = drive_distance_miles(booking.address, anchor)
    mode = "standard"

# Step 3: compute and bucket
Fuel Rate = Total Service Price / metric

standard mode:  Empty < $3/mi ≤ Half < $8/mi ≤ Full
borough mode:   Empty < $1.50/min ≤ Half < $4.00/min ≤ Full
```
