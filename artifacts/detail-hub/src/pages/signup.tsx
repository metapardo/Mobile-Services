import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Redirect, useLocation, Link } from 'wouter';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Lenis from 'lenis';
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
  type Variants,
} from 'framer-motion';
import {
  ArrowUpRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  Check,
  CloudLightning,
  CreditCard,
  Eye,
  EyeOff,
  Gauge,
  Loader2,
  Menu,
  Send,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from 'lucide-react';
import { useSignup, getGetAuthSessionQueryKey } from '@workspace/api-client-react';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { useQueryClient } from '@tanstack/react-query';
import mobullMark from '@/assets/mobull-mark.png';
import blueCloudsMp4 from '@/assets/video/blue-clouds.mp4';
import blueCloudsWebm from '@/assets/video/blue-clouds.webm';
// MARKETING_SITE_REVAMP_BRIEF.md — real product screenshots (a demo org, no
// real customer data) for Section 2's "Book the right Jobs" (the Fuel
// Gauge tap-to-reveal breakdown) and "Right Job, Right Time" (the
// Appointment Optimizer's recommendation card) callouts, plus the Section 3
// product-experience video reel.
import bookSmartScreenshot from '@/assets/marketing/book-smart.png';
import appointmentRecommendationsScreenshot from '@/assets/marketing/appointment-recommendations.png';
import appointmentBookingVideo from '@/assets/marketing/appointment-booking-v2.mov';
import './signup.css';

// ─────────────────────────────────────────────────────────────────────────
// This page is a full port of an earlier one-pager marketing design — visual
// structure and section content only, not that project's app shell
// (its own QueryClientProvider/Router/Toaster are not brought in; `detail-hub`
// already provides all of that at its own root in `App.tsx`).
//
// The one functional carry-over from the real, previous `/signup` page is
// everything in the access-section at the bottom of this file: the real
// account-creation `SignupPanel`, the already-authenticated → redirect-to-`/`
// check, and real error handling from the mutation. Per
// `PRD_DetailHub_SelfServe_Signup_Trial.md` (Phase A), signup is now fully
// self-serve — there is no invite token, no gate, and no lead-capture
// "request access" fallback; `SignupPanel` always renders unconditionally.
// This is real, backend-wired logic (`useSignup` from
// `@workspace/api-client-react`) restyled to fit this design's
// `.access-panel.glass` / `.field-group` / `.access-form` hand-styled markup
// instead of the shadcn `Form`/`FormField` components used elsewhere in this
// app — this section intentionally does not use shadcn.
// ─────────────────────────────────────────────────────────────────────────

type IconType = typeof CalendarDays;

// ─────────────────────────────────────────────────────────────────────────
// Motion helpers (scroll-reveal-on-view)
//
// Reverse-engineered from the Framer-template lineage this page's marketing
// design already shares: elements fade from dim to full brightness with a
// slight upward settle as they cross into the viewport, playing once and
// never replaying on scroll-up-then-down. `Reveal` handles a single block;
// `RevealGroup`/`RevealItem` handle a parent whose children should stagger
// in one after another (each ~0.08s after the previous).
//
// `prefers-reduced-motion` short-circuits both to plain, un-animated markup
// — content just renders at full opacity/position, matching the intent of
// this file's own `@media(prefers-reduced-motion:reduce)` rule in
// `signup.css`.
// ─────────────────────────────────────────────────────────────────────────

const REVEAL_EASE: [number, number, number, number] = [0.2, 0.75, 0.2, 1];
const REVEAL_VIEWPORT = { once: true, margin: '-100px' } as const;

interface RevealBaseProps {
  children: ReactNode;
  className?: string;
  'data-testid'?: string;
}

function Reveal({
  children,
  className,
  delay = 0,
  y = 24,
  scale,
  duration = 0.6,
  ...rest
}: RevealBaseProps & {
  delay?: number;
  y?: number;
  scale?: number;
  duration?: number;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, ...(scale ? { scale } : {}) }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={REVEAL_VIEWPORT}
      transition={{ duration, delay, ease: REVEAL_EASE }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

const staggerContainerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const staggerItemVariants: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: REVEAL_EASE } },
};

