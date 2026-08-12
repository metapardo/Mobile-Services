import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';
import { ErrorFallback } from '@/components/error-fallback';

import './index.css';

// Vercel's Sentry integration (connected via the dashboard, not code) injects a set of
// `SENTRY_*` project env vars — but Vite only exposes `VITE_`-prefixed vars to client
// bundles (by design, so server secrets like `SENTRY_AUTH_TOKEN` never end up in shipped
// JS — see `VITE_API_URL` above for the same convention already established in this
// file). None of the injected `SENTRY_*` vars are `VITE_`-prefixed, so none of them are
// reachable here as-is. `VITE_SENTRY_DSN` is this app's own convention (analogous to
// `VITE_API_URL`) for a `VITE_`-prefixed alias of `SENTRY_DSN` — a DSN is a public
// routing identifier, not a secret, so exposing it client-side is standard Sentry
// practice. This var does not exist in Vercel's project settings yet; it needs to be
// added there (aliasing the value of `SENTRY_DSN`) before this does anything in a real
// deployment. Until then `import.meta.env.VITE_SENTRY_DSN` is simply `undefined`, which
// is handled gracefully below (no init, no crash).
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;

// `import.meta.env.PROD` is true for any `vite build` output (Preview AND Production
// Vercel deployments both go through a real build) and false for the local dev server
// (`vite dev`, where `import.meta.env.DEV` is true instead) — same signal this file
// already branches on for `VITE_API_URL`. Sentry must not initialize locally: skip
// `Sentry.init()` entirely (not just no-op it) when not in a production build, and skip
// it too if the DSN hasn't been configured.
if (import.meta.env.PROD && sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
  });
}

// The generated API hooks (`@workspace/api-client-react`) call relative paths like
// `/api/auth/login`. `api-server` now deploys as a Vercel Serverless Function under
// this SAME Vercel project as `detail-hub` (see `api/[...path].ts`), so in production
// those relative paths are same-origin and resolve correctly on their own — no base
// URL needed, `setBaseUrl` is simply left uncalled (`applyBaseUrl` in
// `@workspace/api-client-react` is a no-op when no base URL has been set).
//
// In local dev, `detail-hub` (Vite) and `api-server` (Express) run as two separate
// processes on two separate ports, so relative paths would resolve against the Vite
// dev server instead — a 404, not an auth failure. `VITE_API_URL` is this app's own
// env convention for pointing at the api-server's origin in that case (no repo-wide
// convention exists). The api-server's documented dev port is 5000 (see root
// `replit.md`'s "Run & Operate" section: `pnpm --filter @workspace/api-server run dev`
// — port 5000), used as a dev-only fallback when `VITE_API_URL` isn't set.
//
// `VITE_API_URL` is intentionally still honored outside dev too (not just ignored) in
// case a non-same-origin deployment (e.g. a preview environment hitting a shared
// staging api-server) ever needs it — it's just no longer *required* in production.
const apiUrl = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : undefined);

if (apiUrl) {
  setBaseUrl(apiUrl);
}

createRoot(document.getElementById('root')!).render(
  <Sentry.ErrorBoundary fallback={ErrorFallback}>
    <App />
  </Sentry.ErrorBoundary>,
);
