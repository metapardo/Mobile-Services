/**
 * `/calculator` — public, no-login "Drive Cost Calculator"
 * (`PRD_Mobull_Public_Calculator.md`). Lets a visitor plug in a job price,
 * two addresses, and their own vehicle/pay numbers, and see the same
 * "is this trip worth it" verdict the in-app Fuel Gauge gives an existing
 * customer — with zero signup friction (Section 1).
 *
 * Reused from the app (Section 2 of the PRD):
 *   - `computeTravelCost` (`@/lib/fuel-gauge`) — the pure cost formula,
 *     extracted out of `computeFuelGauge` in that same file so this page and
 *     the in-app Fuel Gauge can never silently drift apart (§4.1).
 *   - `AddressAutocomplete` — same component, same Google Places (New)
 *     session-token flow, wired to the new public/unauthenticated
 *     autocomplete + place-details hooks instead of the authenticated ones
 *     it defaults to (see that component's own header comment for the
 *     injection mechanism).
 *   - `Header` (`@/components/marketing-chrome`) — shared nav chrome with
 *     `/` and `/signup`, including the new "Drive Cost Calculator" nav entry.
 *
 * Not reused: anchor selection (`selectAnchor` in `fuel-gauge.ts`) — a public
 * visitor supplies both addresses directly, so it's always a single one-way
 * route, doubled for the round trip (PRD §2). The in-app dialog's exact
 * grade copy ("Worth the trip" / "Okay — watch the drive" / "The drive eats
 * this one") is deliberately NOT reused either — see `GRADE_CAPTION` below
 * (§4.5).
 *
 * This page also intentionally does not share `signup.tsx`'s `Footer`
 * component: the reference mockup specifies its own, different footer line
 * ("Designed for precision and clarity…" + How it works/Privacy) rather than
 * the marketing site's logo/copyright footer, and matching the mockup wins
 * per this build's explicit instructions when the two conflict.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import {
  Briefcase,
  Clock,
  Droplet,
  Loader2,
  MapPin,
  Wind,
} from 'lucide-react';
import {
  useAutocompletePublicPlaces,
  useGetPublicPlaceDetails,
  useComputePublicRoute,
} from '@workspace/api-client-react';
import { AddressAutocomplete, type AddressAutocompleteSelection } from '@/components/address-autocomplete';
import { Header } from '@/components/marketing-chrome';
import { computeTravelCost, type FuelGaugeGrade } from '@/lib/fuel-gauge';
import './signup.css';
import './calculator.css';

// ── Copy (§4.5 — same numeric thresholds/colors as the in-app Fuel Gauge, ──
// new labels; this is a public tool with its own framing, not a screenshot
// of the product's internal voice) ──────────────────────────────────────────

const GRADE_CAPTION: Record<FuelGaugeGrade, string> = {
  strong: 'WORTH THE TRIP',
  fair: 'BREAK-EVEN TERRITORY',
  weak: 'LOSING MONEY ON THE DRIVE',
  unknown: 'WORTH THE TRIP',
};

const GRADE_COLOR: Record<FuelGaugeGrade, string> = {
  strong: '#3fb6e0',
  fair: '#f2b134',
  weak: '#f0576b',
  unknown: '#3fb6e0',
};

const PAY_RATE_MIN = 0;
const PAY_RATE_MAX = 75;
const DEFAULT_MPG = 25;
const DEFAULT_GAS_PRICE = 3.5;
const DEFAULT_PAY_RATE = 24;

interface AddressState {
  text: string;
  selection: AddressAutocompleteSelection | null;
}

const emptyAddress: AddressState = { text: '', selection: null };

interface RouteResult {
  roundTripMiles: number;
  roundTripMinutes: number;
}

/** FR-5 error-shape conventions (`no_route_found` 422, `rate_limited` 429, upstream 502, config 500) — never a fabricated result. */
function describeRouteError(err: unknown): string {
  const status = (err as { status?: number } | undefined)?.status;
  const code = (err as { data?: { error?: string } } | undefined)?.data?.error;

  if (code === 'no_route_found') {
    return "We couldn't find a drivable route between these two addresses.";
  }
  if (code === 'rate_limited' || status === 429) {
    return 'Too many calculations right now — try again in a minute.';
  }
  if (status === 502) {
    return "Couldn't get drive time right now. Try again in a moment.";
  }
  if (status === 500) {
    return 'Something went wrong on our end. Try again shortly.';
  }
  return "Something went wrong calculating this route. Try again.";
}

