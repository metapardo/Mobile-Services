# SEO Technical Remediation — PRD

**Status:** Draft v0.1 — for handoff to frontend-engineer
**Date:** September 16, 2026
**Owner:** Bob (Product)
**Source:** `SEO_Audit_Mobull_2026-09-16.md` (full audit, Mobile-Services root), `mobull-copy-brief.md` (brand voice/vocabulary constraints)

---

## 1. Overview

The SEO audit run against `mobull.app` today found the marketing site technically invisible to search engines: zero indexed pages, no sitemap, no structured data, no canonical tags, and a client-rendered SPA that ships its entire authenticated app bundle just to show a static marketing page. This PRD covers what's left after the mechanical, no-judgment-required fixes — six items that were resolved directly in this pass (Section 2) — and scopes the remaining Fail/Warning items that need real engineering decisions and testing (Section 3 onward).

## 2. Already resolved — no action needed

These six items from the audit's Technical SEO Checklist were fixed directly in this session, verified (valid JSON/XML, no path-pattern conflicts), and don't need further engineering work:

| Item | What changed |
|---|---|
| Canonical tags (was: Fail) | Added `<link rel="canonical" href="https://www.mobull.app/">` to `index.html`. Both `/` and `/signup` render this same static HTML shell and now declare the same canonical, resolving the duplicate-content issue the audit flagged. |
| Title tag (was: Warning) | Changed from "Mobull — Super Charge your mobile business." to "Mobull — Mobile Detailing Booking Software" — includes a real target keyword, 42 characters (well under the 60-char limit). |
| Meta description (was: Warning) | Rewritten to use the brief's own approved tagline ("Gas, time, weather — know what a job really costs before you take it.") plus a keyword-bearing second sentence. Fixes the "appointments" → "jobs" violation of `mobull-copy-brief.md` Section 9's vocabulary table, 153 characters (within the 150-160 target). OG and Twitter title/description updated to match — previously they held yet a *third*, older wording than either the page or the meta description, which was its own small inconsistency. |
| XML sitemap (was: Fail) | Created `public/sitemap.xml` listing the one real indexable URL (`https://www.mobull.app/`). Authenticated routes are correctly excluded — they were never supposed to be in a sitemap in the first place. |
| Robots.txt (was: Warning) | Added a `Sitemap:` directive pointing at the new sitemap. |
| Structured data (was: Fail) | Added `Organization` and `SoftwareApplication` JSON-LD to `index.html`. Deliberately **omits any `offers`/pricing property** — `mobull-copy-brief.md` Section 6 explicitly bans any pricing claims since the processor and plans aren't finalized; fabricating a price for the schema would violate that rule the same as writing it in prose would. |
| (Bonus, not in the audit's checklist) Indexation groundwork | Added `X-Robots-Tag: noindex, nofollow` headers in `vercel.json` for every authenticated/utility route (`/home`, `/calendar`, `/clients`, `/client/:id`, `/booking/*`, `/checkout*`, `/more*`, `/login`) — confirmed against the exact route list in `App.tsx`. This matters more than it looks: because this is a single-page app served through one catch-all rewrite, every route was serving the *identical* raw HTML (same title, same meta tags) to any crawler that doesn't execute JavaScript — meta-tag fixes alone wouldn't have stopped `/calendar` or `/checkout` from carrying the same marketing metadata as the homepage. An HTTP-level header, set at Vercel's edge independent of the rendered content, was the only reliable way to fix that. |

**Two important caveats on "Indexation" specifically:** the audit's Fail here (zero pages indexed) isn't something a config change fixes by itself — Google has to actually crawl and index the corrected page, which takes time and isn't guaranteed by having the right tags in place. The next real step is manual, not engineering: submit `https://www.mobull.app/sitemap.xml` in Google Search Console and request indexing for the homepage once it's verified there. That's a task for whoever owns the Search Console account, not something buildable here.

Second: the audit flagged that "Mobull" as a brand name collides with a Spotify artist, a Belgian art-logistics company, a mechanical bull rental service, and Bullhorn's "MoBull" staffing product. This means branded search ("Mobull") won't be a reliable acquisition channel even once indexed — worth flagging to whoever owns brand/positioning, since it affects how much weight to put on branded-search strategy versus the long-tail, mechanism-specific keywords the audit identified as the real opportunity (job cost, drive time, weather — see the audit's Keyword Opportunity Table).

## 3. Remaining Fail/Warning items — scoped for engineering

### 3.1 Crawlability / rendering (Warning)

**Current state:** Pure client-side-rendered SPA (Vite + React, no meta-framework). Googlebot can eventually render JavaScript and see the real content, but every other crawler — and Google's initial crawl pass before the render queue gets to it — sees an empty `<div id="root"></div>`.

| # | Requirement |
|---|---|
| FR-1 | Decide the rendering strategy for the public marketing routes (`/`, `/signup`) specifically — not the whole app. Two realistic options: (a) a build-time prerender step (e.g., a Vite prerendering plugin, or a simple script that renders the marketing route to static HTML at build time and outputs it alongside the SPA bundle) that only targets the unauthenticated marketing pages, or (b) a lightweight dynamic-rendering proxy that serves a prerendered snapshot to known crawler user agents. Recommend (a) — it's simpler, doesn't add a runtime dependency, and matches the fact that only two routes actually need this. |
| FR-2 | Whatever approach is chosen, it must not affect the authenticated app's rendering behavior at all — this app is not migrating to SSR, and Section 3.2's route-based code splitting is a more valuable and lower-risk fix for the authenticated side. |
| FR-3 | Verify the fix by fetching the marketing page's raw HTML with JavaScript disabled (e.g., `curl` or a fetch with no JS execution) and confirming real marketing copy — not an empty div — is present in the response. |

### 3.2 Page speed / bundle size (Fail)

**Current state:** 1.3MB single JS bundle. Because `App.tsx` imports every page component (Calendar, Payroll, Reporting, Checkout, Packages, etc.) directly at the top of the file with no lazy loading, visiting the marketing page at `/` downloads the entire authenticated app's code before a visitor has even signed up.

| # | Requirement |
|---|---|
| FR-4 | Convert the route-level imports in `App.tsx` to `React.lazy()` + `Suspense`, so each route's JS only loads when that route is actually visited. This is the single highest-leverage fix on this list — it's what's actually inflating the marketing page's load time, not anything content-related. |
| FR-5 | The marketing routes (`/`, `/signup`, `/login`) and the small set of components `AuthGate`/`AuthShell` depend on should stay in the main bundle (or their own small chunk) since they're needed immediately; everything behind `AuthGate` — `AppShell` and every page it routes to — is the right boundary for lazy-loading, since none of it can render until a session check passes anyway. |
| FR-6 | Add a loading state for the `Suspense` boundary that's consistent with the app's existing loading patterns (e.g., the `Loader2` spinner already used in `AuthGate` and `BookingNew`) rather than a blank screen during chunk load. |
| FR-7 | Verify with a real bundle analysis (`vite-bundle-visualizer` or equivalent) that the marketing page's initial JS payload drops substantially — set a concrete target once a baseline is measured, rather than declaring victory on "it's smaller now." |

### 3.3 Core Web Vitals (Warning)

| # | Requirement |
|---|---|
| FR-8 | This is explicitly downstream of FR-4–FR-7 — the audit noted Core Web Vitals weren't measured live, just inferred from bundle size. Once code splitting ships, run a real Lighthouse/PageSpeed Insights pass against the production `mobull.app` marketing page and record actual LCP/INP/CLS numbers as the baseline, rather than continuing to reason about this from bundle size alone. |

### 3.4 Broken links (Not checked)

| # | Requirement |
|---|---|
| FR-9 | Out of scope for this PRD to fix (nothing is known to be broken yet) — but worth a periodic automated check (e.g., a scheduled crawl with a tool like `linkinator` against the production site) rather than a one-time manual pass, since this is the kind of thing that silently rots as content gets added per Section 4. |

## 4. Content gaps — explicitly out of scope for this PRD

The audit's Keyword Opportunity and Content Gap tables identify real, high-opportunity content work (a "what a job really costs you" guide, a free job-profit calculator, comparison pages against Vagaro/Booksy/Square Appointments). This PRD deliberately does not scope that work — it's a content/product initiative requiring its own brief, not a technical remediation task, and one item in it needs explicit sign-off before it can proceed at all: **`mobull-copy-brief.md` has a hard rule against naming competitors in customer-facing copy, and the audit's own recommended comparison pages (Mobull vs. Vagaro/Booksy/Square Appointments) are a gray area that rule wasn't written to cover.** Whoever owns brand/positioning should rule on that explicitly before any comparison page gets drafted, let alone published.

## 5. Phased Rollout

**Phase 1 (done, this pass):** Section 2's six items — canonical, title/description, sitemap, robots.txt, structured data, noindex headers.

**Phase 2:** FR-4–FR-7 (code splitting) — highest remaining impact, self-contained, doesn't depend on anything else in this PRD.

**Phase 3:** FR-1–FR-3 (marketing-page prerendering) — can run in parallel with Phase 2 since it touches a different part of the build, but should land before investing heavily in Phase 4 content, since new content pages will have the same crawlability problem if the underlying rendering issue isn't fixed first.

**Phase 4 (separate initiative, not this PRD):** Content gap work per Section 4, gated on the competitor-naming decision for comparison pages specifically.

## 6. Risks & Open Questions

Does whoever owns the Google Search Console account for `mobull.app` exist yet, and can they submit the sitemap and request indexing once Phase 1 is live? This is a real, non-engineering blocker on "Indexation" actually resolving. Is the brand-name collision (Section 2's caveat) a big enough concern to affect naming/positioning decisions, or is it accepted as a known trade-off? Should Phase 3's prerendering approach be revisited if/when this app ever migrates to a meta-framework (Next.js/Remix) for other reasons — this PRD's recommendation is deliberately the smallest fix that solves the current problem, not a bet on the app's long-term architecture.
