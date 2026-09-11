/**
 * WeatherIcon / WeatherGlyph / WeatherIconButton — `PRD_Mobull_Weather_Coverage.md`
 * §8-9 (FR-11 through FR-20). Mirrors `fuel-gauge-icon.tsx`'s established
 * pattern: a small inline glyph, tap opens a `Dialog` with the forecast
 * detail (condition, temp range, precipitation chance) for that one date,
 * and the click handler stops propagation so it never fires a parent
 * `Link`/button underneath it.
 *
 * Three pieces, exported separately because the calendar (`calendar.tsx`)
 * fetches HQ's forecast ONCE per page load (FR-19) and reuses the same
 * response across Day/Week/Month views, while `booking-new.tsx` needs its
 * own self-contained, per-booking-address fetch (FR-11/FR-12):
 *
 *   - `WeatherGlyph` — pure, stateless icon renderer for a `WeatherDayState`.
 *     No button, no dialog. Used bare (no tap target) in month view's cells,
 *     which are already inside a full-cell `<button>` (FR-15) — nesting an
 *     interactive control inside that button would be invalid HTML.
 *   - `WeatherIconButton` — `WeatherGlyph` wrapped in a tappable glyph +
 *     `Dialog` with the forecast detail. Used by `booking-new.tsx` and by
 *     calendar's week header / day-view week strip (both call sites already
 *     restructured so this button is a *sibling* of the day-select control,
 *     not nested inside it — see `calendar.tsx`'s `CalendarDayHeaderCell`).
 *   - `WeatherIcon` — the self-fetching variant used only by
 *     `booking-new.tsx` (FR-14: creation flow only, `booking-detail.tsx` is
 *     explicitly out of scope). Fires `useWeatherForecast` once per distinct
 *     address (not once per render, not on every date change — the request
 *     has no `date` param and returns the whole horizon in one call).
 */
import { useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@workspace/blue-glass-design-system/components/ui/dialog';
import {
  useWeatherForecast,
  type DailyForecastResultCondition,
} from '@workspace/api-client-react';
import {
  Sun, Cloud, Wind, CloudRain, CloudDrizzle, CloudSnow, CloudHail, CloudLightning,
  CloudOff, HelpCircle, Loader2, type LucideIcon,
} from 'lucide-react';
import { resolveWeatherDayState, weatherStateLabel, type WeatherDayState } from '@/lib/weather';

// ── Condition → icon/color map ──────────────────────────────────────────────
// Kept visually distinct per condition (FR-11's "keep it visually distinct
// per condition and consistent with the app's existing icon weight/style"),
// using this app's already-imported icon library (lucide-react) rather than
// hand-rolled SVGs — `fuel-gauge-icon.tsx`'s SVG-per-grade approach only
// needed 3 shapes; 9 conditions is squarely in "reach for the icon set
// already in the app" territory instead.
const CONDITION_ICON: Record<DailyForecastResultCondition, LucideIcon> = {
  clear: Sun,
  cloudy: Cloud,
  windy: Wind,
  rain: CloudRain,
  sleet: CloudDrizzle,
  snow: CloudSnow,
  hail: CloudHail,
  storm: CloudLightning,
  unknown: HelpCircle,
};

const CONDITION_COLOR: Record<DailyForecastResultCondition, string> = {
  clear: '#D9A404',
  cloudy: '#9CA3AF',
  windy: '#0D9488',
  rain: '#3B82F6',
  sleet: '#6366F1',
  snow: '#38BDF8',
  hail: '#A855F7',
  storm: '#7C3AED',
  unknown: '#9CA3AF',
};

const SIZE_CLASSES = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
} as const;
type GlyphSize = keyof typeof SIZE_CLASSES;

/**
 * Pure glyph renderer — `loading` (spinner), `error`/`unavailable` (neutral
 * "no reading" glyph — FR-13: never fabricate a condition for a failed call
 * or an out-of-range date), `unknown` (neutral "?" glyph — the upstream
 * condition string itself came back `"unknown"`, still not a guess), `ready`
 * (the real per-condition icon + color). Renders nothing when `state` is
 * `undefined` (not yet fetched / fetch never triggered).
 */
