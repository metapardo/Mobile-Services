# Weather Coverage — Scope PRD

**Status:** Draft v0.2 — for handoff to backend-engineer / frontend-engineer / integrations-engineer
**Date:** September 2026
**Owner:** Bob (Product)
**Source files:** `artifacts/api-server/src/integrations/google-maps.ts`, `artifacts/api-server/src/routes/places.ts`, `lib/db/src/schema/route-cache.ts`, `lib/db/src/rate-limit.ts`, `artifacts/detail-hub/src/pages/booking-new.tsx`, `artifacts/detail-hub/src/pages/calendar.tsx`, `SETUP_Google_Maps_API_Key.md`

**v0.2 changes:** added calendar-view coverage (day/week/month, §8) and resolved the Vercel/env-var open question from v0.1 (§4, was FR-3) with a concrete recommendation.

---

## 1. Problem

Nothing in the product tells an operator what the weather will be for an appointment before they book it, even though weather materially affects outdoor jobs (mobile detailing, and — per `settings.tsx`'s `BUSINESS_CATEGORIES` — landscaping, home/repair, and other categories this app already supports). The gap has been noticed before: `bookings.ts`'s schema history shows a `weatherSnapshot` column was added speculatively for an earlier PRD and then explicitly dropped (`PRD_DetailHub_Signup_Copy_and_Packages_Hardening.md` FR-9) because nothing populated it — "FR-11 says both come back for real later... don't re-add speculative columns for that now." This PRD is that "for real later": a real Google-backed integration, not a placeholder column.

## 2. Goals

- Show a real weather indicator next to the date field in the appointment-creation flow, for the appointment's actual date and service location.
- Show an at-a-glance weather icon for every day across the calendar's Day, Week, and Month views, so an operator can see the week ahead without opening each appointment.
- Follow the exact server-side integration discipline the codebase already established for Google Maps Platform (`google-maps.ts`) — one module owns the API key, proxy-only, cached where caching is safe.
- Ship a working v1 scoped to booking creation + calendar views — not a general weather feature across the app (see §10).

**Non-goals:** severe-weather alerts, push notifications, auto-rescheduling, historical weather, multi-day/hourly breakdowns beyond a single day-level condition. See §10.

## 3. Integration — new server module

Mirrors `google-maps.ts`'s structure exactly (same file's own header comment: *"This is the ONLY module in the codebase allowed to read `GOOGLE_MAPS_API_KEY`... never logged... never appears in any value returned to a route handler's caller."*).

| # | Requirement |
|---|---|
| FR-1 | New `artifacts/api-server/src/integrations/google-weather.ts` — the only module allowed to read the weather API key. Same `ConfigError`/`UpstreamError` error-class pattern as `google-maps.ts` (`GoogleWeatherConfigError`, `GoogleWeatherUpstreamError`). |
| FR-2 | **Do not guess Google's current Weather API (New) endpoint, request/response field names, or auth header from memory.** `google-maps.ts`'s own comment already warns about this for a *more* established API: *"These are the 'New' API generations... Do not 'fix' field names here from memory; re-check Google's live docs first."* Google's Weather API is a newer product than Places/Routes — whoever implements this must confirm the live endpoint, request shape, and forecast-horizon limit against Google's current documentation before writing the integration. |

## 4. API key and Vercel setup

`SETUP_Google_Maps_API_Key.md` already documents exactly how `GOOGLE_MAPS_API_KEY` got into this project's Vercel deployment (Step 8: `vercel env add GOOGLE_MAPS_API_KEY production`, repeated for `preview`/`development`) — since `artifacts/detail-hub` and `api-server` deploy as one Vercel project (same-origin, per `api/[...path].ts`'s own comment), that's the one place server env vars for this app live.

**Recommendation: a separate `GOOGLE_WEATHER_API_KEY`, not a reuse of the existing Maps key.** The existing key is deliberately locked down — `SETUP_Google_Maps_API_Key.md` Step 5: *"Under API restrictions, choose Restrict key and select exactly two: Places API (New), Routes API"* — specifically so a leaked key can't be used against anything else. Adding Weather to that same key means either loosening that restriction (weakens the existing key) or leaving Weather unrestricted on it (same effect). A second, narrowly-restricted key preserves the existing security posture instead of compromising it.