function formatMoney(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function Calculator() {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = 'Drive Cost Calculator — Mobull';
    const meta = document.querySelector('meta[name="description"]');
    const previous = meta?.getAttribute('content') ?? null;
    meta?.setAttribute(
      'content',
      'See what a job really pays after gas and drive time. Free fuel and drive cost calculator for mobile detailers and other on-the-road service businesses.',
    );
    return () => {
      if (meta && previous !== null) meta.setAttribute('content', previous);
    };
  }, []);

  // Trip Details
  const [servicePriceInput, setServicePriceInput] = useState('99');
  const [start, setStart] = useState<AddressState>(emptyAddress);
  const [client, setClient] = useState<AddressState>(emptyAddress);

  // Vehicle & Cost
  const [mpg, setMpg] = useState(DEFAULT_MPG);
  const [gasPrice, setGasPrice] = useState(DEFAULT_GAS_PRICE);
  const [payRate, setPayRate] = useState(DEFAULT_PAY_RATE);

  // FR-3 bot mitigation: a real, hidden honeypot field (never filled by a
  // real visitor) plus the mount timestamp the server checks a plausible
  // human fill-time against.
  const [honeypot, setHoneypot] = useState('');
  const formRenderedAtRef = useRef(new Date().toISOString());

  const [routeResult, setRouteResult] = useState<RouteResult | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);

  const computeRoute = useComputePublicRoute();

  const servicePrice = Number.parseFloat(servicePriceInput);
  const hasValidPrice = Number.isFinite(servicePrice) && servicePrice > 0;
  const canCalculate = hasValidPrice && !!start.selection && !!client.selection && !computeRoute.isPending;

  const handleCalculate = () => {
    if (!start.selection || !client.selection || !hasValidPrice) return;
    setRouteError(null);
    computeRoute.mutate(
      {
        data: {
          originPlaceId: start.selection.placeId,
          destinationPlaceId: client.selection.placeId,
          // No scheduled appointment time exists for an anonymous visitor —
          // "now" (+60s buffer) is the same past-time clamp `fuel-gauge.ts`'s
          // own `toDepartureIso` applies for a same-day booking.
          departureTime: new Date(Date.now() + 60_000).toISOString(),
          formRenderedAt: formRenderedAtRef.current,
          website: honeypot,
        },
      },
      {
        onSuccess: (res) => {
          setRouteResult({ roundTripMiles: res.miles * 2, roundTripMinutes: res.minutes * 2 });
        },
        onError: (err) => {
          setRouteResult(null);
          setRouteError(describeRouteError(err));
        },
      },
    );
  };

  // Reactive, not just computed at click time — once a route exists, dialing
  // MPG/gas price/pay rate updates the result live without re-spending a
  // routing call (the miles/minutes don't depend on those three inputs).
  const travelCost = useMemo(() => {
    if (!routeResult || !hasValidPrice) return null;
    return computeTravelCost({
      roundTripMiles: routeResult.roundTripMiles,
      roundTripMinutes: routeResult.roundTripMinutes,
      gasPrice,
      vehicleMpg: mpg,
      techHourlyCost: payRate,
      servicePrice,
    });
  }, [routeResult, hasValidPrice, gasPrice, mpg, payRate, servicePrice]);

  const hasResult = travelCost !== null;
  const priceForDisplay = hasValidPrice ? servicePrice : 0;
  // Pre-calculation default: zero travel cost assumed (mockup's own
  // `$99.00 /$99.00` state) — falls out naturally from the same shape
  // `computeTravelCost` returns, so the gauge/copy below don't need a
  // separate "not calculated yet" branch.
  const effective = travelCost ?? {
    fuelCost: 0,
    driveCost: 0,
    travelCost: 0,
    youKeep: priceForDisplay,
    travelLoad: 0,
    grade: 'strong' as FuelGaugeGrade,
  };

  const percentKept = priceForDisplay > 0 ? (effective.youKeep / priceForDisplay) * 100 : 0;
  const percentKeptClamped = Math.max(0, Math.min(100, percentKept));
  const gaugeColor = GRADE_COLOR[effective.grade];
  const caption = GRADE_CAPTION[effective.grade];

  const effectiveHourlyRate =
    hasResult && routeResult && routeResult.roundTripMinutes > 0
      ? effective.youKeep / (routeResult.roundTripMinutes / 60)
      : 0;

  return (
    <div className="site-shell calculator-page">
      <Header open={menuOpen} setOpen={setMenuOpen} />

      <section className="calc-hero container-wide">
        <div className="calc-eyebrow-pill">
          <Wind size={13} />
          <span>Driver Profitability</span>
        </div>
        <h1 className="calc-title">
          Drive Cost <span className="calc-title-accent">Calculator</span>
        </h1>
        <p className="calc-subtitle">
          Stop guessing if a trip is worth it. Calculate exact profit margins considering fuel, distance, and the
          real value of your time.
        </p>
      </section>

      <section className="calc-grid container-wide">
        {/* ── Left column: Trip Details ── */}
        <div className="calc-card" data-testid="card-trip-details">
          <div className="calc-card-heading">
            <span className="calc-card-icon">
              <Briefcase size={18} />
            </span>
            <h2>Trip Details</h2>
          </div>

          <div className="calc-field-group">
            <label htmlFor="calc-service-price">What are you charging the customer?</label>
            <div className="calc-input-prefixed">
              <span>$</span>
              <input
                id="calc-service-price"
                type="number"
                min={0}
                step="1"
                inputMode="decimal"
                value={servicePriceInput}
                onChange={(e) => setServicePriceInput(e.target.value)}
                data-testid="input-calc-service-price"
              />
            </div>
          </div>

          <div className="calc-field-group">
            <label htmlFor="calc-start-address">Start Address</label>
            <AddressAutocomplete
              id="calc-start-address"
              value={start.text}
              onTextChange={(text) => setStart({ text, selection: null })}
              onSelect={(selection) => setStart({ text: selection.formattedAddress, selection })}
              placeholder="E.g., 123 Main St, City"
              className="calc-address-input"
              useAutocompleteHook={useAutocompletePublicPlaces}
              useGetPlaceDetailsHook={useGetPublicPlaceDetails}
              data-testid="input-calc-start-address"
            />
          </div>

          <div className="calc-field-group">
            <label htmlFor="calc-client-address">Client Address</label>
            <AddressAutocomplete
              id="calc-client-address"
              value={client.text}
              onTextChange={(text) => setClient({ text, selection: null })}
              onSelect={(selection) => setClient({ text: selection.formattedAddress, selection })}
              placeholder="E.g., 456 Delivery Ave, City"
              className="calc-address-input"
              useAutocompleteHook={useAutocompletePublicPlaces}
              useGetPlaceDetailsHook={useGetPublicPlaceDetails}
              data-testid="input-calc-client-address"
            />
          </div>

          <div className="calc-divider" />

          <div className="calc-card-heading calc-card-heading-sm">
            <span className="calc-card-icon calc-card-icon-blue">
              <Droplet size={16} />
            </span>
            <h3>Vehicle &amp; Cost</h3>
          </div>

          <div className="calc-field-row">
            <div className="calc-field-group">
              <label htmlFor="calc-mpg">Fuel Efficiency (MPG)</label>
              <input
                id="calc-mpg"
                type="number"
                min={1}
                step="1"
                inputMode="decimal"
                value={mpg}
                onChange={(e) => setMpg(Number(e.target.value) || 0)}
                data-testid="input-calc-mpg"
              />
            </div>
            <div className="calc-field-group">
              <label htmlFor="calc-gas-price">Fuel Price ($/gal)</label>
              <div className="calc-input-prefixed">
                <span>$</span>
                <input
                  id="calc-gas-price"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={gasPrice}
                  onChange={(e) => setGasPrice(Number(e.target.value) || 0)}
                  data-testid="input-calc-gas-price"
                />
              </div>
            </div>
          </div>

          <div className="calc-pay-rate-card">
            <div className="calc-pay-rate-head">
              <div>
                <label htmlFor="calc-pay-rate">Driver Pay Rate ($/hr)</label>
                <p>What the driver should earn for travel time.</p>
              </div>
              <div className="calc-input-prefixed calc-pay-rate-readout">
                <span>$</span>
                <input
                  id="calc-pay-rate"
                  type="number"
                  min={PAY_RATE_MIN}
                  max={PAY_RATE_MAX}
                  step="1"
                  inputMode="decimal"
                  value={payRate}
                  onChange={(e) => setPayRate(Number(e.target.value) || 0)}
                  data-testid="input-calc-pay-rate"
                />
              </div>
            </div>
            <input
              type="range"
              className="calc-slider"
              min={PAY_RATE_MIN}
              max={PAY_RATE_MAX}
              step={1}
              value={payRate}
              onChange={(e) => setPayRate(Number(e.target.value))}
              aria-label="Driver Pay Rate ($/hr)"
              data-testid="slider-calc-pay-rate"
            />
          </div>

          {/* Honeypot (FR-3) — real visitors never see this field; it must stay empty. */}
          <input
            type="text"
            name="website"
            value={honeypot}
            onChange={(e) => setHoneypot(e.target.value)}
            tabIndex={-1}
            autoComplete="off"
            style={{ position: 'absolute', left: -9999, width: 1, height: 1, overflow: 'hidden' }}
          />

          <button
            type="button"
            className="calc-submit-button"
            disabled={!canCalculate}
            onClick={handleCalculate}
            data-testid="button-calculate-route"
          >
            {computeRoute.isPending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Calculating…
              </>
            ) : (
              <>
                <MapPin size={16} /> Calculate Route
              </>
            )}
          </button>
        </div>

        {/* ── Right column: Results ── */}
        <div className="calc-card calc-results-card" data-testid="card-calc-results">
          <p className="calc-results-label">YOU TAKE HOME</p>
          <div className="calc-results-headline">
            <span className="calc-results-dollar">$</span>
            <span className="calc-results-amount">{effective.youKeep.toFixed(2)}</span>
            <span className="calc-results-of">/${priceForDisplay.toFixed(2)}</span>
          </div>
          <p className="calc-net-profit">
            Net Profit: <strong style={{ color: gaugeColor }}>{formatMoney(effective.youKeep)}</strong>
          </p>

          {routeError && (
            <div className="calc-error" role="alert" data-testid="text-calc-route-error">
              {routeError}
            </div>
          )}

          <Gauge percent={percentKeptClamped} color={gaugeColor} caption={caption} />

          <div className="calc-detail-card">
            <div className="calc-detail-row">
              <span className="calc-detail-icon">
                <Clock size={16} />
              </span>
              <div>
                <p className="calc-detail-main">
                  Drive Time: {hasResult && routeResult ? `${Math.round(routeResult.roundTripMinutes)} min` : '--'}
                </p>
                <p className="calc-detail-sub">round trip between the two addresses</p>
              </div>
            </div>
            <div className="calc-detail-row">
              <span className="calc-detail-icon">
                <Droplet size={16} />
              </span>
              <div className="calc-detail-line">
                <span className="calc-detail-main">Fuel</span>
                <span className="calc-detail-value" data-testid="text-calc-fuel-line">
                  {formatMoney(effective.fuelCost)} ·{' '}
                  {hasResult && routeResult ? `${routeResult.roundTripMiles.toFixed(1)} mi` : '--'} round trip
                </span>
              </div>
            </div>
            <div className="calc-detail-row">
              <span className="calc-detail-icon">
                <Briefcase size={16} />
              </span>
              <div className="calc-detail-line">
                <span className="calc-detail-main">Drive time</span>
                <span className="calc-detail-value" data-testid="text-calc-drive-time-line">
                  {formatMoney(effective.driveCost)} ·{' '}
                  {hasResult && routeResult ? `${Math.round(routeResult.roundTripMinutes)} min` : '--'} round trip
                </span>
              </div>
            </div>
          </div>

          <div className="calc-hourly-rate">
            <span>Effective Hourly Rate</span>
            <span className="calc-hourly-rate-value">
              {formatMoney(effectiveHourlyRate)} <small>/ hr</small>
            </span>
          </div>
        </div>
      </section>

      <ExplainerSection />

      <SignupCta />

      <div className="calc-footer container-wide">
        <p>Designed for precision and clarity. Know your worth before you drive.</p>
        <div className="calc-footer-links">
          <a href="#workflow" data-testid="link-calc-how-it-works">
            How it works
          </a>
          <Link href="/signup" data-testid="link-calc-privacy">
            Privacy
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Radial gauge ─────────────────────────────────────────────────────────

