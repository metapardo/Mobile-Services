---
name: Mobull
description: "Gas, time, drive — know the real cost before you book."
colors:
  signal-blue: "#2DA8FF"
  signal-blue-ink: "#03111F"
  quiet-teal: "#0E3A5F"
  quiet-teal-ink: "#E7F4FF"
  harbor-accent: "#164E7A"
  harbor-accent-ink: "#EFF8FF"
  abyssal-navy: "#03111F"
  abyssal-navy-card: "#0A2035"
  abyssal-navy-popover: "#0B2944"
  frost-white: "#F3F8FC"
  hairline-blue: "#1B3E5C"
  muted-surface: "#0B2A46"
  muted-ink: "#9BB6CB"
  recessed-navy: "#061928"
  recessed-navy-ink: "#D3E4F0"
  recessed-hairline: "#163A57"
  alert-coral: "#DB6574"
  alert-coral-ink: "#FFFFFF"
typography:
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    letterSpacing: "0.18em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
spacing:
  base: "4px"
components:
  button-primary:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.signal-blue-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-secondary:
    backgroundColor: "{colors.quiet-teal}"
    textColor: "{colors.quiet-teal-ink}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "inherit"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.abyssal-navy-card}"
    textColor: "{colors.frost-white}"
    rounded: "{rounded.xl}"
    padding: "24px"
  badge-default:
    backgroundColor: "{colors.signal-blue}"
    textColor: "{colors.signal-blue-ink}"
    rounded: "9999px"
    padding: "2px 10px"
---

# Design System: Mobull

## Overview

**Creative North Star: "The Night Instrument Panel"**

Mobull's screens read like a precision instrument at night — a deep, near-black navy foundation with electric blue readouts, translucent glass surfaces, and quiet hairline borders. Nothing glows or announces itself until it's touched; the system stays calm and legible at rest, and Signal Blue reserves itself for the single clearest action in any view. This fits a product whose whole premise is telling a mobile business owner the truth about a job's real cost before they commit — the interface itself should feel like something you'd trust to give you a straight answer in the dark.

The system explicitly rejects the flat, interchangeable look of a generic SaaS admin dashboard. Depth — real translucency, blur, and a restrained blue halo — is the point, not an incumbent style to strip away in the name of simplicity.

**Key Characteristics:**
- Dark-first: the product ships in dark mode only today; light-mode tokens exist in the source but are not currently reachable in the shipped app.
- Layered glass, not flat cards: panels and buttons carry real translucency, blur, and a fine inner highlight rather than a solid fill.
- Structural glow, not ambient decoration: every halo, shimmer, and lift is a direct response to hover/focus/active — a screen with nothing focused looks calm, not lit up.
- One accent, used sparingly: Signal Blue marks the one clear action per view; everything else stays in navy, teal, and neutral tones.

## Colors

A deep-ocean navy foundation carries one electric blue accent; every other role stays a quiet, desaturated variant of the same blue-navy family so Signal Blue never has to compete for attention.

### Primary
- **Signal Blue** (`#2DA8FF`): The one clear action per view — primary buttons, active nav state, focus rings, links. Used deliberately sparingly; its rarity is what makes it read as "the answer" rather than decoration.

### Secondary
- **Quiet Teal** (`#0E3A5F`): Secondary buttons and lower-emphasis filled surfaces that still need to read as interactive, without competing with Signal Blue.

### Tertiary
- **Harbor Accent** (`#164E7A`): Highlighted-but-not-primary states — selected sidebar items, active filter chips, accent fills that need more presence than a neutral but less than Signal Blue.

