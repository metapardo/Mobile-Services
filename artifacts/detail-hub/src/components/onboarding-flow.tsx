/**
 * OnboardingFlow — first-run, 5-screen full-page takeover shown by `AuthGate`
 * instead of `<AppShell>` whenever `settings.onboardingComplete === false`
 * (a brand-new signup only; every pre-existing org was backfilled to `true`
 * at ship time). See `PRD_Mobull_Onboarding_Flow.md` for the functional spec.
 *
 * Visual design, copy, and illustration art are a direct recreation of the
 * five reference mocks in `Onboarding design and copy/` at the repo root
 * (Welcome, Team, Headquarters, Job ROI, Get Started). The 3D-rendered
 * illustrations themselves are cropped straight out of those reference PNGs
 * (`src/assets/onboarding/screen{2,3,4,5}-*.png`) — feathered at the edges so
 * they blend into this screen's own animated starfield rather than sitting
 * in a hard rectangle — not redrawn, since no image-generation tool in this
 * environment could reproduce that art. Screen 1 has no separate
 * illustration in the reference (just starfield + headline), so it's built
 * directly: an animated starfield plus a staggered hero-text reveal. A
 * pulsing glow overlay is layered on top of the destination pin (Screens 3
 * and 5) as an enhancement on top of the real art, per the requested
 * animation.
 *
 * This recreation also collapses the flow from 6 screens to the 5 the
 * reference folder specifies — the prior "Drive Informed" (weather) slide
 * isn't part of that reference set, so it's dropped from onboarding; the
 * weather feature itself is unchanged elsewhere in the app.
 *
 * Interaction shell (FR-1/FR-3) — full-screen takeover, dot pagination, a
 * primary CTA pinned to the bottom safe area — is rebuilt here (not imported
 * from `setup-wizard.tsx`, which doesn't export its version) using this
 * flow's own `ProgressDots` + `NextBtn`.
 *
 * Team names (Screen 2) and the HQ address selection flag (Screen 3) are
 * held in plain local state until the final screen's "Let's go!" fires the
 * real `POST /employees` calls and the final `PATCH /settings` — nothing
 * here creates an `employees` row before that (FR-8/FR-10).
 */
import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCreateEmployee,
  useUpdateSettings,
  getGetSettingsQueryKey,
  getListEmployeesQueryKey,
} from '@workspace/api-client-react';
import { Loader2, ArrowLeft, User, Users as UsersIcon, MapPin, Check } from 'lucide-react';
import { Input } from '@workspace/blue-glass-design-system/components/ui/input';
import { useToast } from '@workspace/blue-glass-design-system/hooks/use-toast';
import { AddressAutocomplete, type AddressAutocompleteSelection } from '@/components/address-autocomplete';
import { EMPLOYEE_COLORS } from '@/pages/payroll-team';
import { trackMixpanelEvent } from '@/lib/mixpanel';
import screen2Team from '@/assets/onboarding/screen2-team.png';
import screen3Hq from '@/assets/onboarding/screen3-hq.png';
import screen4Phone from '@/assets/onboarding/screen4-phone.png';
import screen5Finish from '@/assets/onboarding/screen5-finish.png';

const TOTAL_STEPS = 5;

/** Confirmed step order (this file's own header comment): Welcome, Team,
 *  Headquarters, Job ROI, Get Started — index 0 unused so `STEP_NAMES[step]`
 *  lines up directly with the `step` state's 1-based numbering. */
const STEP_NAMES = ['', 'welcome', 'team', 'headquarters', 'job_roi', 'get_started'] as const;

// ─── Starfield background ───────────────────────────────────────────────────

const STAR_COUNT = 46;

// Deterministic pseudo-random layout so the field doesn't reshuffle on every
// re-render (a linear congruential generator, not `Math.random()`).
function seededStars(count: number) {
  let seed = 42;
  const rand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  return Array.from({ length: count }).map(() => ({
    left: `${(rand() * 100).toFixed(2)}%`,
    top: `${(rand() * 100).toFixed(2)}%`,
    size: 1 + rand() * 2.4,
    bright: rand() > 0.86,
    delay: `${(rand() * 4.5).toFixed(2)}s`,
  }));
}
const STAR_FIELD = seededStars(STAR_COUNT);

/** Full-viewport, fixed-position starfield shared by every screen — mounted
 * once so its slow upward drift never restarts on step change. Two stacked
 * copies of the same star layout, offset by 100% and animated together,
 * loop seamlessly (see `.onboarding-starfield-layer` in index.css). */
