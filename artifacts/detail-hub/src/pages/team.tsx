/**
 * `/team` — public, no-login page introducing the people behind Mobull
 * (`PRD_Mobull_Team_Page.md` v2). Nav-facing label is "About" (per the current
 * ask), but the route stays `/team` to match the PRD's own internal
 * references (`/demo?source=team_hero`, etc.) rather than introducing a
 * mismatch between what the PRD calls this page and what the code calls it.
 *
 * Structural template: `demo.tsx`/`calculator.tsx` — same public-page shape
 * (`Header`/`Footer` from `@/components/marketing-chrome`, no `AuthGate`).
 * The hero is the shared `MarketingHero` component (`@/components/marketing-
 * hero.tsx`), per the PRD's explicit "reuse the redesigned hero component...
 * rather than building a second one."
 *
 * DRAFT — open items carried over from the PRD, not resolved here:
 * - `teamHeroPorsche` (a different crop than the homepage's hero, per the
 *   PRD's "give /team a different crop" requirement) is, like the homepage
 *   photo, Singer Vehicle Design's own promotional photography — same
 *   licensing/trademark question (PRD risk "Photo and trademark rights"),
 *   not cleared for production.
 * - Sean's bio is "not yet written" per the PRD (LinkedIn couldn't be read to
 *   draft one) — his card ships with name/title only, matching the PRD's own
 *   instruction not to guess it.
 * - Jonathan's LinkedIn URL wasn't supplied, so his card has no LinkedIn icon
 *   (the PRD explicitly says "no icon until you supply a URL").
 * - No responsive AVIF/WebP/srcset pipeline or mobile-specific hero crop yet.
 * - Eyebrow "THE TEAM" is the PRD's own proposed copy, flagged there as
 *   "needs your approval" — not yet confirmed.
 * - "Our office"'s one-line copy is new (the PRD specifies "city name plus
 *   one short line" but doesn't supply the line itself) — on-voice per
 *   mobull-copy-brief.md §8, no address/map per the PRD's explicit "no street
 *   address or map is assumed."
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { Header, Footer } from '@/components/marketing-chrome';
import { MarketingHero } from '@/components/marketing-hero';
import { trackMixpanelEvent } from '@/lib/mixpanel';
import teamHeroPorsche from '@/assets/team-hero-porsche.jpg';
import seanHeadshot from '@/assets/sean-pardo-headshot.jpg';
import './signup.css';
import './team.css';

/** lucide-react dropped brand icons; a plain "in" glyph is the standard LinkedIn mark. */
function LinkedInIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 1 1 0-4.124 2.062 2.062 0 0 1 0 4.124zM7.119 20.452H3.552V9h3.567v11.452z" />
    </svg>
  );
}

interface LeaderCardProps {
  name: string;
  title: string;
  bio?: string;
  photoSrc?: string;
  linkedinUrl?: string;
  'data-testid': string;
}

function LeaderCard({ name, title, bio, photoSrc, linkedinUrl, ...rest }: LeaderCardProps) {
  const initials = name
    .split(' ')
    .map((part) => part[0])
    .join('');

  return (
    <div className="leader-card glass" data-testid={rest['data-testid']}>
      <div className="leader-card-photo">
        {photoSrc ? (
          <img src={photoSrc} alt={name} loading="lazy" />
        ) : (
          <div className="leader-card-placeholder" aria-hidden="true">
            {initials}
          </div>
        )}
      </div>
      <div className="leader-card-body">
        <div className="leader-card-head">
          <div>
            <div className="eyebrow leader-card-title">{title}</div>
            <h3>{name}</h3>
          </div>
          {linkedinUrl && (
            <a
              href={linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${name} on LinkedIn`}
              className="leader-card-linkedin"
              onClick={() => trackMixpanelEvent('linkedin_clicked', { person: name })}
              data-testid={`link-linkedin-${initials.toLowerCase()}`}
            >
              <LinkedInIcon />
            </a>
          )}
        </div>
        {bio && <p>{bio}</p>}
      </div>
    </div>
  );
}

function Leadership() {
  return (
    <section className="section" id="leadership">
      <div className="container-wide">
        <div className="section-heading">
          <div>
            <div className="eyebrow">01 / The people</div>
            <h2 className="section-title">Leadership</h2>
          </div>
        </div>
        <div className="leader-grid">
          <LeaderCard
            name="Sean Pardo"
            title="CEO"
            photoSrc={seanHeadshot}
            linkedinUrl="https://www.linkedin.com/in/sean-pardo-97a21119"
            data-testid="card-leader-sean"
          />
        </div>
      </div>
    </section>
  );
}

function Commitment() {
  return (
    <section className="section" id="commitment">
      <div className="container-wide">
        <div className="section-heading">
          <div>
            <div className="eyebrow">02 / Our promise</div>
            <h2 className="section-title">Our commitment</h2>
          </div>
          <p className="section-intro">
            We build for work that happens on the road. Your calendar tells you where to be. Mobull tells you if
            it&rsquo;s worth it, with gas, drive time, and weather attached to every appointment before you book. A
            full week should be a profitable week, and we&rsquo;re building the platform that makes it one for the
            people who run their business out of a van.
          </p>
        </div>
      </div>
    </section>
  );
}

function Office() {
  return (
    <section className="section" id="office">
      <div className="container-wide">
        <div className="office-card glass">
          <div>
            <div className="eyebrow">03 / Where to find us</div>
            <h2 className="section-title">Our office</h2>
          </div>
          <div className="office-detail">
            <h3>New York City</h3>
            <p>368 9th Ave, New York, NY 10001</p>
            <p>
              <a href="mailto:support@mobull.app">support@mobull.app</a>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Team() {
  const [, setLocation] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = 'About — Mobull';
    const meta = document.querySelector('meta[name="description"]');
    const previous = meta?.getAttribute('content') ?? null;
    meta?.setAttribute(
      'content',
      'Meet the people behind Mobull — built for mobile detailers and other on-the-road service businesses, based in New York City.',
    );
    return () => {
      if (meta && previous !== null) meta.setAttribute('content', previous);
    };
  }, []);

  return (
    <div className="site-shell team-page">
      <Header open={menuOpen} setOpen={setMenuOpen} />

      <MarketingHero
        eyebrow="THE TEAM"
        photoSrc={teamHeroPorsche}
        buttonLabel="Request a Demo"
        onButtonClick={() => {
          trackMixpanelEvent('signup_cta_clicked', { cta_location: 'team_hero' });
          setLocation('/demo?source=team_hero');
        }}
        data-testid="section-hero"
      />

      <Leadership />
      <Commitment />
      <Office />

      <Footer />
    </div>
  );
}