### Neutral
- **Abyssal Navy** (`#03111F`): Page background — the deepest, most neutral surface in the system.
- **Abyssal Navy (Card)** (`#0A2035`): Cards, panels, and glass surfaces — one step lighter than the page background so content reads as "raised" without a hard shadow.
- **Abyssal Navy (Popover)** (`#0B2944`): Popovers, dropdowns, and dialogs — one step lighter again, so floating surfaces separate from the cards beneath them.
- **Frost White** (`#F3F8FC`): Primary text and foreground content on dark surfaces.
- **Hairline Blue** (`#1B3E5C`): Borders and dividers — always a quiet, low-contrast line, never a strong rule.
- **Muted Surface** (`#0B2A46`) / **Muted Ink** (`#9BB6CB`): De-emphasized fills and secondary text — captions, placeholder copy, disabled states.
- **Recessed Navy** (`#061928`): Sidebar/navigation chrome — one shade darker than the content surfaces it frames.
- **Alert Coral** (`#DB6574`): Destructive actions and error states only — the one warm color in an otherwise entirely cool palette, so it reads unmistakably as "danger" the instant it appears.

### Named Rules
**The Single-Accent Rule.** Signal Blue marks the one clear action per view. If two elements on the same screen both want the primary treatment, one of them is wrong.

**The Recessed Chrome Rule.** Navigation chrome (the sidebar) always sits one shade darker than the content surfaces it frames, so wayfinding never visually competes with content.

## Typography

**Body Font:** Inter, sans-serif
**Label/Mono Font:** Geist Mono, monospace (used sparingly, for tabular/numeric contexts — not a defining characteristic of the system)

**Character:** Crisp, neutral UI type with a slightly generous reading rhythm — chosen to disappear and let the glass surfaces and Signal Blue accent carry the personality instead of the type itself.

