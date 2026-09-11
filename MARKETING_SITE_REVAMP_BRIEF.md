# Marketing Site Revamp — Execution Brief

**For:** `/impeccable` (this repo already has it configured — `.claude/skills/impeccable`)
**Target file:** `artifacts/detail-hub/src/pages/signup.tsx` (the public marketing/signup page, mounted at `/`)
**Type:** Refinement of a live page — preserve everything not named below (product truth, existing copy voice, the working signup form, the design system's glass/gradient treatment).
**Relationship to prior work:** this brief supersedes the "new value-props section" scope in `PRD_Mobull_Marketing_Site_Value_Props.md` — it now covers the full page, not just one section under the hero.

---

## How to run this

From the repo root, in Claude Code:

```
/impeccable shape marketing site homepage restructure — read MARKETING_SITE_REVAMP_BRIEF.md in full before proposing a plan, target artifacts/detail-hub/src/pages/signup.tsx
```

`shape` plans the UX/structure first rather than jumping straight to code — worth it here since this touches six of the page's eight sections (two new, two removed, two reordered/rewritten). Once the plan looks right, let it proceed into the build.

If you'd rather skip planning and go straight to execution, drop `shape` and just run `/impeccable` with the same target — it'll treat this as a refinement of the incumbent page per its own routing rules.

**Two spots below are marked `⚠ CONFIRM` — real ambiguity in the source notes, not resolved here.** Worth answering before the run, or flag them for Claude to ask about during `shape`.

---

## Final section order (top to bottom)

1. Hero — **unchanged**
2. **NEW** — "Grow your Business" (replaces current `id="why"` / "01 / Get your day back")
3. **NEW** — "Everything you need in 1 app" (replaces current `id="features"` bento section)
4. "Getting Started is easy" (moved here from position 2; current `id="workflow"` / "02 / From inquiry to income," restructured)
5. Story (current `04 / In the field` quote section) — **unchanged**
6. ~~Compare~~ — **removed**
7. ~~FAQ~~ — **removed**
8. Pricing (current `07`-equivalent position) — **"Get Started for Free," rebuilt as a journey**
9. Access/signup form + Footer — **unchanged**

---

## Section 2 — "Grow your Business"

Replaces `ChaosSection` (`id="why"`). New component, same section styling primitives (`Reveal`, eyebrow, `section-title`, `section-intro`) the rest of the page already uses.

**Eyebrow / title:** Grow your Business

Three callouts, side by side (or stacked on mobile):

| Headline | Body copy |
|---|---|
| Book the right Jobs | Use Mobull's Trip Calculator to check distance, drive time, and fuel cost — so you know if a new job is worth the drive before you book it. |
| Right Job, Right Time | Our smart calendar recommends times that connect a new job with ones you already have booked in that area — keeping you in the same area each day. |
| Weather Wise | Weather indicators let you avoid or seek out sun, snow, and rain — so you can book on the days that work best for your service. |

Notes:
- "Trip Calculator" is marketing-copy naming for the existing Fuel Gauge feature (`lib/fuel-gauge.ts`) — a copy choice, not a product rename. Don't touch the in-app feature name.
- Add a real product screenshot to the "Book the right Jobs" callout (per the earlier screenshot brief in `PRD_Mobull_Marketing_Site_Value_Props.md` §11 — Fuel Gauge's tap-to-reveal breakdown, from a demo org, no real customer data).
- Minor tightened wording from the source notes ("checks, distance" → "check distance"; "avoid or seek sun, snow, and rain" → "avoid or seek out sun, snow, and rain") — flag if you want the rawer phrasing kept instead.

---

## Section 3 — "Everything you need in 1 app"

**New section, replacing `FeatureBento` (`id="features"`) entirely** — not layered on top of it. Reuse `FeatureBento`'s existing glass-card styling as the visual starting point (`bento-card`/`.glass` treatment already in the design system), but the current type scale in that component is undersized and not proportioned for mobile — fix both as part of this build, don't just inherit the bug.

**Layout:** two columns on desktop — callout cards/bubbles stacked on the left, a video reel of the product experience filling the right-hand side. Stack vertically (video first or last, your call) on mobile.

**Title:** Everything you need in 1 app

Three callouts:

| Headline |
|---|
| Book Jobs on calendar smartly |
| Know what Jobs are good for your business |
| Manage customer history, financial reports, and take payments |

Notes:
- No body copy was given for these three — headline-only callouts (cards or pill/bubble treatment, your call) unless you want to draft one-liners for each; flag before adding invented copy.
- The video asset itself isn't scoped here (no source file identified) — treat "video reel" as a requirements placeholder; confirm the asset exists or gets produced separately before this ships.

---

## Section 4 — "Getting Started is easy" (moved from position 2)

Same underlying component as today's `Workflow` (`id="workflow"`), moved to this position, with these changes:

| Change | From | To |
|---|---|---|
| Section headline | "The whole route, connected." | **Getting Started is easy** |
| Eyebrow | "RA / OPERATING SYSTEM" | **5 Simple Steps to Business growth** |
| Card labels | Each card shows "Milestone" or "Complete" (`index === 4 ? 'Complete' : 'Milestone'`) | **Removed entirely** |
| Card order | Sign up → Create account → Book an Appointment → Fuel Gauge → Take payment | **Sign up → Create account → Fuel Gauge → Book an Appointment → Take payment** (cards 3 and 4 swapped) |
| "Book an Appointment" card copy | "Aer will recommend a time that makes sense for your business." (stale product-name reference) | **"Mobull's smart recommendations suggest times where you might already be in that area."** |

**⚠ CONFIRM:** the swap moves Fuel Gauge to card 3 and Book an Appointment to card 4 — double-check that's the order you want (vs. the alternative reading of "switch 3 and 4" as "just fix the copy on whichever card ends up third"). Locking in the literal swap above unless you say otherwise.

**Also required (not optional polish — called out explicitly in the source notes):**
- Increase card copy type size — current scale reads too small.
- Make the card track mobile-ready: today's `workflow-track` is a fixed grid with SVG connector lines between cards, which doesn't reflow on small screens. Replace with a swipeable carousel on mobile (or a comparably better mobile pattern — your call on exact mechanism) rather than a static grid.

---

## Section 5 — Story

**Unchanged.** Keep as-is.

---

## Sections 6 & 7 — Compare, FAQ

**Both removed entirely.**

---

## Section 8 — Pricing → "Get Started for Free"

| Change | From | To |
|---|---|---|
| Section title | (current pricing headline) | **Get Started for Free** |
| Plan structure | Multiple pricing tiers/feature-comparison table | **One plan** — full functionality, no feature gating |
| Presentation | Flat feature-comparison table | **A journey**, visually: Day 0 → free 14-day trial starts (no card required, matches existing signup fine print) → Day 14 → converts to **$25/month** → ongoing, with the same full feature set the whole way through |

**⚠ CONFIRM:** the source note says "1 Price (or improve) instead of Priced like a tool, not toy" — read as "the current pricing section feels utilitarian/plain; make it feel considered, not cheap," not as a literal instruction. If that's not what was meant, say so before this gets built — it's a tone call, not a structural one, and worth getting right rather than guessing twice.

Structural requirement either way: this needs to read as a **timeline/journey**, not a comparison grid — trial start, conversion point, and "everything, the whole time" should all be visible in one glance, not buried in fine print.

---

## Section 9 — Access/signup form + Footer

**Unchanged.**

---

## Do not touch

- The signup form itself (`SignupPanel`) and its fields/validation.
- The Hero section, Header, and Footer.
- The Story section's content.
- Any in-app feature naming (Fuel Gauge, Smart Suggestions/Appointment Optimizer) — copy on this page can use friendlier marketing names ("Trip Calculator"), but that's page copy, not a product rename.

## Open questions to resolve before or during the build

1. Card-swap direction in Section 4 (above) — confirm the literal reading is correct.
2. Pricing section tone note (above) — confirm "make it feel premium, not like a feature-comparison table" is the right read.
3. Section 3's three callouts have no body copy in the source notes — confirm headline-only is fine, or provide/approve one-liners before they're invented.
4. The "video reel" asset for Section 3 — confirm it exists or needs to be produced; not scoped here.
