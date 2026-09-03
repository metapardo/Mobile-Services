import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { Redirect, useLocation, Link, useSearch } from 'wouter';
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
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
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
  Zap,
} from 'lucide-react';
import { useSignup, useRequestAccess, getGetAuthSessionQueryKey } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';
import { useSession } from '@/hooks/use-session';
import { useQueryClient } from '@tanstack/react-query';
import rareAerMark from '@/assets/rare-aer-mark.png';
import inviteReferenceImage from '@/assets/info_1788377152751.png';
import blueCloudsMp4 from '@/assets/video/blue-clouds.mp4';
import blueCloudsWebm from '@/assets/video/blue-clouds.webm';
import './signup.css';

// ─────────────────────────────────────────────────────────────────────────
// This page is a full port of the `Rare-Aer-Marketing-Site` one-pager design
// (see `Rare-Aer-Marketing-Site/artifacts/rare-aer/src/App.tsx`) — visual
// structure and section content only, not that project's app shell
// (its own QueryClientProvider/Router/Toaster are not brought in; `detail-hub`
// already provides all of that at its own root in `App.tsx`).
//
// The one functional carry-over from the real, previous `/signup` page is
// everything in the access-section state machine at the bottom of this file:
// the no-token/rejected-token → real lead-capture `RequestAccessPanel` vs.
// valid-`?invite=`-token → real account-creation `GatedSignupPanel` branch,
// the already-authenticated → redirect-to-`/` check, and the invite-rejection
// fallback + URL-clearing behavior. All of that is real, backend-wired logic
// (`useRequestAccess`/`useSignup` from `@workspace/api-client-react`) restyled
// to fit this design's `.access-panel.glass` / `.field-group` / `.access-form`
// hand-styled markup instead of the shadcn `Form`/`FormField` components used
// elsewhere in this app — this section intentionally does not use shadcn.
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
    // but this page's tall pinned `FeatureBento` runway (~260vh) can settle
    // into its final layout after that initial measurement, leaving Lenis's
    // cached scroll limit shorter than the page actually is — any target
    // below that stale limit (e.g. #faq, the footer) then silently fails to
    // scroll at all. Forcing a resize immediately before every programmatic
    // scroll keeps this correct regardless of timing.
    activeLenis.resize();
    activeLenis.scrollTo(target, { offset: 0 });
  } else {
    // Lenis hasn't mounted yet (or already unmounted) — fall back to native
    // smooth scroll rather than doing nothing.
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

const navItems = [
  { label: 'Why Mobull', href: '#why' },
  { label: 'How it works', href: '#workflow' },
  { label: 'For your business', href: '#features' },
  { label: 'FAQ', href: '#faq' },
];

const faqs = [
  {
    q: 'What kind of businesses is Mobull built for?',
    a: 'Mobull is for owners who take the work to the customer: detailers, pressure washing crews, mobile groomers, repair teams, and any operator who wins the day from behind a wheel.',
  },
  {
    q: 'Is Mobull a calendar or a payment tool?',
    a: 'It connects both — then adds the missing layer. You can see the route, the time between stops, your expected take-home, and the follow-up that turns a one-off job into a repeatable book.',
  },
  {
    q: 'How does the business assessment work?',
    a: 'Give us a few details about your average ticket, drive time, and weekly capacity. Mobull turns those inputs into a plain-language view of where your margin is hiding — and where it is leaking.',
  },
  {
    q: 'When can I start using it?',
    a: 'Mobull is opening in small waves in 2026. Request access and we will follow up with the right early-access path for your business.',
  },
];

// Same feature set is listed on every pricing card (see `Pricing` below) —
// tiers differ only in which of these are lit up vs. dimmed, never in which
// rows exist, so someone can compare tiers at a glance rather than parsing
// two different lists.
const pricingFeatures: { label: string; starter: boolean }[] = [
  { label: 'Appointments & scheduling recommendations', starter: true },
  { label: 'Fuel Gauge cost check on every appointment', starter: false },
  { label: 'Email support', starter: true },
  { label: 'Priority support & onboarding', starter: false },
];

interface PricingTier {
  key: 'starter' | 'premium';
  name: string;
  badge: string;
  price: string;
  priceSuffix?: string;
  priceNote?: string;
  description: string;
  featured: boolean;
}

const pricingTiers: PricingTier[] = [
  {
    key: 'starter',
    name: 'Starter',
    badge: 'FREE TRIAL',
    price: 'Free',
    priceNote: 'for your first 14 days',
    description: 'Try Mobull with real appointments — no card required.',
    featured: false,
  },
  {
    key: 'premium',
    name: 'Premium',
    badge: 'MOST POPULAR',
    price: '$40',
    priceSuffix: '/month',
    description: 'Everything you need to run your route like a business.',
    featured: true,
  },
];

const flowSteps: { label: string; copy: string; icon: IconType }[] = [
  { label: 'Sign up', copy: 'Tell us what you do and where you roll.', icon: UserRound },
  { label: 'Create account', copy: 'Set your hours, radius, and real costs.', icon: ShieldCheck },
  { label: 'Book an Appointment', copy: 'Aer will recommend a time that makes sense for your business.', icon: CalendarDays },
  { label: 'Fuel Gauge', copy: 'See if the appointment is worth the trip.', icon: BarChart3 },
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
});