/** Parent for a staggered group — see `RevealItem` for its children. */
function RevealGroup({ children, className, ...rest }: RevealBaseProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      variants={staggerContainerVariants}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** One staggered child of `RevealGroup` — inherits "hidden"/"visible" from its parent. */
function RevealItem({ children, className, ...rest }: RevealBaseProps) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className={className} {...rest}>
        {children}
      </div>
    );
  }

  return (
    <motion.div className={className} variants={staggerItemVariants} {...rest}>
      {children}
    </motion.div>
  );
}

/** Matches `signup.css`'s `@media(min-width:821px)` desktop threshold. */
const DESKTOP_BREAKPOINT_PX = 821;

function useIsDesktopViewport(breakpoint: number): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const mql = window.matchMedia(`(min-width: ${breakpoint}px)`);
    // Belt-and-suspenders: some resize paths (programmatic viewport changes,
    // certain browser automation/emulation tools) don't reliably fire a
    // MediaQueryList's `change` event even though `.matches` itself is
    // already current — a plain `resize` listener catches those too.
    const onChange = () => setIsDesktop(window.innerWidth >= breakpoint);
    onChange();
    mql.addEventListener('change', onChange);
    window.addEventListener('resize', onChange);
    return () => {
      mql.removeEventListener('change', onChange);
      window.removeEventListener('resize', onChange);
    };
  }, [breakpoint]);

  return isDesktop;
}

// ─────────────────────────────────────────────────────────────────────────
// Lenis smooth scroll
//
// Scoped exactly like the page's dark theme / the prior scroll-behavior
// effect: initialized in a `useEffect` on `Signup()` mount, destroyed on
// unmount, never touched globally (no app-root/`main.tsx` changes) — other
// routes (`/calendar`, `/clients`, `/checkout`, etc.) keep native scroll.
//
// `activeLenis` is a module-level singleton rather than context/props
// because only one `Signup()` is ever mounted at a time (same pattern this
// file already uses for `scrollToAccess()` being a plain module function
// callable from `Header`/`Footer` without prop-drilling). It's set/cleared
// by `Signup()`'s Lenis effect below.
// ─────────────────────────────────────────────────────────────────────────

let activeLenis: Lenis | null = null;

