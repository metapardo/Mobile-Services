import mixpanel from 'mixpanel-browser';

/**
 * Second, independent analytics tool alongside PostHog (`./analytics.ts`) — both run,
 * deliberately, side by side. Kept in its own module rather than folded into
 * `analytics.ts` because the two providers' SDKs, init options, and identity lifecycles
 * (Mixpanel's `identify`/`reset`/`register` super-properties vs. PostHog's own) are
 * different enough that tangling them into one file's state would make it harder to
 * reason about either one independently. `main.tsx` calls `initMixpanel()` next to
 * `initAnalytics()` — same "one call at boot" shape, different module.
 *
 * Gating mirrors `artifacts/api-server/src/lib/email.ts`'s `resendEnabled` pattern (the
 * shape explicitly asked for): a module-level flag set once at init, checked before
 * every exported call below, and a single one-time warning log when the integration is
 * unconfigured — never a throw, never a per-call re-check of the env var. Unlike the
 * Sentry/PostHog gates in `main.tsx`, this is *not* additionally gated on
 * `import.meta.env.PROD` — `VITE_MIXPANEL_TOKEN` is a public, client-side project token
 * (not a secret; see the task's own note), and the only gate this file was asked to
 * implement is presence-of-token, same as `resendEnabled` gates only on
 * `RESEND_API_KEY` presence rather than also checking `NODE_ENV`.
 */
let initialized = false;
let warnedNotConfigured = false;

/**
 * Initializes Mixpanel once at boot, gated behind `VITE_MIXPANEL_TOKEN`. Every exported
 * tracking/identity function below no-ops silently until this has actually run — call
 * sites never need their own env checks.
 *
 * `autocapture: false` is required, not incidental: this app manually tracks
 * `page_viewed` per route change (`App.tsx`'s `useLocation` effect) — Mixpanel's own
 * autocapture option includes built-in page-view tracking that would double-fire
 * against that manual instrumentation if left on, per Mixpanel's own implementation
 * guidance (the two are meant to be mutually exclusive).
 */
export function initMixpanel(): void {
  const token = import.meta.env.VITE_MIXPANEL_TOKEN;

  if (!token) {
    if (!warnedNotConfigured) {
      // eslint-disable-next-line no-console
      console.warn(
        'VITE_MIXPANEL_TOKEN is not set — Mixpanel analytics will be skipped. This is ' +
          'expected in local dev or any environment without a configured Mixpanel token.',
      );
      warnedNotConfigured = true;
    }
    return;
  }

  mixpanel.init(token, {
    autocapture: false,
    track_pageview: false,
  });
  initialized = true;
}

/**
 * Safe wrapper around `mixpanel.track()` — a no-op until `initMixpanel()` has actually
 * run (local dev, or a build with no `VITE_MIXPANEL_TOKEN` configured), so call sites
 * never need their own guard.
 */
export function trackMixpanelEvent(name: string, properties?: Record<string, unknown>): void {
  if (initialized) {
    mixpanel.track(name, properties);
  }
}

/**
 * One listener, mounted once in `App.tsx` on every route change (per this app's
 * `page_viewed` spec — not hand-instrumented per page). Uses `mixpanel.track_pageview()`
 * (present on this installed SDK version) rather than a plain `track()` call so the
 * event also picks up Mixpanel's own built-in page-view enrichment (referrer, campaign
 * params, etc.) — but with `event_name` overridden to this app's own `page_viewed`
 * name/shape (`track_pageview`'s own default event name is `$mp_web_page_view`, not
 * what this spec calls for).
 */
export function trackMixpanelPageview(path: string): void {
  if (!initialized) return;
  mixpanel.track_pageview({ path }, { event_name: 'page_viewed' });
}

/**
 * Called at the exact point `auth-gate.tsx`/`use-session.ts` confirms a valid
 * authenticated session with an org — see that file's own state-machine comments for
 * why that's the right point (not merely "a login/signup response came back"). Always
 * the real user id from session data, never email.
 */
export function identifyMixpanelUser(userId: string): void {
  if (initialized) {
    mixpanel.identify(userId);
  }
}

/** Called from `use-logout.ts`'s logout flow — clears Mixpanel's local identity/state. */
export function resetMixpanel(): void {
  if (initialized) {
    mixpanel.reset();
  }
}

/**
 * Registers `organization_id` as a Mixpanel super property (sent with every subsequent
 * `track()` call from this browser) — explicitly NOT Mixpanel Groups/Group Analytics,
 * which requires a plan tier that hasn't been confirmed for this project.
 */
export function registerMixpanelOrganization(organizationId: string): void {
  if (initialized) {
    mixpanel.register({ organization_id: organizationId });
  }
}
