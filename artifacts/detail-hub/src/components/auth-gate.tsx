import { Redirect } from 'wouter';
import { Loader2, AlertTriangle } from 'lucide-react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import { useSession } from '@/hooks/use-session';

/**
 * Gates its children behind a valid session with an active organization. Mounted once,
 * around the "/" redirect and the whole `AppShell` route tree in `App.tsx` — everything
 * except `/login` and `/signup` renders behind this.
 *
 * Three non-happy-path states, each rendered explicitly rather than falling through to a
 * blank screen or an infinite redirect loop:
 *   1. Session check still in flight -> full-screen loader.
 *   2. Session check failed (network/api-server unreachable — `GET /auth/session` itself
 *      always responds 200 for "not signed in", so a thrown error here means the request
 *      couldn't complete at all, not "logged out") -> retry screen.
 *   3. Valid session, no active organization (rare in v1 — see `useGetAuthSession`'s
 *      JSDoc — but explicitly possible, e.g. a signup whose compensating cleanup raced)
 *      -> "account isn't set up" screen instead of silently getting stuck.
 * Only once `authenticated === true` AND `organizationId` is set does this render
 * `children`. `authenticated === false` redirects to `/login`.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending, isError, refetch, isRefetching } = useSession();

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

  return <>{children}</>;
}
