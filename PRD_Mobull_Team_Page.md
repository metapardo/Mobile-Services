# PRD: The Team Page

**Status:** Draft (v2, updated October 8, 2026 with new hero layout, commitment copy, and profile content)
**Owner:** Bob
**Last updated:** October 8, 2026
**Reviewers:** Sean Pardo, Jonathan Mohan (both appear on the page, so both approve their own profile)

## Summary

A new public, no-login marketing page (`/team`) that puts faces and names behind Mobull. It opens on the new hero layout from `PRD_Mobull_Hero_Redesign.md`: a full-bleed photo of a white off-road Porsche 911 on a wet beach, left-aligned text over a dark scrim, with the Mobull value prop on top. Below it: Leadership (two profile cards), Our commitment, and Our office (New York City). Build it as a sibling of `/calculator` and `/demo` with the shared header and footer, add it to the top nav, and give it its own SEO metadata. The page builds trust with first-touch visitors, so every line must stay inside what the copy brief allows.

## Problem

- Visitors arriving from the guerrilla campaign, the calculator, and the demo form land on a product with no visible people behind it. The ICP (a detailer a year or three in, wary of software) trusts a person more than a logo.
- The marketing site has no page saying who built Mobull or where it's based. A prospect deciding whether to hand over a phone number on `/demo` has nowhere to check.
- Cost of not solving it: weaker demo-request conversion and no answer to "who are these people?" Not quantified; there's no baseline.

## Goals

- A visitor sees who leads Mobull, what the company stands for, and where it's based within one scroll.
- The page matches the rest of the site (type, color, header, footer) and reuses the new hero.
- Non-goals: a full About or Careers section, individual bio pages, a blog, a press kit, a hiring funnel.

## Success metrics