type SignupFormValues = z.infer<typeof signupSchema>;

const requestAccessSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Enter a valid email address'),
  businessName: z.string().optional(),
  // Anti-spam honeypot — real visitors never see or fill this field (rendered
  // visually hidden, out of tab order, below). Any non-empty value here means
  // the submitter is a bot; the backend discards those silently.
  honeypot: z.string().optional(),
});

type RequestAccessFormValues = z.infer<typeof requestAccessSchema>;

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
        <img src={rareAerMark} alt="Mobull logo mark" data-testid="img-logo" />
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
            Request access <ArrowUpRight size={14} />
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
            Request early access <ArrowUpRight size={15} />
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

function ChaosSection() {
  return (
    <section className="section" id="why">
      <div className="container-wide chaos-layout">
        <div>
          <Reveal>
            <div className="eyebrow">01 / Get your day back</div>
            <h2 className="section-title">
              Less juggling.
              <br />
              <span style={{ color: 'hsl(var(--primary))' }}>More knowing.</span>
            </h2>
            <p className="section-intro">
              Texts in one hand. A calendar in the other. A payment notification you hope is right. Mobull gives
              all of it one clear point of view.
            </p>
          </Reveal>
          <RevealGroup className="feature-list">
            <RevealItem className="feature-line">
              <CalendarDays className="feature-icon" size={21} />
              <div>
                <h3>One live route</h3>
                <p>Your appointments, travel gaps, and capacity in the same picture.</p>
              </div>
            </RevealItem>
            <RevealItem className="feature-line">
              <Gauge className="feature-icon" size={21} />
              <div>
                <h3>A yes/no on every job</h3>
                <p>Know what a booking is worth after fuel, time, and the trip home.</p>
              </div>
            </RevealItem>
            <RevealItem className="feature-line">
              <CircleDollarSign className="feature-icon" size={21} />
              <div>
                <h3>Every dollar accounted for</h3>
                <p>Track deposits, balances, and next-job opportunities without spreadsheet archaeology.</p>
              </div>
            </RevealItem>
          </RevealGroup>
        </div>
        <Reveal scale={0.96} delay={0.1}>
          <div className="dashboard glass grid-lines" data-testid="card-route-dashboard">
            <div className="dash-top">
              <span className="dash-title">Tuesday / route forecast</span>
              <span className="dash-date">OCT 14 · LIVE</span>
            </div>
            <div className="dash-main">
              <div className="dash-card dash-card-wide">
                <span className="dash-label">Projected take-home</span>
                <div className="dash-big">$684.20</div>
                <span className="dash-positive">↑ 12.8% vs. your usual Tuesday</span>
                <div className="mini-bars" aria-label="Weekly projected revenue bars">
                  {[45, 65, 52, 79, 100, 71, 58].map((height, index) => (
                    <span key={index} style={{ height: `${height}%` }} />
                  ))}
                </div>
                <span className="dash-label">
                  Mon&nbsp;&nbsp;&nbsp; Tue&nbsp;&nbsp;&nbsp; Wed&nbsp;&nbsp;&nbsp; Thu&nbsp;&nbsp;&nbsp;
                  Fri&nbsp;&nbsp;&nbsp; Sat&nbsp;&nbsp;&nbsp; Sun
                </span>
              </div>
              <div className="dash-card">
                <span className="dash-label">Route health</span>
                <div className="dash-big">
                  92<span style={{ fontSize: '.9rem' }}>/100</span>
                </div>
                <span className="dash-positive">Clean route</span>
              </div>
              <div className="dash-card">
                <span className="dash-label">Booked</span>
                <div className="dash-big">
                  4<span style={{ fontSize: '.9rem' }}> stops</span>
                </div>
                <span className="dash-positive">1 opening left</span>
              </div>
            </div>
            <div className="route-list">
              {[
                ['08:30', 'Sarah Chen', 'PAID'],
                ['11:15', 'Marcus Webb', 'DUE'],
                ['14:00', 'Priya Patel', 'QUOTE'],
              ].map(([time, name, tag], index) => (
                <div key={name}>
                  <div className="route-row">
                    <span className="route-time">{time}</span>
                    <span>{name}</span>
                    <span className="route-tag">{tag}</span>
                  </div>
                  {index < 2 && <div className="route-line" />}
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function Workflow() {
  return (
    <section className="section workflow-section" id="workflow">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">02 / From inquiry to income</div>
            <h2 className="section-title">
              The whole route,
              <br />
              connected.
            </h2>
          </div>
          <p className="section-intro">
            No more handoffs between five tabs. Each step adds context to the next, so your business gets smarter
            with every booking.
          </p>
        </Reveal>
        <div className="workflow-board glass grid-lines" data-testid="workflow-board">
          <div className="workflow-head">
            <span className="mono muted" style={{ fontSize: '.68rem' }}>
              RA / OPERATING SYSTEM
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
                      <span className="flow-status">{index === 4 ? 'Complete' : 'Milestone'}</span>
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

interface BentoCardData {
  key: string;
  className: string;
  testId: string;
  content: ReactNode;
}

const bentoCards: BentoCardData[] = [
  {
    key: 'forecast',
    className: 'bento-card bento-tall glass',
    testId: 'card-feature-forecast',
    content: (
      <>
        <CloudLightning size={22} style={{ color: 'hsl(var(--primary))' }} />
        <div className="eyebrow" style={{ marginTop: 28 }}>
          Route intelligence
        </div>
        <h3>The best route is the one that pays you twice.</h3>
        <p>
          Mobull weighs location, job length, travel, and your actual overhead — then shows the route that makes
          the day make sense.
        </p>
        <div className="metric-display">
          <strong>+21%</strong>
          <span>route margin in a typical first month</span>
        </div>
      </>
    ),
  },
  {
    key: 'assessment',
    className: 'bento-card bento-accent',
    testId: 'card-feature-assessment',
    content: (
      <>
        <Sparkles size={22} />
        <div className="eyebrow" style={{ marginTop: 28 }}>
          Business assessment
        </div>
        <h3>Turn your gut feeling into a number.</h3>
        <p>Answer a few real questions. Get an honest view of the jobs, zones, and hours worth protecting.</p>
      </>
    ),
  },
  {
    key: 'followups',
    className: 'bento-card bento-small glass',
    testId: 'card-feature-followups',
    content: (
      <>
        <Zap size={22} style={{ color: 'hsl(var(--accent))' }} />
        <div className="eyebrow" style={{ marginTop: 28 }}>
          Repeatable by design
        </div>
        <h3>One job should not be the end of the story.</h3>
        <p>Keep the next visit visible while the current one is still fresh.</p>
        <div className="inline-stat">
          <div>
            <strong>6</strong>
            <span>follow-ups queued</span>
          </div>
          <div>
            <strong>3</strong>
            <span>routes ready</span>
          </div>
        </div>
      </>
    ),
  },
];

/** Default rendering — the original static stacked/grid bento layout, just with a staggered fade-up reveal added. */
function FeatureBentoStatic() {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return (
      <div className="feature-bento">
        {bentoCards.map((card) => (
          <article key={card.key} className={card.className} data-testid={card.testId}>
            {card.content}
          </article>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      className="feature-bento"
      initial="hidden"
      whileInView="visible"
      viewport={REVEAL_VIEWPORT}
      variants={staggerContainerVariants}
    >
      {bentoCards.map((card) => (
        <motion.article key={card.key} className={card.className} data-testid={card.testId} variants={staggerItemVariants}>
          {card.content}
        </motion.article>
      ))}
    </motion.div>
  );
}

/**
 * Desktop-only pinned horizontal-scroll variant: a tall scroll runway pins
 * a `position: sticky` viewport while the card track's `x` is driven by
 * vertical scroll progress (`useScroll` scoped to the runway via `ref` +
 * `useTransform`) — real vertical scroll input mapped to horizontal
 * translation, not actual horizontal scrolling. Only ever mounted when
 * `FeatureBento` has confirmed both a desktop-width viewport and no
 * `prefers-reduced-motion` preference (see `FeatureBento` below) — a
 * constantly scroll-linked full-bleed effect is exactly the kind of thing
 * that should never reach a touch/mobile viewport or an accessibility
 * preference asking for less motion.
 */
function FeatureBentoPinned() {
  const runwayRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [translateDistance, setTranslateDistance] = useState(0);

  const { scrollYProgress } = useScroll({
    target: runwayRef,
    offset: ['start start', 'end end'],
  });

  useEffect(() => {
    function measure() {
      if (!trackRef.current || !runwayRef.current) return;
      const trackWidth = trackRef.current.scrollWidth;
      const viewportWidth = runwayRef.current.offsetWidth;
      setTranslateDistance(Math.max(trackWidth - viewportWidth, 0));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const x = useTransform(scrollYProgress, [0, 1], [0, -translateDistance]);

  return (
    <div ref={runwayRef} className="feature-bento-runway">
      <div className="feature-bento-sticky">
        <motion.div ref={trackRef} className="feature-bento-track" style={{ x }}>
          {bentoCards.map((card, index) => (
            <motion.article
              key={card.key}
              className={card.className}
              data-testid={card.testId}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={REVEAL_VIEWPORT}
              transition={{ duration: 0.6, delay: index * 0.08, ease: REVEAL_EASE }}
            >
              {card.content}
            </motion.article>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

function FeatureBento() {
  const prefersReducedMotion = useReducedMotion();
  const isDesktop = useIsDesktopViewport(DESKTOP_BREAKPOINT_PX);
  const usePinnedLayout = isDesktop === true && !prefersReducedMotion;

  return (
    <section className="section" id="features">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">03 / Built for the road</div>
            <h2 className="section-title">
              A clearer read
              <br />
              on your work.
            </h2>
          </div>
          <p className="section-intro">
            Not more software to babysit. Just the signal you need to make a good call, then keep moving.
          </p>
        </Reveal>
        {usePinnedLayout ? <FeatureBentoPinned /> : <FeatureBentoStatic />}
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

function Compare() {
  return (
    <section className="section">
      <div className="container-wide compare-grid">
        <div>
          <div className="eyebrow">05 / The difference</div>
          <h2 className="section-title">Your business is not a group chat.</h2>
          <p className="compare-note">
            You already have tools. Mobull is the connective tissue that helps them tell the same story.
          </p>
        </div>
        <RevealGroup className="compare-table" data-testid="comparison-table">
          <RevealItem className="compare-row header">
            <div>What you need to know</div>
            <div>Today</div>
            <div>Mobull</div>
          </RevealItem>
          {[
            ['Is this job worth the drive?', 'Maybe', 'Clear'],
            ['What did I actually make?', 'Somewhere', 'Tracked'],
            ['When should I follow up?', 'Remember', 'Queued'],
            ['Can I do one more stop?', 'Guess', 'Forecast'],
          ].map(([label, oldValue, newValue]) => (
            <RevealItem className="compare-row" key={label}>
              <div>{label}</div>
              <div className="no">{oldValue}</div>
              <div className="yes">
                <Check size={14} style={{ verticalAlign: 'middle', marginRight: 4 }} />
                {newValue}
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

function FAQ() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="section" id="faq">
      <div className="container-wide faq-grid">
        <Reveal>
          <div className="eyebrow">06 / Good questions</div>
          <h2 className="section-title">
            No fog.
            <br />
            No fine print.
          </h2>
          <p className="compare-note">Still curious? That is a healthy operating instinct. Here is the short version.</p>
        </Reveal>
        <div className="faq-list">
          {faqs.map((faq, index) => (
            <div className="faq-item" key={faq.q}>
              <button
                className={`faq-question ${open === index ? 'open' : ''}`}
                onClick={() => setOpen(open === index ? null : index)}
                aria-expanded={open === index}
                data-testid={`button-faq-${index + 1}`}
              >
                <span>{faq.q}</span>
                <ChevronDown size={18} />
              </button>
              {open === index && (
                <div className="faq-answer" data-testid={`text-faq-answer-${index + 1}`}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * Card layout borrowed from the infranex.framer.ai pricing pattern: eyebrow +
 * pill badge on one row, a big price, a one-line description, then a full
 * shared feature checklist — every card lists the same rows, but rows that
 * tier doesn't include stay dimmed rather than being omitted, so the two
 * cards stay visually comparable at a glance. Both CTAs are soft
 * top-of-funnel actions (`scrollToAccess`, same as the Hero/header buttons)
 * — this is a pre-launch, invite-only site with no real billing anywhere in
 * this codebase, so neither button implies an actual purchase.
 */
function Pricing() {
  return (
    <section className="section">
      <div className="container-wide">
        <Reveal className="section-heading">
          <div>
            <div className="eyebrow">07 / Simple pricing</div>
            <h2 className="section-title">
              Priced like a tool,
              <br />
              not a toy.
            </h2>
          </div>
          <p className="section-intro">
            Start free and see the route pay for itself. Upgrade when you&rsquo;re ready to run every job through it.
          </p>
        </Reveal>
        <RevealGroup className="pricing-grid" data-testid="pricing-cards">
          {pricingTiers.map((tier) => (
            <RevealItem
              key={tier.key}
              className={`pricing-card glass${tier.featured ? ' pricing-card-featured' : ''}`}
              data-testid={`card-pricing-${tier.key}`}
            >
              <div className="pricing-card-head">
                <span className="eyebrow">{tier.name}</span>
                <span className="pricing-badge">{tier.badge}</span>
              </div>
              <div className="pricing-price">
                <span className="pricing-price-value">{tier.price}</span>
                {tier.priceSuffix && <span className="pricing-price-suffix">{tier.priceSuffix}</span>}
              </div>
              {tier.priceNote && <p className="pricing-price-note">{tier.priceNote}</p>}
              <p className="pricing-description">{tier.description}</p>
              <ul className="pricing-features">
                {pricingFeatures.map((feature) => {
                  const included = tier.key === 'starter' ? feature.starter : true;
                  return (
                    <li
                      key={feature.label}
                      className={included ? 'pricing-feature-included' : 'pricing-feature-excluded'}
                    >
                      <Check size={16} />
                      <span>{feature.label}</span>
                    </li>
                  );
                })}
              </ul>
              <button
                className="button-primary button-full"
                onClick={scrollToAccess}
                data-testid={`button-pricing-${tier.key}`}
              >
                Get Started <ArrowUpRight size={15} />
              </button>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </section>
  );
}

/**
 * The real no-token / rejected-token path: a real lead-capture form, wired to
 * the real `useRequestAccess` mutation — restyled to this design's
 * `.field-group`/`.access-form` markup instead of shadcn `Form`/`FormField`.
 */
function RequestAccessPanel({ noticeText, tokenRejected }: { noticeText: string; tokenRejected: boolean }) {
  const { toast } = useToast();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestAccessFormValues>({
    resolver: zodResolver(requestAccessSchema),
    defaultValues: { email: '', businessName: '', honeypot: '' },
  });

  const requestAccessMutation = useRequestAccess({
    mutation: {
      onSuccess: (_data, variables) => {
        setSubmittedEmail(variables.data.email);
        setSubmitted(true);
      },
      onError: (err) => {
        const message = err?.data?.message ?? 'Something went wrong submitting your request. Please try again.';
        toast({ title: 'Request failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: RequestAccessFormValues) => {
    requestAccessMutation.mutate({
      data: {
        email: values.email,
        businessName: values.businessName?.trim() ? values.businessName.trim() : undefined,
        honeypot: values.honeypot || undefined,
      },
    });
  };

  if (submitted) {
    return (
      <div className="success-state" data-testid="status-request-access-success">
        <div className="success-icon">
          <CheckCircle2 size={27} />
        </div>
        <h3>You&rsquo;re on the radar.</h3>
        <p>Thanks for your interest in Mobull. We&rsquo;ll email {submittedEmail ?? 'you'} if a spot opens up.</p>
        <p className="form-login-link">
          Already have an account?{' '}
          <Link href="/login" data-testid="link-login">
            Log in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form className="access-form" onSubmit={handleSubmit(onSubmit)} data-testid="form-request-access">
      {tokenRejected ? (
        <div className="form-notice rejected" data-testid="text-request-access-notice">
          <AlertTriangle size={16} />
          <p>{noticeText}</p>
        </div>
      ) : (
        <p className="form-notice" data-testid="text-request-access-notice">
          {noticeText}
        </p>
      )}

      <div className="field-group">
        <label htmlFor="request-email">Work email</label>
        <input
          id="request-email"
          type="email"
          autoComplete="email"
          placeholder="you@yourbusiness.com"
          data-testid="input-request-email"
          {...register('email')}
        />
        {errors.email && <span className="field-error">{errors.email.message}</span>}
      </div>

      <div className="field-group">
        <label htmlFor="request-business-name">Business name</label>
        <input
          id="request-business-name"
          placeholder="Northline Mobile Detail (optional)"
          data-testid="input-request-business-name"
          {...register('businessName')}
        />
      </div>

      {/* Honeypot: visually hidden and out of tab order, never seen by real
          visitors. Positioned off-screen (not display:none — some bots
          specifically skip display:none fields) so it still exists in the
          DOM for less careful automated submitters to fill in. */}
      <div className="field-group field-group-honeypot" aria-hidden="true">
        <label htmlFor="request-honeypot">Company website</label>
        <input id="request-honeypot" tabIndex={-1} autoComplete="off" data-testid="input-honeypot" {...register('honeypot')} />
      </div>

      <button
        className="button-primary form-submit"
        type="submit"
        disabled={requestAccessMutation.isPending}
        data-testid="button-request-access"
      >
        {requestAccessMutation.isPending ? (
          <>
            <Loader2 className="animate-spin" size={16} /> Submitting…
          </>
        ) : (
          <>
            Request access <Send size={15} />
          </>
        )}
      </button>
      <p className="form-fineprint">No sales sequence. No credit card. Just a thoughtful follow-up from a human.</p>
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
 * The real gated account-creation form, shown whenever an `?invite=` token is
 * present — wired to the real `useSignup` mutation, restyled to this design's
 * markup. Token validity can only be discovered at submit time (single-use
 * atomic claim on the backend, by design) — see `onInviteRejected`.
 */
function GatedSignupPanel({ inviteToken, onInviteRejected }: { inviteToken: string; onInviteRejected: () => void }) {
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
    defaultValues: { name: '', email: '', password: '', organizationName: '', organizationSlug: '' },
  });

  const signupMutation = useSignup({
    mutation: {
      onSuccess: async () => {
        // Signup only creates the user + organization — it doesn't sign in on its own
        // (see `useSignup`'s JSDoc / the api-server's `autoSignIn: false`). Send the new
        // user to log in with the credentials they just chose rather than pretending
        // they're already authenticated.
        await queryClient.invalidateQueries({ queryKey: getGetAuthSessionQueryKey() });
        toast({
          title: 'Account created',
          description: 'Log in with your new email and password to get started.',
        });
        setLocation('/login');
      },
      onError: (err) => {
        if (err?.data?.error === 'invalid_invite_token') {
          onInviteRejected();
          return;
        }
        const message = err?.data?.message ?? 'Something went wrong creating your account. Please try again.';
        toast({ title: 'Signup failed', description: message, variant: 'destructive' });
      },
    },
  });

  const onSubmit = (values: SignupFormValues) => {
    signupMutation.mutate({
      data: { ...values, inviteToken },
    });
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
 * "08 / First flight" section shell — the copy column adapts to whether a
 * valid invite token is in play, but the actual form rendered as `children`
 * is decided by `Signup()` below using the exact same state machine the
 * previous version of this page used.
 */
function AccessSection({ gated, children }: { gated: boolean; children: ReactNode }) {
  return (
    <section className="section access-section" id="access">
      <div className="container-wide">
        <div className="access-panel glass">
          <Reveal className="access-copy">
            <div className="eyebrow">08 / {gated ? "You're invited" : 'First flight'}</div>
            <h2 data-testid="text-access-headline">{gated ? 'Set up your business.' : 'Make your next mile count.'}</h2>
            <p data-testid="text-access-subhead">
              {gated
                ? "You're one step from your first route — create your account and business below."
                : "Mobull is invite-only while we build with owners who know the road. Tell us what you're building and we'll save you a seat."}
            </p>
            <img
              className="invite-image"
              src={inviteReferenceImage}
              alt="Mobull early access invitation reference"
              data-testid="img-invite-reference"
            />
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
            href="#faq"
            onClick={(e) => {
              e.preventDefault();
              lenisScrollToHash('#faq');
            }}
            data-testid="link-footer-faq"
          >
            FAQ
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
  const search = useSearch();
  const [, setLocation] = useLocation();
  const [inviteRejected, setInviteRejected] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const inviteToken = new URLSearchParams(search).get('invite');

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

  // There is no way to check an invite token's validity without consuming it
  // (see `claimPlatformInviteToken` — single atomic claim-and-consume, by
  // design, to stay race-safe on single-use tokens). So "invalid, expired, or
  // used" can only ever be discovered when the gated form below is actually
  // submitted and the API rejects it (`onInviteRejected` from
  // `GatedSignupPanel`) — never pre-validated on load.
  const showGatedSignup = Boolean(inviteToken) && !inviteRejected;

  return (
    <div className="site-shell">
      <Header open={menuOpen} setOpen={setMenuOpen} />
      <Hero />
      <ChaosSection />
      <Workflow />
      <FeatureBento />
      <Story />
      <Compare />
      <FAQ />
      <Pricing />
      <AccessSection gated={showGatedSignup}>
        {showGatedSignup && inviteToken ? (
          <GatedSignupPanel
            inviteToken={inviteToken}
            onInviteRejected={() => {
              setInviteRejected(true);
              // The token turned out invalid/expired/used — drop it from the
              // URL rather than leaving a stale `?invite=` hanging around
              // once we've fallen back to the request-access form.
              setLocation('/signup', { replace: true });
            }}
          />
        ) : (
          <RequestAccessPanel
            tokenRejected={inviteRejected}
            noticeText={
              inviteRejected
                ? "That invite link didn't work — it may be expired or already used. Request a new one below and we'll follow up."
                : "Mobull is invite-only right now. Request access below and we'll follow up if a spot opens up."
            }
          />
        )}
      </AccessSection>
      <Footer />
    </div>
  );
}