const GAUGE_TICKS = Array.from({ length: 9 }, (_, i) => {
  const theta = ((180 - i * 22.5) * Math.PI) / 180;
  const outer = 100;
  const inner = 90;
  return {
    x1: 100 + outer * Math.cos(theta),
    y1: 100 - outer * Math.sin(theta),
    x2: 100 + inner * Math.cos(theta),
    y2: 100 - inner * Math.sin(theta),
  };
});

function Gauge({ percent, color, caption }: { percent: number; color: string; caption: string }) {
  return (
    <div className="calc-gauge-wrap">
      <svg viewBox="0 0 200 112" className="calc-gauge-svg" aria-hidden="true">
        {GAUGE_TICKS.map((t, i) => (
          <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke="rgba(160,190,220,0.35)" strokeWidth="1.5" />
        ))}
        <path
          d="M10,100 A90,90 0 0 1 190,100"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="14"
          strokeLinecap="round"
        />
        <path
          d="M10,100 A90,90 0 0 1 190,100"
          fill="none"
          stroke={color}
          strokeWidth="14"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray="100"
          strokeDashoffset={100 - percent}
          style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="calc-gauge-center">
        <span className="calc-gauge-percent" data-testid="text-calc-percent-kept">
          {Math.round(percent)}%
        </span>
        <span className="calc-gauge-caption" style={{ color }} data-testid="text-calc-grade-caption">
          {caption}
        </span>
      </div>
    </div>
  );
}

