import { createRoot } from 'react-dom/client';
import { setBaseUrl } from '@workspace/api-client-react';

import App from './App';

import './index.css';

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

createRoot(document.getElementById('root')!).render(<App />);