function lenisScrollToHash(hash: string) {
  const target = document.querySelector(hash) as HTMLElement | null;
  if (!target) return;
  if (activeLenis) {
    // Lenis caches document height at mount and via its own ResizeObserver,
    // but late-loading media (the showcase video, the grow-section
    // screenshots) can still shift final page height after that initial
    // measurement, leaving Lenis's cached scroll limit shorter than the
    // page actually is — any target below that stale limit then silently
    // fails to scroll at all. Forcing a resize immediately before every
    // programmatic scroll keeps this correct regardless of timing.
    activeLenis.resize();
    activeLenis.scrollTo(target, { offset: 0 });
  } else {
    // Lenis hasn't mounted yet (or already unmounted) — fall back to native
    // smooth scroll rather than doing nothing.
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// MARKETING_SITE_REVAMP_BRIEF.md — Section 6 (Compare) and 7 (FAQ) are
// removed entirely, so the FAQ nav item goes with them (no page destination
// left for it to scroll to).
const navItems = [
  { label: 'Why Mobull', href: '#why' },
  { label: 'How it works', href: '#workflow' },
  { label: 'For your business', href: '#features' },
];

// The one feature list shown throughout Section 8 (Get Started for Free) —
// every item applies the whole time, Day 0 through ongoing, so unlike the
// old two-tier list this is never split or dimmed by plan.
const pricingFeatures: string[] = [
  'Appointments & scheduling recommendations',
  'Fuel Gauge cost check on every appointment',
  'Email support',
  'Priority support & onboarding',
];

interface JourneyStop {
  key: string;
  when: string;
  title: string;
  copy: string;
  icon: IconType;
}

// MARKETING_SITE_REVAMP_BRIEF.md §8 — a Day 0 → Day 14 → ongoing journey,
// not a free-vs-premium comparison: the same full feature set (`pricingFeatures`
// above) carries through every stop, so the timeline's job is to show when
// the price changes, never what you lose or gain along the way.
const journeyStops: JourneyStop[] = [
  {
    key: 'day-0',
    when: 'Day 0',
    title: 'Free trial starts',
    copy: 'Create your account and start booking real appointments today. No card required.',
    icon: Sparkles,
  },
  {
    key: 'day-14',
    when: 'Day 14',
    title: 'Converts to $25/month',
    copy: 'One plan, full functionality. The price simply picks up where the trial left off.',
    icon: CreditCard,
  },
  {
    key: 'ongoing',
    when: 'Ongoing',
    title: 'Everything, the whole time',
    copy: 'No feature gating, no upsell tiers. What you had on day one is what you keep.',
    icon: ShieldCheck,
  },
];

// MARKETING_SITE_REVAMP_BRIEF.md §4 — cards 3 & 4 swapped from the previous
// order (Book an Appointment, Fuel Gauge) to this one (Fuel Gauge, Book an
// Appointment); "Book an Appointment"'s copy replaces its stale "Aer"
// reference with the given line.
const flowSteps: { label: string; copy: string; icon: IconType }[] = [
  { label: 'Sign up', copy: 'Tell us what you do and where you roll.', icon: UserRound },
  { label: 'Create account', copy: 'Set your hours, radius, and real costs.', icon: ShieldCheck },
  { label: 'Fuel Gauge', copy: 'See if the appointment is worth the trip.', icon: BarChart3 },
  { label: 'Book an Appointment', copy: 'Mobull’s smart recommendations suggest times where you might already be in that area.', icon: CalendarDays },
  { label: 'Take payment', copy: 'Close the loop and tee up the next one.', icon: CreditCard },
];

function scrollToAccess() {
  lenisScrollToHash('#access');
}

const signupSchema = z.object({
  name: z.string().min(1, 'Your name is required'),
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  organizationName: z.string().min(1, 'Business name is required'),
  organizationSlug: z
    .string()
    .min(1, 'Business URL is required')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers, and hyphens only (e.g. "acme-detailing")'),
  // Populates `AdminSettings.home_base_address` (Gas Meter's home base) —
  // stored verbatim, no geocoding at signup time (FR-11/FR-12).
  businessAddress: z.string().min(1, 'Business address is required'),
});

type SignupFormValues = z.infer<typeof signupSchema>;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function Logo() {
  return (
    <a
      className="brand"
      href="#top"
      onClick={(e) => {
        e.preventDefault();
        lenisScrollToHash('#top');
      }}
      data-testid="link-brand"
    >
      <span className="brand-mark">
        <img src={mobullMark} alt="Mobull logo mark" data-testid="img-logo" />
      </span>
      <span>mobull</span>
    </a>
  );
}

function Header({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const go = (e: ReactMouseEvent, href: string) => {
    e.preventDefault();
    setOpen(false);
    lenisScrollToHash(href);
  };
  return (
    <header className="topbar">
      <div className="container-wide nav-row">
        <Logo />
        <nav className="nav-links" aria-label="Main navigation">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => go(e, item.href)}
              data-testid={`link-nav-${item.label.toLowerCase().replaceAll(' ', '-')}`}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <Link href="/login" className="button-ghost nav-cta" data-testid="link-login-nav">
            Log in
          </Link>
          <button className="button-primary nav-cta" onClick={scrollToAccess} data-testid="button-nav-request">
            Sign up <ArrowUpRight size={14} />
          </button>
        </div>
        <button
          className="menu-toggle"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
          data-testid="button-mobile-menu"
        >
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>
      {open && (
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={(e) => go(e, item.href)}
              data-testid={`link-mobile-${item.label.toLowerCase().replaceAll(' ', '-')}`}
            >
              {item.label}
            </a>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} data-testid="link-login-mobile">
            Log in
          </Link>
          <button className="button-primary" onClick={scrollToAccess} data-testid="button-mobile-request">
            Sign up <ArrowUpRight size={15} />
          </button>
        </nav>
      )}
    </header>
  );
}

/**
 * The two pre-transcoded, web-ready cloud videos (H.264 + VP9, no audio) take
 * the place of the source design's static storm-hero image, layered under the
 * same `.hero-image` positioning/opacity/drift treatment.
 */
function Hero() {
  return (
    <section className="hero" id="top">
      <video
        className="hero-image"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        data-testid="video-storm-hero"
      >
        <source src={blueCloudsWebm} type="video/webm" />
        <source src={blueCloudsMp4} type="video/mp4" />
      </video>
      <div className="container-wide hero-content">
        <h1 className="text-foreground">
          Super Charge
          <br />
          <em>your mobile business.</em>
        </h1>
        <p className="hero-copy reveal reveal-delay-2">
          Gas, time, drive, know the real cost before you book.
        </p>
        <div className="hero-actions reveal reveal-delay-3">
          <button className="button-ghost" onClick={scrollToAccess} data-testid="button-hero-access">
            Get Started Now <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="hero-footer reveal reveal-delay-3">
          <p className="hero-caption">
            The weather changes.
            <br />
            <strong>Your margin shouldn&rsquo;t.</strong>
          </p>
          <span className="scroll-cue">Scroll to forecast</span>
        </div>
      </div>
    </section>
  );
}

interface GrowCallout {
  key: string;
  icon: IconType;
  headline: string;
  body: string;
  screenshot?: string;
  screenshotAlt?: string;
}

// MARKETING_SITE_REVAMP_BRIEF.md §2 — replaces `ChaosSection` entirely
// (was: a two-column [feature list | fabricated dashboard mock] layout).
// Two of the three callouts now carry a real product screenshot (a demo
// org, no real customer data) instead of any invented numbers; "Weather
// Wise" stays icon-only — no screenshot was scoped for it.
const growCallouts: GrowCallout[] = [
  {
    key: 'book-smart',
    icon: Gauge,
    headline: 'Book the right Jobs',
    body: "Use Mobull's Trip Calculator to check distance, drive time, and fuel cost, so you know if a new job is worth the drive before you book it.",
    screenshot: bookSmartScreenshot,
    screenshotAlt: 'Fuel Gauge breakdown showing you keep $96 of $99 on this job',
  },
  {
    key: 'right-time',
    icon: CalendarClock,
    headline: 'Right Job, Right Time',
    body: 'Our smart calendar recommends times that connect a new job with ones you already have booked in that area, keeping you in the same area each day.',
    screenshot: appointmentRecommendationsScreenshot,
    screenshotAlt: 'A recommended appointment time that fits right after an existing nearby job',
  },
  {
    key: 'weather-wise',
    icon: CloudLightning,
    headline: 'Weather Wise',
    body: 'Weather indicators let you avoid or seek out sun, snow, and rain, so you can book on the days that work best for your service.',
  },
];

function GrowSection() {
  return (
    <section className="section" id="why">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">Grow your Business</div>
            <h2 className="section-title">Grow your Business.</h2>
          </div>
          <p className="section-intro">
            Every job Mobull shows you already has the real numbers attached, so growing your book never means
            guessing.
          </p>
        </Reveal>
        <RevealGroup className="grow-grid">
          {growCallouts.map((callout) => {
            const Icon = callout.icon;
            return (
              <RevealItem className="grow-card" key={callout.key} data-testid={`card-grow-${callout.key}`}>
                {callout.screenshot ? (
                  <div className="grow-card-media">
                    <img src={callout.screenshot} alt={callout.screenshotAlt} loading="lazy" />
                  </div>
                ) : (
                  <div className="grow-card-icon">
                    <Icon size={22} />
                  </div>
                )}
                <h3>{callout.headline}</h3>
                <p>{callout.body}</p>
              </RevealItem>
            );
          })}
        </RevealGroup>
      </div>
    </section>
  );
}

// MARKETING_SITE_REVAMP_BRIEF.md §4 — moved from position 2 to position 4
// (after the two new sections). Eyebrow/title swapped; the "Milestone"/
// "Complete" status pill is gone (it never meant anything a visitor could
// act on); "RA / OPERATING SYSTEM" — a stale RareAir-era brand reference,
// see PRODUCT.md's Brand Commitments — is fixed alongside it.
function Workflow() {
  return (
    <section className="section workflow-section" id="workflow">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">5 Simple Steps to Business growth</div>
            <h2 className="section-title">Getting Started is easy.</h2>
          </div>
          <p className="section-intro">
            No more handoffs between five tabs. Each step adds context to the next, so your business gets smarter
            with every booking.
          </p>
        </Reveal>
        <div className="workflow-board glass grid-lines" data-testid="workflow-board">
          <div className="workflow-head">
            <span className="mono muted" style={{ fontSize: '.68rem' }}>
              MOBULL / GETTING STARTED
            </span>
            <p>Built for the moment a customer says &ldquo;what about Thursday?&rdquo;</p>
          </div>
          <RevealGroup className="workflow-track">
            <WorkflowConnectors />
            {flowSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <RevealItem className={`flow-node-${index + 1}`} key={step.label}>
                  <div className="flow-node" data-testid={`workflow-step-${index + 1}`}>
                    <div className="flow-node-top">
                      <span className="flow-number">0{index + 1}</span>
                    </div>
                    <Icon className="flow-icon" size={20} />
                    <div>
                      <h3>{step.label}</h3>
                      <p>{step.copy}</p>
                    </div>
                  </div>
                </RevealItem>
              );
            })}
          </RevealGroup>
        </div>
      </div>
    </section>
  );
}

