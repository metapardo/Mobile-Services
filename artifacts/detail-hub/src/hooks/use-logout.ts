import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { useLogout as useLogoutMutation } from '@workspace/api-client-react';
import { getGetAuthSessionQueryKey } from '@/hooks/use-session';
import { useToast } from '@/hooks/use-toast';

/**
 * Shared logout action for every entry point (sidebar, mobile "More" menu, settings, etc.)
 * so the query-cache/navigation ordering only lives in one place.
 *
 * Ordering, mirroring `login.tsx`'s "invalidate the session query before navigating" care
 * but going one step further: the server has already deleted the session row and expired
 * the cookie by the time `onSuccess` fires, so instead of invalidating (which would fire a
 * redundant `GET /auth/session` round-trip just to confirm what we already know) we set the
 * cached session data directly to the logged-out shape. That's synchronous, so by the time
 * `setLocation('/login')` runs, `AuthGate`/`useSession()` consumers already see
 * `authenticated: false` on their very next render — no flash of stale "still logged in"
 * state, no race with the mutation.
 *
 * On failure: no navigation (the user may still have a valid session — bouncing them to
 * `/login` on a failed logout could strand them believing they're logged out when they're
 * not) and a toast so it's not a silent no-op.
 */
export function useLogout() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useLogoutMutation({
    mutation: {
      onSuccess: () => {
        queryClient.setQueryData(getGetAuthSessionQueryKey(), { authenticated: false });
        setLocation('/login');
      },
      onError: (err) => {
        // `useLogout`'s default `TError` is `ErrorType<unknown>` (unlike `useLogin`'s
        // `ErrorType<ErrorResponse>`) since the endpoint has no documented error body — cast
        // narrowly here rather than widening the shared type just for this one message lookup.
        const data = err?.data as { message?: string } | null | undefined;
        const message = data?.message ?? 'Something went wrong logging you out. Please try again.';
        toast({ title: 'Logout failed', description: message, variant: 'destructive' });
      },
    },
  });
}
