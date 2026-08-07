# Appointment Optimizer — Product Requirements Document

**Status:** Draft v0.2
**Date:** August 5, 2026
**Owner:** Bob (Product)
**Platform:** Mobile Service Appointment Platform

---

## 1. Overview

Appointment Optimizer is a scheduling assist feature for the business owner's multi-technician calendar view. When booking a new appointment, the system suggests up to 6 times across the whole team, ranked by proximity to bookings already on the calendar. Instead of the owner manually scanning every technician's day and guessing which open slot minimizes drive time, the system searches the calendar itself for existing bookings near the new appointment's address, then checks whether the technician on each nearby booking has room to fit the new job in right before or after it.

The feature is built around one idea: the calendar already contains a set of fixed, known addresses. The cheapest, most profitable new appointment is almost always one slotted next to a job that's already happening nearby. Searching by location first — "what's already on the books near this address?" — is both the simpler implementation and the more natural way to find that answer, compared to checking every technician's full day one at a time. Because each existing booking belongs to exactly one technician, finding a nearby booking and confirming that technician is free before/after it automatically respects the rule that a suggested slot is only ever based on the technician who's already going to be there — never a teammate's schedule.

## 2. Problem Statement

Mobile service businesses (home services, mobile grooming, repair, cleaning, etc.) lose margin every time a technician drives further than necessary between jobs. Today, booking a new appointment is a manual, address-blind process — the owner or a scheduling admin picks an open slot without a clear view of how much drive time it adds to that day's route. This produces:

- Appointments booked far from other same-day work, inflating fuel cost and technician hours without inflating revenue.
- Technicians double-booked across the service area, arriving late to later jobs.
- No systematic way to prefer "gap-filling" bookings that make a route tighter and more profitable.

## 3. Goals & Success Metrics

| Goal | Metric | Target |
|---|---|---|
| Reduce drive time per booked day | Avg. fleet drive time per technician-day | -15% vs. pre-launch baseline |
| Increase margin per appointment | Avg. (revenue − variable cost) per booking | +10% vs. baseline |
| Drive adoption of suggested times | % of new bookings made using a suggested slot | ≥50% within 60 days of launch |
| Keep suggestions trustworthy | % of suggested slots accepted without modification | ≥70% |

## 4. Non-Goals (v1)