**Actions needed (Bob/whoever owns the Google Cloud project) — same project, mirrors `SETUP_Google_Maps_API_Key.md` Steps 3-8 for the new API:**

1. In the same Google Cloud project already used for Maps (`console.cloud.google.com/apis/library`), search **"Weather API"** → **Enable**. Confirm the exact product name in Google's current console — naming has shifted before (`SETUP_Google_Maps_API_Key.md`'s own "Do not enable the legacy 'Places API'" warning is precedent for this exact kind of trap).
2. Create a new key (`console.cloud.google.com/apis/credentials`), name it `mobull-weather-prod`, dismiss the app-restriction popup ("Maybe later" — same reasoning as the Maps key, Step 5), then set **API restrictions → Restrict key → Weather API only**.
3. Leave application restrictions as **None** for the same reason as the Maps key (Vercel serverless functions have no stable outbound IP unless you're paying for static egress) — revisit only if that changes.
4. Set a billing budget alert (`console.cloud.google.com/billing` → Budgets & alerts) the same way as the Maps key, since Google Weather API quotas are, like Maps, typically not caller-adjustable — the real spend cap is FR-5's rate limiter, not the Google console.
5. Repeat for a second, IP-restricted `mobull-weather-dev` key for local development (same rationale as Maps Step 7 — don't share one key between laptop and production).
6. **In Vercel:** `vercel env add GOOGLE_WEATHER_API_KEY production`, then repeat with `preview` and `development` targets (dev key for those) — identical mechanics to the existing Maps key. **Do not** prefix it `VITE_` — same warning as the Maps key: that would inline it into the client bundle.
7. Locally, add `GOOGLE_WEATHER_API_KEY=...` to `.env` (already `.gitignore`d, same as the Maps key).

No other Vercel action is needed — no new project, no new domain, no build-setting change. This is purely an env-var addition to the existing project, same mechanism already in place for Maps.

## 5. Route and rate limiting

| # | Requirement |
|---|---|
| FR-3 | New route `POST /weather/forecast` in `artifacts/api-server/src/routes/weather.ts`, gated by the existing `requireOrgSession` middleware, same pattern as `places.ts`/`routing.ts`. |
| FR-4 | New rate-limit bucket `weather` added to `RATE_LIMIT_DEFAULTS` (`lib/db/src/rate-limit.ts`): **`{ limit: 300, windowMinutes: 60 }`** — a placeholder pending real usage data, same explicit caveat the existing `routing` (200/hr) and `places` (500/hr) buckets carry, not values confirmed against Google's actual quotas. Reasoning for 300, not a copy of either neighbor: weather calls are coarser-grained than `places`' per-keystroke autocomplete traffic (one call per page load, not per character typed), but more frequent than `routing`'s per-booking lookups, since — per FR-19 — every calendar view load fires one. Sits between the two existing buckets rather than matching either. |
| FR-4a | **This bucket is not the thing that actually protects Google spend — the cache (FR-6-FR-8) is.** `weather` limits requests *into api-server*; it does nothing to limit *upstream Google calls* on its own, because most requests should be cache hits. If the cache is working, upstream Google traffic for a given org stays at roughly one call per FR-7's TTL window regardless of how many times `/weather/forecast` gets hit internally. If the cache is broken or misconfigured, this rate-limit bucket is the only backstop — set it as defense-in-depth, not as the primary cost control, and don't consider "the rate limit is set" equivalent to "Google spend is bounded." |
| FR-4b | **Open gap, worth closing before this ships:** FR-19 assumes one `/weather/forecast` call per calendar page load, reused across Day/Week/Month view switches in the same session — but that depends on the frontend actually caching the response client-side (e.g., a React Query key scoped to the org, not re-fetched on every view toggle) rather than re-fetching on each switch. Switching day → week → month rapidly without that client-side reuse would multiply calls per session and is exactly the kind of "surge" this bucket exists to catch — call this out explicitly in the frontend implementation, don't leave it implicit. |
| FR-5 | Request body: `{ placeId, latitude, longitude }` — **no `date` parameter.** Most forecast APIs (Google's included, pending FR-2's confirmation) return a multi-day forecast array from one call per location, not one call per day. The route requests the full available forecast horizon in a single upstream call and returns/caches every date in it — see FR-8. |

## 6. Caching

**Not the `route_cache` pattern.** `route_cache`'s 30-day TTL is correct for drive time (doesn't change day to day); a weather forecast does, so reusing that table/TTL would be wrong, not just non-optimal.

| # | Requirement |
|---|---|
| FR-6 | New `weather_cache` table: `(latitude rounded, longitude rounded, date, condition, temp fields, computed_at)`, unique on `(rounded_lat, rounded_lng, date)`. Round coordinates to ~2 decimal places (~1km) so nearby bookings, and every calendar view for the same org, share a cache hit. |
| FR-7 | TTL: short (hours, not 30 days) — forecasts change. Exact value (recommend 3-6 hours as a starting placeholder, same "pending real data" caveat as FR-4) needs Bob's or engineering's sign-off. |
| FR-8 | **One upstream call hydrates many cache rows.** Per FR-5, a single `POST /weather/forecast` call for one location returns Google's full forecast array (however many days out that turns out to be, per FR-2); the route writes one `weather_cache` row per date in that response, not one upstream call per date. This is what makes month view (§8, up to 42 visible dates) cheap: one upstream call for HQ's coordinates populates every date the month grid can actually show a real forecast for. |
| FR-9 | **Not organization-scoped**, matching `route_cache`'s own explicit precedent: weather at a place and date doesn't depend on which org asked, so scoping it per-org would fragment a cache that should be shared. Do not add `organizationId`/RLS here without re-reading `route-cache.ts`'s own comment on why it deliberately skips that. |

## 7. Forecast horizon

| # | Requirement |
|---|---|
| FR-10 | Most forecast APIs cap how far out they'll predict (commonly ~10 days) — confirm the real limit against Google's live docs (FR-2). A date beyond that horizon (a booking, or a calendar cell) shows a neutral "forecast not available yet" state, not a guessed icon and not an error. This is the common case for month view's later weeks — expected, not a bug. |

## 8. Frontend — booking creation flow

Placement is literal: next to the date field, on `booking-new.tsx`'s "Date and time" `Section` (`Section title="Date and time" icon={Calendar}`, `pages/booking-new.tsx:1344-1355`) — inline with the button that already shows `{dateLabel} at {fmtTime(time)}`.

| # | Requirement |
|---|---|
| FR-11 | New `weather-icon.tsx` component, styled consistently with `fuel-gauge-icon.tsx`'s pattern: small glyph inline in the Date and time row, tap opens a `Dialog` with the forecast detail (condition, temp range, precipitation chance). |
| FR-12 | Fetches once an address is selected (needs the service location) **and** a date is set — before either, the icon is hidden entirely, same precedent as the Recommended section: *"No address selected -> section hidden entirely, no empty shell."* This icon uses the appointment's own service address, not HQ — see §9 for why the calendar views use HQ instead. |
| FR-13 | UI states mirror Fuel Gauge's own discipline: `loading` / `ready` / `error` / `unavailable` (beyond-horizon, FR-10) / `unknown`. Never fabricate a condition icon when the call failed or the date is out of range. |
| FR-14 | Scoped to `booking-new.tsx` (creation flow) only for v1 — `booking-detail.tsx` is a later extension, not built here (§10). |

## 9. Frontend — calendar views (Day, Week, Month)

**What location does a calendar-day icon represent?** A single calendar day can have zero, one, or several bookings at different addresses — unlike the booking-creation flow (§8), there's no one obvious "the" address for a day. Two real options:

- **(a) HQ location for every day, every view.** Simple, cheap (one upstream call per FR-8 covers the org's entire visible forecast horizon), consistent, and matches how a normal weather-widget reads ("weather where you're based"). Doesn't reflect a specific out-of-area job's actual conditions — but that precision already lives in the per-appointment icon (§8), which this doesn't replace.
- **(b) The day's first/primary booking's address**, when one exists. More locally accurate on booked days, but undefined on empty days and ambiguous on multi-address days (which one wins?).

**Recommendation: (a), HQ-based, for all three calendar views.** It's the only option that's simple, consistent, and — thanks to FR-8 — nearly free (one cached call covers the month). (b) is a real future refinement if operators say the HQ reading is misleading on days with distant jobs, but it's not v1.

| # | Requirement |
|---|---|
| FR-15 | **Month view** (`pages/calendar.tsx`, month-grid day cells, `data-testid="calendar-month-cell-{date}"`, ~lines 460-472): a small weather glyph — icon only, no temperature label, the cell is only ~84px tall — added next to the day-number circle at the top of each cell. |
| FR-16 | **Week view** (`calendar-week-header-{date}`, ~lines 705-716): weather icon added to each column header, alongside the weekday letter and date circle. Tap opens the same forecast-detail popover as FR-11's booking-creation icon. |
| FR-17 | **Day view**: Day view's own top strip (the 7-day picker at ~lines 651-679 — weekday letter + date circle + a booking-presence dot, structurally near-identical to Week view's column headers but a separate block of JSX) gets the same weather icon per day. This strip already shows all 7 days at once even though the grid below shows one — "a weather icon for each day" applies to it the same way it applies to Week view's header. |
| FR-18 | *(Nice-to-have, not required to ship FR-15-17):* Week view's column headers and Day view's week strip are already near-duplicate JSX (`weekDays.map` + selected/today styling). Worth extracting a shared component now that a weather icon is a third thing both need to stay in sync — flagged as a clean opportunity, not a blocker. |
| FR-19 | All three views fetch HQ's forecast once per calendar load (not per cell/column) via FR-5/FR-8 and read from that single response locally — never one network call per visible day. |
| FR-20 | Every visible date gets an icon regardless of whether it has bookings (per the (a) decision above) — except dates beyond the forecast horizon (FR-10), which show the neutral "unavailable" state, not a missing icon that looks broken. |

## 10. B2B SaaS considerations

- **Multi-tenancy:** `weather_cache` deliberately un-scoped (§6, FR-9), matching `route_cache`'s existing precedent exactly.
- **Admin vs. end-user:** no new admin surface — an end-user (operator) feature only, in both the creation flow and the calendar.
- **Billing/plan-tier:** Google Weather API pricing/free-tier limits need checking against Google's current published rates before committing to a rollout plan.
- **API/integration surface:** one new internal proxy route (`POST /weather/forecast`); nothing external-facing changes.
- **Migration path:** none — fully additive; no existing data touched.
- **Security/compliance:** same bar as `google-maps.ts` — API key read server-side only, never logged, never returned to the client. §4 covers the separate-key rationale.

## 11. Not doing (v1)

- Weather on `booking-detail.tsx` — shows an appointment date today with no weather hook; extending there is a cheap follow-up once v1 is proven, but not built in this pass.
- Per-booking-address weather on the calendar (§9 option (b)) — HQ-based for v1.
- Severe-weather alerts, push notifications, or any proactive messaging.
- Auto-suggesting a reschedule when weather looks bad — informational only, no workflow change.
- Historical weather or an hourly/multi-day breakdown — a single day-level condition + temp range only.

## 12. Risks and open questions

- **The exact Google Weather API (New) endpoint, auth, request/response shape, and forecast horizon are not confirmed in this PRD** (FR-2) — blocking for `integrations-engineer` before implementation starts.
- **Real pricing/quota for the Weather API** — unconfirmed, needs the same live-docs check as the endpoint itself.
- **Cache TTL (FR-7)** — placeholder pending a real decision from Bob or whoever owns forecast-accuracy tolerance.
- **§9's HQ-vs-per-booking decision** — recommended as HQ, but worth a real product call before FR-15-17 are built, since it's genuinely a judgment call, not a technical constraint.

## 13. Rollout

- Feature-flagged behind confirming FR-2 (real API contract) first — no frontend work should start until the integration module's contract is confirmed against live Google docs.
- Once live, this becomes the real target for `PRD_Mobull_Onboarding_Flow.md`'s fourth welcome card and `PRD_Mobull_Marketing_Site_Value_Props.md`'s third value-prop screenshot — both are currently blocked on this shipping.