- **Primary:** the page is live and reachable from the top nav, with all sections correct on desktop and mobile (visual QA sign-off from Bob).
- **Secondary (once there's traffic):** share of `/team` visitors who continue to `/demo` or `/calculator`, via Mixpanel. No target; no baseline.
- **Guardrail:** page speed stays in line with the other public pages. The hero photo must not make `/team` the slowest page.

## Recommended solution

New route `/team`, new page `pages/team.tsx`, reusing `Header` and `Footer` from `components/marketing-chrome.tsx`. Page title, meta description, sitemap entry and Mixpanel `page_viewed` follow the pattern set by `/calculator` and `/demo`.

### Key flows / requirements

**Hero (new layout, shared with the homepage)**

- [ ] Reuse the redesigned hero component from `PRD_Mobull_Hero_Redesign.md` rather than building a second one: left-aligned content, blue mono eyebrow, two-line headline, subhead, single button, full-bleed Porsche photo with the car anchored lower right, dark scrim fading left to right and a bottom fade into the page background.
- [ ] Headline: **"Make every / mile pay."** ("mile pay." in brand blue). Same headline as the homepage, so the value prop is consistent.
- [ ] Eyebrow: **"THE TEAM"** instead of "VALUE IN MOTION", so visitors know which page they're on. Proposed, needs your approval.
- [ ] Subhead: the homepage subhead, kept identical across both pages. **The homepage subhead has an open grammar issue** ("gives you gas... into every appointment"; recommended fix: "builds"). Resolve it once and both pages inherit it.
- [ ] Button: "Request a Demo" linking to `/demo?source=team_hero`, so the demo form's existing `source` property attributes the lead to this page. (The homepage hero uses "Learn more"; a team page is a better place for a demo ask.)
- [ ] Because both pages use the same photo, give `/team` a different crop (for example a tighter, more cinematic crop, or the car positioned differently) so the two heroes don't look identical. Open question below.
- [ ] Responsive: srcset in AVIF/WebP with JPEG fallback, preloaded, with a mobile crop that keeps the car visible. Text contrast (WCAG AA) verified over the photo at every breakpoint.

**Leadership**

- [ ] Section heading: "Leadership".
- [ ] Two profile cards side by side on desktop, stacked on mobile. **Jonathan Mohan on the left, Sean Pardo on the right** (as requested; see Open question about the order).
- [ ] Each card: headshot, name, title, short bio, and a LinkedIn icon link where one exists.
- [ ] Missing headshot at launch: branded placeholder (initials on the dark card), never a broken image.

*Jonathan Mohan card (left)*

- Title: **VP of Marketing**
- Bio: "John is an experienced marketer using his behavioral sciences acumen to understand how to approach the market and users."
- LinkedIn: none provided, so no icon until you supply a URL.

*Sean Pardo card (right)*

- Title: **CEO**
- LinkedIn: icon linking to `https://www.linkedin.com/in/sean-pardo-97a21119` (opens in a new tab with `rel="noopener noreferrer"` and an accessible label, "Sean Pardo on LinkedIn").
- Bio: **not yet written.** I tried to read your LinkedIn profile to draft it, but LinkedIn blocks automated access and the page returned nothing. I won't write a bio from guesswork. Paste the "About" section of your profile (or a few sentences on your background) and I'll turn it into a two-sentence blurb that matches the other card. Until then the card ships with name and title only.

**Our commitment**

- [ ] Section heading: "Our commitment", with this draft beneath (built from the positioning statement and the approved lines in the copy brief; no statistics, customers, pricing, or roadmap claims):

  > We build for work that happens on the road. Your calendar tells you where to be. Mobull tells you if it's worth it, with gas, drive time, and weather attached to every appointment before you book. A full week should be a profitable week, and we're building the platform that makes it one for the people who run their business out of a van.

- [ ] Sean approves final wording. Voice check done against the brief: no exclamation points, no emoji, no competitor names, no pricing or plan language, no features that aren't shipped (the brief lists gas, drive time and weather as shipped capabilities).

**Our office**

- [ ] Section heading: "Our office", location "New York City."
- [ ] Minimum treatment: the city name plus one short line. No street address or map is assumed (see Open questions).

**Cross-cutting**

- [ ] Add `{ label: 'Team', href: '/team', type: 'route' }` to `navItems` in `marketing-chrome.tsx`. Nav position is an open question (it would be the sixth item).
- [ ] Add `/team` to `public/sitemap.xml` and keep it indexable.
- [ ] Per-page `<title>` and meta description, matching `/calculator` and `/demo`.
- [ ] Mixpanel: the app-level `page_viewed` listener covers the page view. Add a LinkedIn-click event only if you want it (`linkedin_clicked`, snake_case, past tense, no manual timestamp).
- [ ] Accessibility: one H1 (in the hero), meaningful alt text, visible focus states, keyboard-reachable LinkedIn link.

### Alternatives considered (and rejected)

| Option | Why rejected |
|---|---|
| Put the team content on the homepage | A dedicated URL can be linked from campaigns, email signatures and the demo confirmation. |
| Build a separate hero for `/team` | Two near-identical hero components will drift apart; one shared component keeps the value prop consistent. |
| Write Sean's bio from guesses | LinkedIn couldn't be read. A bio you didn't write or approve is a worse outcome than a short placeholder. |

## Not doing (v1)

Individual bio pages, careers, press mentions, an interactive map, a contact form on this page (the demo page owns lead capture), additional team members, and a Team page inside the logged-in app.

## B2B SaaS considerations

- **Multi-tenancy / permissions:** none, public page.
- **Admin vs. end-user:** marketing site only; content is edited in code.
- **Billing / plan tier:** none, and the page must not mention pricing (not finalized).
- **API / integration surface:** none. Static content.
- **Migration:** none.
- **Security / privacy:** two named people, their photos, bios and a LinkedIn link are published publicly; get each person's consent. No office street address unless the company decides to publish one.

## Risks and open questions

- **Card order.** "Jonathan Mohan on the left" puts the VP of Marketing ahead of the CEO. That's fine if intentional; most leadership pages lead with the CEO. Confirm. If it meant "left-aligned text," I'll flip the order back (Sean first).
- **Name mismatch.** The card says "Jonathan Mohan" but the bio calls him "John." Confirm which name he goes by and use it consistently; I kept both as supplied.
- **Title wording.** You gave "VP of Marketing"; the earlier request said "Vice President of Marketing." I used the shorter form from your latest message.
- **Typo fixed:** "behaviorial" is corrected to "behavioral" in the bio.
- **Sean's bio and both headshots are missing.** The page can launch with placeholders, but not with blank cards. Jonathan's LinkedIn URL is also missing.
- **Photo and trademark rights.** The hero photo shows a Porsche with visible lettering and custom decals. Confirm commercial licensing (and consider legal review) before it ships. Same issue as the homepage hero; one decision covers both.
- **Same hero on two pages.** Decide whether `/team` gets a distinct crop or a different photo.
- **Homepage subhead grammar** carries over (see Hero section).
- **"Our office":** is a city name enough, or do you want a street address, photo or map?
- **Nav crowding:** where does "Team" sit, and does the mobile menu handle six items?
- **Commitment copy** is a draft; Sean needs to approve it.

## Assumptions

- The page is `/team`, unauthenticated, and uses the shared header/footer and existing dark brand styling.
- Voice and claim limits come from `mobull-copy-brief.md`; there's no separate visual brand guide in the repo.
- Two leaders is the complete launch set.
- The hero component from the Hero Redesign PRD is built first (or at the same time) so this page can reuse it.

## Rollout plan

- Ship after, or together with, the homepage hero redesign, since this page reuses that component.
- Before launch: photo rights confirmed, both leaders approve their profiles, Sean approves the commitment copy and supplies his bio, headshots delivered, mobile review of the hero crop and contrast.
- Check in two to four weeks after launch on `/team` visits and click-through to `/demo`.

## Appendix

Reference: `PRD_Mobull_Hero_Redesign.md` (shared hero), `mobull-copy-brief.md` (voice, approved lines), `artifacts/detail-hub/src/components/marketing-chrome.tsx` (header, footer, `navItems`), `artifacts/detail-hub/src/pages/demo.tsx` and `calculator.tsx` (public page pattern), `artifacts/detail-hub/public/sitemap.xml`, `PRD_Mobull_Demo_Request_Page.md` (CTA and `source` conventions).