function Starfield() {
  const layer = (keyPrefix: string) => (
    <div className="onboarding-starfield-layer">
      {STAR_FIELD.map((s, i) => (
        <span
          key={`${keyPrefix}-${i}`}
          className={`onboarding-star${s.bright ? ' onboarding-star--bright' : ''}`}
          style={{ left: s.left, top: s.top, width: s.size, height: s.size, animationDelay: s.delay }}
        />
      ))}
    </div>
  );
  return (
    <div className="onboarding-starfield" aria-hidden="true">
      {layer('a')}
      {layer('b')}
    </div>
  );
}

// ─── Pulse overlay for the destination pin (Screens 3 and 5) ───────────────
// The reference art already has a glowing pin baked in — this layers an
// animated halo on top of it (positioned by eye against the real photo) so
// the glow visibly pulses, per the requested animation, without redrawing
// the pin itself.
function PinHalo({ left, top }: { left: string; top: string }) {
  return <div className="onboarding-pin-halo" style={{ left, top }} aria-hidden="true" />;
}

// ─── Shell pieces ───────────────────────────────────────────────────────────

function ProgressDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex gap-2 justify-center items-center">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={
            i === current
              ? 'w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_3px_rgba(45,168,255,0.85)]'
              : 'w-1.5 h-1.5 rounded-full bg-muted-foreground/40'
          }
        />
      ))}
    </div>
  );
}

/** The reference's blue-to-violet glowing pill CTA — a native button (not
 * the shared `Button`) so its gradient/glow doesn't have to fight that
 * component's own Signal-Blue-fill variant styling. */
