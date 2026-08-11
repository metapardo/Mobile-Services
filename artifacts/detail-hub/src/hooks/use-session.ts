import { useGetAuthSession, getGetAuthSessionQueryKey } from '@workspace/api-client-react';

/**
 * Thin wrapper around the generated `GET /api/auth/session` hook with the query
 * behavior this app wants everywhere it's used (login/signup redirect checks, the
 * route-level `AuthGate`): don't retry on failure (a failed request here almost always
 * means the api-server is unreachable, not a transient blip worth silently retrying
 * behind a stuck loading screen), and do refetch on window focus (so switching back to
 * this tab after the session cookie expired/was cleared elsewhere reflects reality
 * instead of a stale "still logged in").
 *
 * NOTE: `GET /auth/session` always responds 200 — even "not signed in" is a normal
 * response body (`{ authenticated: false }`), not an HTTP error — so `isError` here
 * really does mean "couldn't reach/parse a response from the api-server", not "not
 * logged in". Callers should treat that as a distinct state from "authenticated: false".
 */
export function useSession() {
  return useGetAuthSession({
    query: {
      queryKey: getGetAuthSessionQueryKey(),
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 10_000,
    },
  });
}

export { getGetAuthSessionQueryKey };