- Full route re-optimization of an already-booked day (we only slot *new* appointments into existing gaps — we don't move existing bookings).
- Dynamic/surge pricing based on slot desirability (may be a future phase).
- Multi-stop bundling of several new requests into one route in a single pass.
- Automated booking without owner/admin confirmation — v1 always presents suggestions for human selection.

## 5. Users & Core Story

**Primary user:** Business owner or scheduling admin at a mobile service business, booking a new appointment for a customer (by phone, in-app, or web).

**User story:** As the business owner, when I go to book a new appointment, I want the system to suggest the best available times based on my existing schedule and the new appointment's location, so I can offer the customer times that keep my day efficient and profitable — without manually cross-checking my calendar and a map.

## 6. Product Requirements

### 6.1 Functional Requirements

| # | Requirement | Priority |
|---|---|---|
| FR-1 | System accepts a new appointment request: customer address, service type, service duration, and a target date range. | P0 |
| FR-2 | System searches all existing bookings on the calendar within the target date range — across every technician — and filters to those whose address is within 45 minutes' drive of the new appointment's address. Each result is a candidate anchor, already tied to one specific technician. | P0 |
| FR-3 | For each candidate anchor, system checks the open (unbooked, in-business-hours) time immediately before and immediately after it, on that anchor's own assigned technician's calendar only — never a different technician's schedule. | P0 |
| FR-4 | System confirms the open time before/after the anchor is enough for `service_duration + travel time` to and from the anchor. | P0 |
| FR-5 | System detects double-anchored gaps — an open slot sitting directly between two consecutive bookings for the same technician, within 45 minutes of both — and treats these as highest priority. | P0 |
| FR-6 | System positions the suggested start time as tightly as possible against the anchor (accounting for drive time), not just anywhere in the gap. | P0 |
| FR-7 | Because eligibility starts from a calendar-wide proximity search (FR-2) rather than looping technician-by-technician, every qualifying candidate already carries its own technician — no separate cross-technician pooling step is needed before ranking. | P0 |
| FR-8 | Candidates are ranked: double-anchored > shorter total travel > higher slot margin > tighter time fit. | P0 |
| FR-9 | System returns up to 6 ranked candidates total across the whole team. A single technician (e.g., Josh) may contribute more than one of the 6 if more than one of his bookings independently qualifies as a nearby anchor. | P0 |
| FR-10 | Each suggestion displays the technician's name and a plain-language reason (e.g., "Josh — 12 min from his 1:00 PM job, same day"). | P0 |
| FR-11 | When the owner/admin selects a suggested slot, the booking form auto-fills both the date/time AND the technician from that suggestion — the technician is not left as a separate manual field to fill in. Owner can still change the technician manually afterward if they want to override it. | P0 |
| FR-12 | Config: the 45-minute travel radius is adjustable per business (admin setting), not hardcoded. | P1 |
| FR-13 | Track suggestion acceptance/override rate for reporting, including which technician's suggestions get accepted most. | P1 |
| FR-14 | When no existing booking anywhere on the calendar is within 45 minutes of the new address, show a distinct "no nearby bookings" state rather than a false suggestion. | P1 |

### 6.2 Scoring & Ranking Spec

The search starts from the calendar, not from a technician list: find bookings near the new address first, then check whether the specific technician on each of those bookings has room to take the job. This is a single proximity search over all bookings, followed by a cheap availability check on only the short list that already passed the location filter — not a full scan of every technician's day.

**Step 1 — Find candidate anchors:**

```
candidate_anchors = all bookings in the target date range
                     WHERE drive_time(new_address, booking.address) ≤ 45 min
```

This is technician-agnostic by design — it doesn't matter yet who's assigned. It just narrows the entire calendar down to the handful of bookings that are actually close enough to matter.

**Step 2 — Check availability on that anchor's own technician:**

For each candidate anchor, look only at the technician already assigned to it:

1. Is there open (unbooked, in-business-hours) time immediately before or immediately after that anchor, on that technician's calendar?
2. Is that open time ≥ `service_duration + travel_time` to/from the anchor?

If both are true, it's an eligible slot. A technician is never checked against another technician's anchor — the anchor and the availability check always belong to the same person.

**Suggested start time:**

```
Before anchor:  start_time = anchor.start − (service_duration + travel_time)
After anchor:   start_time = anchor.end + travel_time
```

**Double-anchored slots:** if two consecutive bookings belong to the same technician and the gap between them is small enough that a new appointment could sit within 45 minutes of both, that slot ranks above any single-anchored option — no backtracking, tightest possible fit.

**Ranking order among eligible candidates:**

1. Double-anchored slots rank above single-anchored slots.
2. Among ties, shorter total travel time (sum of both legs if double-anchored) ranks higher.
3. Among ties, the (technician, slot) pairing with higher margin ranks higher, where:

   ```
   Slot Margin = Service Revenue − Variable Cost
   Variable Cost ≈ (incremental drive distance × cost/mile) + (incremental drive time × technician hourly rate)
   ```

   "Incremental" drive distance/time is measured against the anchor-to-anchor baseline the route would already run, not the full trip from the technician's start point — this keeps the metric honest about the *marginal* cost this booking adds.
4. Among remaining ties, the slot that leaves the least unusable leftover gap wins (tighter fit = more of the day stays bookable).

**Output cap:** up to 6 candidates total across the whole team, deduplicated so near-identical times off the same anchor aren't shown twice. If one technician has several strong qualifying anchors, they can legitimately fill more than one of the 6 slots.

### 6.3 UX Requirements

- The owner's calendar view shows all technicians side by side; suggested times are shown as a short, ranked list of up to 6 (technician, time) pairs layered on top of that view, not a full manual scan.
- Every suggestion clearly labels which technician it applies to, with the reason text visible by default (e.g., "Josh — 12 min from his 1:00 PM job").
- If zero or one candidate qualifies across the entire team, the UI should say so plainly ("No nearby bookings on your team in the next 2 weeks — showing next available time instead") rather than silently falling back to an unrelated slot.
- Selecting a suggestion automatically sets the technician field on the booking form to that suggestion's technician (no separate manual technician pick required), along with the date and time; owner just confirms. The technician field remains editable afterward in case the owner wants to override it.
- Admin settings screen exposes the travel radius (default 45 min) as a single adjustable value, applied the same way to every technician.

## 7. Data Requirements

| Data | Source | Notes |
|---|---|---|
| Existing appointment addresses | Booking records | Must be geocoded (lat/long) at creation time, indexed for proximity search |
| New appointment address | Booking form input | Geocode on entry, before search runs |
| Technician assigned to each booking | Booking records | Needed to know whose calendar to check once a nearby anchor is found |
| Drive time between two addresses | Distance Matrix API (Google Maps, Mapbox, or equivalent) | Only computed for the short list of bookings that pass an initial radius pre-filter, not every booking on the calendar |
| Service pricing & duration | Service catalog | Needed for revenue and time-blocked calculations |
| Technician hourly cost, mileage cost | Business settings | Needed for the margin/variable cost calculation |
| Business hours | Business settings | Bounds valid windows |

## 8. System Considerations

- Because the search starts from "find nearby bookings," a simple geospatial index (or even a straight-line-distance bounding-box pre-filter) on booking addresses lets this run as one query instead of a loop over every technician's calendar. Precise drive-time (via a Distance Matrix API) only needs to be computed for the short list of bookings that pass that first cheap filter.
- Geocoding should happen once, at appointment creation, and be stored — not recomputed on every search.
- Drive-time lookups should be cached per (address A, address B) pair within a reasonable TTL.
- v1 does not require a full vehicle-routing engine — that's a v2+ consideration if the roadmap moves toward re-optimizing an already-booked day.

## 9. Edge Cases

| Case | Handling |
|---|---|
| No existing booking anywhere on the calendar is within 45 min of the new address | Show a "no nearby bookings" state rather than a false suggestion; optionally fall back to distance from a home base. |
| Only one anchor available near the new address | Single-anchor slots still qualify but rank below any double-anchored slot found elsewhere. |
| Two different technicians each have a nearby anchor at similar times | Both are shown independently, up to the 6-slot cap — the owner may prefer a specific technician even if travel cost is slightly higher. |
| One technician (e.g., Josh) has more nearby anchors than the rest of the team combined | All of his qualifying anchors compete on the same ranked list; he can occupy most or all of the 6 slots if his candidates genuinely outrank everyone else's. |
| Anchor appointment gets cancelled after a suggestion was shown | Suggestion should be invalidated/refreshed before booking is confirmed. |
| Owner selects a suggestion, then wants a different technician for that same time | Technician field auto-fills from the suggestion but stays editable — owner can manually swap it without losing the selected date/time. |
| Fewer than 6 eligible slots exist across the whole team | Show what's available; do not pad the list with ineligible options. |
| Business hours boundary cuts a gap short | Clip the available time at business open/close before checking for available duration. |

## 10. Phased Rollout

**Phase 1 (MVP):** Calendar-first proximity search (FR-1–FR-11) — find bookings near the new address across the whole team, check only that booking's own technician for availability, rank, and cap at 6. Manual booking confirmation with technician auto-fill on selection. This is not deferred or split by technician; the search is inherently team-wide from the start.

**Phase 2:** Configurable travel radius (FR-12), acceptance-rate tracking by technician (FR-13), "no nearby bookings" fallback refinement (FR-14).

**Phase 3:** Owner-adjustable ranking weights (e.g., prioritize margin vs. tightness vs. a preferred technician).

**Phase 4 (future):** Full-day route re-optimization across the team, dynamic pricing for high-value slots, demand forecasting.

## 11. Metrics & Instrumentation

- Suggested-slot acceptance rate (accepted as-is vs. modified vs. ignored).
- Average technician drive time per day, pre- vs. post-launch.
- Average margin per booking, pre- vs. post-launch.
- Distribution of double-anchored vs. single-anchored bookings over time (should trend toward double-anchored as the feature matures and calendars fill in).

## 12. Risks & Open Questions

- **Data quality risk:** stale or incorrect addresses on existing bookings will silently produce bad recommendations — needs validation at entry.
- **API cost risk:** distance-matrix calls at scale need caching/rate-limit strategy; needs eng sizing before Phase 2.
- **Open question:** should the initial proximity pass use straight-line distance as a cheap pre-filter before computing real drive time on the short list, or call the Distance Matrix API directly for every nearby booking?
- **Open question:** how should the system behave for services with highly variable duration (e.g., estimate ranges) when calculating available fit?
- **Open question:** do we want owner-level override of ranking weights in Phase 1, or hold that for Phase 3 as scoped above?

## 13. Appendix — Core Formulas

```
# Step 1: search the whole calendar for nearby bookings (technician-agnostic).
candidate_anchors = all bookings in date range
                     WHERE drive_time(new_address, booking.address) ≤ 45 min

# Step 2: for each candidate anchor, check only its own assigned technician.
For each candidate_anchor:
    T = candidate_anchor.technician

    Eligible if:  open time immediately before/after candidate_anchor, on T's own calendar,
                  ≥ service_duration + drive_time(new_address, candidate_anchor.address)

    Suggested start (before anchor) = anchor.start − (service_duration + drive_time)
    Suggested start (after anchor)  = anchor.end + drive_time

    Slot Margin = Service Revenue − [(incremental drive distance × cost/mile)
                                     + (incremental drive time × technician hourly rate)]

Ranking:  double-anchored > shorter total travel > higher slot margin > tighter time fit
Output:   up to 6 ranked candidates
          (one technician may contribute several of the 6 if their anchors genuinely rank highest)
```