const journeyPaths = [
  { id: 'journey-path-1', d: 'M 198 130 C 265 130, 255 300, 336 300' },
  { id: 'journey-path-2', d: 'M 430 382 C 505 382, 470 192, 556 192' },
  { id: 'journey-path-3', d: 'M 650 192 C 730 192, 700 397, 775 397' },
  { id: 'journey-path-4', d: 'M 869 397 C 935 397, 885 130, 996 130' },
];

/**
 * The static hairline connectors between `flow-node`s (`journey-path` /
 * `journey-path-shadow`, unchanged) plus a traveling shimmer dot per path —
 * a small glow-filled `<circle>` moved along the exact same path geometry
 * via native SVG `<animateMotion>` + `<mpath>`. This is purely declarative
 * SVG (no rAF/JS loop), which matters since 4 of these run at once — and it
 * stays perfectly locked to the bezier curve since it rides the same `d`
 * the visible line is drawn from (`<mpath>` referencing the path's `id`).
 * Staggered `begin` times (0s/0.6s/1.2s/1.8s) keep the four dots from
 * pulsing in visual sync, matching the organic, non-mechanical feel of the
 * reference site's connector shimmer.
 */
function WorkflowConnectors() {
  const prefersReducedMotion = useReducedMotion();

  return (
    <svg className="journey-connectors" viewBox="0 0 1100 500" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <radialGradient id="journey-shimmer-gradient" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f2ffff" stopOpacity="1" />
          <stop offset="55%" stopColor="#70e5ff" stopOpacity=".95" />
          <stop offset="100%" stopColor="#24bdff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {journeyPaths.map((path) => (
        <path key={`${path.id}-shadow`} className="journey-path-shadow" d={path.d} />
      ))}
      {journeyPaths.map((path) => (
        <path key={path.id} id={path.id} className="journey-path" d={path.d} />
      ))}
      {!prefersReducedMotion &&
        journeyPaths.map((path, index) => (
          <circle key={`${path.id}-shimmer`} className="journey-shimmer" r="5" fill="url(#journey-shimmer-gradient)">
            <animateMotion dur="3.4s" begin={`${index * 0.6}s`} repeatCount="indefinite">
              <mpath href={`#${path.id}`} xlinkHref={`#${path.id}`} />
            </animateMotion>
          </circle>
        ))}
    </svg>
  );
}

