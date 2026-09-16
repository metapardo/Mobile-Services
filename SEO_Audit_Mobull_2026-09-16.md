# Mobull SEO Audit — Full Site Audit

**Date:** September 16, 2026
**Site audited:** mobull.app
**Competitors:** Vagaro, Booksy, Square Appointments (user-provided)

---

## Executive Summary

Mobull's marketing site (mobull.app) has a coherent brand voice and a genuinely differentiated product story, but it's SEO-invisible today: **zero indexed pages**, no sitemap, no structured data, no canonical tags, and a single-page client-rendered app that ships its entire authenticated app bundle (1.3MB JS) just to show a marketing page. There's also zero long-tail content — competitors (Jobber, Housecall Pro, QuoteIQ) own the exact "how much to charge" and "job cost/margin" search space that is *literally Mobull's core positioning*, and nobody's contesting it.

**Biggest strength:** The product's differentiation (drive-time + fuel cost + weather priced into every job, before you accept it) maps directly onto real, already-established search demand — "how much to charge for mobile detailing," "true cost per job," "mobile detailing profit margins" are all active queries competitors rank for using worse content than what Mobull's own product mechanic could prove.

**Top 3 priorities:**
1. Fix technical foundations (sitemap, canonical, structured data, robots.txt) — currently blocking any organic growth regardless of content quality.
2. Publish 2-3 pieces of content in the "arithmetic is the proof" space (job-cost/margin guides, a free calculator) — this is uncontested ground that matches the product's actual mechanism.
3. Reduce the JS payload the marketing page ships, since it's currently loading the entire authenticated app (calendar, payroll, reporting, etc.) to render a static hero.

**Overall assessment: Critical issues.** Not a "needs polish" situation — the site is essentially starting from zero on discoverability, which is normal for a pre-launch product but means every item below is greenfield work, not incremental fixes.

