/**
 * Shared weather-forecast helpers — `PRD_Mobull_Weather_Coverage.md` §8-9
 * (FR-11 through FR-20). Pure, presentation-agnostic logic consumed by both
 * `weather-icon.tsx` (glyph/dialog components) and the two call sites
 * (`booking-new.tsx`'s Date and time row, `calendar.tsx`'s three views).
 *
 * `POST /weather/forecast` (`useWeatherForecast`, a react-query mutation —
 * this codebase's convention for POST endpoints, same as
 * `useComputeRoute`/`useAutocompletePlaces`) returns every date Google's
 * forecast horizon covers (up to ~10 days, FR-10) for one location in a
 * single call — never one call per date. A date that isn't present in that
 * array is the `unavailable` signal (beyond the horizon), not a separate
 * status field (see the generated `weatherForecast`'s own doc comment).
 */
import type { DailyForecastResult, DailyForecastResultCondition } from '@workspace/api-client-react';

export type WeatherDayState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'unavailable' }
  | { kind: 'unknown'; entry: DailyForecastResult }
  | { kind: 'ready'; entry: DailyForecastResult };

/**
 * Resolves a single date's display state from a `useWeatherForecast`
 * mutation's status flags plus its (possibly not-yet-fetched) result array.
 *
 * Returns `undefined` — render nothing — before the mutation has ever fired
 * (mirrors this file's callers' own "hidden entirely, no empty shell"
 * precedent, e.g. `booking-new.tsx`'s Recommended section) rather than
 * showing a state for data that was never asked for.
 */
export function resolveWeatherDayState(params: {
  date: string;
  isPending: boolean;
  isError: boolean;
  hasFetched: boolean;
  forecast: DailyForecastResult[] | undefined;
}): WeatherDayState | undefined {
  const { date, isPending, isError, hasFetched, forecast } = params;
  if (isPending) return { kind: 'loading' };
  if (isError) return { kind: 'error' };
  if (!hasFetched) return undefined;
  const entry = (forecast ?? []).find(d => d.date === date);
  if (!entry) return { kind: 'unavailable' };
  if (entry.condition === 'unknown') return { kind: 'unknown', entry };
  return { kind: 'ready', entry };
}

export function conditionLabel(condition: DailyForecastResultCondition): string {
  switch (condition) {
    case 'clear': return 'Clear';
    case 'cloudy': return 'Cloudy';
    case 'windy': return 'Windy';
    case 'rain': return 'Rain';
    case 'sleet': return 'Sleet';
    case 'snow': return 'Snow';
    case 'hail': return 'Hail';
    case 'storm': return 'Storm';
    case 'unknown': return 'Unknown';
    default: return 'Unknown';
  }
}

export function weatherStateLabel(state: WeatherDayState): string {
  switch (state.kind) {
    case 'loading': return 'Loading forecast…';
    case 'error': return 'Weather unavailable';
    case 'unavailable': return 'Forecast not available yet for this date';
    case 'unknown': return 'Weather condition unknown';
    case 'ready': return conditionLabel(state.entry.condition);
  }
}
