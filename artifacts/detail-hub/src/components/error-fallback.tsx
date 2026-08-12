import { AlertTriangle } from 'lucide-react';
import { AuthShell } from '@/components/auth-shell';
import { Button } from '@/components/ui/button';

/**
 * Top-level fallback rendered by the `Sentry.ErrorBoundary` wrapping `<App />` in
 * `main.tsx` when an unhandled render error escapes the app tree. Sentry has already
 * captured the error by the time this renders (that's the boundary's job) — this is
 * just the "don't white-screen" UI, styled to match the rest of the unauthenticated /
 * status-screen family (see `auth-gate.tsx`'s error/loading states, which use the same
 * `AuthShell` + centered icon + message + action button shape).
 */
export function ErrorFallback({ resetError }: { error: unknown; resetError: () => void }) {
  return (
    <AuthShell showLogo={false}>
      <div className="flex flex-col items-center gap-3 py-2 text-center" data-testid="status-app-error">
        <AlertTriangle className="w-8 h-8 text-destructive" />
        <p className="text-[16px] font-semibold text-white">Something went wrong</p>
        <p className="text-[13px] text-muted-foreground max-w-[300px]">
          DetailHub ran into an unexpected error. Reloading usually fixes it — if it keeps happening,
          let us know.
        </p>
        <Button
          onClick={() => {
            resetError();
            window.location.reload();
          }}
          className="mt-2 gradient-btn min-h-[44px] px-8"
        >
          Reload
        </Button>
      </div>
    </AuthShell>
  );
}
