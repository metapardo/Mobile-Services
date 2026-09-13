import { Redirect } from 'wouter';
import { Loader2, AlertTriangle } from 'lucide-react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@workspace/blue-glass-design-system/components/ui/button';
import { useSession } from '@/hooks/use-session';
import { useGetSettings, getGetSettingsQueryKey } from '@workspace/api-client-react';
import { OnboardingFlow } from '@/components/onboarding-flow';

/**
 * Gates its children behind a valid session with an active organization. Mounted once,
 * around the "/" redirect and the whole `AppShell` route tree in `App.tsx` — everything
 * except `/login` and `/signup` renders behind this.
 *
 * Four non-happy-path states, each rendered explicitly rather than falling through to a
 * blank screen or an infinite redirect loop:
 *   1. Session check still in flight -> full-screen loader.
 *   2. Session check failed (network/api-server unreachable — `GET /auth/session` itself
 *      always responds 200 for "not signed in", so a thrown error here means the request
 *      couldn't complete at all, not "logged out") -> retry screen.
 *   3. Valid session, no active organization (rare in v1 — see `useGetAuthSession`'s
 *      JSDoc — but explicitly possible, e.g. a signup whose compensating cleanup raced)
 *      -> "account isn't set up" screen instead of silently getting stuck.
 *   4. Valid session + organization, but `settings.onboardingComplete === false`
 *      (PRD_Mobull_Onboarding_Flow.md FR-4/FR-6 — a brand-new signup that hasn't
 *      finished first-run onboarding yet) -> the full-screen `OnboardingFlow` takeover
 *      instead of `<AppShell>`. Every settings row that existed before this field
 *      shipped was backfilled to `true`, so this only ever fires for new signups.
 * Only once `authenticated === true`, `organizationId` is set, AND onboarding is
 * complete (or its status can't be determined — see below) does this render
 * `children`. `authenticated === false` redirects to `/login`.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending, isError, refetch, isRefetching } = useSession();
  const hasSessionWithOrg = !!data?.authenticated && !!data.organizationId;

  // Only fetch once we know there's a session + org to fetch settings for —
  // no point racing this against the session check itself.
  const settingsQuery = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey(), retry: false, enabled: hasSessionWithOrg },
  });

  if (isPending) {
    return (
      <AuthShell showLogo={false}>
        <div className="flex flex-col items-center gap-3 py-6" data-testid="status-session-loading">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-[14px] text-muted-foreground">Checking your session…</p>
        </div>
      </AuthShell>
    );
  }

  if (isError || !data) {
    return (
      <AuthShell showLogo={false}>
        <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="status-session-error">
          <AlertTriangle className="w-8 h-8 text-destructive" />
          <p className="text-[16px] font-semibold text-white">Can't reach DetailHub</p>
          <p className="text-[13px] text-muted-foreground max-w-[280px]">
            We couldn't check your session. Check your connection and try again.
          </p>
          <Button onClick={() => refetch()} disabled={isRefetching} className="mt-2 gradient-btn min-h-[44px] px-8">
            {isRefetching ? 'Retrying…' : 'Retry'}
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (!data.authenticated) {
    return <Redirect to="/login" />;
  }

  if (!data.organizationId) {
    return (
      <AuthShell showLogo={false}>
        <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="status-no-organization">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
          <p className="text-[16px] font-semibold text-white">Your account isn't set up yet</p>
          <p className="text-[13px] text-muted-foreground max-w-[300px]">
            You're signed in, but your account isn't linked to a business yet. Contact support to get this
            resolved.
          </p>
        </div>
      </AuthShell>
    );
  }

  // Settings still loading -> brief loader, same visual treatment as the
  // session-check loader above, rather than flashing onboarding or the app
  // shell before we actually know `onboardingComplete`.
  if (settingsQuery.isLoading) {
    return (
      <AuthShell showLogo={false}>
        <div className="flex flex-col items-center gap-3 py-6" data-testid="status-settings-loading">
          <Loader2 className="w-8 h-8 text-primary animate-spin" />
          <p className="text-[14px] text-muted-foreground">Loading your account…</p>
        </div>
      </AuthShell>
    );
  }

  // A genuine settings-fetch failure (not a 404 — that would mean "no
  // settings row yet", which `onboardingComplete` being explicitly `false`
  // and absent are both unusual for a real org) falls through to the app
  // shell rather than trapping the visitor behind a permanent loader/error
  // screen over a check this gate can't resolve. `settings.tsx` itself still
  // surfaces a real error state if there's an underlying data problem.
  if (settingsQuery.data?.onboardingComplete === false) {
    return <OnboardingFlow />;
  }

  return <>{children}</>;
}
