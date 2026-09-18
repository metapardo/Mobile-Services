/**
 * Shared public-marketing-site chrome — the logo, top nav/header, and footer
 * that both `signup.tsx` (rendered at `/` and `/signup`) and
 * `calculator.tsx` (`/calculator`) use for brand consistency
 * (`PRD_Mobull_Public_Calculator.md` §3). Extracted out of `signup.tsx`,
 * which owned all of this as private, unexported functions before the
 * calculator page needed the same header.
 *
 * `navItems` now carries a `type: 'anchor' | 'route'` discriminant
 * (`'anchor'` is the default when omitted, matching every pre-existing
 * entry) so `Header` can render an in-page Lenis-scroll anchor (the
 * original, and still the common, case) or a real `wouter` `Link` to a
 * different top-level route (currently just "Drive Cost Calculator") from the
 * same array, in both the desktop `nav-links` and the mobile `mobile-nav`
 * blocks — one list drives both renders, no parallel special-case list.
 */
import type { MouseEvent as ReactMouseEvent } from 'react';
import { Link, useLocation } from 'wouter';
import type Lenis from 'lenis';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import mobullMark from '@/assets/mobull-mark.png';

// ─────────────────────────────────────────────────────────────────────────
// Lenis smooth scroll — module-level singleton
//
// Only one marketing page (`Signup`) currently runs its own Lenis instance
// (`calculator.tsx` uses native scroll — it has no in-page anchors of its
// own to smooth-scroll between). `setActiveLenis` is called from that page's
// mount/unmount effect; `lenisScrollToHash` (used by `Header`/`Footer`
// regardless of which page rendered them) degrades to native
// `scrollIntoView` whenever Lenis isn't currently mounted, or whenever the
// target hash doesn't exist on the current page at all (e.g. `#why` from
// `/calculator`, which has no such section).
// ─────────────────────────────────────────────────────────────────────────

let activeLenis: Lenis | null = null;

export function setActiveLenis(lenis: Lenis | null) {
  activeLenis = lenis;
}

export function lenisScrollToHash(hash: string) {
  const target = document.querySelector(hash) as HTMLElement | null;
  if (!target) return;
  if (activeLenis) {
    // Lenis caches document height at mount and via its own ResizeObserver,
    // but late-loading media can still shift final page height after that
    // initial measurement, leaving Lenis's cached scroll limit shorter than
    // the page actually is — any target below that stale limit then
    // silently fails to scroll at all. Forcing a resize immediately before
    // every programmatic scroll keeps this correct regardless of timing.
    activeLenis.resize();
    activeLenis.scrollTo(target, { offset: 0 });
  } else {
    // Lenis hasn't mounted yet (or this page never runs one) — fall back to
    // native smooth scroll rather than doing nothing.
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

export interface NavItem {
  label: string;
  href: string;
  /** `'anchor'` (default, omit for existing entries) scrolls to an in-page hash on the current page via Lenis. `'route'` renders a real `wouter` `Link` to a different top-level route. */
  type?: 'anchor' | 'route';
}

// MARKETING_SITE_REVAMP_BRIEF.md — Section 6 (Compare) and 7 (FAQ) are
// removed entirely, so the FAQ nav item goes with them (no page destination
// left for it to scroll to).
// PRD_Mobull_Public_Calculator.md §3 — "Drive Cost Calculator" is the first
// `type: 'route'` entry: it's a distinct top-level page, not a section of
// this one-pager.
export const navItems: NavItem[] = [
  { label: 'Why Mobull', href: '#why' },
  { label: 'How it works', href: '#workflow' },
  { label: 'For your business', href: '#features' },
  { label: 'Drive Cost Calculator', href: '/calculator', type: 'route' },
];

export function scrollToAccess() {
  lenisScrollToHash('#access');
}

export function Logo() {
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

function navTestId(prefix: string, label: string) {
  return `link-${prefix}-${label.toLowerCase().replaceAll(' ', '-')}`;
}

export function Header({ open, setOpen }: { open: boolean; setOpen: (value: boolean) => void }) {
  const [, setLocation] = useLocation();

  const go = (e: ReactMouseEvent, href: string) => {
    e.preventDefault();
    setOpen(false);
    lenisScrollToHash(href);
  };

  // The "Sign up" CTA normally just scrolls down to this same page's
  // `#access` panel (true on both `/` and `/signup`, which both render
  // `Signup`). `Header` now also renders on `/calculator`, which has no
  // `#access` section — falling back to a real navigation to `/signup`
  // there instead of silently no-op'ing (per `lenisScrollToHash`'s
  // "target doesn't exist" guard).
  const goToSignup = () => {
    setOpen(false);
    if (document.querySelector('#access')) {
      scrollToAccess();
    } else {
      setLocation('/signup');
    }
  };

  return (
    <header className="topbar">
      <div className="container-wide nav-row">
        <Logo />
        <nav className="nav-links" aria-label="Main navigation">
          {navItems.map((item) =>
            item.type === 'route' ? (
              <Link key={item.href} href={item.href} data-testid={navTestId('nav', item.label)}>
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => go(e, item.href)}
                data-testid={navTestId('nav', item.label)}
              >
                {item.label}
              </a>
            ),
          )}
        </nav>
        <div className="nav-actions">
          <Link href="/login" className="button-ghost nav-cta" data-testid="link-login-nav">
            Log in
          </Link>
          <button className="button-primary nav-cta" onClick={goToSignup} data-testid="button-nav-request">
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
          {navItems.map((item) =>
            item.type === 'route' ? (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                data-testid={navTestId('mobile', item.label)}
              >
                {item.label}
              </Link>
            ) : (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => go(e, item.href)}
                data-testid={navTestId('mobile', item.label)}
              >
                {item.label}
              </a>
            ),
          )}
          <Link href="/login" onClick={() => setOpen(false)} data-testid="link-login-mobile">
            Log in
          </Link>
          <button className="button-primary" onClick={goToSignup} data-testid="button-mobile-request">
            Sign up <ArrowUpRight size={15} />
          </button>
        </nav>
      )}
    </header>
  );
}

export function Footer() {
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