### Hierarchy
- **Display** (semibold, 1.875–2.25rem, tight tracking): Page-level headers within the app (e.g. a section's top-of-page title).
- **Headline** (semibold, 1.5rem): Panel and card-group headers.
- **Title** (semibold, 1.125–1.25rem): Card titles, dialog headers.
- **Body** (regular, 0.875–1rem, 1.43–1.5 line-height): Default UI copy, form labels and values, the large majority of on-screen text.
- **Label** (semibold, 0.75rem, uppercase, 0.18em tracking, Signal Blue): Section eyebrows and micro-labels — never plain gray caps.

### Named Rules
**The Eyebrow Rule.** Section labels are always uppercase, semibold, 0.18em-tracked, and colored Signal Blue — this is the system's one recurring typographic flourish, and it always appears in this exact combination, never partially.

## Layout

Desktop uses a fixed 256px navigation sidebar with a fluid content area beside it. Below the `md` breakpoint, the sidebar is replaced entirely by a fixed bottom tab bar — there is no collapsed/hamburger intermediate state; navigation is either a full sidebar or a full bottom bar, matching the product's field-first, phone-in-hand usage.

Spacing follows a 4px base rhythm; most component padding lands on 8/12/16/24px steps rather than arbitrary values.

## Elevation & Depth

The system uses layered translucent glass, not conventional box-shadow stacking. Depth comes from backdrop blur, a linear gradient tinted toward the surface color beneath it, and a fine inset highlight along the top edge — not from a drop shadow implying a light source above the screen.

Glow, shimmer, and lift are **structural, not ambient**: a card or button is flat and quiet at rest, and only on hover/focus/active does a blue-tinted border, a rotating conic-gradient edge highlight, a diagonal shimmer sweep, and a small upward translate all appear together as one coordinated response. Nothing glows while idle.

### Named Rules
**The Quiet-At-Rest Rule.** Every glass surface is flat and quiet until it's touched — halo, shimmer, and lift only appear on hover, focus, or active. A screen with nothing focused should look calm, not lit up.

## Shapes

Corners are consistently rounded, never sharp — the scale runs 8px (small controls) → 10px (inputs) → 12px (buttons) → 16px (cards and panels), so larger surfaces get proportionally softer corners. Badges are the one exception, fully pill-shaped regardless of size.

Borders on glass surfaces (cards, panels) are a translucent mix toward the foreground color rather than the flat `hairline-blue` token directly — this is what gives glass edges their faint luminous quality instead of reading as a plain 1px rule. Plain form controls (inputs) use the flat hairline border directly, by contrast — see the Flat Input Rule below.

## Components

### Buttons
- **Shape:** 12px radius (rounded-lg).
- **Primary:** Signal Blue fill, Abyssal Navy text, a matching blue-tinted border, and a soft blue drop shadow beneath it even at rest — the one button style allowed a resting shadow, since it's the one element the Single-Accent Rule says should always read as "the answer."
- **Secondary:** Quiet Teal fill with a matching border — filled, but visibly a step down from primary.
- **Outline / Ghost:** Transparent fill, inherits whatever surface it sits on; no resting shadow.
- **Hover / Focus (all variants via `glass-control`):** border shifts toward Signal Blue, a diagonal shimmer sweeps across, and the button lifts 2px — released back down on press.

### Badges
- **Style:** Fully pill-shaped (not on the 8–16px radius scale), small and dense (2px/10px padding), never wraps to a second line.
- **Variants:** default (Signal Blue fill), secondary (Quiet Teal fill), destructive (Alert Coral fill), outline (transparent, thin border).

### Cards / Containers
- **Corner Style:** 16px radius (rounded-xl) — the softest corner in the system, reserved for the largest surfaces.
- **Background:** Abyssal Navy (Card), layered as a translucent gradient rather than a flat fill.
- **Shadow Strategy:** See Elevation & Depth — inset highlight at rest, full glow/lift/shimmer combination on hover/focus.
- **Border:** Translucent foreground-tinted hairline, not the flat border token.
- **Internal Padding:** 24px standard (header/content/footer sections).

### Inputs / Fields
- **Style:** Flat and transparent — no glass treatment. 36px height, 10px radius, a flat hairline border, transparent background.
- **Focus:** A single-pixel Signal Blue ring, no lift or shimmer.

### Named Rules
**The Flat Input Rule.** Form fields stay flat and transparent — glass treatment is reserved for containers (cards, panels) and actions (buttons), never for data-entry fields, so typed text stays maximally legible against the page background rather than competing with a moving glass surface underneath it.

### Navigation
- **Style:** Fixed 256px sidebar in Recessed Navy — one shade darker than card surfaces (see the Recessed Chrome Rule) — with Signal Blue marking the active route.
- **Mobile:** Replaced entirely by a fixed bottom tab bar below the `md` breakpoint; no intermediate collapsed state.

### Empty States
A recurring, deliberate pattern: a centered icon inside a small muted rounded square, a title, a one-line description, and a real, actionable button — never seeded or fabricated example content. This directly reflects the product's principle of being honest about the absence of real data rather than papering over it with fake rows.

## Do's and Don'ts

### Do:
- **Do** reserve Signal Blue for the one clearest action per view (the Single-Accent Rule) — resist the urge to add a second primary-styled element to the same screen.
- **Do** keep every glow, shimmer, and lift a direct response to hover/focus/active (the Quiet-At-Rest Rule) — a resting screen should look calm.
- **Do** use a real `Empty` state (icon + title + description + actionable CTA) for zero-data screens instead of seeded or fabricated example content.
- **Do** keep the sidebar/nav chrome one shade darker than the content surfaces it frames (the Recessed Chrome Rule).

### Don't:
- **Don't** apply glass-panel treatment to form inputs — they stay flat and transparent (the Flat Input Rule).
- **Don't** let the system drift toward a flat, generic SaaS-dashboard look — depth and the blue-glass signature are the point, not incumbent baggage to strip away.
- **Don't** add ambient or idle animation to a surface at rest — every animated effect is a state response, never a constant presence.
- **Don't** reintroduce the retired "Rare Air" orange/coral gradient wordmark — Mobull's cool, all-blue palette is the current, final identity.
