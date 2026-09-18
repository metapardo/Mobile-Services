import posthog from 'posthog-js';

/**
 * `initialized` tracks whether `posthog.init()` actually ran, rather than relying on
 * posthog-js's undocumented `posthog.__loaded` internal. `trackEvent` below no-ops
 * until this is true, so call sites (e.g. scroll-depth tracking on the marketing page)
 * never need to re-check env vars or guard against calling `capture()` before `init()`.
 */
let initialized = false;

/**
 * Same PROD-only gate `main.tsx` already applied inline for Sentry: PostHog must not
 * initialize for local dev sessions, so local clicking-around doesn't pollute
 * production analytics. `VITE_POSTHOG_KEY` is a public, client-side project key (not a
 * secret) — see `main.tsx`'s original comment for the full `VITE_`-prefix reasoning.
 */
export function initAnalytics(): void {
  const posthogKey = import.meta.env.VITE_POSTHOG_KEY;
  const posthogHost = import.meta.env.VITE_POSTHOG_HOST ?? 'https://us.i.posthog.com';

  if (import.meta.env.PROD && posthogKey) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      person_profiles: 'identified_only',
    });
    initialized = true;
  }
}

/**
 * Safe wrapper around `posthog.capture()` — a no-op until `initAnalytics()` has
 * actually run (local dev, or a build with no `VITE_POSTHOG_KEY` configured), so call
 * sites never need their own env checks.
 */
export function trackEvent(name: string, properties?: Record<string, unknown>): void {
  if (initialized) {
    posthog.capture(name, properties);
  }
}