export function WeatherGlyph({ state, size = 'sm' }: { state: WeatherDayState | undefined; size?: GlyphSize }) {
  if (!state) return null;
  const cls = SIZE_CLASSES[size];

  if (state.kind === 'loading') {
    return <Loader2 className={`${cls} text-muted-foreground animate-spin`} aria-hidden="true" />;
  }
  if (state.kind === 'error' || state.kind === 'unavailable') {
    return <CloudOff className={`${cls} text-muted-foreground/50`} aria-hidden="true" />;
  }
  if (state.kind === 'unknown') {
    return <HelpCircle className={`${cls} text-muted-foreground`} aria-hidden="true" />;
  }
  const Icon = CONDITION_ICON[state.entry.condition] ?? HelpCircle;
  const color = CONDITION_COLOR[state.entry.condition] ?? CONDITION_COLOR.unknown;
  return <Icon className={cls} style={{ color }} aria-hidden="true" />;
}

function WeatherDetailBody({ state }: { state: WeatherDayState }) {
  if (state.kind === 'ready' || state.kind === 'unknown') {
    const { entry } = state;
    return (
      <div className="mt-1 space-y-2.5">
        {entry.description && (
          <p className="text-[14px] text-foreground">{entry.description}</p>
        )}
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-muted-foreground">High / Low</span>
          <span className="font-medium tabular-nums">
            {Math.round(entry.tempHighF)}° / {Math.round(entry.tempLowF)}°F
          </span>
        </div>
        <div className="flex items-center justify-between text-[14px]">
          <span className="text-muted-foreground">Chance of precipitation</span>
          <span className="font-medium tabular-nums">{entry.precipitationChance}%</span>
        </div>
      </div>
    );
  }
  return (
    <p className="mt-2 text-[13px] text-muted-foreground">{weatherStateLabel(state)}</p>
  );
}

interface WeatherIconButtonProps {
  state: WeatherDayState | undefined;
  /** Shown in the dialog title, e.g. "Tue, Mar 4". */
  dateLabel: string;
  size?: GlyphSize;
  testId?: string;
}

/** `WeatherGlyph` wrapped in a tap target + detail `Dialog`. Renders nothing when `state` is `undefined` (FR-12's "hidden entirely, no empty shell"). */
export function WeatherIconButton({ state, dateLabel, size = 'sm', testId }: WeatherIconButtonProps) {
  const [open, setOpen] = useState(false);
  if (!state) return null;

  return (
    <>
      <button
        onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(true); }}
        className="shrink-0 w-6 h-6 p-0.5 flex items-center justify-center rounded-md hover:opacity-80 active:opacity-60 transition-opacity"
        aria-label={`Weather: ${weatherStateLabel(state)}`}
        data-testid={testId ?? 'weather-icon'}
      >
        <WeatherGlyph state={state} size={size} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3">
              <WeatherGlyph state={state} size="sm" />
              <span>{dateLabel}</span>
            </DialogTitle>
          </DialogHeader>
          <WeatherDetailBody state={state} />
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Self-fetching booking-new.tsx variant (FR-11 through FR-14) ─────────────

interface WeatherIconProps {
  /** The booking's selected service-address place ID (not HQ — FR-12). */
  placeId: string;
  latitude: number;
  longitude: number;
  /** `YYYY-MM-DD` — the booking's selected date. */
  date: string;
  dateLabel: string;
}

/**
 * Only rendered by the caller once BOTH an address is selected and a date is
 * set (FR-12) — this component assumes that's already true and fetches
 * immediately on mount / whenever the address changes. Re-fetches only when
 * `placeId`/`latitude`/`longitude` actually change, never when just `date`
 * changes (the request has no `date` param — FR-5 — one call covers the
 * whole horizon, so switching the picked date within that horizon reuses the
 * same in-memory result instead of re-fetching).
 */
export function WeatherIcon({ placeId, latitude, longitude, date, dateLabel }: WeatherIconProps) {
  const mutation = useWeatherForecast();
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const key = `${placeId}|${latitude}|${longitude}`;
    if (fetchedKeyRef.current === key) return;
    fetchedKeyRef.current = key;
    mutation.mutate({ data: { placeId, latitude, longitude } });
    // `mutation` is intentionally excluded — `useMutation`'s returned object
    // is not stable across renders, and re-running this on every render
    // (rather than only when the address itself changes) is exactly the
    // "surge" FR-4b calls out. `fetchedKeyRef` is the actual re-fetch guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId, latitude, longitude]);

  const state = resolveWeatherDayState({
    date,
    isPending: mutation.isPending,
    isError: mutation.isError,
    hasFetched: mutation.isSuccess,
    forecast: mutation.data,
  });

  return <WeatherIconButton state={state} dateLabel={dateLabel} size="sm" testId="weather-icon-booking-date" />;
}
