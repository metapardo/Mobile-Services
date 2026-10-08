# PRD: Homepage Hero Redesign ("Make every mile pay.")

**Status:** Draft
**Owner:** Bob
**Last updated:** October 8, 2026
**Reviewers:** Sean Pardo (copy and brand approval)

## Summary

Replace the current homepage hero (centered "Not every job is worth the drive." over a looping blue-cloud video) with the supplied design: a left-aligned hero over a full-bleed beach photo of a white off-road Porsche 911, with a blue mono eyebrow ("VALUE IN MOTION"), the headline "Make every mile pay." (with "mile pay." in brand blue), a one-sentence subhead, and a single "Learn more" button. The design is to be implemented as shown, with the open items below resolved before build. The main reason to make this change: the old headline centered on turning jobs down, which your own copy brief says is the wrong lead for a first-years detailer who worries about having enough work.

## Problem

- The current hero line ("Not every job is worth the drive.") frames Mobull around declining work. The copy brief (Section 10) says to lead with finding jobs that pay, since the ICP is anxious about having enough work, not too much.
- The cloud video is abstract. It doesn't show the road, the drive, or the idea of money kept per mile, which is the product's whole point.
- Evidence this is the right fix is the brief and the design review, not conversion data. There's no A/B baseline for the current hero in this repo, so the benefit is a judgment call until measured.

## Goals

- The hero communicates "your drive has a cost and Mobull shows it" in one glance, in the ICP's own language.
- Match the supplied design verbatim: layout, copy, typography, color, image treatment.
- No regression in page speed or sign-up funnel entry.
- Non-goals: redesigning any other section of the page, changing the sign-up form, changing the nav, or writing new product claims.

## Success metrics

- **Primary:** the shipped hero matches the approved design at desktop and mobile widths (visual QA sign-off from Bob).
- **Guardrail:** hero-to-signup click rate (`signup_cta_clicked` with `cta_location: 'hero'`) does not drop versus the two weeks before launch; compare before and after, since there's no test baseline today.
- **Guardrail:** Largest Contentful Paint on `/` is no worse than today. Swapping a looping video for an optimized still should help, but verify rather than assume.

## Recommended solution

The hero is the `Hero()` component in `artifacts/detail-hub/src/pages/signup.tsx`, styled in `signup.css` under `.site-shell .hero`, and is the landing page for logged-out visitors at `/`. Rework that component and its CSS; no new route or backend.

### Key flows / requirements

**Layout**

- [ ] Left-aligned content block, vertically centered in the left half of the hero. The current hero centers everything, so `.hero-content` alignment and text-align change.
- [ ] Photo fills the hero edge to edge, with the car anchored lower right (`object-position` toward the right, so the car is never covered by text and never cropped on narrower screens).
- [ ] Dark scrim darker on the left, fading to transparent on the right, plus a bottom fade into the page background so the hero blends into the next section (the existing `.hero::before` gradient does something similar; retune it for the photo and text legibility).
- [ ] Remove the brightness/saturation boost on `.hero-image` (`brightness(1.6)`) which was tuned for the cloud video and would wash out the photo.

**Content (verbatim from the design)**

- [ ] Eyebrow: `VALUE IN MOTION`, uppercase mono, brand blue, wide letter-spacing. The existing `.eyebrow` style (DM Mono, primary color, uppercase, 0.16em tracking) already matches.
- [ ] Headline, two lines: "Make every" in white, then "mile pay." in brand blue (the `--primary` token). The current `h1 em` is forced white; change it to the primary color.
- [ ] Subhead: "Mobull gives you gas, drive time, and weather into every appointment, so you know what you keep before you book." **See Open question 1, this sentence reads incorrectly as written.**
- [ ] Button: ghost pill labeled "Learn more" with the up-right arrow, same `button-ghost` style as today.

**Image**

- [ ] Use the supplied photograph, exported in responsive sizes (for example 800, 1280, 1920 px wide) in AVIF/WebP with a JPEG fallback, served with `srcset`, and preloaded since it is the largest element above the fold.
- [ ] Mobile art direction: a tighter crop that keeps the car in frame, with the text block above or over a heavier scrim.
- [ ] Decorative `alt=""` or `aria-hidden` (the headline carries the meaning), or a short descriptive alt if the image is treated as content.
- [ ] Remove the `<video>` element and the two cloud video imports from this hero. Those assets are only used here (checked), so they can be deleted once the new hero ships, or left until after launch to ease rollback.

**Behavior and accessibility**