interface AppShowcaseCallout {
  key: string;
  headline: string;
  /**
   * One-liner drafted for this build (MARKETING_SITE_REVAMP_BRIEF.md §3 gave
   * headline text only, and left drafting body copy or leaving these
   * headline-only as a live decision — drafted here per that confirmation).
   * Grounded in real, already-shipped capabilities described elsewhere in
   * PRODUCT.md, not invented claims.
   */
  body: string;
}

const appShowcaseCallouts: AppShowcaseCallout[] = [
  {
    key: 'book-smart',
    headline: 'Book Jobs on calendar smartly',
    body: 'See openings that already work with your day, and fill them without the back-and-forth.',
  },
  {
    key: 'know-good-jobs',
    headline: 'Know what Jobs are good for your business',
    body: 'Every booking shows its real cost before you say yes, not after.',
  },
  {
    key: 'manage-everything',
    headline: 'Manage customer history, financial reports, and take payments',
    body: 'Client history, revenue, and payments, all in the same place you already run your day from.',
  },
];

/**
 * MARKETING_SITE_REVAMP_BRIEF.md §3 — replaces `FeatureBento`/`bentoCards`/
 * the pinned horizontal-scroll runway entirely (that whole apparatus depended
 * on card content this section no longer has). Two columns on desktop
 * (callouts left, video right); the video leads on mobile so the product is
 * shown before it's told. Reuses `.glass`/`bento-card`-family styling for
 * visual continuity rather than a new visual pattern, per the brief.
 *
 * The video autoplays on a muted loop like the Hero's ambient cloud video —
 * the `autoPlay` attribute alone is inconsistently honored once the element
 * is wrapped in a Framer Motion reveal, so a real `.play()` call backs it up
 * once the element mounts (rejection swallowed: browsers are free to defer
 * this, and `controls` still lets a visitor pause/scrub it manually).
 */