function NextBtn({
  label,
  onClick,
  disabled = false,
  loading = false,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 p-5 z-10">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className="onboarding-cta w-full h-14 rounded-full text-[17px] font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none transition-opacity"
        data-testid="button-onboarding-next"
      >
        {loading && <Loader2 className="w-4 h-4 animate-spin" />}
        {label}
      </button>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────

export function OnboardingFlow() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [step, setStep] = useState(1);

  // Screen 2 — Team
  const [teamMode, setTeamMode] = useState<'solo' | 'team' | null>(null);
  const [names, setNames] = useState<[string, string, string]>(['', '', '']);

  // Screen 3 — Headquarters
  const [homeAddress, setHomeAddress] = useState('');
  const [hqSelection, setHqSelection] = useState<AddressAutocompleteSelection | null>(null);

  // Final screen — submit state
  const [finishing, setFinishing] = useState(false);

  const updateSettingsMutation = useUpdateSettings();
  const createEmployeeMutation = useCreateEmployee();

  const goNext = () => setStep(s => Math.min(s + 1, TOTAL_STEPS));
  const goBack = () => setStep(s => Math.max(s - 1, 1));

  // `onboarding_step_viewed` — fires when each step becomes visible (forward or
  // backward navigation both count as "viewed"), not just on forward progression.
  useEffect(() => {
    trackMixpanelEvent('onboarding_step_viewed', {
      step_name: STEP_NAMES[step],
      step_order: step,
    });
  }, [step]);

  // Screen 3 — FR-14: write through immediately on selection, not deferred.
  const handleAddressSelect = (place: AddressAutocompleteSelection) => {
    setHomeAddress(place.formattedAddress);
    setHqSelection(place);
    updateSettingsMutation.mutate(
      {
        data: {
          homeAddress: place.formattedAddress,
          hqLatitude: place.latitude,
          hqLongitude: place.longitude,
          hqGooglePlaceId: place.placeId,
        },
      },
      {
        onError: (err) => {
          const message = err?.data?.message ?? 'Something went wrong saving your address. You can fix this later in Settings.';
          toast({ title: "Couldn't save your address", description: message, variant: 'destructive' });
        },
      },
    );
  };

  const handleAddressTextChange = (text: string) => {
    setHomeAddress(text);
    // Free typing after a prior selection means the text no longer matches
    // those coordinates — clear the selection flag so "Next" re-disables
    // until a real suggestion is chosen again (FR-13).
    setHqSelection(null);
  };

  // Final screen — FR-19: create employees, then flip `onboardingComplete`,
  // then redirect. Awaited in order (not fire-and-forget) so a failure
  // partway through surfaces instead of silently landing on `/calendar`
  // with half the team missing.
  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const nonEmptyNames = names.map(n => n.trim()).filter(Boolean);
      for (let i = 0; i < nonEmptyNames.length; i++) {
        await createEmployeeMutation.mutateAsync({
          data: { name: nonEmptyNames[i], color: EMPLOYEE_COLORS[i % EMPLOYEE_COLORS.length] },
        });
      }
      await updateSettingsMutation.mutateAsync({ data: { onboardingComplete: true } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getListEmployeesQueryKey() }),
      ]);
      // Fires once, only on a genuinely completed step 5 (not on an error partway
      // through, which returns early via the `catch` below without reaching here).
      // `teamMode` is guaranteed non-null by this point — step 2's "Next" stays
      // disabled until a choice is made (see that step's `NextBtn`) — but the
      // conditional spread still honors "omit rather than send a placeholder" for
      // the type checker's sake.
      trackMixpanelEvent('onboarding_completed', teamMode ? { team_mode: teamMode } : undefined);
      setLocation('/calendar');
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message ?? 'Something went wrong finishing setup. Please try again.';
      toast({ title: "Couldn't finish setup", description: message, variant: 'destructive' });
      setFinishing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background overflow-y-auto overflow-x-hidden" data-testid="page-onboarding">
      <Starfield />

      {/* Header — back arrow (steps 2-5) + progress dots, transparent so the
          starfield shows through (the reference has no header chrome bar). */}
      <div className="sticky top-0 z-10 px-4 py-3 flex items-center justify-between">
        <button
          onClick={goBack}
          className={`w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 transition-colors ${step === 1 ? 'invisible' : ''}`}
          aria-hidden={step === 1}
          data-testid="button-onboarding-back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 flex justify-center">
          <ProgressDots current={step - 1} total={TOTAL_STEPS} />
        </div>
        <div className="w-9" />
      </div>

      {/* ── Screen 1 — Welcome ── */}
      {step === 1 && (
        <div className="relative z-10 flex flex-col min-h-[calc(100dvh-56px)] pb-32">
          <div className="flex-1 flex flex-col justify-center px-7">
            <h1 className="onboarding-reveal max-w-[360px] text-[47px] font-light leading-[1.15] tracking-tight">
              <span className="block">Business is hard</span>
              <span className="block">
                Mobull will get you there <b className="font-bold">faster</b>
              </span>
            </h1>
          </div>
          <NextBtn label="Let's go..." onClick={goNext} />
        </div>
      )}

      {/* ── Screen 2 — Team ── */}
      {step === 2 && (
        <div className="relative z-10 flex flex-col min-h-[calc(100dvh-56px)] pb-32">
          <div className="px-6 pt-2">
            <h1 className="text-[28px] font-bold leading-tight text-center mb-6">What's your team look like?</h1>
            <img
              src={screen2Team}
              alt=""
              className="w-full max-w-[340px] h-auto mx-auto select-none pointer-events-none"
              draggable={false}
              data-testid="img-onboarding-screen2"
            />

            <div className="mt-8 space-y-3">
              <button
                onClick={() => setTeamMode('solo')}
                className={`w-full flex items-center justify-between px-5 py-4 rounded-2xl border text-left transition-colors ${
                  teamMode === 'solo' ? 'onboarding-glow-ring border-primary/70 bg-primary/5' : 'border-white/10 bg-white/[0.02]'
                }`}
                data-testid="button-onboarding-team-just-me"
              >
                <span className="flex items-center gap-3 text-[16px] font-medium">
                  <User className="w-5 h-5 text-primary" /> Just me
                </span>
                <span
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                    teamMode === 'solo' ? 'border-primary' : 'border-muted-foreground/40'
                  }`}
                >
                  {teamMode === 'solo' && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                </span>
              </button>

              <div
                className={`rounded-2xl border transition-colors ${
                  teamMode === 'team' ? 'onboarding-glow-ring border-primary/70 bg-primary/5' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <button
                  onClick={() => setTeamMode('team')}
                  className="w-full flex items-center justify-between px-5 py-4 text-left"
                  data-testid="button-onboarding-team-couple-of-us"
                >
                  <span className="flex items-center gap-3 text-[16px] font-medium">
                    <UsersIcon className="w-5 h-5 text-primary" /> Couple of us
                  </span>
                  <span
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                      teamMode === 'team' ? 'border-primary' : 'border-muted-foreground/40'
                    }`}
                  >
                    {teamMode === 'team' && <span className="w-2.5 h-2.5 rounded-full bg-primary" />}
                  </span>
                </button>
                {teamMode === 'team' && (
                  <div className="px-5 pb-4 pt-1 space-y-3 border-t border-white/10 mx-5">
                    {([0, 1, 2] as const).map((i) => (
                      <Input
                        key={i}
                        value={names[i]}
                        onChange={(e) => setNames(n => {
                          const next = [...n] as [string, string, string];
                          next[i] = e.target.value;
                          return next;
                        })}
                        placeholder={`Teammate ${i + 1} name`}
                        className="h-11 text-[15px] bg-transparent"
                        data-testid={`input-onboarding-teammate-${i + 1}`}
                      />
                    ))}
                    <p className="text-[12px] text-muted-foreground">Leave any blank — you can add more teammates later from Settings.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          <NextBtn label="Next" onClick={goNext} disabled={!teamMode} />
        </div>
      )}

      {/* ── Screen 3 — Headquarters ── */}
      {step === 3 && (
        <div className="relative z-10 flex flex-col min-h-[calc(100dvh-56px)] pb-32">
          <div className="px-6 pt-2">
            <h1 className="text-[28px] font-bold leading-tight text-center mb-2">Where are you based?</h1>
            <p className="text-[14px] text-muted-foreground text-center mb-4">This will help calculate fuel and drive costs.</p>
            <div className="relative max-w-[300px] mx-auto">
              <img
                src={screen3Hq}
                alt=""
                className="w-full h-auto select-none pointer-events-none"
                draggable={false}
                data-testid="img-onboarding-screen3"
              />
              <PinHalo left="72%" top="11%" />
            </div>

            <div className={`mt-6 rounded-2xl ${hqSelection ? 'onboarding-glow-ring' : ''}`}>
              <div
                className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border ${
                  hqSelection ? 'border-primary/70 bg-primary/5' : 'border-white/10 bg-white/[0.02]'
                }`}
              >
                <MapPin className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground mb-0.5">Business address</p>
                  <AddressAutocomplete
                    value={homeAddress}
                    onTextChange={handleAddressTextChange}
                    onSelect={handleAddressSelect}
                    placeholder="123 Main Street"
                    className="!px-0 !py-0 h-auto border-none bg-transparent text-[15px] font-medium"
                    data-testid="input-onboarding-hq-address"
                  />
                </div>
                {hqSelection && (
                  <span className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5 text-background" />
                  </span>
                )}
              </div>
            </div>
          </div>
          <NextBtn label="Next" onClick={goNext} disabled={!hqSelection} />
        </div>
      )}

      {/* ── Screen 4 — Job ROI ── */}
      {step === 4 && (
        <div className="relative z-10 flex flex-col min-h-[calc(100dvh-56px)] pb-32">
          <div className="px-6 pt-4 text-center">
            <h1 className="text-[26px] font-bold leading-tight mb-6">See what you will really earn</h1>

            <img
              src={screen4Phone}
              alt="A booking screen showing the Fuel Gauge breakdown: you keep $94 of $99, worth the trip"
              className="w-full max-w-[280px] h-auto mx-auto select-none pointer-events-none"
              draggable={false}
              data-testid="img-onboarding-screen4"
            />
            <p className="text-[13px] text-muted-foreground mt-5">Example reading — every real job gets scored once you start booking.</p>
          </div>
          <NextBtn label="Next" onClick={goNext} />
        </div>
      )}

      {/* ── Screen 5 — Get Started ── */}
      {step === 5 && (
        <div className="relative z-10 flex flex-col min-h-[calc(100dvh-56px)] pb-32">
          <div className="px-6 pt-8 text-center">
            <h1 className="text-[30px] font-bold leading-tight mb-1">Start booking jobs</h1>
            <p className="text-[15px] text-muted-foreground mb-6">You're all set</p>
            <div className="relative max-w-[300px] mx-auto">
              <img
                src={screen5Finish}
                alt=""
                className="w-full h-auto select-none pointer-events-none"
                draggable={false}
                data-testid="img-onboarding-screen5"
              />
              <PinHalo left="61%" top="16%" />
            </div>
            <p className="text-[14px] text-muted-foreground mt-8 max-w-[280px] mx-auto">
              {teamMode === 'team'
                ? "We'll add your teammates and take you straight to your calendar."
                : "You're all set — let's take you to your calendar."}
            </p>
          </div>
          <NextBtn label="Let's go!" onClick={handleFinish} loading={finishing} />
        </div>
      )}
    </div>
  );
}