- [ ] Keep the existing entrance reveal animations on the text; drop the 16-second drift animation on the image, or keep it subtle and disabled for `prefers-reduced-motion`.
- [ ] Verify text contrast (WCAG AA) for the subhead and the blue headline against the photo and scrim at every breakpoint, particularly over the lighter sky at top right.
- [ ] Tracking: keep `signup_cta_clicked` with `cta_location: 'hero'` only if "Learn more" still leads toward sign-up (see Open question 2).

### Alternatives considered (and rejected)

| Option | Why rejected |
|---|---|
| Keep the cloud video and only change the words | Doesn't deliver the "value in motion" visual, which is half the point of the redesign. |
| Use a looping video of the car instead of a still | Heavier page weight and no motion asset exists; the photo's own motion blur already conveys speed. |
| Keep the centered layout | The supplied design is left-aligned; centering would push the text over the car. |

## Not doing (v1)

Changing any section below the hero, a new hero video, A/B testing infrastructure (worth adding, but out of scope), localized copy, and a dark/light theme variant.

## B2B SaaS considerations

- **Multi-tenancy / permissions:** none; public marketing page.
- **Admin vs. end-user:** none.
- **Billing / plan tier:** none, and the hero must not mention pricing (not finalized).
- **API / integration surface:** none.
- **Migration:** none.
- **SEO:** this is the homepage. Keep exactly one H1, keep the page title and meta description in sync with the new headline, and update the Open Graph image if it currently shows the old hero.
- **Compliance:** see photo and trademark risk below.

## Risks and open questions

1. **The subhead is ungrammatical as written.** "Mobull gives you gas, drive time, and weather into every appointment" doesn't parse (you don't give someone "gas"). The design appears to have turned the earlier line "Mobull prices gas, drive time, and weather into every appointment" into "gives." Since you asked for the design verbatim, this PRD ships it as drawn unless you decide otherwise. Recommended fix, which keeps the meaning: **"Mobull builds gas, drive time, and weather into every appointment, so you know what you keep before you book."** Decision needed before build.
2. **"Learn more" has no defined destination.** Today the hero button scrolls to the sign-up area and logs `signup_cta_clicked`. "Learn more" suggests scrolling to the explainer content or the calculator or demo page instead. Decide the target, and rename the Mixpanel event or `cta_location` so analytics don't count a "learn more" click as sign-up intent. Pointing it at the free calculator (`/calculator`) would be consistent with the campaign.
3. **Two elements in the current hero aren't in the design:** the caption "The weather changes. Your margin shouldn't." and the "Scroll to forecast" cue. The screenshot is cropped and may simply not show them. Confirm whether to remove them (verbatim reading) or keep them at the bottom.
4. **Photo and trademark rights.** The photo shows a Porsche with visible "PORSCHE" lettering and custom race decals. Confirm commercial licensing, and consider legal review for using a third-party car brand on the homepage of a different product. Your copy brief also says to avoid naming other brands in public copy, so keep the name out of text and alt text. If the image can't be cleared, the layout still works with a licensed substitute.
5. **New copy isn't in the copy brief.** "Make every mile pay." and "Value in motion" aren't among the approved headlines or taglines, and the brief says every line must trace to the positioning statement. "Make every mile pay" does (the price of the drive and what you keep), but Sean should approve both lines and the brief should be updated so the other pages stay consistent.
6. **Team page overlap.** `PRD_Mobull_Team_Page.md` plans to use this same photo for its hero. Decide whether the two pages share one image component or the Team page gets a different crop, so the site doesn't show the identical hero twice.
7. **No baseline to prove improvement.** Without an A/B test, a drop or lift in sign-up clicks can't be attributed to the hero alone.

## Assumptions

- The design in the screenshot is final aside from the open questions above.
- The hero lives only in `Hero()` in `signup.tsx` and is the only place the cloud video is used (confirmed by search).
- Existing design tokens (`--primary` blue, DM Mono for eyebrows, Space Grotesk for headings) are the source for color and type; no new fonts.
- The photo can be licensed for commercial web use.

## Rollout plan

- Single phase behind no flag (it's a static marketing change), deployed to a Vercel preview first for design and mobile review.
- Sign-off needed: Sean (copy), Bob (visual QA), and photo-rights confirmation before production.
- Check in two weeks after launch on hero click rate, bounce, and LCP versus the prior two weeks.

## Appendix

Design reference: supplied screenshot of the new hero and the source photograph (not yet in the repo). Related: `mobull-copy-brief.md` (voice, approved headlines, Section 10 on not leading with declining work), `artifacts/detail-hub/src/pages/signup.tsx` (`Hero()`), `artifacts/detail-hub/src/pages/signup.css` (`.site-shell .hero*`), `PRD_Mobull_Team_Page.md`.