function AppShowcaseSection() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  return (
    <section className="section" id="features">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">Everything you need in 1 app</div>
            <h2 className="section-title">Everything you need in 1 app.</h2>
          </div>
          <p className="section-intro">
            One connected place to book the job, know if it's worth it, and get paid. No juggling between tools.
          </p>
        </Reveal>
        <div className="showcase-grid">
          <RevealGroup className="showcase-callouts">
            {appShowcaseCallouts.map((callout) => (
              <RevealItem className="showcase-pill glass" key={callout.key} data-testid={`card-showcase-${callout.key}`}>
                <h3>{callout.headline}</h3>
                <p>{callout.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
          <Reveal className="showcase-video-wrap" scale={0.97} delay={0.1}>
            <video
              ref={videoRef}
              className="showcase-video"
              controls
              autoPlay
              muted
              loop
              playsInline
              preload="auto"
              data-testid="video-app-showcase"
            >
              <source src={appointmentBookingVideo} type="video/quicktime" />
              <source src={appointmentBookingVideo} type="video/mp4" />
            </video>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function Story() {
  return (
    <section className="section story-section">
      <div className="container-wide story-grid">
        <Reveal>
          <div className="eyebrow">04 / In the field</div>
          <blockquote className="story-quote">
            &ldquo;I stopped asking <span>&lsquo;can I fit it in?&rsquo;</span> and started asking &lsquo;does it
            pay?&rsquo;&rdquo;
          </blockquote>
          <div className="story-byline">
            <div className="avatar">JM</div>
            <div>
              <strong>Jules Moreno</strong>
              <small>Owner, Northline Mobile Detail · Phoenix, AZ</small>
            </div>
          </div>
        </Reveal>
        <RevealGroup className="story-proof">
          <RevealItem className="proof-card glass">
            <strong>5.3 hrs</strong>
            <span>saved per week in back-and-forth</span>
          </RevealItem>
          <RevealItem className="proof-card glass">
            <strong>$412</strong>
            <span>recovered from forgotten balances</span>
          </RevealItem>
          <RevealItem className="proof-card glass">
            <strong>8 jobs</strong>
            <span>added without adding a workday</span>
          </RevealItem>
        </RevealGroup>
      </div>
    </section>
  );
}

/**
 * MARKETING_SITE_REVAMP_BRIEF.md §8 — replaces `Pricing`/`pricingTiers`
 * entirely. The old section pitted a Starter tier against a Premium tier;
 * per the user's explicit correction this isn't a tier comparison at all —
 * there is one plan, and the section's job is to show the free-to-paid
 * *journey* (Day 0 trial start → Day 14 conversion → ongoing) with the real
 * feature set attached to it, not fine print underneath a price. Uses
 * `.price-journey-*` class names (not `.journey-*`) since that prefix is
 * already owned by `Workflow`'s SVG bezier connectors.
 */
function GetStartedFree() {
  return (
    <section className="section">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">Get Started for Free</div>
            <h2 className="section-title">Get Started for Free.</h2>
          </div>
          <p className="section-intro">
            One plan. Full functionality from day one. The only thing that changes over time is the price.
          </p>
        </Reveal>
        <RevealGroup className="price-journey" data-testid="pricing-journey">
          {journeyStops.map((stop, index) => (
            <RevealItem className="price-journey-stop" key={stop.key} data-testid={`card-journey-${stop.key}`}>
              <div className="price-journey-marker">
                <stop.icon size={18} />
              </div>
              <div className="price-journey-when">{stop.when}</div>
              <h3>{stop.title}</h3>
              <p>{stop.copy}</p>
              {index === journeyStops.length - 1 && (
                <ul className="price-journey-features">
                  {pricingFeatures.map((feature) => (
                    <li key={feature}>
                      <Check size={15} />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RevealItem>
          ))}
        </RevealGroup>
        <Reveal className="price-journey-cta" delay={0.15}>
          <button className="button-primary" onClick={scrollToAccess} data-testid="button-pricing-start">
            Get Started <ArrowUpRight size={15} />
          </button>
          <p className="form-fineprint">Free for 14 days. No card required.</p>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * The real, always-shown account-creation form — no invite token, no gate
 * (`PRD_DetailHub_SelfServe_Signup_Trial.md` FR-1/FR-2/FR-5). Wired to the
 * real `useSignup` mutation, restyled to this design's markup. On success the
 * backend has already created the org, signed the user in (cookies set on
 * the response, same mechanism `POST /auth/login` uses), and activated the
 * new organization — so this lands the user directly in the app rather than
 * sending them to `/login`.
 */
function SignupPanel() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showPassword, setShowPassword] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      organizationName: '',
      organizationSlug: '',
      businessAddress: '',
    },
  });

  const signupMutation = useSignup({
    mutation: {
      onSuccess: async () => {
        // Signup now also signs the caller in and activates the new
        // organization (see `SignupResult.token`/`organizationId`) — refresh
        // the cached session query so `AuthGate`/`useSession` pick up the new
        // `authenticated: true` state immediately instead of momentarily
        // rendering a "still logged out" flash before their own next refetch.
        await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
        toast({
          title: 'Account created',
          description: "You're all set. Welcome to Mobull.",
        });
        setLocation('/');
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong creating your account. Please try again.';
        toast({ title: 'Signup failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: SignupFormValues) => {
    signupMutation.mutate({ data: values });
  };

  return (
    <form className="access-form" onSubmit={handleSubmit(onSubmit)} data-testid="form-signup">
      <div className="field-group">
        <label htmlFor="organization-name">Business name</label>
        <input
          id="organization-name"
          placeholder="Northline Mobile Detail"
          data-testid="input-organization-name"
          {...register('organizationName')}
          onChange={(e) => {
            setValue('organizationName', e.target.value, { shouldValidate: true });
            if (!slugTouched) {
              setValue('organizationSlug', slugify(e.target.value), { shouldValidate: true });
            }
          }}
        />
        {errors.organizationName && <span className="field-error">{errors.organizationName.message}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="organization-slug">Business URL</label>
        <input
          id="organization-slug"
          placeholder="northline-mobile-detail"
          data-testid="input-organization-slug"
          {...register('organizationSlug')}
          onChange={(e) => {
            setSlugTouched(true);
            setValue('organizationSlug', slugify(e.target.value), { shouldValidate: true });
          }}
        />
        {errors.organizationSlug ? (
          <span className="field-error">{errors.organizationSlug.message}</span>
        ) : (
          <span className="field-error" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Lowercase letters, numbers, and hyphens only.
          </span>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="business-address">Business address</label>
        <input
          id="business-address"
          placeholder="123 Main St, Phoenix, AZ 85001"
          data-testid="input-business-address"
          {...register('businessAddress')}
        />
        {errors.businessAddress ? (
          <span className="field-error">{errors.businessAddress.message}</span>
        ) : (
          <span className="field-error" style={{ color: 'hsl(var(--muted-foreground))' }}>
            Your home base, used for route and Fuel Gauge calculations. Editable later in Settings.
          </span>
        )}
      </div>

      <div className="field-group">
        <label htmlFor="signup-name">Your name</label>
        <input id="signup-name" placeholder="Jordan Smith" data-testid="input-name" {...register('name')} />
        {errors.name && <span className="field-error">{errors.name.message}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          placeholder="you@yourbusiness.com"
          data-testid="input-email"
          {...register('email')}
        />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="signup-password">Password</label>
        <div style={{ position: 'relative' }}>
          <input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            data-testid="input-password"
            style={{ paddingRight: 42 }}
            {...register('password')}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
            style={{
              position: 'absolute',
              right: 4,
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'transparent',
              border: 0,
              padding: 8,
              color: 'hsl(var(--muted-foreground))',
              display: 'grid',
              placeItems: 'center',
            }}
            tabIndex={-1}
          >
            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
        {errors.password && <span className="field-error">{errors.password.message}</span>}
      </div>

      <button className="button-primary form-submit" type="submit" disabled={signupMutation.isPending} data-testid="button-signup">
        {signupMutation.isPending ? (
          <>
            <Loader2 className="animate-spin" size={16} /> Creating account…
          </>
        ) : (
          <>
            Create account <Send size={15} />
          </>
        )}
      </button>

      <p className="form-fineprint">Free for your first 14 days. No card required.</p>
      <p className="form-login-link">
        Already have an account?{' '}
        <Link href="/login" data-testid="link-login">
          Log in
        </Link>
      </p>
    </form>
  );
}

/**
 * "08 / First flight" section shell — signup is fully self-serve now, so the
 * copy here is fixed (no gated/invite-only variant). The form rendered as
 * `children` is decided by `Signup()` below.
 */
function AccessSection({ children }: { children: ReactNode }) {
  return (
    <section className="section access-section" id="access">
      <div className="container-wide">
        <div className="access-panel glass">
          <Reveal className="access-copy">
            <div className="eyebrow">08 / First flight</div>
            <h2 data-testid="text-access-headline">Make your next mile count.</h2>
            <p data-testid="text-access-subhead">
              You&rsquo;re one step from your first route. Create your account and business below. Free for your
              first 14 days, no card required.
            </p>
          </Reveal>
          {children}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="container-wide footer-row">
        <Logo />
        <span className="footer-note">© 2026 Mobull · Know before you go.</span>
        <div className="footer-links">
          <a
            href="#why"
            onClick={(e) => {
              e.preventDefault();
              lenisScrollToHash('#why');
            }}
            data-testid="link-footer-why"
          >
            Why Mobull
          </a>
          <a
            href="#top"
            className="back-top"
            onClick={(e) => {
              e.preventDefault();
              lenisScrollToHash('#top');
            }}
            data-testid="link-back-top"
          >
            Back to top <ArrowUpRight size={12} />
          </a>
        </div>
      </div>
    </footer>
  );
}

export default function Signup() {
  const [menuOpen, setMenuOpen] = useState(false);

  // Lenis owns smooth scroll for this page now (see `lenisScrollToHash` /
  // `scrollToAccess` above), so the previous `document.documentElement.style
  // .scrollBehavior = 'smooth'` effect that lived here is gone — running both
  // at once produces janky double-smoothing. Scoped exactly the way that
  // effect was: initialized only while `Signup()` is mounted, destroyed on
  // unmount, never touched globally (no app-root/`main.tsx` changes) — every
  // other route (`/calendar`, `/clients`, `/checkout`, etc.) keeps native
  // scroll untouched.
  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true });
    activeLenis = lenis;
    return () => {
      lenis.destroy();
      activeLenis = null;
    };
  }, []);

  const { data: session, isPending: sessionPending } = useSession();

  // Already authenticated — no reason to be on the signup page.
  if (!sessionPending && session?.authenticated) {
    return <Redirect to="/" />;
  }

  return (
    <div className="site-shell">
      <Header open={menuOpen} setOpen={setMenuOpen} />
      <Hero />
      <GrowSection />
      <AppShowcaseSection />
      <Workflow />
      <Story />
      <GetStartedFree />
      <AccessSection>
        <SignupPanel />
      </AccessSection>
      <Footer />
    </div>
  );
}