**Additional context:** A `site:mobull.app` search returned zero results — the site is not indexed anywhere yet. The "Mobull" brand name itself also collides with several unrelated entities (a Spotify artist, a Belgian art-logistics company, a mechanical bull rental service, and Bullhorn's "MoBull" staffing app), so branded search won't be a reliable acquisition channel even once indexed.

---

## Keyword Opportunity Table

| Keyword | Est. Difficulty | Opportunity Score | Current Ranking | Intent | Recommended Content Type |
|---|---|---|---|---|---|
| mobile detailing software | Hard | Medium | Not ranked | Commercial | Homepage / feature page |
| mobile detailing booking app | Moderate | High | Not ranked | Commercial | Homepage / feature page |
| mobile detailing scheduling software | Moderate | High | Not ranked | Commercial | Feature page |
| app for mobile detailers | Easy–Moderate | High | Not ranked | Commercial | Homepage |
| auto detailing business software | Hard | Medium | Not ranked | Commercial | Feature page |
| how much to charge for mobile detailing | Moderate | High | Not ranked | Informational/Commercial | Pricing guide (blog) |
| mobile detailing profit margins | Easy | High | Not ranked | Informational | Guide (blog) — direct positioning match |
| true cost per job detailing | Easy | High | Not ranked | Informational | Guide (blog) — direct positioning match |
| mobile detailing pricing calculator | Easy | High | Not ranked | Transactional | Free tool / interactive page |
| how far should I drive for a detailing job | Easy | Medium | Not ranked | Informational | Blog / FAQ |
| mobile detailing route planning | Easy | Medium | Not ranked | Informational | Blog |
| best software for mobile detailers 2026 | Hard | Medium | Not ranked | Commercial | Comparison/listicle page |
| Vagaro alternative for mobile detailing | Moderate | High | Not ranked | Commercial | Comparison page |
| Booksy alternative for mobile detailers | Moderate | High | Not ranked | Commercial | Comparison page |
| Square Appointments alternative mobile business | Moderate | Medium | Not ranked | Commercial | Comparison page |
| Mobull vs Vagaro | Easy | High | Not ranked | Commercial | Comparison page |
| Mobull vs Booksy | Easy | High | Not ranked | Commercial | Comparison page |
| ceramic coating scheduling software | Easy | Medium | Not ranked | Commercial | Niche landing page |
| mobile car wash business app | Moderate | Medium | Not ranked | Commercial | Homepage variant / feature page |
| how to know if a job is worth it detailing | Easy | High | Not ranked | Informational | Blog — matches Fuel Gauge exactly |
| mobile detailing job costing | Easy | High | Not ranked | Informational | Guide (blog) |
| free mobile detailing scheduling app | Moderate | Medium | Not ranked | Transactional | Homepage (trial CTA) |
| detailing app that calculates gas cost | Easy | High | Not ranked | Commercial | Feature page — exact-match Fuel Gauge |
| mobile detailer weather scheduling | Easy | Low–Medium | Not ranked | Informational | Blog / FAQ |
| what is a mobile detailing business | Easy | Low | Not ranked | Informational | Top-of-funnel guide |

---

## On-Page Issues Table

| Page | Issue | Severity | Recommended Fix |
|---|---|---|---|
| `/` and `/signup` | Title tag has zero target keywords ("Mobull — Super Charge your mobile business.") | High | Rework to include a category keyword, e.g. "Mobull — Mobile Detailing Business Software \| Know Before You Go" (respect the 50-60 char limit) |
| `/` and `/signup` | Meta description uses "appointments" (banned per `mobull-copy-brief.md`) and no target keyword | Medium | Rewrite using "jobs" per the brief AND work in a keyword phrase naturally |
| `/` and `/signup` | No `<link rel="canonical">` anywhere — root and `/signup` render identical content with no canonical declared | Critical | Add canonical tags pointing both to one URL (recommend `https://www.mobull.app/`) |
| Site-wide | No JSON-LD structured data at all | High | Add `Organization` + `SoftwareApplication` schema minimum; `FAQPage` schema once FAQ content exists |
| Site-wide | H1/H2 copy is 100% brand-voice, zero keyword presence (by design, per copy brief — hero is off-limits) | Medium | Can't touch H1 per current constraints; recover keyword relevance through H2/H3 wording on new content pages instead |
| All app screenshots | Alt text present but no natural keyword inclusion | Low | Minor — not worth forcing, low priority |
| `/calendar`, `/booking/*`, `/checkout`, etc. | These authenticated routes all resolve through the same `vercel.json` catch-all rewrite to `index.html` with no `noindex` | Medium | Add `X-Robots-Tag: noindex` via Vercel headers config for all non-marketing routes, or a client-side `noindex` meta for authenticated views |

---

## Content Gap Recommendations

| Topic/Keyword | Why it matters | Format | Priority | Effort |
|---|---|---|---|---|
| "What a job really costs you" (margin/true-cost-per-job guide) | Beancount.io already ranks here; this is Mobull's *exact* positioning statement turned into content — highest-leverage gap on the list | Blog / pillar guide | High | Moderate |
| Mobile detailing job profit calculator | Zero competitors offer this as a real interactive tool; matches brief's "arithmetic is the proof" doctrine exactly — could literally reuse Fuel Gauge's calculation logic client-side | Free interactive tool page | High | Substantial |
| "How much to charge for mobile detailing" | High-intent query Jobber/Housecall Pro/Invoice Fly all rank for; easy to out-specificity with real package-tier data ($158/$278/$443 is the going market range) | Blog / pricing guide | High | Moderate |
| Mobull vs. Vagaro / Booksy / Square Appointments (comparison pages) | Direct commercial intent, low competition for the "for mobile detailers" long tail specifically — Booksy has a documented weak spot (no vehicle data model) worth citing factually | 3 comparison landing pages | High | Moderate |
| "How far is too far to drive for a job" | Zero content ownership anywhere; maps 1:1 to the Fuel Gauge mechanism and the hero's own line | Blog / FAQ | Medium | Quick win |
| Mobile detailing route planning / reducing dead driving | Adjacent to Jobber's routing content but under-served for solo/1-2 person operators specifically | Blog | Medium | Moderate |
| No blog/resources section exists at all | Every gap above requires this infrastructure first | New `/resources` or `/guides` route + CMS or MDX setup | High | Substantial (dependency for everything else) |

---

## Technical SEO Checklist

| Check | Status | Details |
|---|---|---|
| HTTPS | Pass | Served via Vercel, confirmed via `og:url` |
| Mobile-friendly / responsive | Pass | Viewport meta present, verified responsive CSS this session |
| Title tag present/unique | Warning | Present but no keyword targeting |
| Meta description present | Warning | Present, correct length, contains banned word "appointments," no keyword |
| Canonical tags | Fail | Absent entirely |
| XML sitemap | Fail | Does not exist |
| Robots.txt | Warning | Exists, allows all, but doesn't reference a sitemap and doesn't exclude authenticated app routes |
| Structured data (schema.org) | Fail | None present anywhere |
| Crawlability / rendering | Warning | Pure client-side-rendered SPA, no SSR/prerendering — relies entirely on Googlebot's JS render queue; other crawlers get an empty `<div id="root">` |
| Page speed / bundle size | Fail | 1.3MB single JS bundle, no route-based code splitting — the marketing page loads the entire authenticated app |
| Core Web Vitals (observable signals) | Warning | Large render-blocking bundle likely hurts LCP; not measured live this session |
| Broken links | Not checked | Would require a live crawl outside this session's scope |
| Indexation | Fail | Confirmed via `site:mobull.app` search — zero pages indexed |

---

## Competitor Comparison Summary

| Dimension | Mobull | Vagaro | Booksy | Square Appointments |
|---|---|---|---|---|
| Keyword footprint | None (pre-launch) | Broad (salon/spa/fitness category leader) | Broad (marketplace-driven, salon focus) | Broad (general appointments, huge domain authority via Square) |
| Content depth | None (no blog) | Deep (established blog + support docs) | Deep (blog + comparison content) | Very deep (Square's overall content/domain authority) |
| Vertical fit for mobile detailing | Purpose-built (only one of the four) | Generic — not vehicle-aware | Generic — confirmed no vehicle data model | Generic — general service business |
| Domain authority signal | New/unranked | Established | Established | Very high (Square brand) |
| SERP feature presence | None | Likely (reviews, sitelinks) | Likely (marketplace listings) | Likely (strong brand SERP presence) |
| **Winner** | — | Content/authority | Marketplace distribution | Domain authority |

Mobull's real edge isn't out-authoring these three on generic scheduling-software terms — that's a losing fight against Square's domain authority alone. The edge is the vertical-specific, mechanism-specific long tail (job cost, drive time, weather, "for mobile detailers") where none of the three has purpose-built content, because none of the three is built for this trade specifically.

---

## Prioritized Action Plan

**Quick Wins (do this week):**
- Add `<link rel="canonical">` to `index.html` — *High impact, no dependencies*
- Rewrite title tag and meta description to include a target keyword and fix the "appointments" → "jobs" inconsistency — *High impact, no dependencies*
- Add `Sitemap:` line to `robots.txt` (even a stub, ahead of the sitemap existing) and generate a basic `sitemap.xml` for the one real public route — *Medium impact*
- Add `Organization` + `SoftwareApplication` JSON-LD schema to `index.html` — *Medium impact*

**Strategic Investments (plan for this quarter):**
- Stand up a `/resources` or `/guides` section (blog infrastructure) — *High impact, blocks everything else content-related, substantial effort*
- Publish the "what a job really costs you" margin guide and the free job-profit calculator tool — *High impact, depends on blog infra; calculator is substantial effort but a strong linkable asset*
- Publish 3 competitor comparison pages (Mobull vs. Vagaro/Booksy/Square Appointments) — *High impact, moderate effort, depends on legal/positioning review since these name competitors (the copy brief bans naming competitors in *marketing* copy generally — comparison pages are a different content type and would need explicit sign-off before publishing)*
- Route-based code splitting so the marketing page doesn't ship the authenticated app's JS — *High impact on page speed/Core Web Vitals, substantial engineering effort, likely a `frontend-engineer` task*
- Add `noindex` headers for authenticated app routes — *Medium impact, low-moderate effort*

---

**Note:** Publishing head-to-head comparison pages naming Vagaro/Booksy/Square Appointments would need explicit go-ahead — `mobull-copy-brief.md` currently has a hard rule against naming competitors in customer-facing copy, and a comparison page is a gray area that rule wasn't written to cover.

## Follow-Up Options

- Draft content briefs for the top keyword opportunities
- Write the title tag / meta description fix and canonical tag (unambiguous, no sign-off needed)
- Draft the "what a job really costs you" guide as a first blog post
- Dive deeper into any specific section above