// ── "Stop driving for free." explainer (verbatim from the mockup) ─────────

const EXPLAINER_CARDS = [
  {
    icon: MapPin,
    title: '1. The Round-Trip Reality',
    body: "Most apps only show you the distance to the drop-off. But unless you're guaranteed a trip back, you are paying for the return journey out of your own pocket. We automatically double your distance and time to ensure you aren't stranded or driving back for free.",
  },
  {
    icon: Droplet,
    title: '2. The True Cost of Fuel',
    body: 'Every mile driven is gas burned. By inputting your real-world MPG and local gas prices, we calculate exactly how much money goes straight into the tank. This is a hard cost that eats directly into your profit margin before you even consider maintenance.',
  },
  {
    icon: Clock,
    title: '3. True Hourly Rate',
    body: 'Driver pay is a real trip cost. Set the hourly rate the driver should earn and we apply it to the model-calculated round-trip duration. That amount is deducted alongside fuel so the net estimate reflects both operating cost and paid driving time.',
  },
];

function ExplainerSection() {
  return (
    <section className="calc-explainer container-wide">
      <h2 className="calc-explainer-title">Stop driving for free.</h2>
      <p className="calc-explainer-subtitle">
        Gig workers and contractors often look at the gross pay of a trip without factoring in the hidden costs of
        returning home. Here is how we calculate your true profitability.
      </p>
      <div className="calc-explainer-grid">
        {EXPLAINER_CARDS.map((card) => {
          const Icon = card.icon;
          return (
            <div className="calc-explainer-card" key={card.title}>
              <span className="calc-card-icon">
                <Icon size={18} />
              </span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── CTA (§4.6 — not in the mockup crop, PRD asks for it regardless) ────────

function SignupCta() {
  return (
    <section className="calc-cta container-wide">
      <div className="calc-cta-panel glass">
        <h2>See this on your own jobs.</h2>
        <p>Mobull runs this same math on every job on your calendar — automatically, before you book it.</p>
        <Link href="/signup" className="button-primary calc-cta-button" data-testid="link-calc-signup-cta">
          Get Started Free
        </Link>
      </div>
    </section>
  );
}
