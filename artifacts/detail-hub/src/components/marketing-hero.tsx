/**
 * PRD_Mobull_Hero_Redesign.md ("Make every mile pay."). Shared hero used by both
 * the homepage (`signup.tsx`) and `/team` (`pages/team.tsx`, per
 * PRD_Mobull_Team_Page.md's explicit "reuse the redesigned hero component...
 * rather than building a second one" — a second near-identical hero would drift
 * from this one over time). Headline and subhead are identical across both pages
 * by design, so they're fixed here rather than passed as props; the eyebrow,
 * background photo, and button are the only things that differ per page.
 *
 * DRAFT: both `photoSrc` values callers pass in today (`heroPorscheBeach` on the
 * homepage, `teamHeroPorsche` on `/team`) are Singer Vehicle Design's own
 * promotional photography — not cleared for production (PRD risk #4, and
 * PRD_Mobull_Team_Page.md's "Photo and trademark rights" risk, which explicitly
 * says this is the same open issue covering both pages). The responsive
 * AVIF/WebP/srcset pipeline and mobile-specific art direction both PRDs ask for
 * aren't done yet either — this renders a single JPEG at every breakpoint.
 */
import { ArrowUpRight } from 'lucide-react';

export interface MarketingHeroProps {
  eyebrow: string;
  photoSrc: string;
  buttonLabel: string;
  onButtonClick: () => void;
  'data-testid'?: string;
}

export function MarketingHero({ eyebrow, photoSrc, buttonLabel, onButtonClick, ...rest }: MarketingHeroProps) {
  return (
    <section className="hero" id="top" data-testid={rest['data-testid']}>
      <img
        className="hero-image hero-image-photo"
        src={photoSrc}
        alt=""
        aria-hidden="true"
        data-testid="img-hero-photo"
      />

      <div className="container-wide hero-content">
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="text-foreground">
          Make every
          <br />
          <span className="hero-accent">mile pay.</span>
        </h1>
        <p className="hero-copy reveal reveal-delay-2">
          Mobull builds gas, drive time, and weather into every appointment, so you know what you keep before you
          book.
        </p>
        <div className="hero-actions reveal reveal-delay-3">
          <button className="button-ghost" onClick={onButtonClick} data-testid="button-hero-access">
            {buttonLabel} <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="hero-footer reveal reveal-delay-3">
          <span className="scroll-cue">Scroll to Learn more</span>
        </div>
      </div>
    </section>
  );
}
